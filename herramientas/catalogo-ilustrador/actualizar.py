"""Actualiza los álbumes generados desde TCGdex (datos/albumes-artista.json: de artista o de un Pokémon en una expansión): regenera cada catálogo desde TCGdex (cartas nuevas incluidas),
descarga las imágenes que falten y, si el álbum necesita más hojas, genera su modelo 3D (web/prueba-3d/modelo/album-<n>h.glb).
La colección de nadie se toca: las cartas nuevas aparecen como pendientes. Lo ejecuta cada semana .github/workflows/actualizar-artistas.yml.
Uso (en la raíz del repo, con acceso a api.tcgdex.net y assets.tcgdex.net):  python herramientas/catalogo-ilustrador/actualizar.py"""
import json, math, os, pathlib, subprocess, sys, urllib.parse, urllib.request

RAIZ = pathlib.Path(__file__).resolve().parents[2]
POR_PAGINA = 9                                          # web/js/album/distribucion.js
LIMITLESS = 'https://untiwlxjdklqjwjbvdym.supabase.co/functions/v1/imagen-limitless'   # supabase/functions/imagen-limitless
ARTE = RAIZ / 'web/prueba-3d/assets/proxies/arte'


def arte_limitless(catalogo):
    """3.39 · Cartas sin imagen en TCGdex y sin arte todavía: se busca su imagen en limitlesstcg y se guarda como arte/<id>.png (el visor
    la usa sola, ver proxies.js → rutasArte). Un fallo no tumba la actualización: la carta se ve con marcador hasta la próxima vez."""
    nuevas = []
    manifiesto_f = RAIZ / 'web/prueba-3d/assets/cartas/manifiesto.json'
    manifiesto = json.loads(manifiesto_f.read_text(encoding='utf-8'))
    for c in json.loads(catalogo.read_text(encoding='utf-8'))['cartas']:
        destino = ARTE / (c['id'].lower() + '.png')
        if c.get('estadoImagen') != 'sin-imagen' or c['id'] in manifiesto['cartas'] or destino.exists() or (ARTE / (c['id'] + '.png')).exists():
            continue                                         # ya tiene imagen, o arte puesto a mano (proxies.js → ARTE)
        try:
            s = json.load(urllib.request.urlopen('https://api.tcgdex.net/v2/en/sets/' + urllib.parse.quote(c['expansion']), timeout=30))
            codigo = (s.get('abbreviation') or {}).get('official') or s.get('tcgOnline') or ''
            q = urllib.parse.urlencode({'buscar': 1, 'set': codigo, 'num': c['numero'], 'id': c['expansion']})
            hallada = json.load(urllib.request.urlopen(LIMITLESS + '?' + q, timeout=60))
        except Exception as e:
            print('  sin arte en limitlesstcg para', c['id'], '·', e); continue
        # 3.41 · «ruta»: carpeta de limitlesstcg (2011+); «pio»: cartas antiguas (pokemontcg.io, la fuente de limitlesstcg para ellas)
        clave = 'ruta' if hallada.get('ruta') else 'pio' if hallada.get('pio') else None
        if not clave: continue
        ruta = hallada[clave]
        datos = urllib.request.urlopen(LIMITLESS + '?' + clave + '=' + urllib.parse.quote(ruta), timeout=60).read()
        if datos[:4] == b'\x89PNG':
            ARTE.mkdir(parents=True, exist_ok=True); destino.write_bytes(datos); nuevas.append(c['id']); print('  arte de limitlesstcg:', c['id'], ruta)
            # en el manifiesto de imágenes (rutas relativas a assets/cartas/): el visor la usa como cualquier otra, sin listas a mano
            rel = '../proxies/arte/' + destino.name
            manifiesto['cartas'][c['id']] = {'mini': rel, 'grande': rel, 'origen': 'limitlesstcg: ' + ruta}
    if nuevas:
        manifiesto_f.write_text(json.dumps(manifiesto, ensure_ascii=False, indent=1), encoding='utf-8')
    return nuevas


def ids(ruta):
    try: return {c['id'] for c in json.loads(ruta.read_text(encoding='utf-8'))['cartas']}
    except FileNotFoundError: return set()


def main():
    resumen = []
    for a in json.loads((RAIZ / 'datos/albumes-artista.json').read_text(encoding='utf-8')):
        cat = RAIZ / 'datos/catalogo' / ('coleccion-%s.json' % a['id'])
        antes = ids(cat)
        filtro = ['--ilustrador', a['ilustrador']] if 'ilustrador' in a else ['--expansion', a['expansion'], '--pokemon', a['pokemon']]
        subprocess.run([sys.executable, 'herramientas/catalogo-ilustrador/generar.py', *filtro, '--id', a['id']], cwd=RAIZ, check=True)
        despues = ids(cat)
        nuevas, retiradas = sorted(despues - antes), sorted(antes - despues)
        # imágenes: un fallo puntual no tumba la actualización (la carta se ve con marcador hasta la próxima vez)
        subprocess.run([sys.executable, 'herramientas/texturas/descargar_cartas.py', '--catalogo', str(cat.relative_to(RAIZ))], cwd=RAIZ)
        arte_limitless(cat)
        hojas = math.ceil(math.ceil(len(despues) / POR_PAGINA) / 2)
        modelo = RAIZ / 'web/prueba-3d/modelo' / ('album.glb' if hojas == 9 else 'album-%dh.glb' % hojas)
        if not modelo.exists():                         # el álbum ha crecido: un modelo con más hojas (Python puro, sin Blender)
            subprocess.run([sys.executable, 'blender/exportar_glb.py', '--hojas', str(hojas)], cwd=RAIZ, check=True)
        linea = '%s: %d cartas (%d nuevas%s), modelo %s' % (a.get('ilustrador') or a['id'], len(despues), len(nuevas), ', %d retiradas' % len(retiradas) if retiradas else '', modelo.name)
        print(linea, nuevas or '')
        resumen.append('- ' + linea + (': ' + ', '.join(nuevas) if nuevas else ''))
    # la app instalada (sw.js) guarda las miniaturas de precache.json: las cartas nuevas también tienen que estar en la lista
    subprocess.run([sys.executable, 'herramientas/pwa/generar_precache.py'], cwd=RAIZ, check=True)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f: f.write('## Álbumes generados desde TCGdex\n' + '\n'.join(resumen) + '\n')


if __name__ == '__main__':
    main()
