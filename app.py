from flask import Flask, render_template, send_from_directory, request, jsonify
from flask_cors import CORS
import os
import csv
import io
from datetime import datetime
import psycopg2
from psycopg2.extras import execute_values

app = Flask(__name__)
CORS(app)  # Habilitar CORS para todas las rutas

def get_db_connection():
    """Obtiene conexión a la base de datos Supabase"""
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise Exception('DATABASE_URL no está configurada')
    return psycopg2.connect(database_url)

def detectar_formato_csv(headers):
    """Detecta si es formato Grid (ejecuciones) o formato Orders (órdenes)"""
    if 'E/X' in headers:
        return 'grid'
    elif 'Precio promedio' in headers:
        return 'orders'
    return 'unknown'

def traducir_operacion_grid(ejecucion_ninja):
    """Traduce formato Grid de NinjaTrader"""
    instrumento = ejecucion_ninja.get('Instrumento', '')
    accion = ejecucion_ninja.get('Acción', '')
    cantidad = ejecucion_ninja.get('Cantidad', '1')
    precio = ejecucion_ninja.get('Precio', '0')
    tiempo = ejecucion_ninja.get('Tiempo', '')
    entrada_salida = ejecucion_ninja.get('E/X', '')
    nombre = ejecucion_ninja.get('Nombre', '')
    cuenta = ejecucion_ninja.get('Nombre de cuenta de pantalla', '')

    precio_str = precio.replace(',', '.').replace('$', '').strip()
    try:
        precio_float = float(precio_str)
    except:
        precio_float = 0.0

    try:
        cantidad_int = int(cantidad)
    except:
        cantidad_int = 1

    fecha, hora = parsear_tiempo(tiempo)

    if 'Comprar' in accion:
        tipo = 'Alcista (Compra)'
    elif 'Vender' in accion:
        tipo = 'Bajista (Venta)'
    else:
        tipo = accion

    es_entrada = 'Entrada' in entrada_salida
    es_salida = 'Salida' in entrada_salida

    return {
        'instrumento': instrumento,
        'tipo_operacion': tipo,
        'contratos': cantidad_int,
        'precio': precio_float,
        'fecha': fecha,
        'hora': hora,
        'es_entrada': es_entrada,
        'es_salida': es_salida,
        'nombre_estrategia': nombre,
        'cuenta': cuenta,
        'accion_original': accion
    }

def traducir_operacion_orders(orden_ninja):
    """Traduce formato Orders de NinjaTrader"""
    instrumento = orden_ninja.get('Instrumento', '')
    accion = orden_ninja.get('Acción', '')
    cantidad = orden_ninja.get('Cantidad', '1')
    precio = orden_ninja.get('Precio promedio', '0')
    tiempo = orden_ninja.get('Tiempo', '')
    nombre = orden_ninja.get('Nombre', '')
    cuenta = orden_ninja.get('Nombre de cuenta de pantalla', '')
    estado = orden_ninja.get('Estado', '')
    completo = orden_ninja.get('Completo', '0')

    if estado != 'Completo':
        return None

    precio_str = str(precio).replace(',', '.').replace('$', '').strip()
    try:
        precio_float = float(precio_str)
    except:
        precio_float = 0.0

    if precio_float == 0:
        return None

    try:
        cantidad_int = int(completo) if completo else int(cantidad)
    except:
        cantidad_int = 1

    fecha, hora = parsear_tiempo(tiempo)

    if 'Comprar' in accion:
        tipo = 'Alcista (Compra)'
    elif 'Vender' in accion:
        tipo = 'Bajista (Venta)'
    else:
        tipo = accion

    nombre_lower = nombre.lower() if nombre else ''
    es_entrada = 'entry' in nombre_lower
    es_salida = any(x in nombre_lower for x in ['exit', 'stop', 'target', 'cerrar'])

    return {
        'instrumento': instrumento,
        'tipo_operacion': tipo,
        'contratos': cantidad_int,
        'precio': precio_float,
        'fecha': fecha,
        'hora': hora,
        'es_entrada': es_entrada,
        'es_salida': es_salida,
        'nombre_estrategia': nombre,
        'cuenta': cuenta,
        'accion_original': accion
    }

