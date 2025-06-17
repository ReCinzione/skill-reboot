const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');

// Disable hardware acceleration to potentially mitigate GPU issues
app.disableHardwareAcceleration();

const { spawn } = require('child_process');
const path = require('path');
const Store = require('electron-store');
const axios = require('axios'); // Added axios

// Store per configurazioni persistenti
const store = new Store();

let mainWindow;
let overlayWindow;
let pythonProcess;
let isMonitoring = false;

async function checkPythonServerStatus(maxAttempts = 15, interval = 1000) {
    console.log('Checking Python server status...');
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('python-status-update', {
                status: 'starting',
                message: `Attempting to connect to Python server (${attempt}/${maxAttempts})...`
            });
        }
        try {
            const response = await axios.get('http://localhost:5001/status', { timeout: interval - 100 });
            if (response.status === 200 && response.data) {
                if (response.data.gemini_configured === true) {
                    console.log('Python server is ready and Gemini is configured.');
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('python-status-update', {
                            status: 'ready',
                            message: 'Python server ready and AI configured.'
                        });
                    }
                    return true;
                } else {
                    console.log('Python server is up but Gemini not yet configured. Retrying attempt ' + attempt);
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('python-status-update', {
                            status: 'starting',
                            message: 'Python server detected, configuring AI...'
                        });
                    }
                    // Continue to retry if Gemini not yet configured, up to maxAttempts
                }
            }
        } catch (error) {
            console.log(`Python server status check failed (attempt ${attempt}/${maxAttempts}): ${error.message}. Retrying...`);
        }
        if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, interval));
        }
    }
    console.log(`Python server did not become fully ready after ${maxAttempts} attempts.`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('python-status-update', {
            status: 'error',
            message: 'Python server failed to start, configure, or is unresponsive.'
        });
    }
    return false;
}

// Crea la finestra principale
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        icon: path.join(__dirname, '../assets/icon.png'),
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

    mainWindow.once('ready-to-show', async () => { // made async
        mainWindow.show();
        
        // Avvia automaticamente il backend Python
        console.log('🚀 Avvio automatico del backend Python...');
        startPythonProcess(); // This just spawns
        await checkPythonServerStatus(); // Now we check status and inform UI
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (overlayWindow) {
            overlayWindow.close();
        }
        if (pythonProcess) {
            pythonProcess.kill();
        }
    });

    // Debug in modalità sviluppo
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
}

// Crea la finestra overlay
function createOverlayWindow() {
    overlayWindow = new BrowserWindow({
        width: 350,
        height: 200,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        skipTaskbar: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false
    });

    overlayWindow.loadFile(path.join(__dirname, 'renderer/overlay.html'));

    // Posiziona l'overlay in alto a destra
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    overlayWindow.setPosition(width - 370, 20);

    overlayWindow.on('closed', () => {
        overlayWindow = null;
    });
}

// Avvia il processo Python
function startPythonProcess() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('python-status-update', {
            status: 'starting',
            message: 'Python process starting...'
        });
    }
    const pythonPath = path.join(__dirname, '../python/monitor.py');
    
    pythonProcess = spawn('python', [pythonPath], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    // Ascolta l'output di Python per i suggerimenti AI
    pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        
        // Cerca i suggerimenti AI con il formato specifico
        const suggestionMatch = output.match(/AI_SUGGESTION_START({.*?})AI_SUGGESTION_END/s);
        
        if (suggestionMatch) {
            try {
                const suggestionData = JSON.parse(suggestionMatch[1]);
                
                // Invia i dati all'overlay
                if (overlayWindow && !overlayWindow.isDestroyed()) {
                    overlayWindow.webContents.send('update-content', suggestionData);
                    
                    // Mostra l'overlay se nascosto
                    if (!overlayWindow.isVisible()) {
                        overlayWindow.show();
                    }
                }
                
                // Invia anche alla finestra principale per aggiornare lo stato
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('suggestion-received', suggestionData);
                }
                
                console.log('Suggerimento AI ricevuto:', suggestionData);
            } catch (error) {
                console.error('Errore parsing JSON suggerimento:', error);
            }
        }
        
        // Log generale dell'output Python
        console.log('Python output:', output);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error('Python error:', data.toString());
    });

    pythonProcess.on('close', (code) => {
        console.log(`Processo Python terminato con codice ${code}`);
        pythonProcess = null;
        
        // Aggiorna lo stato nella UI
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('python-process-closed', code);
        }
    });

    pythonProcess.on('error', (error) => {
        console.error('Errore avvio processo Python:', error);
        
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('python-process-error', error.message);
        }
    });
}

