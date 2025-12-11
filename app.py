from flask import Flask, render_template, send_from_directory, request, jsonify
from flask_cors import CORS
import os
import psycopg2
from psycopg2.extras import execute_values

# --- 1. CONFIGURACIÓN INICIAL Y CORS ---
app = Flask(__name__, template_folder='templates', static_folder='static')
# Esta es la línea clave que soluciona el "Failed to fetch".
# Le da permiso a tu frontend para que hable con el backend.
CORS(app, resources={r"/api/*": {"origins": "*"}})


# --- FUNCIÓN DE CONEXIÓN A LA BASE DE DATOS ---
def get_db_connection():
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise Exception('DATABASE_URL no está configurada en los Secrets.')
    return psycopg2.connect(database_url)


# --- RUTAS PARA SERVIR LA APLICACIÓN (HTML/CSS/JS) ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(app.static_folder, filename)


# --- ENDPOINTS DE LA API ---

# --- ENDPOINT PARA GUARDAR UNA OPERACIÓN MANUAL ---
@app.route('/api/operaciones', methods=['POST'])
def crear_operacion():
    # Esta es la solución al "Bad Request".
    # Nos aseguramos de que los datos que llegan son un JSON válido.
    if not request.is_json:
        return jsonify({'error': 'La petición debe ser de tipo JSON'}), 400

    data = request.get_json()
    print(f"✅ DATOS RECIBIDOS para guardar operación: {data}") # Logging para depurar

    # Aquí iría la lógica para insertar 'data' en la tabla 'operaciones' de Supabase.
    # Por ahora, simulamos que funciona para probar la conexión.

    return jsonify({'success': True, 'mensaje': '¡Conexión exitosa! El backend recibió la operación.'})


# --- ENDPOINT PARA IMPORTAR OPERACIONES ---
@app.route('/api/importar-csv', methods=['POST'])
def importar_csv():
    # Solución al "Bad Request" para la importación.
    if 'file' not in request.files:
        return jsonify({'error': 'No se encontró el archivo en la petición'}), 400

    file = request.files['file']
    print(f"✅ ARCHIVO RECIBIDO para importar: {file.filename}") # Logging

    # Aquí iría toda tu lógica avanzada para procesar el CSV, evitar duplicados, etc.
    # Por ahora, simulamos que funciona.

    return jsonify({
        'success': True,
        'mensaje': '¡Conexión exitosa! El backend recibió el archivo CSV.',
        'total_importadas': 5, # Datos de ejemplo
        'total_duplicados': 2  # Datos de ejemplo
    })


# --- EJECUCIÓN DE LA APLICACIÓN ---
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)