def parsear_tiempo(tiempo):
    """Parsea el tiempo en diferentes formatos"""
    if not tiempo:
        return '', ''

    formatos = ['%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M', '%Y-%m-%d %H:%M:%S']
    for fmt in formatos:
        try:
            dt = datetime.strptime(tiempo.strip(), fmt)
            return dt.strftime('%Y-%m-%d'), dt.strftime('%H:%M:%S')
        except:
            continue
    return '', ''

def emparejar_operaciones(operaciones_traducidas):
    """Empareja entradas con salidas para calcular P/L"""
    operaciones_completas = []
    entradas_pendientes = {}

    for op in operaciones_traducidas:
        if op is None:
            continue

        key = (op['cuenta'], op['instrumento'])

        if op['es_entrada']:
            if key not in entradas_pendientes:
                entradas_pendientes[key] = []
            entradas_pendientes[key].append(op)
        elif op['es_salida']:
            if key in entradas_pendientes and entradas_pendientes[key]:
                entrada = entradas_pendientes[key].pop(0)

                if 'MNQ' in op['instrumento']:
                    valor_punto = 2
                elif 'NQ' in op['instrumento'] and 'MNQ' not in op['instrumento']:
                    valor_punto = 20
                elif 'MES' in op['instrumento']:
                    valor_punto = 5
                elif 'ES' in op['instrumento'] and 'MES' not in op['instrumento']:
                    valor_punto = 50
                else:
                    valor_punto = 2

                if 'Comprar' in entrada['accion_original']:
                    pnl = (op['precio'] - entrada['precio']) * op['contratos'] * valor_punto
                else:
                    pnl = (entrada['precio'] - op['precio']) * op['contratos'] * valor_punto

                operacion_completa = {
                    'fecha': entrada['fecha'],
                    'tipo': entrada['tipo_operacion'],
                    'activo': entrada['instrumento'],
                    'estrategia': entrada['nombre_estrategia'] or 'Importado',
                    'contratos': entrada['contratos'],
                    'hora_entrada': entrada['hora'],
                    'hora_salida': op['hora'],
                    'importe': round(pnl, 2),
                    'cuenta': entrada['cuenta'],
                    'precio_entrada': entrada['precio'],
                    'precio_salida': op['precio']
                }
                operaciones_completas.append(operacion_completa)

    return operaciones_completas

@app.route('/')
@app.route('/index.html')
def index():
    return render_template('index.html')

