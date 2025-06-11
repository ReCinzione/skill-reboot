# 🤖 AI Instructor Agent - Setup e Avvio

## 📋 Prerequisiti

### Software richiesto:
1. **Node.js** (v16 o superiore) - [Download](https://nodejs.org/)
2. **Python** (v3.8 o superiore) - [Download](https://python.org/)
3. **Tesseract OCR** - [Download](https://tesseract-ocr.github.io/tessdoc/Installation.html)

### Per Windows:
- Installa Tesseract e aggiungi il path alle variabili d'ambiente
- Potrebbe essere necessario: `C:\Program Files\Tesseract-OCR\tesseract.exe`

## 🚀 Installazione

### 1. Crea la struttura del progetto:
```bash
mkdir ai-instructor-agent
cd ai-instructor-agent

# Crea le cartelle
mkdir src src/renderer python
```

### 2. Salva i file:
- Salva `package.json` nella root
- Salva `main.js` in `src/`
- Salva `index.html` in `src/renderer/`
- Salva `overlay.html` in `src/renderer/`
- Salva `screen_monitor.py` in `python/`

### 3. Installa dipendenze Node.js:
```bash
npm install
```

### 4. Installa dipendenze Python:
```bash
npm run install-python-deps
# Oppure manualmente:
pip install opencv-python pyautogui pytesseract pillow flask flask-cors requests
```

## ▶️ Avvio dell'applicazione

### Modalità sviluppo:
```bash
npm run dev
```

### Modalità produzione:
```bash
npm start
```

## 🔧 Configurazione

### 1. API OpenAI (Opzionale):
- Ottieni una chiave API da [OpenAI](https://platform.openai.com)
- Inseriscila nell'interfaccia dell'app
- **Nota**: Il prototipo funziona anche senza, usando suggerimenti predefiniti

### 2. Applicazioni supportate:
- Microsoft Excel
- Microsoft Word  
- Browser Web
- Tutte le applicazioni (modalità generica)

## 🎯 Come funziona

### Monitoraggio automatico:
1. **Screen Capture**: Cattura screenshot ogni 2 secondi
2. **OCR**: Estrae testo usando Tesseract
3. **Analisi**: Rileva confusione dell'utente
4. **AI**: Genera suggerimenti contestuali
5. **Overlay**: Mostra suggerimenti in tempo reale

### Funzionalità principali:
- ✅ Rilevamento automatico dell'applicazione attiva
- ✅ Estrazione testo con OCR multilingua (IT/EN)
- ✅ Suggerimenti contestuali basati su AI
- ✅ Overlay non invasivo con auto-hide
- ✅ Log delle attività in tempo reale
- ✅ Configurazione personalizzabile

## 🔒 Privacy e Sicurezza

- **Dati locali**: Tutto rimane sul tuo computer
- **Screenshot**: Non vengono salvati permanentemente  
- **API**: Solo se configurata dall'utente
- **Trasparenza**: Codice completamente visibile

## 🛠️ Sviluppo e Personalizzazione

### Aggiungere nuovi software:
1. Modifica `_detect_current_app()` in `screen_monitor.py`
2. Aggiungi regole specifiche in `_determine_help_context()`
3. Crea suggerimenti personalizzati in `_get_fallback_suggestion()`

### Migliorare l'AI:
1. Integra API OpenAI reale in `_call_openai_api()`
2. Perfeziona i prompt per ogni software
3. Aggiungi machine learning per pattern recognition

### Personalizzare l'UI:
1. Modifica i CSS in `index.html` e `overlay.html`
2. Aggiungi nuove funzionalità nell'interfaccia React
3. Personalizza i colori e l'aspetto

## 📊 Monetizzazione (Roadmap)

### Versione Free:
- 1 software supportato
- 50 sessioni di monitoraggio/mese
- Suggerimenti base

### Versione Premium (€29/mese):
- Tutti i software supportati
- Monitoraggio illimitato
- AI avanzata con GPT-4
- Analytics dettagliati
- Suggerimenti personalizzati

### Versione Enterprise:
- Deployment aziendale
- Personalizzazioni specifiche
- Integrazione con LMS esistenti
- Dashboard amministratore
- Supporto prioritario

## 🚧 Prossimi sviluppi

### Funzionalità pianificate:
- [ ] Tutorial guidati interattivi
- [ ] Registrazione di macro automatiche
- [ ] Integrazione con sistemi HR
- [ ] Dashboard analytics
- [ ] Mobile companion app
- [ ] Supporto multi-monitor
- [ ] Plugin per software specifici

### Miglioramenti tecnici:
- [ ] Machine Learning per pattern recognition
- [ ] WebSocket per comunicazione real-time
- [ ] Database per analytics
- [ ] Sistema di aggiornamenti automatici
- [ ] Ottimizzazioni performance

## 💡 Consigli per il lancio

### MVP (Minimum Viable Product):
1. **Focus su Excel**: È il software più usato in azienda
2. **Suggerimenti semplici**: Inizia con shortcut e funzioni base
3. **Feedback utenti**: Implementa sistema di rating suggerimenti
4. **Metrics**: Traccia engagement e utilità

### Go-to-Market:
1. **LinkedIn**: Targeting HR Manager e IT Manager
2. **Demo video**: Mostra ROI sulla formazione
3. **Trial gratuito**: 30 giorni per convincere le aziende
4. **Caso d'uso**: "Riduce del 50% il tempo di formazione"

## 🆘 Troubleshooting

### Problemi comuni:

**Tesseract non trovato:**
```bash
# Windows
set PATH=%PATH%;C:\Program Files\Tesseract-OCR
# Linux/Mac  
sudo apt-get install tesseract-ocr
```

**Errori di permessi:**
- L'app potrebbe richiedere permessi per screen capture
- Su macOS: Sistema > Privacy > Registrazione schermo

**Performance lente:**
- Riduci frequenza screenshot (da 2 a 5 secondi)
- Limita area di cattura
- Ottimizza resolution immagini

Questo prototipo ti dà una base solida per iniziare. L'architettura è scalabile e puoi aggiungere funzionalità progressivamente basandoti sul feedback degli utenti!