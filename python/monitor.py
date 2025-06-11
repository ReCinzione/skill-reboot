# python/screen_monitor_v2.py
# -*- coding: utf-8 -*-
import sys
import os  # For os.environ and os.path
import logging
import codecs  # For Windows console encoding

# Standard library imports first
import json
import sqlite3
import time
from datetime import datetime
import threading

# Fix encoding for Windows console - This is executable code, so after all imports
if sys.platform == 'win32':
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.detach())
    os.environ['PYTHONIOENCODING'] = 'utf-8'

# Configure logging - Placed after platform-specific setup but before imports that might use logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)  # Set to INFO for less verbose logging

# File Handler
# from logging.handlers import RotatingFileHandler  # Example for rotation
# file_handler = RotatingFileHandler(  # noqa: E501
#     'backend.log', maxBytes=10*1024*1024, backupCount=5, encoding='utf-8'  # noqa: E501
# )
file_handler = logging.FileHandler('backend.log', encoding='utf-8')  # Simpler
file_handler.setLevel(logging.DEBUG)  # Or INFO for less verbosity

# Stream Handler (Console)
stream_handler = logging.StreamHandler()
stream_handler.setLevel(logging.INFO)  # Keep console output less verbose

# Formatter
formatter = logging.Formatter(  # noqa: E501
    '%(asctime)s - %(name)s - %(levelname)s - %(module)s - '  # noqa: E501
    '%(funcName)s - %(lineno)d - %(message)s')  # noqa: E501
file_handler.setFormatter(formatter)
stream_handler.setFormatter(formatter)

# Add handlers to logger
logger.addHandler(file_handler)
logger.addHandler(stream_handler)


# Third-party imports (some might use logger in their import process if guarded)
import cv2
import google.generativeai as genai
import keyboard  # Per hotkey globali
import numpy as np

try:
    import pyautogui
except Exception as e:  # Catching a broader range of exceptions during import
    logger.warning(f"PyAutoGUI could not be imported due to: {e}. Screenshot functionality will be disabled.")
    pyautogui = None  # Ensure pyautogui is defined so checks don't cause NameError

# import pywinauto # Already commented out
import pytesseract
from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont

# Typing imports
from typing import Dict, Optional

app = Flask(__name__)
CORS(app)