@app.route('/api/importar-csv', methods=['POST'])
def importar_csv():
    """Endpoint para importar archivo CSV de NinjaTrader y devolver operaciones procesadas"""
    try:
        print(f"📥 Petición recibida en /api/importar-csv")
        print(f"Content-Type: {request.content_type}")
        print(f"Files: {list(request.files.keys())}")
        print(f"Form data: {dict(request.form)}")
        
        if 'file' not in request.files:
            print("❌ Error: No se encontró archivo en request.files")
            return jsonify({'error': 'No se proporcionó archivo'}), 400

        cuenta_id = request.form.get('cuenta_id')
        user_id = request.form.get('user_id')

        print(f"cuenta_id: {cuenta_id}, user_id: {user_id}")

        if not cuenta_id:
            print("❌ Error: cuenta_id no proporcionado")
            return jsonify({'error': 'cuenta_id es requerido'}), 400

        if not user_id:
            print("❌ Error: user_id no proporcionado")
            return jsonify({'error': 'user_id es requerido'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'Nombre de archivo vacío'}), 400

        content = file.read().decode('utf-8')

        reader = csv.DictReader(io.StringIO(content), delimiter=';')
        operaciones_raw = list(reader)

        if not operaciones_raw:
            return jsonify({'error': 'El archivo está vacío'}), 400

        headers = list(operaciones_raw[0].keys())
        formato = detectar_formato_csv(headers)

        operaciones_traducidas = []
        for op in operaciones_raw:
            if formato == 'grid':
                traducida = traducir_operacion_grid(op)
            elif formato == 'orders':
                traducida = traducir_operacion_orders(op)
            else:
                return jsonify({'error': f'Formato CSV no reconocido. Headers: {headers[:5]}'}), 400

            if traducida:
                operaciones_traducidas.append(traducida)

        def parse_datetime(op):
            try:
                return datetime.strptime(f"{op['fecha']} {op['hora']}", '%Y-%m-%d %H:%M:%S')
            except:
                return datetime.min

        operaciones_traducidas.sort(key=parse_datetime)

        operaciones_completas = emparejar_operaciones(operaciones_traducidas)

        operaciones_formateadas = []
        for op in operaciones_completas:
            operaciones_formateadas.append({
                'fecha': op.get('fecha'),
                'tipo': op.get('tipo'),
                'activo': op.get('activo'),
                'estrategia': op.get('estrategia') or 'Importado',
                'contratos': op.get('contratos') or 1,
                'tipoEntrada': 'Market',
                'tipoSalida': 'Market',
                'hora_entrada': op.get('hora_entrada'),
                'hora_salida': op.get('hora_salida'),
                'importe': op.get('importe') or 0
            })

        return jsonify({
            'success': True,
            'operaciones': operaciones_formateadas,
            'total_recibidas': len(operaciones_completas),
            'total_importadas': len(operaciones_formateadas),
            'total_duplicados': 0,
            'formato_detectado': formato,
            'mensaje': f'Archivo procesado correctamente. Se importaron {len(operaciones_formateadas)} operaciones.'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/operacion', methods=['POST'])
def crear_operacion():
    """Endpoint para crear una operación individual"""
    print(f"📥 Petición recibida en /operacion")
    print(f"Content-Type: {request.content_type}")
    print(f"Headers: {dict(request.headers)}")
    print(f"Raw data: {request.data}")
    
    # Validar que hay contenido
    if not request.data:
        print("❌ Error: Request sin datos")
        return jsonify({'error': 'No se proporcionaron datos'}), 400
    
    # Intentar parsear JSON
    try:
        data = request.get_json()
        print(f"✅ JSON parseado correctamente: {data}")
    except Exception as e:
        print(f"❌ Error al parsear JSON: {str(e)}")
        return jsonify({'error': f'JSON inválido: {str(e)}'}), 400

    if not data:
        print("❌ Error: data es None o vacío")
        return jsonify({'error': 'No se proporcionaron datos'}), 400

    cuenta_id = data.get('cuenta_id')
    print(f"cuenta_id extraído: {cuenta_id}")
    
    if not cuenta_id:
        print("❌ Error: cuenta_id no proporcionado")
        return jsonify({'error': 'cuenta_id es requerido'}), 400

    # Extraer el token de autorización
    auth_header = request.headers.get('Authorization')
    print(f"Authorization header: {auth_header}")
    
    if not auth_header or not auth_header.startswith('Bearer '):
        print("❌ Error: Token de autorización no válido")
        return jsonify({'error': 'Token de autorización requerido'}), 401

    access_token = auth_header.replace('Bearer ', '')

    conn = None
    cursor = None

    try:
        # Verificar el token con Supabase y obtener el user_id
        import jwt
        import os
        
        # Decodificar el JWT para obtener el user_id
        # El JWT de Supabase contiene el user_id en el campo 'sub'
        decoded = jwt.decode(access_token, options={"verify_signature": False})
        user_id = decoded.get('sub')
        
        if not user_id:
            return jsonify({'error': 'Token inválido'}), 401

        conn = get_db_connection()
        cursor = conn.cursor()

        # Verificar que la cuenta pertenece al usuario
        cursor.execute("""
            SELECT id FROM cuentas_trading
            WHERE id = %s AND user_id = %s
        """, (cuenta_id, user_id))
        
        cuenta_valida = cursor.fetchone()
        if not cuenta_valida:
            return jsonify({'error': 'La cuenta no pertenece a este usuario'}), 403

        cursor.execute("""
            INSERT INTO operaciones (
                cuenta_id, instrumento, estrategia, fecha_operacion,
                hora_entrada, hora_salida, precio_entrada, precio_salida,
                contratos, resultado_pnl, tipo_operacion, notas_psicologia, captura_url
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            cuenta_id,
            data.get('instrumento'),
            data.get('estrategia'),
            data.get('fecha_operacion'),
            data.get('hora_entrada'),
            data.get('hora_salida'),
            data.get('precio_entrada'),
            data.get('precio_salida'),
            data.get('contratos'),
            data.get('resultado_pnl'),
            data.get('tipo_operacion'),
            data.get('notas_psicologia'),
            data.get('captura_url')
        ))

        operacion_id = cursor.fetchone()[0]
        conn.commit()

        return jsonify({
            'success': True,
            'mensaje': 'Operación guardada correctamente',
            'datos': [{'id': operacion_id}]
        })

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route('/importar-cuenta', methods=['POST'])
def importar_cuenta():
    """Endpoint para importar operaciones evitando duplicados basado en clave única"""
    print(f"📥 Petición recibida en /importar-cuenta")
    print(f"Content-Type: {request.content_type}")
    print(f"Raw data length: {len(request.data) if request.data else 0}")
    
    try:
        data = request.get_json()
        print(f"✅ JSON parseado correctamente")
    except Exception as e:
        print(f"❌ Error al parsear JSON: {str(e)}")
        return jsonify({'error': f'JSON inválido: {str(e)}'}), 400

    if not data:
        print("❌ Error: data es None o vacío")
        return jsonify({'error': 'No se proporcionaron datos'}), 400

    cuenta_id = data.get('cuenta_id')
    operaciones = data.get('operaciones', [])
    
    print(f"cuenta_id: {cuenta_id}")
    print(f"Número de operaciones: {len(operaciones)}")

    if not cuenta_id:
        return jsonify({'error': 'cuenta_id es requerido'}), 400

    if not operaciones:
        return jsonify({'error': 'No hay operaciones para importar'}), 400

    total_recibidas = len(operaciones)
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Obtener todas las operaciones existentes para esta cuenta
        # Clave única: cuenta_id + fecha_operacion + hora_entrada + instrumento
        cursor.execute("""
            SELECT fecha_operacion, hora_entrada, hora_salida, instrumento, resultado_pnl
            FROM operaciones
            WHERE cuenta_id = %s
        """, (cuenta_id,))

        # Crear un conjunto con las claves únicas de operaciones existentes
        existentes = set()
        for row in cursor.fetchall():
            fecha_op = row[0].isoformat() if row[0] else None
            hora_ent = str(row[1]) if row[1] else None
            hora_sal = str(row[2]) if row[2] else None
            instrumento = row[3]
            pnl = float(row[4]) if row[4] else 0.0

            # Clave compuesta más robusta para evitar duplicados
            clave = (fecha_op, hora_ent, hora_sal, instrumento, round(pnl, 2))
            existentes.add(clave)

        operaciones_nuevas = []
        duplicados = 0

        # Filtrar operaciones duplicadas
        for op in operaciones:
            fecha_op = op.get('fecha_operacion') or op.get('fecha')
            hora_ent = op.get('hora_entrada')
            hora_sal = op.get('hora_salida')
            instrumento = op.get('instrumento') or op.get('activo')
            pnl = float(op.get('resultado_pnl') or op.get('importe') or 0)

            # Construir clave única para esta operación
            clave = (fecha_op, hora_ent, hora_sal, instrumento, round(pnl, 2))

            if clave in existentes:
                duplicados += 1
            else:
                operaciones_nuevas.append(op)
                # Agregar al conjunto para evitar duplicados dentro del mismo lote
                existentes.add(clave)

        importadas = 0
        if operaciones_nuevas:
            valores = []
            for op in operaciones_nuevas:
                valores.append((
                    cuenta_id,
                    op.get('instrumento') or op.get('activo'),
                    op.get('estrategia') or 'Importado',
                    op.get('fecha_operacion') or op.get('fecha'),
                    op.get('hora_entrada'),
                    op.get('hora_salida'),
                    op.get('precio_entrada'),
                    op.get('precio_salida'),
                    op.get('contratos') or 1,
                    op.get('resultado_pnl') or op.get('importe') or 0,
                    op.get('tipo_operacion') or op.get('tipo'),
                    op.get('notas_psicologia'),
                    op.get('captura_url')
                ))

            execute_values(cursor, """
                INSERT INTO operaciones (
                    cuenta_id, instrumento, estrategia, fecha_operacion,
                    hora_entrada, hora_salida, precio_entrada, precio_salida,
                    contratos, resultado_pnl, tipo_operacion, notas_psicologia, captura_url
                ) VALUES %s
            """, valores)

            importadas = len(operaciones_nuevas)

        conn.commit()

        return jsonify({
            'success': True,
            'mensaje': f'Importación completada. Se recibieron {total_recibidas} operaciones, se importaron {importadas} operaciones nuevas y se omitieron {duplicados} duplicados.',
            'total_recibidas': total_recibidas,
            'total_importadas': importadas,
            'total_duplicados': duplicados
        })

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route('/operaciones', methods=['GET'])
def obtener_operaciones():
    """Endpoint para obtener operaciones de una cuenta"""
    print(f"📥 Petición recibida en /operaciones (GET)")
    cuenta_id = request.args.get('cuenta_id')
    print(f"cuenta_id solicitado: {cuenta_id}")

    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if cuenta_id:
            cursor.execute("""
                SELECT id, cuenta_id, instrumento, estrategia, fecha_operacion,
                       hora_entrada, hora_salida, precio_entrada, precio_salida,
                       contratos, resultado_pnl, tipo_operacion, notas_psicologia, captura_url
                FROM operaciones
                WHERE cuenta_id = %s
                ORDER BY fecha_operacion, hora_entrada
            """, (cuenta_id,))
        else:
            cursor.execute("""
                SELECT id, cuenta_id, instrumento, estrategia, fecha_operacion,
                       hora_entrada, hora_salida, precio_entrada, precio_salida,
                       contratos, resultado_pnl, tipo_operacion, notas_psicologia, captura_url
                FROM operaciones
                ORDER BY fecha_operacion, hora_entrada
            """)

        operaciones = []
        for row in cursor.fetchall():
            operaciones.append({
                'id': row[0],
                'cuenta_id': row[1],
                'instrumento': row[2],
                'estrategia': row[3],
                'fecha_operacion': row[4].isoformat() if row[4] else None,
                'hora_entrada': str(row[5]) if row[5] else None,
                'hora_salida': str(row[6]) if row[6] else None,
                'precio_entrada': float(row[7]) if row[7] else None,
                'precio_salida': float(row[8]) if row[8] else None,
                'contratos': row[9],
                'resultado_pnl': float(row[10]) if row[10] else 0,
                'tipo_operacion': row[11],
                'notas_psicologia': row[12],
                'captura_url': row[13]
            })

        return jsonify({
            'success': True,
            'operaciones': operaciones
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route('/operacion/<int:operacion_id>', methods=['DELETE'])
def eliminar_operacion(operacion_id):
    """Endpoint para eliminar una operación específica"""
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM operaciones WHERE id = %s", (operacion_id,))
        conn.commit()

        return jsonify({
            'success': True,
            'mensaje': 'Operación eliminada correctamente'
        })

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route('/operacion/<int:operacion_id>', methods=['PUT'])
def actualizar_operacion(operacion_id):
    """Endpoint para actualizar una operación existente"""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No se proporcionaron datos'}), 400

    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE operaciones SET
                instrumento = %s,
                estrategia = %s,
                fecha_operacion = %s,
                hora_entrada = %s,
                hora_salida = %s,
                precio_entrada = %s,
                precio_salida = %s,
                contratos = %s,
                resultado_pnl = %s,
                tipo_operacion = %s,
                notas_psicologia = %s,
                captura_url = %s
            WHERE id = %s
        """, (
            data.get('instrumento'),
            data.get('estrategia'),
            data.get('fecha_operacion'),
            data.get('hora_entrada'),
            data.get('hora_salida'),
            data.get('precio_entrada'),
            data.get('precio_salida'),
            data.get('contratos'),
            data.get('resultado_pnl'),
            data.get('tipo_operacion'),
            data.get('notas_psicologia'),
            data.get('captura_url'),
            operacion_id
        ))

        conn.commit()

        return jsonify({
            'success': True,
            'mensaje': 'Operación actualizada correctamente'
        })

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route('/api/operaciones/<cuenta_id>', methods=['DELETE'])
def eliminar_operaciones_cuenta(cuenta_id):
    """Endpoint para eliminar todas las operaciones de una cuenta"""
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM operaciones WHERE cuenta_id = %s", (cuenta_id,))
        deleted_count = cursor.rowcount

        conn.commit()

        return jsonify({
            'success': True,
            'mensaje': f'Se eliminaron {deleted_count} operaciones de la cuenta.',
            'total_eliminadas': deleted_count
        })

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json')

@app.route('/logo.jpg')
def logo():
    return send_from_directory('static', 'logo.jpg')

@app.route('/icon.png')
def icon():
    return send_from_directory('static', 'icon.png')

@app.route('/sw.js')
def service_worker():
    return send_from_directory('static', 'sw.js', mimetype='application/javascript')

@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory('static', filename)

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)