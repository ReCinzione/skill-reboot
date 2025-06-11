from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    return jsonify({"status": "Backend attivo", "message": "Test server funzionante"})

@app.route('/test')
def test():
    return jsonify({"test": "ok"})

if __name__ == '__main__':
    print("🚀 Test Server avviato")
    print("📡 Server in ascolto su http://localhost:5001")
    app.run(host='localhost', port=5001, debug=False)