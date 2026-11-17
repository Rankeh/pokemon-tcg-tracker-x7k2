"""Descarga las imágenes de las cartas a web/prueba-3d/assets/cartas/ (sin instalar nada: solo Python).
Uso (en la raíz del repo):  python herramientas/texturas/descargar_cartas.py [--catalogo datos/catalogo/coleccion-asako-ito.json]
Guarda mini/<id>.webp (low, textura del bolsillo) y grande/<id>.webp (high, ficha) y escribe manifiesto.json.
Es idempotente: lo que ya existe se omite. El manifiesto se FUSIONA: cada álbum añade sus cartas sin borrar las de los demás. Los nombres son SIEMPRE minúsculas, igual que el id del catálogo (GitHub Pages distingue mayúsculas).
Uso personal de tu colección; las ilustraciones pertenecen a The Pokémon Company, Nintendo, Creatures y GAME FREAK."""
import argparse, json, pathlib, sys, time, urllib.request
RAIZ = pathlib.Path(__file__).resolve().parents[2]
SALIDA = RAIZ / 'web/prueba-3d/assets/cartas'
_ap = argparse.ArgumentParser(); _ap.add_argument('--catalogo', default='datos/catalogo/coleccion-teselia.json')
cat = json.loads((RAIZ / _ap.parse_args().catalogo).read_text(encoding='utf-8'))
cartas = cat['cartas'] if isinstance(cat, dict) else cat
(SALIDA / 'mini').mkdir(parents=True, exist_ok=True); (SALIDA / 'grande').mkdir(exist_ok=True)

def bajar(url):
    for intento in range(3):
        try:
            d = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read()
            if d[:4] == b'RIFF' and d[8:12] == b'WEBP' and len(d) > 1500: return d
            raise ValueError('no es una imagen webp válida')
        except Exception as e:
            ultimo = e; time.sleep(1 + intento)
    raise ultimo

_previo = SALIDA / 'manifiesto.json'
entradas = (json.loads(_previo.read_text(encoding='utf-8')).get('cartas') or {}) if _previo.is_file() else {}
fallos = []
for c in cartas:
    if not c.get('imagen') or c.get('estadoImagen') == 'sin-imagen': continue
    id_ = c['id'].lower(); url = c['imagen']
    try:
        for carpeta, sufijo in (('mini', 'low.webp'), ('grande', 'high.webp')):
            f = SALIDA / carpeta / (id_ + '.webp')
            if not f.is_file(): f.write_bytes(bajar(url.rsplit('/', 1)[0] + '/' + sufijo)); time.sleep(0.15)
        entradas[c['id']] = {'mini': 'mini/%s.webp' % id_, 'grande': 'grande/%s.webp' % id_, 'origen': url}
        print('OK  ', id_)
    except Exception as e:
        fallos.append(id_); print('FALLO', id_, e)
(SALIDA / 'manifiesto.json').write_text(json.dumps({'version': 2, 'formato': 'WebP; mini = textura del bolsillo, grande = ficha', 'procedencia': 'TCGdex (https://tcgdex.net)', 'cartas': entradas}, ensure_ascii=False, indent=1), encoding='utf-8')
print('\n%d cartas en el manifiesto (todos los álbumes), %d fallos %s' % (len(entradas), len(fallos), fallos)); sys.exit(1 if fallos else 0)
