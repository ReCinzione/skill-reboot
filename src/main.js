const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const Store = require('electron-store');

// Store per configurazioni persistenti
const store = new Store();

let mainWindow;
let overlayWindow;
let pythonProcess;
let isMonitoring = false;

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

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        // Avvia automaticamente il backend Python
        console.log('🚀 Avvio automatico del backend Python...');
        startPythonProcess();
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
        const axios = require('axios');
        
        if (!pythonProcess) {
            startPythonProcess();
            // Aspetta che il server Python sia pronto
            await new Promise(resolve => setTimeout(resolve, 2000));
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
            return { success: false, error: 'Errore avvio monitoraggio' };
        }
        
    } catch (error) {
        console.error('Errore avvio monitoraggio:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('stop-monitoring', async () => {
    try {
        const axios = require('axios');
        
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
            return { success: false, error: 'Errore stop monitoraggio' };
        }
        
    } catch (error) {
        console.error('Errore stop monitoraggio:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('manual-test', async (event, testData) => {
    try {
        const axios = require('axios');
        
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
        const axios = require('axios');
        
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
    return {
        isMonitoring,
        pythonProcessRunning: pythonProcess !== null,
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
app.whenReady().then(() => {
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