class AdvancedScreenMonitor:
    def __init__(self):
        self.monitoring_active = False
        self.current_app = None
        self.last_screenshot = None
        self.gemini_api_key = None
        self.suggestions_history = []
        # Database locale per cache e configurazioni
        self.init_local_db()
        # Configurazione Gemini
        self.gemini_model = None
        # Stato dell'applicazione attiva
        self.active_window_info = {}
        # Contatori per analytics
        self.stats = {
            'suggestions_generated': 0,
            'suggestions_accepted': 0,
            'suggestions_dismissed': 0,
            'f12_activations': 0
        }

    def init_local_db(self):
        """Inizializza database locale SQLite."""
        try:
            self.db_path = 'ai_instructor_local.db'
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            # Tabella per cronologia suggerimenti
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS suggestions_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    app_name TEXT,
                    context_data TEXT,
                    suggestion_text TEXT,
                    user_action TEXT,
                    screenshot_path TEXT
                )
            ''')
            # Tabella per configurazioni utente
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_config (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            ''')
            # Tabella per statistics
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS usage_stats (
                    date DATE DEFAULT CURRENT_DATE,
                    f12_presses INTEGER DEFAULT 0,
                    suggestions_shown INTEGER DEFAULT 0,
                    suggestions_accepted INTEGER DEFAULT 0,
                    app_usage_time INTEGER DEFAULT 0,
                    PRIMARY KEY (date)
                )
            ''')
            conn.commit()
            conn.close()
            logger.info("Database locale inizializzato")
        except Exception:
            logger.error("Errore inizializzazione database", exc_info=True)

    def setup_gemini(self, api_key: str):
        """Configura l'API di Gemini."""
        try:
            self.gemini_api_key = api_key
            genai.configure(api_key=api_key)
            # Usa Gemini 2.0 Flash per multimodale
            self.gemini_model = genai.GenerativeModel('gemini-2.0-flash-exp')
            # Test di connessione
            test_response = self.gemini_model.generate_content("Ciao, sei funzionante?")
            logger.info(
                f"Gemini configurato correttamente: {test_response.text[:50]}..."  # noqa: E501
            )
            return True
        except Exception:  # noqa: E722
            logger.error("Errore configurazione Gemini", exc_info=True)
            return False

    def start_hotkey_monitoring(self):
        """Avvia il monitoraggio dell'hotkey F12."""
        try:
            self.monitoring_active = True
            # Registra l'hotkey F12
            keyboard.add_hotkey('f12', self.on_f12_pressed)
            logger.info("🎯 Monitoraggio hotkey F12 attivato")
            logger.info("👆 Premi F12 per richiedere assistenza AI")
            return {"status": "started", "message": "Hotkey F12 registrato"}
        except Exception as e:
            logger.error(
                f"Errore registrazione hotkey: {e}", exc_info=True  # noqa: E501
            )
            return {"status": "error", "message": str(e)}

    def stop_hotkey_monitoring(self):
        """Ferma il monitoraggio dell'hotkey."""
        try:
            self.monitoring_active = False
            keyboard.unhook_all_hotkeys()
            logger.info("Monitoraggio hotkey fermato")
            return {"status": "stopped", "message": "Monitoraggio fermato"}
        except Exception as e:
            logger.error(f"Errore stop hotkey: {e}", exc_info=True)
            return {"status": "error", "message": str(e)}

    def on_f12_pressed(self):
        """Callback quando viene premuto F12."""
        try:
            logger.info("🔥 F12 premuto! Avvio analisi AI...")
            # Update stats
            self.stats['f12_activations'] += 1
            self.update_daily_stats('f12_presses', 1)
            # Avvia analisi in thread separato per non bloccare
            analysis_thread = threading.Thread(target=self.perform_ai_analysis)
            analysis_thread.daemon = True
            analysis_thread.start()
        except Exception:  # noqa: E722
            logger.error("Errore callback F12", exc_info=True)

    def perform_ai_analysis(self):
        """Esegue l'analisi completa quando viene premuto F12."""
        try:
            start_time = time.time()
            # 1. Cattura screenshot ad alta risoluzione
            screenshot = self.capture_high_quality_screenshot()
            if not screenshot:
                logger.error("Impossibile catturare screenshot")
                return
            # 2. Analisi profonda dell'applicazione attiva
            app_context = self.analyze_active_application()
            # 3. Estrazione testo OCR
            ocr_text = self.extract_text_advanced(screenshot)
            # 4. Preparazione dati per Gemini
            context_data = {
                'app_info': app_context,
                'ocr_text': ocr_text,
                'timestamp': datetime.now().isoformat(),
                'screenshot_size': screenshot.size if screenshot else None
            }
            # 5. Genera suggerimento con Gemini
            suggestion = self.generate_ai_suggestion(screenshot, context_data)
            # 6. Invia suggerimento all'UI
            if suggestion:
                self.send_suggestion_to_overlay(suggestion)
                self.save_suggestion_to_db(context_data, suggestion)
            processing_time = time.time() - start_time
            logger.info(f"⚡ Analisi completata in {processing_time:.2f}s")
        except Exception:  # noqa: E722
            logger.error("Errore analisi AI", exc_info=True)

    def capture_high_quality_screenshot(self) -> Optional[Image.Image]:
        """Cattura screenshot ad alta qualità."""
        if not pyautogui:
            logger.warning("PyAutoGUI not available, cannot capture screenshot.")
            return None
        try:
            # Screenshot dell'intero schermo
            screenshot = pyautogui.screenshot()
            # Ottimizza per l'analisi AI
            # Riduci dimensioni se troppo grande (Gemini ha limiti)  # noqa: E501
            max_size = (1920, 1080)
            if screenshot.size[0] > max_size[0] or screenshot.size[1] > max_size[1]:
                screenshot.thumbnail(max_size, Image.Resampling.LANCZOS)
            return screenshot
        except Exception:  # noqa: E722
            logger.error("Errore cattura screenshot", exc_info=True)
            return None

    def analyze_active_application(self) -> Dict:
        """Analisi profonda dell'applicazione attiva usando pywinauto."""
        try:
            app_info = {
                'app_name': 'unknown',
                'window_title': '',
                'specific_context': {},
                'ui_elements': []
            }
            # Ottieni finestra attiva
            try:
                active_window = pywinauto.Desktop(backend="uia").windows()[0]
                app_info['window_title'] = active_window.window_text()
                # Determina il tipo di applicazione
                title_lower = app_info['window_title'].lower()
                if 'excel' in title_lower:
                    app_info = self.analyze_excel_context(active_window, app_info)
                elif 'word' in title_lower:
                    app_info = self.analyze_word_context(active_window, app_info)
                elif any(browser in title_lower for browser in ['chrome', 'firefox', 'edge']):
                    app_info = self.analyze_browser_context(active_window, app_info)
            except Exception as e:
                logger.warning(
                    f"Impossibile analizzare finestra attiva: {e}"
                )  # No traceback needed
            return app_info
        except Exception as e:
            logger.error(f"Errore analisi applicazione: {e}", exc_info=True)
            return {'app_name': 'unknown', 'error': str(e)}

    def analyze_excel_context(self, window, app_info: Dict) -> Dict:
        """Analisi specifica per Excel."""
        try:
            app_info['app_name'] = 'excel'
            specific_context = {
                'worksheets': [],
                'active_cell': None,
                'selected_range': None,
                'visible_formulas': [],
                'ribbon_tab': None,
                'cell_value': None,
                'workbook_name': None
            }
            # Prova prima con COM automation per informazioni precise
            try:
                import win32com.client
                xl_app = win32com.client.GetActiveObject("Excel.Application")
                if xl_app and xl_app.ActiveSheet:
                    # Cella attiva
                    active_cell = xl_app.ActiveCell
                    if active_cell:
                        specific_context['active_cell'] = active_cell.Address
                        specific_context['cell_value'] = str(active_cell.Value) if active_cell.Value else ""
                    # Selezione corrente
                    selection = xl_app.Selection
                    if selection:
                        specific_context['selected_range'] = selection.Address
                    # Formula bar (se presente)
                    if hasattr(active_cell, 'Formula') and active_cell.Formula:
                        specific_context['visible_formulas'].append(str(active_cell.Formula))
                    # Nome del foglio
                    if xl_app.ActiveSheet.Name:
                        specific_context['worksheets'].append(xl_app.ActiveSheet.Name)
                    # Nome del workbook
                    if xl_app.ActiveWorkbook and xl_app.ActiveWorkbook.Name:
                        specific_context['workbook_name'] = xl_app.ActiveWorkbook.Name
            except Exception as com_error:
                # Traceback might be too noisy for this
                logger.warning(f"COM automation non disponibile: {com_error}")
                # Fallback: usa pywinauto per ottenere informazioni base
                try:
                    excel_elements = window.descendants()
                    # Cerca elementi specifici di Excel
                    for element in excel_elements:
                        try:
                            element_text = element.window_text()
                            control_type = element.element_info.control_type
                            # Rileva schede del foglio
                            if 'Sheet' in element_text or 'Foglio' in element_text:
                                specific_context['worksheets'].append(element_text)
                            # Rileva formule nella barra formula
                            if element_text.startswith('='):
                                specific_context['visible_formulas'].append(element_text)
                            # Rileva scheda ribbon attiva
                            if control_type == 'TabItem' and element.has_keyboard_focus():
                                specific_context['ribbon_tab'] = element_text
                        except Exception:  # noqa: E722, Bare except for safety in loop
                            continue
                except Exception as e_detail:
                    logger.warning(
                        f"Dettagli Excel pywinauto non disponibili: {e_detail}"
                    )
            app_info['specific_context'] = specific_context
            logger.info(f"Contesto Excel analizzato: {specific_context}")
            return app_info
        except Exception as e_main:
            logger.error(f"Errore analisi Excel: {e_main}", exc_info=True)
            # Ritorna un contesto base in caso di errore
            app_info['specific_context'] = {  # noqa: E501
                'worksheets': ['Foglio1'],
                'active_cell': 'A1',
                'selected_range': None,  # noqa: E501
                'visible_formulas': [],
                'ribbon_tab': None,
                'error': str(e_main)
            }
            return app_info

    def analyze_word_context(self, window, app_info: Dict) -> Dict:
        """Analisi specifica per Word."""
        try:
            app_info['app_name'] = 'word'
            specific_context = {
                'document_name': app_info['window_title'],
                'ribbon_tab': None,
                'selection_info': None
            }
            app_info['specific_context'] = specific_context
            return app_info
        except Exception:  # noqa: E722
            logger.error("Errore analisi Word", exc_info=True)
            return app_info

    def analyze_browser_context(self, window, app_info: Dict) -> Dict:
        """Analisi specifica per browser."""
        try:
            app_info['app_name'] = 'browser'
            specific_context = {
                'page_title': app_info['window_title'],
                'url_info': 'unknown'
            }
            app_info['specific_context'] = specific_context
            return app_info
        except Exception:  # noqa: E722
            logger.error("Errore analisi browser", exc_info=True)
            return app_info

    def extract_text_advanced(self, image: Image.Image) -> str:
        """Estrazione testo avanzata con OCR."""
        try:
            if not image:
                return ""
            # Converti in array numpy per opencv
            img_array = np.array(image)
            img_gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            # Miglioramento immagine per OCR
            img_enhanced = cv2.convertScaleAbs(img_gray, alpha=1.2, beta=10)
            # OCR con configurazioni ottimizzate
            custom_config = r'--oem 3 --psm 6 -l ita+eng'  # noqa: E501
            text = pytesseract.image_to_string(img_enhanced, config=custom_config)
            # Pulisci il testo
            cleaned_text = ' '.join(text.split())
            return cleaned_text[:2000]  # Limita lunghezza per API
        except Exception:  # noqa: E722
            logger.error("Errore OCR", exc_info=True)
            return ""

    def generate_ai_suggestion(  # noqa: E501
            self, screenshot: Image.Image, context_data: Dict
    ) -> Optional[Dict]:
        """Genera suggerimento usando Gemini 2.0 e lo stampa su stdout."""
        try:
            import random  # Keep import here if only used in this function
            if not self.gemini_model or not screenshot:
                suggestion = self.get_fallback_suggestion(context_data)
            else:
                # Prepara il prompt contestuale
                app_name = context_data.get('app_info', {}).get('app_name', 'unknown')
                window_title = context_data.get('app_info', {}).get('window_title', '')
                ocr_text = context_data.get('ocr_text', '')
                prompt = self.build_contextual_prompt(app_name, window_title, ocr_text, context_data)
                # Chiamata a Gemini con immagine
                response = self.gemini_model.generate_content([
                    prompt,
                    screenshot
                ])
                if response and response.text:
                    suggestion_text = response.text.strip()
                    # Genera suggestion_id univoco
                    suggestion_id = f"suggestion_{int(time.time())}_{random.randint(1000, 9999)}"
                    # Prova a parsare come JSON, altrimenti usa come testo semplice
                    try:
                        parsed_response = json.loads(suggestion_text)
                        if isinstance(parsed_response, dict):
                            title = parsed_response.get('title', 'Suggerimento AI')
                            text_content = parsed_response.get('text', suggestion_text)
                            tutorial_link = parsed_response.get('detailed_tutorial_link')
                        else:
                            title = 'Suggerimento AI'
                            text_content = suggestion_text
                            tutorial_link = None
                    except json.JSONDecodeError:
                        title = 'Suggerimento AI'
                        text_content = suggestion_text
                        tutorial_link = None
                    # Struttura la risposta
                    suggestion = {
                        'suggestion_id': suggestion_id,
                        'title': title,
                        'text': text_content,
                        'detailed_tutorial_link': tutorial_link,
                        'type': 'ai_suggestion',
                        'message': text_content,  # Compatibilità
                        'app': app_name,
                        'context': context_data.get('app_info', {}).get('specific_context', {}),
                        'timestamp': time.time(),
                        'source': 'gemini_2.0'
                    }
                    self.stats['suggestions_generated'] += 1
                    self.update_daily_stats('suggestions_shown', 1)
                else:
                    suggestion = self.get_fallback_suggestion(context_data)
            # Stampa il suggerimento su stdout con prefissi specifici per Electron
            self._print_suggestion_to_stdout(suggestion)
            return suggestion
        except Exception:  # noqa: E722
            logger.error("Errore Gemini", exc_info=True)
            suggestion = self.get_fallback_suggestion(context_data)
            self._print_suggestion_to_stdout(suggestion)
            return suggestion

    def _print_suggestion_to_stdout(self, suggestion: Dict):
        """Stampa il suggerimento su stdout con formato JSON e prefissi."""
        try:
            # Converti il suggerimento in JSON
            # sys import already at top
            json_data = json.dumps(suggestion, ensure_ascii=False, separators=(',', ':'))
            # Stampa con prefisso e suffisso specifici
            print(f"AI_SUGGESTION_START{json_data}AI_SUGGESTION_END", flush=True)
            # Log per debug
            logger.info(
                f"Suggerimento inviato a Electron: {suggestion.get('message', 'N/A')[:100]}..."  # noqa: E501
            )
        except Exception:  # noqa: E722
            logger.error("Errore stampa suggerimento su stdout", exc_info=True)
            # Fallback: stampa un messaggio semplice
            fallback_error_msg = (
                f"AI_SUGGESTION_START{{\"type\":\"error\",\"message\":"
                f"\"Errore nella generazione del suggerimento\",\"timestamp\":{time.time()}}}"  # noqa: E501
                f"AI_SUGGESTION_END"
            )
            print(fallback_error_msg, flush=True)
            logger.error(
                f"Inviato fallback error message a stdout: {fallback_error_msg}"  # noqa: E501
            )

    def build_contextual_prompt(  # noqa: E501
            self, app_name: str, window_title: str,
            ocr_text: str, context_data: Dict
    ) -> str:
        """Costruisce prompt contestuale per Gemini."""
        base_prompt = f"""
        Sei un assistente AI esperto nell'uso di software per ufficio.
        L'utente ha premuto F12 per richiedere aiuto.
        CONTESTO:
        - Applicazione attiva: {app_name}
        - Titolo finestra: {window_title}
        - Testo visibile (OCR): {ocr_text[:500]}
        COMPITO:
        Analizza lo screenshot e fornisci un suggerimento pratico e specifico in italiano.
        Il suggerimento deve essere:
        1. Breve (max 60 parole)
        2. Azionabile (con shortcut se utili)
        3. Contestuale alla situazione mostrata
        4. Professionale ma amichevole
        """
        # Aggiungi prompt specifici per applicazione
        if app_name == 'excel':
            excel_context = context_data.get('app_info', {}).get('specific_context', {})
            base_prompt += """
            SUGGERIMENTI SPECIFICI EXCEL:
            - Se vedi una tabella: suggerisci formattazione, filtri, o funzioni utili
            - Se vedi formule: suggerisci ottimizzazioni o funzioni alternative
            - Se vedi grafici: suggerisci miglioramenti visuali
            - Se vedi errori: fornisci soluzioni specifiche
            - Includi sempre shortcut da tastiera quando utili (es. Ctrl+T,
              Ctrl+L, etc.)
            """
            if excel_context:
                base_prompt += f"""
            CONTESTO EXCEL SPECIFICO (ottenuto tramite automazione):
            - Workbook: {excel_context.get('workbook_name', 'N/A')}
            - Fogli di lavoro: {excel_context.get('worksheets', [])}
            - Cella attiva: {excel_context.get('active_cell', 'N/A')}
            - Valore cella attiva: {excel_context.get('cell_value', 'N/A')}
            - Range selezionato: {excel_context.get('selected_range', 'N/A')}
            - Formula nella barra: {excel_context.get('visible_formulas', [])}
            - Tab ribbon attivo: {excel_context.get('ribbon_tab', 'N/A')}
            Basa il tuo suggerimento su queste informazioni specifiche.
            Se la cella contiene una formula, suggerisci miglioramenti o alternative.
            Se è selezionato un range, suggerisci operazioni utili su quel range.
            Se la cella è vuota, suggerisci cosa inserire basandoti sul contesto.
            """
                if excel_context.get('visible_formulas'):
                    base_prompt += (
                        "\nNota: È presente una formula - considera suggerimenti "
                        "per ottimizzarla o spiegarla."
                    )
                if excel_context.get('cell_value') and \
                   str(excel_context.get('cell_value')).replace('.', '').replace(',', '').isdigit():
                    base_prompt += (
                        "\nNota: La cella contiene un valore numerico - considera "
                        "suggerimenti per calcoli o formattazione."
                    )
                if excel_context.get('selected_range') and \
                   ':' in str(excel_context.get('selected_range', '')):
                    base_prompt += (
                        "\nNota: È selezionato un range di celle - suggerisci "
                        "operazioni su intervalli (somma, media, grafici, ecc.)."
                    )
        elif app_name == 'word':
            base_prompt += """
            SUGGERIMENTI SPECIFICI WORD:  # noqa: E501
            - Se vedi testo: suggerisci formattazione o stili
            - Se vedi tabelle: suggerisci miglioramenti layout
            - Se vedi problemi di impaginazione: fornisci soluzioni
            - Includi shortcut utili (es. Ctrl+H, Ctrl+G, etc.)
            """
        elif app_name == 'powerpoint':
            base_prompt += (
                "\nFornisci suggerimenti specifici per PowerPoint come layout, "
                "animazioni, o design delle slide."
            )
        base_prompt += """
FORMATO RISPOSTA:
Rispondi SEMPRE in formato JSON con questa struttura:
{
  "title": "Titolo breve del suggerimento (max 30 caratteri)",
  "text": "Testo del suggerimento dettagliato (max 100 parole)",
  "detailed_tutorial_link": "URL tutorial se disponibile (opzionale)"
}
Esempi di URL tutorial utili:
- Excel: https://support.microsoft.com/it-it/office/excel  # noqa: E501
- Word: https://support.microsoft.com/it-it/office/word  # noqa: E501
- PowerPoint: https://support.microsoft.com/it-it/office/powerpoint  # noqa: E501
Se non hai un link specifico, ometti il campo detailed_tutorial_link.
RISPONDI SOLO CON IL JSON, SENZA ALTRO TESTO.
        """
        return base_prompt

    def get_fallback_suggestion(self, context_data: Dict) -> Dict:
        """Suggerimenti di fallback senza AI."""
        app_name = context_data.get('app_info', {}).get('app_name', 'unknown')
        fallback_suggestions = {
            'excel': [
                "[TABELLA] Prova Ctrl+T per convertire i dati in tabella formattata",
                "[FILTRI] Usa Ctrl+Shift+L per attivare/disattivare i filtri automatici",
                "[GRAFICO] Seleziona i dati e premi Alt+F1 per un grafico veloce",
                "[RICERCA] Usa Ctrl+F per aprire la ricerca avanzata",
                "[INCOLLA] Prova Ctrl+Shift+V per incollare speciale con opzioni"
            ],
            'word': [
                "[SOSTITUISCI] Usa Ctrl+H per aprire Trova e Sostituisci",
                "[PAGINA] Premi Ctrl+Enter per inserire un'interruzione di pagina",
                "[FORMATO] Seleziona testo e usa Ctrl+D per formattazione carattere",
                "[RIPETI] Usa F4 per ripetere l'ultima azione",
                "[NAVIGA] Premi Ctrl+G per andare a pagina/riga specifica"
            ],
            'browser': [
                "[RIPRISTINA] Usa Ctrl+Shift+T per riaprire l'ultima scheda chiusa",
                "[INDIRIZZO] Premi Ctrl+L per selezionare la barra degli indirizzi",
                "[SEGNALIBRI] Usa Ctrl+Shift+O per aprire il gestore segnalibri",
                "[DEV] Premi F12 per aprire gli strumenti sviluppatore"
            ]
        }
        import random  # Keep import here if only used in this function
        suggestions = fallback_suggestions.get(app_name, fallback_suggestions['excel'])
        message = random.choice(suggestions)
        return {
            'type': 'fallback_suggestion',
            'message': message,
            'app': app_name,
            'timestamp': time.time(),
            'source': 'fallback'
        }

    def send_suggestion_to_overlay(self, suggestion: Dict):
        """Invia suggerimento all'overlay Electron."""
        try:
            logger.info(f"💡 SUGGERIMENTO: {suggestion.get('message', 'N/A')}")
            self.suggestions_history.append(suggestion)
            # _overlay_data = {
            #     'type': 'suggestion',
            #     'message': suggestion['message'],
            #     'timestamp': suggestion['timestamp']
            # }
            # TODO: Implementare invio reale all'overlay Electron
            return True
        except Exception:  # noqa: E722
            logger.error("Errore invio overlay", exc_info=True)
            return False

    def save_suggestion_to_db(self, context_data: Dict, suggestion: Dict):
        """Salva suggerimento nel database locale."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO suggestions_history
                (app_name, context_data, suggestion_text, user_action, screenshot_path)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                context_data.get('app_info', {}).get('app_name', 'unknown'),
                json.dumps(context_data),
                suggestion['message'],
                'shown',
                None  # Per ora non salviamo screenshot
            ))
            conn.commit()
            conn.close()
        except Exception:  # noqa: E722
            logger.error("Errore salvataggio DB", exc_info=True)

    def save_feedback_to_db(self, feedback_data: Dict):
        """Salva feedback utente nel database."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            # Crea tabella suggestions_log se non esiste
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS suggestions_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    suggestion_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    user_action TEXT,
                    suggestion_data TEXT,
                    session_info TEXT,
                    timestamp REAL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            # Inserisci feedback
            cursor.execute('''
                INSERT INTO suggestions_log
                (suggestion_id, action, user_action, suggestion_data, session_info, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                feedback_data.get('suggestion_id'),
                feedback_data.get('action'),
                feedback_data.get('user_action'),
                json.dumps(feedback_data.get('suggestion_data', {})),
                json.dumps(feedback_data.get('session_info', {})),
                feedback_data.get('timestamp')
            ))
            conn.commit()
            conn.close()
            logger.info(f"Feedback salvato: {feedback_data.get('suggestion_id')}")
        except Exception:  # noqa: E722
            logger.error("Errore salvataggio feedback", exc_info=True)

    def update_daily_stats(self, metric: str, increment: int = 1):
        """Aggiorna statistiche giornaliere."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            # Insert or update today's stats
            cursor.execute(f'''
                INSERT OR IGNORE INTO usage_stats (date) VALUES (CURRENT_DATE)
            ''')
            cursor.execute(f'''
                UPDATE usage_stats
                SET {metric} = {metric} + ?
                WHERE date = CURRENT_DATE
            ''', (increment,))
            conn.commit()
            conn.close()
        except Exception:  # noqa: E722
            logger.error("Errore aggiornamento stats", exc_info=True)

    def get_analytics_data(self) -> Dict:
        """Ottieni dati analytics."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            # Stats giornaliere
            cursor.execute('''
                SELECT * FROM usage_stats
                ORDER BY date DESC
                LIMIT 7
            ''')
            daily_stats = cursor.fetchall()
            # Suggerimenti recenti
            cursor.execute('''
                SELECT * FROM suggestions_history
                ORDER BY timestamp DESC
                LIMIT 10
            ''')
            recent_suggestions = cursor.fetchall()
            conn.close()
            return {
                'daily_stats': daily_stats,
                'recent_suggestions': recent_suggestions,
                'session_stats': self.stats
            }
        except Exception as e:  # Keep 'e' for the message
            # Original print for this one as it's a direct return for Flask
            print(f"[ERRORE] Errore lettura analytics: {e}")  # noqa: E501
            return {'error': str(e)}


