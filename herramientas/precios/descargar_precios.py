"""Descarga los precios en EUROS (Cardmarket, vía TCGdex) de las 158 cartas del catálogo y los guarda en
datos/catalogo/precios-teselia.json. La web los lee de ahí: sin claves de API, sin servidor, presupuesto 0.
Uso (en la raíz del repo, con internet):  python herramientas/precios/descargar_precios.py
Nota honesta: Cardmarket agrega el mercado europeo; el precio NO distingue el idioma de la carta.
Fuente: https://api.tcgdex.net/v2/es/cards/<id> (campo pricing.cardmarket, unidad EUR, actualizado a diario)."""
import json, pathlib, time, urllib.request, sys

RAIZ = pathlib.Path(__file__).resolve().parents[2]
API = 'https://api.tcgdex.net/v2/es/cards/'
# Enlace a la página del producto en Cardmarket con las ofertas filtradas a ESPAÑOL (?language=4).
# 3.7.32: prices.pokemontcg.io/cardmarket/<id> es un redirector público; se le LEE la cabecera Location sin seguirla
# (así no dependemos de la API de pokemontcg.io, que limita peticiones, ni tocamos cardmarket.com, que bloquea bots).
# La primera versión añadía language=4 al redirector y la redirección lo perdía: el enlace llegaba sin filtro.
REDIRECTOR = 'https://prices.pokemontcg.io/cardmarket/'
SETS_PTCGIO = {'sv10.5b': 'zsv10pt5', 'sv10.5w': 'rsv10pt5', 'svp': 'svp'}

class _SinRedirecciones(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
_ABRIDOR = urllib.request.build_opener(_SinRedirecciones)

def id_ptcgio(c):
    s = SETS_PTCGIO.get(c['expansion'])
    return '%s-%d' % (s, int(c['numero'])) if s else None

def enlace_cardmarket(c):
    ident = id_ptcgio(c)
    if not ident: return None
    destino = None
    for i in range(3):
        try:
            r = _ABRIDOR.open(urllib.request.Request(REDIRECTOR + ident, headers={'User-Agent': 'album-teselia (uso personal)'}), timeout=20)
            r.close(); break
        except urllib.error.HTTPError as e:
            if 300 <= e.code < 400: destino = e.headers.get('Location'); break
            if i == 2: return None
            time.sleep(3 * (i + 1) ** 2)
        except Exception:
            if i == 2: return None
            time.sleep(3 * (i + 1) ** 2)
    if not destino or 'cardmarket.com' not in destino: return None
    return destino.split('?')[0].replace('/en/', '/es/') + '?language=4'

def pedir(url, intentos=3):
    # 3.7.33: reintentos con espera creciente — a ~37 cartas seguidas la API suelta un 503 pasajero y antes se perdía la carta
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'album-teselia (uso personal)'})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.load(r)
        except Exception:
            if i == intentos - 1: raise
            espera = 3 * (i + 1) ** 2
            print('      ... reintento en %d s' % espera); time.sleep(espera)

def main():
    cat = json.load(open(RAIZ / 'datos/catalogo/coleccion-teselia.json', encoding='utf-8'))
    cartas = cat if isinstance(cat, list) else cat['cartas']
    destino = RAIZ / 'datos/catalogo/precios-teselia.json'
    previo = json.loads(destino.read_text(encoding='utf-8')) if destino.exists() else {'cartas': {}}   # lo ya descargado no se pierde si hoy algo falla
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
            enlace = enlace_cardmarket(c)
            anterior = previo['cartas'].get(c['id']) or {}
            if not enlace and 'cardmarket.com' in str(anterior.get('enlace', '')): enlace = anterior['enlace']   # el enlace directo anterior sigue valiendo
            if enlace: v['enlace'] = enlace
            if v['tendencia'] is None and v['bajo'] is None and not enlace:
                sin.append(c['id'])
            else:
                salida['cartas'][c['id']] = {k: x for k, x in v.items() if x is not None}
            print('%3d/158 %-14s %s%s' % (i, c['id'], v['tendencia'] if v['tendencia'] is not None else 'sin precio', ' · enlace ✓' if enlace else ''))
        except Exception as e:
            if previo['cartas'].get(c['id']):
                salida['cartas'][c['id']] = previo['cartas'][c['id']]
                print('%3d/158 %-14s fallo (%s): se conserva lo de la descarga anterior' % (i, c['id'], e))
            else:
                sin.append(c['id']); print('%3d/158 %-14s fallo: %s' % (i, c['id'], e))
        time.sleep(0.3)                                    # educado con la API pública (dos peticiones por carta)
    destino.write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding='utf-8')
    print('\nGuardado', destino, '·', len(salida['cartas']), 'con precio;', len(sin), 'sin precio', ('→ ' + ', '.join(sin)) if sin else '')
    sys.exit(0 if salida['cartas'] else 1)

if __name__ == '__main__':
    main()
