from flask import Flask, render_template, send_from_directory, request, jsonify
from flask_cors import CORS
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import csv
import io
from datetime import datetime

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app, resources={r"/api/*": {"origins": "*"}})

def get_db_connection():
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise Exception('DATABASE_URL no está configurada en los Secrets.')
    return psycopg2.connect(database_url, cursor_factory=RealDictCursor)

def init_db():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS operaciones (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                cuenta_id TEXT NOT NULL,
                fecha DATE NOT NULL,
                tipo TEXT,
                activo TEXT,
                estrategia TEXT,
                contratos INTEGER,
                tipo_entrada TEXT,
                tipo_salida TEXT,
                hora_entrada TIME,
                hora_salida TIME,
                importe DECIMAL(12,2) NOT NULL,
                animo TEXT,
                notas TEXT,
                media_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, cuenta_id, fecha, hora_entrada, importe)
            )
        ''')
        conn.commit()
        cur.close()
        conn.close()
        print("Base de datos inicializada correctamente")
    except Exception as e:
        print(f"Error inicializando la base de datos: {e}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/logo.jpg')
def serve_logo():
    return send_from_directory(app.static_folder, 'logo.jpg')

@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory(app.static_folder, 'manifest.json')

@app.route('/sw.js')
def serve_sw():
    return send_from_directory(app.static_folder, 'sw.js')

@app.route('/api/operaciones', methods=['GET'])
def obtener_operaciones():
    try:
        user_id = request.args.get('user_id')
        cuenta_id = request.args.get('cuenta_id')
        
        if not user_id or not cuenta_id:
            return jsonify({'error': 'Se requiere user_id y cuenta_id'}), 400
        
        print(f"Obteniendo operaciones para user_id={user_id}, cuenta_id={cuenta_id}")
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            SELECT * FROM operaciones 
            WHERE user_id = %s AND cuenta_id = %s 
            ORDER BY fecha DESC, hora_entrada DESC
        ''', (user_id, cuenta_id))
        operaciones = cur.fetchall()
        cur.close()
        conn.close()
        
        result = []
        for op in operaciones:
            result.append({
                'id': op['id'],
                'user_id': op['user_id'],
                'cuenta_id': op['cuenta_id'],
                'fecha': str(op['fecha']) if op['fecha'] else None,
                'tipo': op['tipo'],
                'activo': op['activo'],
                'estrategia': op['estrategia'],
                'contratos': op['contratos'],
                'tipo_entrada': op['tipo_entrada'],
                'tipo_salida': op['tipo_salida'],
                'hora_entrada': str(op['hora_entrada']) if op['hora_entrada'] else None,
                'hora_salida': str(op['hora_salida']) if op['hora_salida'] else None,
                'importe': float(op['importe']) if op['importe'] else 0,
                'animo': op['animo'],
                'notas': op['notas'],
                'media_url': op['media_url']
            })
        
        print(f"Devolviendo {len(result)} operaciones")
        return jsonify({'success': True, 'operaciones': result})
        
    except Exception as e:
        print(f"ERROR obteniendo operaciones: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/operaciones', methods=['POST'])
def crear_operacion():
    try:
        if not request.is_json:
            return jsonify({'error': 'La petición debe ser de tipo JSON'}), 400

        data = request.get_json()
        print(f"DATOS RECIBIDOS para guardar operación: {data}")
        
        user_id = data.get('user_id')
        cuenta_id = data.get('cuenta_id')
        fecha = data.get('fecha')
        importe = data.get('importe')
        
        if not user_id or not cuenta_id or not fecha or importe is None:
            return jsonify({'error': 'Faltan campos obligatorios: user_id, cuenta_id, fecha, importe'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute('''
            INSERT INTO operaciones (user_id, cuenta_id, fecha, tipo, activo, estrategia, 
                                     contratos, tipo_entrada, tipo_salida, hora_entrada, 
                                     hora_salida, importe, animo, notas, media_url)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (user_id, cuenta_id, fecha, hora_entrada, importe) DO NOTHING
            RETURNING id
        ''', (
            user_id,
            cuenta_id,
            fecha,
            data.get('tipo'),
            data.get('activo'),
            data.get('estrategia'),
            data.get('contratos'),
            data.get('tipo_entrada'),
            data.get('tipo_salida'),
            data.get('hora_entrada'),
            data.get('hora_salida'),
            importe,
            data.get('animo'),
            data.get('notas'),
            data.get('media_url')
        ))
        
        result = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if result:
            print(f"Operación guardada con ID: {result['id']}")
            return jsonify({'success': True, 'id': result['id'], 'mensaje': 'Operación guardada correctamente'})
        else:
            print("Operación duplicada, no se insertó")
            return jsonify({'success': True, 'duplicado': True, 'mensaje': 'Operación duplicada, no se insertó'})
            
    except Exception as e:
        print(f"ERROR guardando operación: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/operaciones/<int:id>', methods=['DELETE'])
def eliminar_operacion(id):
    try:
        user_id = request.args.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'Se requiere user_id'}), 400
        
        print(f"Eliminando operación id={id} para user_id={user_id}")
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('DELETE FROM operaciones WHERE id = %s AND user_id = %s RETURNING id', (id, user_id))
        result = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if result:
            print(f"Operación {id} eliminada correctamente")
            return jsonify({'success': True, 'mensaje': 'Operación eliminada correctamente'})
        else:
            return jsonify({'error': 'Operación no encontrada'}), 404
            
    except Exception as e:
        print(f"ERROR eliminando operación: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/operaciones/<int:id>', methods=['PUT'])
def actualizar_operacion(id):
    try:
        if not request.is_json:
            return jsonify({'error': 'La petición debe ser de tipo JSON'}), 400

        data = request.get_json()
        print(f"Actualizando operación id={id}: {data}")
        
        user_id = data.get('user_id')
        if not user_id:
            return jsonify({'error': 'Se requiere user_id'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute('''
            UPDATE operaciones 
            SET fecha = %s, tipo = %s, activo = %s, estrategia = %s, 
                contratos = %s, tipo_entrada = %s, tipo_salida = %s, 
                hora_entrada = %s, hora_salida = %s, importe = %s, 
                animo = %s, notas = %s, media_url = %s
            WHERE id = %s AND user_id = %s
            RETURNING id
        ''', (
            data.get('fecha'),
            data.get('tipo'),
            data.get('activo'),
            data.get('estrategia'),
            data.get('contratos'),
            data.get('tipo_entrada'),
            data.get('tipo_salida'),
            data.get('hora_entrada'),
            data.get('hora_salida'),
            data.get('importe'),
            data.get('animo'),
            data.get('notas'),
            data.get('media_url'),
            id,
            user_id
        ))
        
        result = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if result:
            print(f"Operación {id} actualizada correctamente")
            return jsonify({'success': True, 'mensaje': 'Operación actualizada correctamente'})
        else:
            return jsonify({'error': 'Operación no encontrada'}), 404
            
    except Exception as e:
        print(f"ERROR actualizando operación: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/importar-csv', methods=['POST'])
def importar_csv():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No se encontró el archivo en la petición'}), 400

        file = request.files['file']
        cuenta_id = request.form.get('cuenta_id')
        user_id = request.form.get('user_id')
        
        if not cuenta_id or not user_id:
            return jsonify({'error': 'Se requiere cuenta_id y user_id'}), 400
        
        print(f"ARCHIVO RECIBIDO para importar: {file.filename}")
        
        content = file.read().decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(content))
        
        operaciones = []
        for row in csv_reader:
            fecha = None
            importe = 0
            hora_entrada = None
            hora_salida = None
            activo = None
            tipo = None
            contratos = None
            
            if 'Entry time' in row:
                try:
                    entry_time = row.get('Entry time', '')
                    if entry_time:
                        dt = datetime.strptime(entry_time.split('.')[0], '%Y-%m-%dT%H:%M:%S')
                        fecha = dt.strftime('%Y-%m-%d')
                        hora_entrada = dt.strftime('%H:%M:%S')
                except:
                    pass
            
            if 'Exit time' in row:
                try:
                    exit_time = row.get('Exit time', '')
                    if exit_time:
                        dt = datetime.strptime(exit_time.split('.')[0], '%Y-%m-%dT%H:%M:%S')
                        hora_salida = dt.strftime('%H:%M:%S')
                except:
                    pass
            
            if 'fecha' in row:
                fecha = row.get('fecha')
            
            if 'Profit' in row:
                try:
                    profit_str = row.get('Profit', '0').replace('$', '').replace(',', '').strip()
                    importe = float(profit_str)
                except:
                    importe = 0
            elif 'importe' in row:
                try:
                    importe = float(row.get('importe', 0))
                except:
                    importe = 0
            
            if 'Instrument' in row:
                activo = row.get('Instrument')
            elif 'activo' in row:
                activo = row.get('activo')
            
            if 'Market pos.' in row:
                pos = row.get('Market pos.', '').lower()
                if 'long' in pos:
                    tipo = 'bullish'
                elif 'short' in pos:
                    tipo = 'bearish'
            elif 'tipo' in row:
                tipo = row.get('tipo')
            
            if 'Qty' in row:
                try:
                    contratos = int(row.get('Qty', 0))
                except:
                    contratos = None
            elif 'contratos' in row:
                try:
                    contratos = int(row.get('contratos', 0))
                except:
                    contratos = None
            
            if fecha:
                operaciones.append({
                    'fecha': fecha,
                    'tipo': tipo,
                    'activo': activo,
                    'estrategia': row.get('estrategia'),
                    'contratos': contratos,
                    'tipoEntrada': row.get('tipo_entrada'),
                    'tipoSalida': row.get('tipo_salida'),
                    'hora_entrada': hora_entrada,
                    'hora_salida': hora_salida,
                    'importe': importe
                })
        
        print(f"Se procesaron {len(operaciones)} operaciones del CSV")
        
        return jsonify({
            'success': True,
            'mensaje': f'Se procesaron {len(operaciones)} operaciones del archivo CSV.',
            'operaciones': operaciones,
            'total_procesadas': len(operaciones)
        })
        
    except Exception as e:
        print(f"ERROR importando CSV: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5000, debug=True)
