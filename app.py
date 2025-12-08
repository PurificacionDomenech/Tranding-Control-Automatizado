from flask import Flask, render_template, jsonify, request
import os

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/trades', methods=['GET'])
def get_trades():
    # Placeholder for future trading data
    return jsonify([])

@app.route('/api/trades', methods=['POST'])
def add_trade():
    # Placeholder for adding trading records
    data = request.get_json()
    return jsonify({'status': 'success', 'message': 'Trade registered'}), 201

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
