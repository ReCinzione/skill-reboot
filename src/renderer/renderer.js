// src/renderer/renderer.js
const { ipcRenderer } = require('electron');

class AIInstructorUI {
    constructor() {
        this.isMonitoring = false;
        this.apiKey = '';
        this.config = {};
        this.geminiSession = null;
        this.isChatOpen = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.loadStoredData();
        this.updateUI();
    }

    initializeElements() {
        // Elementi principali
        this.statusDot = document.getElementById('status-dot');
        this.statusText = document.getElementById('status-text');
        this.startBtn = document.getElementById('start-btn');
        this.stopBtn = document.getElementById('stop-btn');
        this.testBtn = document.getElementById('test-btn');
        this.geminiChatBtn = document.getElementById('geminiChatBtn');
        
        // Test manuale
        this.manualTestInput = document.getElementById('manualTestInput');
        this.runManualTestBtn = document.getElementById('runManualTestBtn');
        
        // Gemini Live Chat
        this.geminiChatSection = document.getElementById('geminiChatSection');
        this.chatContainer = document.getElementById('chatContainer');
        this.chatInput = document.getElementById('chatInput');
        this.sendChatBtn = document.getElementById('sendChatBtn');
        this.closeChatBtn = document.getElementById('closeChatBtn');
        this.chatStatus = document.getElementById('chatStatus');
        
        // Configurazione API
        this.apiKeyInput = document.getElementById('api-key');
        this.saveApiKeyBtn = document.getElementById('save-api-key');
        
        // Configurazioni
        this.autoStartCheckbox = document.getElementById('auto-start');
        this.overlayPositionSelect = document.getElementById('overlay-position');
        this.suggestionDelayInput = document.getElementById('suggestion-delay');
        this.targetAppsCheckboxes = document.querySelectorAll('input[name="target-apps"]');
        this.saveConfigBtn = document.getElementById('save-config');
        
        // Log e statistiche
        this.logContainer = document.getElementById('log-container');
        this.suggestionCount = document.getElementById('suggestion-count');
        this.f12Count = document.getElementById('f12-count');
        this.uptimeDisplay = document.getElementById('uptime');
        
        // Contatori
        this.stats = {
            suggestions: 0,
            f12Presses: 0,
            startTime: null
        };
    }

