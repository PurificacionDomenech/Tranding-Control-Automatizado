from flask import Flask, render_template, send_from_directory, request, jsonify
import os
import csv
import io
from datetime import datetime

app = Flask(__name__)

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
    """Endpoint para importar archivo CSV de NinjaTrader con detección de duplicados"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No se proporcionó archivo'}), 400
        
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
        
        # Aquí iría la lógica de detección de duplicados con Supabase
        # Como no tienes integración de Supabase en app.py, devuelvo todas las operaciones
        # El frontend ya tiene lógica de detección de duplicados en confirmImport()
        
        total_recibidas = len(operaciones_completas)
        
        return jsonify({
            'success': True,
            'operaciones': operaciones_completas,
            'total_recibidas': total_recibidas,
            'total_importadas': total_recibidas,
            'total_duplicados': 0,
            'formato_detectado': formato,
            'mensaje': f'Importación completada. Se recibieron {total_recibidas} operaciones. La detección de duplicados se realiza en el navegador antes de guardar.'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

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
