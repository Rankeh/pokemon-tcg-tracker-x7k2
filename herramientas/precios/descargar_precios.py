"""Descarga los precios en EUROS (Cardmarket, vía TCGdex) de las 158 cartas del catálogo y los guarda en
datos/catalogo/precios-teselia.json. La web los lee de ahí: sin claves de API, sin servidor, presupuesto 0.
Uso (en la raíz del repo, con internet):  python herramientas/precios/descargar_precios.py
Nota honesta: Cardmarket agrega el mercado europeo; el precio NO distingue el idioma de la carta.
Fuente: https://api.tcgdex.net/v2/es/cards/<id> (campo pricing.cardmarket, unidad EUR, actualizado a diario)."""
import json, pathlib, time, urllib.request, sys

RAIZ = pathlib.Path(__file__).resolve().parents[2]
API = 'https://api.tcgdex.net/v2/es/cards/'

def pedir(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'album-teselia (uso personal)'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)

def main():
    cat = json.load(open(RAIZ / 'datos/catalogo/coleccion-teselia.json', encoding='utf-8'))
    cartas = cat if isinstance(cat, list) else cat['cartas']
    salida = {'fecha': time.strftime('%Y-%m-%d'), 'fuente': 'Cardmarket vía TCGdex (api.tcgdex.net)', 'unidad': 'EUR',
              'nota': 'Precio del mercado europeo; Cardmarket no separa por idioma de la carta.', 'cartas': {}}
    sin = []
    for i, c in enumerate(cartas, 1):
        try:
            datos = pedir(API + c['id'])
            cm = (datos.get('pricing') or {}).get('cardmarket') or {}
            # las ilustraciones especiales suelen cotizar como holo: se usa la variante normal y, si falta, la -holo
            v = {'tendencia': cm.get('trend', cm.get('trend-holo')), 'bajo': cm.get('low', cm.get('low-holo')),
                 'medio30': cm.get('avg30', cm.get('avg30-holo')), 'actualizado': cm.get('updated')}
            if v['tendencia'] is None and v['bajo'] is None:
                sin.append(c['id'])
            else:
                salida['cartas'][c['id']] = {k: x for k, x in v.items() if x is not None}
            print('%3d/158 %-14s %s' % (i, c['id'], v['tendencia'] if v['tendencia'] is not None else 'sin precio'))
        except Exception as e:
            sin.append(c['id']); print('%3d/158 %-14s fallo: %s' % (i, c['id'], e))
        time.sleep(0.15)                                   # educado con la API pública
    destino = RAIZ / 'datos/catalogo/precios-teselia.json'
    destino.write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding='utf-8')
    print('\nGuardado', destino, '·', len(salida['cartas']), 'con precio;', len(sin), 'sin precio', ('→ ' + ', '.join(sin)) if sin else '')
    sys.exit(0 if salida['cartas'] else 1)

if __name__ == '__main__':
    main()