    setupEventListeners() {
        // Bottoni principali
        this.startBtn?.addEventListener('click', () => this.startMonitoring());
        this.stopBtn?.addEventListener('click', () => this.stopMonitoring());
        this.testBtn?.addEventListener('click', () => this.runManualTest());
        this.geminiChatBtn?.addEventListener('click', () => this.toggleGeminiChat());
        
        // Test manuale con input personalizzato
        this.runManualTestBtn?.addEventListener('click', () => this.runCustomManualTest());
        this.manualTestInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.runCustomManualTest();
            }
        });
        
        // Gemini Live Chat
        this.sendChatBtn?.addEventListener('click', () => this.sendChatMessage());
        this.closeChatBtn?.addEventListener('click', () => this.closeGeminiChat());
        this.chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });
        
        // API Key
        this.saveApiKeyBtn?.addEventListener('click', () => this.saveApiKey());
        this.apiKeyInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveApiKey();
            }
        });
        
        // Configurazioni
        this.saveConfigBtn?.addEventListener('click', () => this.saveConfig());
        
        // Auto-save configurazioni quando cambiano
        this.autoStartCheckbox?.addEventListener('change', () => this.autoSaveConfig());
        this.overlayPositionSelect?.addEventListener('change', () => this.autoSaveConfig());
        this.suggestionDelayInput?.addEventListener('change', () => this.autoSaveConfig());
        
        this.targetAppsCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.autoSaveConfig());
        });
        
        // Listener IPC da main.js
        ipcRenderer.on('suggestion-received', (event, data) => {
            this.handleSuggestionReceived(data);
        });
        
        ipcRenderer.on('f12-pressed', () => {
            this.handleF12Pressed();
        });
        
        ipcRenderer.on('python-process-closed', (event, code) => {
            this.handlePythonProcessClosed(code);
        });
        
        ipcRenderer.on('python-process-error', (event, error) => {
            this.handlePythonProcessError(error);
        });
        
        // Aggiorna uptime ogni secondo
        setInterval(() => this.updateUptime(), 1000);
    }

    async loadStoredData() {
        try {
            // Carica API Key
            const apiKeyResult = await ipcRenderer.invoke('load-api-key');
            if (apiKeyResult.success && apiKeyResult.apiKey) {
                this.apiKey = apiKeyResult.apiKey;
                if (this.apiKeyInput) {
                    this.apiKeyInput.value = this.apiKey;
                }
            }
            
            // Carica configurazioni
            const configResult = await ipcRenderer.invoke('load-config');
            if (configResult.success) {
                this.config = configResult.config;
                this.applyConfigToUI();
            }
            
            // Carica stato monitoraggio
            const statusResult = await ipcRenderer.invoke('get-monitoring-status');
            if (statusResult) {
                this.isMonitoring = statusResult.isMonitoring;
                this.updateUI();
            }
            
        } catch (error) {
            console.error('Errore caricamento dati:', error);
            this.addLog('Errore caricamento configurazioni', 'error');
        }
    }

    applyConfigToUI() {
        if (this.autoStartCheckbox) {
            this.autoStartCheckbox.checked = this.config.autoStart || false;
        }
        
        if (this.overlayPositionSelect) {
            this.overlayPositionSelect.value = this.config.overlayPosition || 'top-right';
        }
        
        if (this.suggestionDelayInput) {
            this.suggestionDelayInput.value = this.config.suggestionDelay || 5000;
        }
        
        // Applica target apps
        const targetApps = this.config.targetApps || ['excel', 'word'];
        this.targetAppsCheckboxes.forEach(checkbox => {
            checkbox.checked = targetApps.includes(checkbox.value);
        });
    }

    async startMonitoring() {
        try {
            if (!this.apiKey) {
                this.showNotification('Inserisci prima la tua API Key di Gemini', 'warning');
                return;
            }
            
            this.addLog('Avvio monitoraggio...', 'info');
            
            const config = {
                apiKey: this.apiKey,
                targetApps: this.getSelectedTargetApps(),
                suggestionDelay: parseInt(this.suggestionDelayInput?.value || '5000'),
                overlayPosition: this.overlayPositionSelect?.value || 'top-right'
            };
            
            const result = await ipcRenderer.invoke('start-monitoring', config);
            
            if (result.success) {
                this.isMonitoring = true;
                this.stats.startTime = Date.now();
                this.updateUI();
                this.addLog('Monitoraggio avviato con successo', 'success');
                this.showNotification('Monitoraggio AI attivo! Premi F12 per aprire l\'interfaccia', 'success');
            } else {
                this.addLog(`Errore avvio: ${result.error}`, 'error');
                this.showNotification('Errore durante l\'avvio del monitoraggio', 'error');
            }
            
        } catch (error) {
            console.error('Errore start monitoring:', error);
            this.addLog(`Errore: ${error.message}`, 'error');
            this.showNotification('Errore durante l\'avvio', 'error');
        }
    }

    async stopMonitoring() {
        try {
            this.addLog('Arresto monitoraggio...', 'info');
            
            const result = await ipcRenderer.invoke('stop-monitoring');
            
            if (result.success) {
                this.isMonitoring = false;
                this.stats.startTime = null;
                this.updateUI();
                this.addLog('Monitoraggio fermato', 'info');
                this.showNotification('Monitoraggio fermato', 'info');
            } else {
                this.addLog(`Errore stop: ${result.error}`, 'error');
            }
            
        } catch (error) {
            console.error('Errore stop monitoring:', error);
            this.addLog(`Errore: ${error.message}`, 'error');
        }
    }

    async runManualTest() {
        try {
            this.addLog('Esecuzione test manuale...', 'info');
            
            const testData = {
                context: 'test_manuale',
                app: 'excel',
                userQuery: 'Test di funzionamento del sistema AI'
            };
            
            const result = await ipcRenderer.invoke('manual-test', testData);
            
            if (result.success) {
                this.addLog('Test manuale avviato', 'success');
                this.showNotification('Test manuale in corso...', 'info');
            } else {
                this.addLog(`Errore test: ${result.error}`, 'error');
            }
            
        } catch (error) {
            console.error('Errore manual test:', error);
            this.addLog(`Errore: ${error.message}`, 'error');
        }
    }
    
    async runCustomManualTest() {
        try {
            const userQuery = this.manualTestInput?.value.trim();
            
            if (!userQuery) {
                this.showNotification('Inserisci una query di test', 'warning');
                return;
            }
            
            this.addLog(`Test personalizzato: "${userQuery}"`, 'info');
            
            const testData = {
                context: 'test_personalizzato',
                app: 'excel',
                userQuery: userQuery,
                customTest: true
            };
            
            // Disabilita il pulsante durante l'esecuzione
            if (this.runManualTestBtn) {
                this.runManualTestBtn.disabled = true;
                this.runManualTestBtn.textContent = '⏳ Elaborazione...';
            }
            
            const result = await ipcRenderer.invoke('manual-test', testData);
            
            if (result.success) {
                this.addLog('Test personalizzato completato', 'success');
                this.showNotification('Test completato! Controlla l\'overlay per il risultato.', 'success');
                
                // Pulisci il campo input
                if (this.manualTestInput) {
                    this.manualTestInput.value = '';
                }
            } else {
                this.addLog(`Errore test personalizzato: ${result.error}`, 'error');
                this.showNotification('Errore durante il test', 'error');
            }
            
        } catch (error) {
            console.error('Errore custom manual test:', error);
            this.addLog(`Errore: ${error.message}`, 'error');
            this.showNotification('Errore durante il test', 'error');
        } finally {
            // Riabilita il pulsante
            if (this.runManualTestBtn) {
                this.runManualTestBtn.disabled = false;
                this.runManualTestBtn.textContent = '▶️ Esegui Test';
            }
        }
    }

    async saveApiKey() {
        try {
            const apiKey = this.apiKeyInput?.value.trim();
            
            if (!apiKey) {
                this.showNotification('Inserisci una API Key valida', 'warning');
                return;
            }
            
            const result = await ipcRenderer.invoke('save-api-key', apiKey);
            
            if (result.success) {
                this.apiKey = apiKey;
                this.addLog('API Key salvata con successo', 'success');
                this.showNotification('API Key salvata!', 'success');
            } else {
                this.addLog(`Errore salvataggio API Key: ${result.error}`, 'error');
                this.showNotification('Errore salvataggio API Key', 'error');
            }
            
        } catch (error) {
            console.error('Errore save API key:', error);
            this.addLog(`Errore: ${error.message}`, 'error');
        }
    }

    async saveConfig() {
        try {
            const config = this.getConfigFromUI();
            
            const result = await ipcRenderer.invoke('save-config', config);
            
            if (result.success) {
                this.config = config;
                this.addLog('Configurazioni salvate', 'success');
                this.showNotification('Configurazioni salvate!', 'success');
            } else {
                this.addLog(`Errore salvataggio config: ${result.error}`, 'error');
            }
            
        } catch (error) {
            console.error('Errore save config:', error);
            this.addLog(`Errore: ${error.message}`, 'error');
        }
    }

    async autoSaveConfig() {
        // Auto-salva le configurazioni con un debounce
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.saveConfig();
        }, 1000);
    }

    getConfigFromUI() {
        return {
            autoStart: this.autoStartCheckbox?.checked || false,
            overlayPosition: this.overlayPositionSelect?.value || 'top-right',
            suggestionDelay: parseInt(this.suggestionDelayInput?.value || '5000'),
            targetApps: this.getSelectedTargetApps()
        };
    }

    getSelectedTargetApps() {
        const selected = [];
        this.targetAppsCheckboxes.forEach(checkbox => {
            if (checkbox.checked) {
                selected.push(checkbox.value);
            }
        });
        return selected.length > 0 ? selected : ['excel', 'word'];
    }

    updateUI() {
        // Determina lo stato del sistema
        let systemStatus = 'Sistema Inattivo';
        let statusClass = '';
        
        if (this.isMonitoring) {
            systemStatus = '✅ Monitoraggio Attivo';
            statusClass = 'active';
        } else if (this.apiKey) {
            systemStatus = '🟡 Backend Pronto - Clicca "Avvia F12"';
            statusClass = 'ready';
        } else {
            systemStatus = '🔴 Inserisci API Key per iniziare';
            statusClass = 'inactive';
        }
        
        // Aggiorna stato del sistema
        if (this.statusDot) {
            this.statusDot.className = `status-dot ${statusClass}`;
        }
        
        if (this.statusText) {
            this.statusText.textContent = systemStatus;
        }
        
        // Aggiorna bottoni
        if (this.startBtn) {
            this.startBtn.disabled = this.isMonitoring || !this.apiKey;
        }
        
        if (this.stopBtn) {
            this.stopBtn.disabled = !this.isMonitoring;
        }
        
        if (this.testBtn) {
            this.testBtn.disabled = !this.apiKey;
        }
        
        if (this.geminiChatBtn) {
            this.geminiChatBtn.disabled = !this.apiKey;
        }
        
        // Aggiorna stato chat button
        this.updateChatButtonState();
        
        // Aggiorna statistiche
        this.updateStats();
    }

    updateStats() {
        if (this.suggestionCount) {
            this.suggestionCount.textContent = this.stats.suggestions;
        }
        
        if (this.f12Count) {
            this.f12Count.textContent = this.stats.f12Presses;
        }
    }

    updateUptime() {
        if (this.uptimeDisplay && this.stats.startTime) {
            const uptime = Date.now() - this.stats.startTime;
            const seconds = Math.floor(uptime / 1000) % 60;
            const minutes = Math.floor(uptime / (1000 * 60)) % 60;
            const hours = Math.floor(uptime / (1000 * 60 * 60));
            
            this.uptimeDisplay.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else if (this.uptimeDisplay) {
            this.uptimeDisplay.textContent = '00:00:00';
        }
    }

    handleSuggestionReceived(data) {
        this.stats.suggestions++;
        this.updateStats();
        
        this.addLog(`Suggerimento AI: ${data.message}`, 'ai');
        
        // Mostra notifica se l'overlay non è visibile
        this.showNotification('Nuovo suggerimento AI disponibile!', 'info');
    }

    handleF12Pressed() {
        this.stats.f12Presses++;
        this.updateStats();
        
        this.addLog('Hotkey F12 premuto', 'info');
    }

    handlePythonProcessClosed(code) {
        this.isMonitoring = false;
        this.updateUI();
        
        this.addLog(`Processo Python terminato (codice: ${code})`, 'warning');
        
        if (code !== 0) {
            this.showNotification('Il processo Python si è chiuso inaspettatamente', 'error');
        }
    }

    handlePythonProcessError(error) {
        this.addLog(`Errore processo Python: ${error}`, 'error');
        this.showNotification('Errore nel processo Python', 'error');
    }

    // === GEMINI LIVE CHAT METHODS ===
    
    async toggleGeminiChat() {
        if (this.isChatOpen) {
            this.closeGeminiChat();
        } else {
            await this.openGeminiChat();
        }
    }
    
    async openGeminiChat() {
        try {
            if (!this.apiKey) {
                this.showNotification('Configura prima la API Key di Gemini', 'warning');
                return;
            }
            
            this.addLog('Apertura Gemini Live Chat...', 'info');
            this.updateChatStatus('🔄 Connessione a Gemini Live...');
            
            // Mostra la sezione chat
            if (this.geminiChatSection) {
                this.geminiChatSection.classList.remove('hidden');
            }
            
            // Inizializza la connessione Gemini Live
            await this.initializeGeminiLive();
            
            this.isChatOpen = true;
            this.updateChatButtonState();
            this.addLog('Gemini Live Chat aperta', 'success');
            
        } catch (error) {
            console.error('Errore apertura chat:', error);
            this.addLog(`Errore chat: ${error.message}`, 'error');
            this.updateChatStatus('❌ Errore di connessione');
            this.showNotification('Errore durante l\'apertura della chat', 'error');
        }
    }
    
    closeGeminiChat() {
        try {
            // Chiudi la sessione Gemini se attiva
            if (this.geminiSession) {
                this.geminiSession.disconnect();
                this.geminiSession = null;
            }
            
            // Nascondi la sezione chat
            if (this.geminiChatSection) {
                this.geminiChatSection.classList.add('hidden');
            }
            
            this.isChatOpen = false;
            this.updateChatButtonState();
            this.addLog('Gemini Live Chat chiusa', 'info');
            
        } catch (error) {
            console.error('Errore chiusura chat:', error);
            this.addLog(`Errore chiusura chat: ${error.message}`, 'error');
        }
    }
    
    async initializeGeminiLive() {
        try {
            this.updateChatStatus('Connecting to Gemini Live...');
            
            // Import the Google GenAI library
            const { GoogleGenAI, Modality } = require('@google/genai');
            
            // Get API key from settings
            const apiKey = this.apiKeyInput.value.trim();
            if (!apiKey) {
                throw new Error('API key is required for Gemini Live');
            }
            
            // Initialize Google GenAI with Live API
            const ai = new GoogleGenAI({
                apiKey: apiKey,
                // Live must use v1alpha at this time
                apiVersion: 'v1alpha',
            });
            
            // Connect to Gemini Live session
            this.geminiSession = await ai.live.connect({
                model: 'gemini-2.0-flash-exp',
                config: {
                    responseModalities: [
                        // Use only plain-text for the responses
                        Modality.TEXT,
                    ],
                },
                callbacks: {
                    onmessage: (message) => {
                        if (message.serverContent && message.serverContent.modelTurn) {
                            let responseText = '';
                            for (const part of message.serverContent.modelTurn.parts) {
                                if (part.text) {
                                    responseText += part.text;
                                }
                            }
                            if (responseText) {
                                this.handleGeminiMessage({
                                    text: responseText,
                                    timestamp: new Date()
                                });
                            }
                        }
                    },
                    onerror: (error) => {
                        this.handleGeminiError(error);
                    }
                },
            });
            
            this.updateChatStatus('Connected to Gemini Live');
        } catch (error) {
            this.handleGeminiError(error);
        }
    }
    
    async sendChatMessage() {
        try {
            const message = this.chatInput?.value.trim();
            
            if (!message) {
                this.showNotification('Inserisci un messaggio', 'warning');
                return;
            }
            
            if (!this.geminiSession) {
                this.showNotification('Chat non connessa', 'error');
                return;
            }
            
            // Aggiungi il messaggio dell'utente alla chat
            this.addChatMessage('user', message);
            
            // Pulisci l'input
            if (this.chatInput) {
                this.chatInput.value = '';
            }
            
            // Mostra indicatore di digitazione
            this.updateChatStatus('⌨️ Gemini sta scrivendo...');
            
            // Invia il messaggio a Gemini Live usando il formato API corretto
            await this.geminiSession.sendClientContent({
                turns: message,
                turnComplete: true
            });
            
        } catch (error) {
            console.error('Errore invio messaggio:', error);
            this.addLog(`Errore invio messaggio: ${error.message}`, 'error');
            this.updateChatStatus('❌ Errore invio messaggio');
            this.showNotification('Errore durante l\'invio del messaggio', 'error');
        }
    }
    
    handleGeminiMessage(message) {
        try {
            if (message.serverContent && message.serverContent.modelTurn) {
                let responseText = '';
                
                for (const part of message.serverContent.modelTurn.parts) {
                    if (part.text) {
                        responseText += part.text;
                    }
                }
                
                if (responseText.trim()) {
                    this.addChatMessage('assistant', responseText.trim());
                    this.updateChatStatus('✅ Connesso a Gemini Live');
                }
            }
        } catch (error) {
            console.error('Errore gestione messaggio Gemini:', error);
            this.addLog(`Errore messaggio: ${error.message}`, 'error');
        }
    }
    
    handleGeminiError(error) {
        console.error('Errore Gemini Live:', error);
        this.addLog(`Errore Gemini Live: ${error.message}`, 'error');
        this.updateChatStatus('❌ Errore di connessione');
        this.addChatMessage('system', `❌ Errore: ${error.message}`);
    }
    
    addChatMessage(type, content) {
        if (!this.chatContainer) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        
        let icon = '';
        let bgColor = '';
        
        switch (type) {
            case 'user':
                icon = '👤';
                bgColor = 'rgba(77, 171, 247, 0.2)';
                break;
            case 'assistant':
                icon = '🤖';
                bgColor = 'rgba(81, 207, 102, 0.2)';
                break;
            case 'system':
                icon = '💡';
                bgColor = 'rgba(116, 192, 252, 0.2)';
                break;
        }
        
        messageDiv.style.cssText = `
            margin-bottom: 10px;
            padding: 8px;
            background: ${bgColor};
            border-radius: 6px;
            font-size: 0.8rem;
            line-height: 1.4;
        `;
        
        messageDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                <span style="font-weight: bold;">${icon} ${type === 'user' ? 'Tu' : type === 'assistant' ? 'Gemini' : 'Sistema'}</span>
                <span style="font-size: 0.7rem; opacity: 0.7;">${timestamp}</span>
            </div>
            <div>${content}</div>
        `;
        
        this.chatContainer.appendChild(messageDiv);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }
    
    updateChatStatus(status) {
        if (this.chatStatus) {
            this.chatStatus.textContent = status;
        }
    }
    
    updateChatButtonState() {
        if (this.geminiChatBtn) {
            if (this.isChatOpen) {
                this.geminiChatBtn.textContent = '💬 Chat Aperta';
                this.geminiChatBtn.classList.remove('btn-secondary');
                this.geminiChatBtn.classList.add('btn-primary');
            } else {
                this.geminiChatBtn.textContent = '💬 Gemini Chat';
                this.geminiChatBtn.classList.remove('btn-primary');
                this.geminiChatBtn.classList.add('btn-secondary');
            }
        }
    }

    addLog(message, type = 'info') {
        if (!this.logContainer) return;
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        logEntry.innerHTML = `
            <span class="log-time">${timestamp}</span>
            <span class="log-message">${message}</span>
        `;
        
        this.logContainer.appendChild(logEntry);
        
        // Mantieni solo gli ultimi 100 log
        while (this.logContainer.children.length > 100) {
            this.logContainer.removeChild(this.logContainer.firstChild);
        }
        
        // Scroll automatico verso il basso
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    showNotification(message, type = 'info') {
        // Crea notifica toast
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Aggiungi al body
        document.body.appendChild(notification);
        
        // Animazione di entrata
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // Rimuovi dopo 3 secondi
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Inizializza l'UI quando il DOM è pronto
document.addEventListener('DOMContentLoaded', () => {
    window.aiInstructorUI = new AIInstructorUI();
});

// Esporta per uso globale
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIInstructorUI;
}