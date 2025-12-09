from flask import Flask, render_template, send_from_directory, request, jsonify
import os
import csv
import io
from datetime import datetime

app = Flask(__name__)

def traducir_y_calcular_operacion(ejecucion_ninja):
    """
    Traduce los nombres de columna de NinjaTrader al formato de la base de datos
    y calcula el P/L cuando es posible.
    """
    resultado = {}
    
    instrumento = ejecucion_ninja.get('Instrumento', '')
    accion = ejecucion_ninja.get('Acción', '')
    cantidad = ejecucion_ninja.get('Cantidad', '1')
    precio = ejecucion_ninja.get('Precio', '0')
    tiempo = ejecucion_ninja.get('Tiempo', '')
    entrada_salida = ejecucion_ninja.get('E/X', '')
    nombre = ejecucion_ninja.get('Nombre', '')
    comision = ejecucion_ninja.get('Comisión', '0')
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
    
    if tiempo:
        try:
            dt = datetime.strptime(tiempo, '%d/%m/%Y %H:%M:%S')
            fecha = dt.strftime('%Y-%m-%d')
            hora = dt.strftime('%H:%M:%S')
        except:
            fecha = ''
            hora = ''
    else:
        fecha = ''
        hora = ''
    
    if 'Comprar' in accion:
        tipo = 'Alcista (Compra)'
    elif 'Vender' in accion:
        tipo = 'Bajista (Venta)'
    else:
        tipo = accion
    
    es_entrada = 'Entrada' in entrada_salida
    es_salida = 'Salida' in entrada_salida
    
    resultado = {
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
        'accion_original': accion,
        'entrada_salida_original': entrada_salida
    }
    
    return resultado

def emparejar_operaciones(operaciones_traducidas):
    """
    Empareja entradas con salidas para calcular P/L.
    Agrupa por cuenta e instrumento.
    """
    operaciones_completas = []
    entradas_pendientes = {}
    
    for op in operaciones_traducidas:
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
                elif 'NQ' in op['instrumento']:
                    valor_punto = 20
                elif 'MES' in op['instrumento']:
                    valor_punto = 5
                elif 'ES' in op['instrumento']:
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
    """Endpoint para importar archivo CSV de NinjaTrader"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No se proporcionó archivo'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'Nombre de archivo vacío'}), 400
        
        content = file.read().decode('utf-8')
        
        reader = csv.DictReader(io.StringIO(content), delimiter=';')
        
        operaciones_raw = list(reader)
        
        operaciones_traducidas = []
        for op in operaciones_raw:
            traducida = traducir_y_calcular_operacion(op)
            operaciones_traducidas.append(traducida)
        
        # Sort by date and time (chronological order - entries before exits)
        def parse_datetime(op):
            try:
                return datetime.strptime(f"{op['fecha']} {op['hora']}", '%Y-%m-%d %H:%M:%S')
            except:
                return datetime.min
        
        operaciones_traducidas.sort(key=parse_datetime)
        
        operaciones_completas = emparejar_operaciones(operaciones_traducidas)
        
        return jsonify({
            'success': True,
            'operaciones': operaciones_completas,
            'total_importadas': len(operaciones_completas),
            'mensaje': f'Se procesaron {len(operaciones_completas)} operaciones completas'
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