# Istanza globale del monitor
logger.info("Creazione istanza AdvancedScreenMonitor")
monitor = AdvancedScreenMonitor()


# API Routes aggiornate
@app.route('/start_hotkey', methods=['POST'])
def start_hotkey_monitoring_route():  # Renamed to avoid conflict
    """Avvia monitoraggio hotkey F12."""
    try:
        data = request.get_json() or {}
        # Configura Gemini se fornita API key
        if 'gemini_api_key' in data:
            if monitor.setup_gemini(data['gemini_api_key']):
                logger.info(
                    "Gemini configurato tramite API endpoint /start_hotkey"
                )
            else:
                logger.warning(
                    "Gemini non configurato tramite API /start_hotkey, fallback"
                )
        result = monitor.start_hotkey_monitoring()
        return jsonify(result)
    except Exception as e:
        logger.error("Errore in /start_hotkey endpoint", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/stop_hotkey', methods=['POST'])
def stop_hotkey_monitoring_route():  # Renamed
    """Ferma monitoraggio hotkey."""
    try:
        result = monitor.stop_hotkey_monitoring()
        return jsonify(result)
    except Exception as e:
        logger.error("Errore in /stop_hotkey endpoint", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/status', methods=['GET'])
def get_status_route():  # Renamed
    """Status completo del sistema."""
    return jsonify({
        "hotkey_active": monitor.monitoring_active,
        "gemini_configured": monitor.gemini_model is not None,
        "stats": monitor.stats,
        "suggestions_count": len(monitor.suggestions_history)
    })


@app.route('/analytics', methods=['GET'])
def get_analytics_route():  # Renamed
    """Ottieni dati analytics."""
    return jsonify(monitor.get_analytics_data())


@app.route('/manual_suggestion', methods=['POST'])
def manual_suggestion_route():  # Renamed
    """Richiesta manuale di suggerimento (simula F12)."""
    try:
        # Simula pressione F12
        monitor.on_f12_pressed()
        return jsonify({"status": "triggered", "message": "Analisi avviata"})
    except Exception as e:
        logger.error("Errore in /manual_suggestion endpoint", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/feedback', methods=['POST'])
def user_feedback_route():  # Renamed
    """Ricevi feedback utente sui suggerimenti."""
    try:
        data = request.get_json()
        suggestion_id = data.get('suggestion_id')
        action = data.get('action')  # 'accept', 'dismiss'
        user_action = data.get('user_action')  # 'accepted', 'dismissed', 'opened_tutorial'
        suggestion_data = data.get('suggestion_data', {})
        timestamp = data.get('timestamp', time.time())
        session_info = data.get('session_info', {})
        # Aggiorna statistiche
        if action == 'accept':
            monitor.stats['suggestions_accepted'] += 1
            monitor.update_daily_stats('suggestions_accepted', 1)
        elif action == 'dismiss':
            monitor.stats['suggestions_dismissed'] += 1
            # Assuming you want to track dismissals in daily_stats as well
            monitor.update_daily_stats('suggestions_dismissed', 1)
        # Salva feedback completo nel database
        monitor.save_feedback_to_db({
            'suggestion_id': suggestion_id,
            'action': action,
            'user_action': user_action,
            'suggestion_data': suggestion_data,
            'timestamp': timestamp,
            'session_info': session_info
        })
        logger.info(
            f"Feedback ricevuto: {action} per suggestion {suggestion_id}"
        )
        return jsonify({
            "status": "feedback_received",
            "suggestion_id": suggestion_id,
            "action": action
        })
    except Exception as e:
        logger.error("Errore feedback endpoint", exc_info=True)
        return jsonify({"error": str(e)}), 500


def test_tesseract_ocr():
    """Test Tesseract OCR functionality with a dummy image."""
    try:
        logger.info("Starting Tesseract OCR test...")
        # Create a dummy image
        img = Image.new('RGB', (400, 100), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        try:
            # Attempt to load a common system font
            font = ImageFont.truetype("arial.ttf", 30)
        except IOError:
            logger.warning(
                "arial.ttf not found, using default font for Tesseract test image."
            )
            font = ImageFont.load_default()
        test_text = "Hello Tesseract 123"
        d.text((10, 10), test_text, fill=(0, 0, 0), font=font)
        # Perform OCR
        text_content = pytesseract.image_to_string(img)
        # Normalize text for comparison
        normalized_text = " ".join(text_content.split()).lower()
        normalized_test_text = test_text.lower()

        if normalized_test_text in normalized_text:
            logger.info(
                f"Tesseract OCR is working correctly. Detected: '{text_content.strip()}'"  # noqa: E501
            )
        else:
            logger.warning(  # noqa: E501
                f"Tesseract OCR produced unexpected output. Expected to find "
                f"'{test_text}', but got: '{text_content.strip()}'"  # noqa: E501
            )
    except pytesseract.TesseractNotFoundError:
        logger.error(  # noqa: E501
            "Tesseract OCR test failed: Tesseract is not installed or not found in PATH.",  # noqa: E501
            exc_info=True
        )
        logger.info(  # noqa: E501
            "Ensure Tesseract is installed. If it's installed in a custom "
            "location, set 'pytesseract.tesseract_cmd' to the full path of "
            "'tesseract.exe'."  # noqa: E501
        )
        if hasattr(pytesseract.pytesseract, 'tesseract_cmd'):
            logger.info(f"Current pytesseract.tesseract_cmd: {pytesseract.pytesseract.tesseract_cmd}")  # noqa: E501
        else:
            logger.info("pytesseract.tesseract_cmd is not set.")
    except Exception as e_ocr:  # noqa: E722
        logger.error(
            f"Tesseract OCR test failed with an unexpected error: {e_ocr}", exc_info=True  # noqa: E501
        )
        if hasattr(pytesseract.pytesseract, 'tesseract_cmd'):
            logger.info(f"Current pytesseract.tesseract_cmd: {pytesseract.pytesseract.tesseract_cmd}")  # noqa: E501
        else:
            logger.info("pytesseract.tesseract_cmd is not set.")


if __name__ == '__main__':
    logger.info("Application starting...")
    # Configurazione Tesseract (Windows)
    # Attempt to set Tesseract command path,
    # but allow it to fail gracefully if not on Windows or Tesseract is in PATH
    try:
        if sys.platform == 'win32':  # Only set this on Windows
            # Check if the default path exists before setting it.
            tesseract_cmd_path = r'C:\\Program Files\\Tesseract-OCR\\tesseract.exe'  # noqa: E501
            if os.path.exists(tesseract_cmd_path):
                pytesseract.pytesseract.tesseract_cmd = tesseract_cmd_path
                logger.info(
                    f"Set pytesseract.tesseract_cmd to: {tesseract_cmd_path}"  # noqa: E501
                )
            else:
                logger.warning(  # noqa: E501
                    f"Default Tesseract path not found: {tesseract_cmd_path}. "
                    "Please ensure Tesseract is in PATH or configure tesseract_cmd."  # noqa: E501
                )
        else:
            logger.info(
                "Not on Windows, assuming Tesseract is in PATH if needed."
            )
    except Exception as e:
        logger.error(
            f"Error during Tesseract path configuration: {e}", exc_info=True
        )

    test_tesseract_ocr()  # Call the test function once

    logger.info("AI Instructor Agent v2.0 - Backend starting")
    logger.info("Main features:")
    logger.info("  - [HOTKEY] F12 hotkey for on-demand assistance")
    logger.info(
        "  - [AI] Gemini 2.0 integration for multimodal analysis"
    )
    logger.info("  - [ANALYSIS] Deep analysis with pywinauto")
    logger.info("  - [DB] Local database for persistence")
    logger.info("  - [STATS] Usage analytics and statistics")
    logger.info("Flask server starting on http://localhost:5001")
    try:
        app.run(host='localhost', port=5001, debug=False)
    except Exception:  # noqa: E722
        logger.critical("Flask app failed to run", exc_info=True)