// Gestori IPC
ipcMain.handle('start-monitoring', async (event, config) => {
    try {
        let pythonReady = false;
        if (!pythonProcess) {
            console.log("Python process not running. Starting it now for 'start-monitoring'.");
            startPythonProcess(); // Spawns the process
            pythonReady = await checkPythonServerStatus(); // Check its status
        } else {
            console.log("Python process already running. Checking status for 'start-monitoring'.");
            pythonReady = await checkPythonServerStatus(); // Check status of already running process
        }

        if (!pythonReady) {
            return { success: false, error: 'Python backend is not ready or failed to configure.' };
        }
        
        // Avvia il monitoraggio hotkey
        const response = await axios.post('http://localhost:5001/start_hotkey', {
            gemini_api_key: config.apiKey
        });
        
        if (response.data.status === 'started') {
            isMonitoring = true;
            
            // Crea l'overlay se non esiste
            if (!overlayWindow) {
                createOverlayWindow();
            }
            
            return { success: true, message: 'Monitoraggio F12 avviato' };
        } else {
            // Pass Python's error message to the UI if available
            const errorMessage = response.data.message || 'Errore avvio monitoraggio (dettagli non disponibili)';
            return { success: false, error: errorMessage };
        }
        
    } catch (error) {
        console.error('Errore avvio monitoraggio:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('stop-monitoring', async () => {
    try {
        // const axios = require('axios'); // Already at top
        
        // Ferma il monitoraggio hotkey
        const response = await axios.post('http://localhost:5001/stop_hotkey');
        
        if (response.data.status === 'stopped') {
            isMonitoring = false;
            
            // Nascondi l'overlay
            if (overlayWindow && !overlayWindow.isDestroyed()) {
                overlayWindow.hide();
            }
            
            return { success: true, message: 'Monitoraggio fermato' };
        } else {
            const errorMessage = response.data.message || 'Errore stop monitoraggio (dettagli non disponibili)';
            return { success: false, error: errorMessage };
        }
        
    } catch (error) {
        console.error('Errore stop monitoraggio:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('manual-test', async (event, testData) => {
    try {
        // const axios = require('axios'); // Already at top
        
        // Invia richiesta di test manuale al backend Python
        const response = await axios.post('http://localhost:5001/manual_suggestion', {
            test_data: testData
        });
        
        return { success: true, message: 'Test manuale completato', data: response.data };
    } catch (error) {
        console.error('Errore test manuale:', error);
        return { success: false, error: error.message };
    }
});

// Handler per feedback utente dall'overlay
ipcMain.on('suggestion-action', async (event, feedbackData) => {
    try {
        // const axios = require('axios'); // Already at top
        
        // Invia feedback al backend Python
        const response = await axios.post('http://localhost:5001/feedback', {
            suggestion_id: feedbackData.suggestion_id,
            action: feedbackData.action,
            user_action: feedbackData.user_action,
            suggestion_data: feedbackData.suggestion,
            timestamp: feedbackData.timestamp,
            session_info: {
                app_name: 'excel',
                user_context: 'overlay_interaction'
            }
        });
        
        console.log('✅ Feedback inviato al backend:', response.data);
    } catch (error) {
        console.error('❌ Errore invio feedback:', error.message);
    }
});

ipcMain.handle('get-monitoring-status', async () => {
    let pythonStatusData = {
        gemini_configured: false,
        hotkey_active: false,
    };
    let pythonResponsive = false;
    try {
        const response = await axios.get('http://localhost:5001/status', { timeout: 500 });
        if (response.status === 200 && response.data) {
            pythonStatusData = response.data;
            pythonResponsive = true;
        }
    } catch (e) {
        console.log('Could not fetch Python status for get-monitoring-status:', e.message);
    }
    return {
        isMonitoring: pythonStatusData.hotkey_active || isMonitoring, // Prefer Python's view
        pythonProcessRunning: pythonProcess !== null,
        pythonServerResponsive: pythonResponsive,
        geminiConfigured: pythonStatusData.gemini_configured,
        overlayVisible: overlayWindow && overlayWindow.isVisible()
    };
});

ipcMain.handle('save-api-key', async (event, apiKey) => {
    try {
        store.set('gemini_api_key', apiKey);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('load-api-key', async () => {
    try {
        const apiKey = store.get('gemini_api_key', '');
        return { success: true, apiKey };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-config', async (event, config) => {
    try {
        store.set('app_config', config);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('load-config', async () => {
    try {
        const config = store.get('app_config', {
            autoStart: false,
            overlayPosition: 'top-right',
            suggestionDelay: 5000,
            targetApps: ['excel', 'word']
        });
        return { success: true, config };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Gestori overlay
ipcMain.handle('hide-overlay', async () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide();
    }
    return { success: true };
});

ipcMain.handle('show-overlay', async () => {
    if (!overlayWindow) {
        createOverlayWindow();
    }
    
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show();
    }
    return { success: true };
});

// Inizializzazione app
app.whenReady().then(async () => { // Make async
    createMainWindow();
    
    // Registra hotkey globale F12
    globalShortcut.register('F12', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.focus();
            } else {
                mainWindow.show();
            }
        }
        
        // Notifica alla UI che F12 è stato premuto
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('f12-pressed');
        }
    });
    
    // Note: startPythonProcess is now called from mainWindow's 'ready-to-show' event,
    // which also calls checkPythonServerStatus.

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    // Deregistra tutti i shortcut globali
    globalShortcut.unregisterAll();
    
    // Termina il processo Python
    if (pythonProcess) {
        pythonProcess.kill();
    }
    
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    // Cleanup prima della chiusura
    globalShortcut.unregisterAll();
    
    if (pythonProcess) {
        pythonProcess.kill();
    }
});

// Gestione errori non catturati
process.on('uncaughtException', (error) => {
    console.error('Errore non catturato:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Promise rejection non gestita:', reason);
});