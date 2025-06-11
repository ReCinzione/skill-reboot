# AI Instructor Agent

🤖 **AI-powered desktop instructor that monitors user activity and provides real-time guidance**

An intelligent desktop application that uses computer vision, OCR, and AI to monitor user activity and provide contextual suggestions and guidance in real-time.

## ✨ Features

- **Real-time Screen Monitoring**: Captures and analyzes screen content using computer vision
- **OCR Text Recognition**: Extracts text from screenshots using Tesseract OCR
- **AI-Powered Suggestions**: Uses Google Gemini AI to provide contextual guidance
- **Hotkey Activation**: Press F12 to activate AI analysis of current screen
- **Application Detection**: Automatically detects active applications and context
- **Local Database**: Stores suggestions history and analytics locally
- **Modern UI**: Clean Electron-based interface with real-time status updates

## 🏗️ Architecture

- **Frontend**: Electron app with HTML/CSS/JavaScript
- **Backend**: Python Flask API server
- **AI Integration**: Google Gemini API for intelligent suggestions
- **Database**: SQLite for local data storage
- **Computer Vision**: OpenCV for image processing
- **OCR**: Tesseract for text extraction

## 📋 Prerequisites

### Software Required:
1. **Node.js** (v16 or higher) - [Download](https://nodejs.org/)
2. **Python** (v3.8 or higher) - [Download](https://python.org/)
3. **Tesseract OCR** - [Download](https://tesseract-ocr.github.io/tessdoc/Installation.html)
4. **Google Gemini API Key** - [Get API Key](https://makersuite.google.com/app/apikey)

### For Windows:
- Install Tesseract and add to PATH environment variables
- Default path: `C:\Program Files\Tesseract-OCR\tesseract.exe`

## 🚀 Installation

### 1. Clone the repository:
```bash
git clone https://github.com/ReCinzione/skill-reboot.git
cd skill-reboot
```

### 2. Install Node.js dependencies:
```bash
npm install
```

### 3. Install Python dependencies:
```bash
pip install -r python/requirements.txt
```

### 4. Configure API Key:
- Launch the application
- Enter your Google Gemini API key in the settings
- The key will be stored securely locally

## ▶️ Usage

### Start the application:
```bash
npm start
```

### Development mode:
```bash
npm run dev
```

### How to use:
1. Launch the application
2. Enter your Google Gemini API key
3. Click "Start Monitoring" to begin screen analysis
4. Press **F12** anytime to get AI suggestions for current screen content
5. View suggestions in the overlay or main interface

## 📁 Project Structure

```
skill-reboot/
├── src/
│   ├── main.js              # Electron main process
│   └── renderer/
│       ├── index.html       # Main UI
│       ├── overlay.html     # Overlay UI
│       └── renderer.js      # Frontend logic
├── python/
│   ├── monitor.py           # Python backend server
│   ├── requirements.txt     # Python dependencies
│   └── test_server.py       # Testing utilities
├── package.json             # Node.js configuration
├── ai_instructor_local.db   # Local SQLite database
└── README.md               # This file
```

## 🔧 Configuration

### Environment Variables:
- `GEMINI_API_KEY`: Your Google Gemini API key (optional, can be set in UI)
- `PYTHONIOENCODING`: Set to 'utf-8' for Windows compatibility

### API Endpoints:
- `GET /status`: Check system status
- `POST /start_hotkey`: Start monitoring with API key
- `POST /stop_hotkey`: Stop monitoring
- `POST /analyze_screen`: Manual screen analysis
- `GET /suggestions`: Get suggestions history

## 🐛 Troubleshooting

### Common Issues:

1. **Python process fails to start**:
   - Ensure Python 3.8+ is installed
   - Check that all dependencies are installed: `pip install -r python/requirements.txt`
   - Verify Tesseract is in PATH

2. **Unicode encoding errors on Windows**:
   - Set environment variable: `PYTHONIOENCODING=utf-8`
   - The application includes automatic encoding fixes

3. **Tesseract not found**:
   - Install Tesseract OCR
   - Add to PATH or set `TESSERACT_CMD` environment variable

4. **API key issues**:
   - Verify your Gemini API key is valid
   - Check internet connection
   - Ensure API quotas are not exceeded

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Google Gemini AI for intelligent suggestions
- Tesseract OCR for text recognition
- OpenCV for computer vision capabilities
- Electron for cross-platform desktop app framework

## 📞 Support

If you encounter any issues or have questions, please [open an issue](https://github.com/ReCinzione/skill-reboot/issues) on GitHub.

---

**Made with ❤️ for enhanced productivity and learning**