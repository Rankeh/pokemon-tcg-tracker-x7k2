"""Genera precache.json: los archivos que la app instalada (sw.js) guarda en el dispositivo para funcionar sin conexión.

- «nucleo»: páginas, estilos, código, catálogos, precios, modelos 3D e iconos (se guardan al instalar).
- «miniaturas»: las imágenes pequeñas de todas las cartas, y el arte y las cartas proxy de las que TCGdex no tiene (después, en segundo plano).
- «externos»: Three.js desde jsDelivr (versión fija).
Las imágenes grandes no se precargan: se guardan la primera vez que abres la ficha de cada carta.
Uso (en la raíz del repo):  python herramientas/pwa/generar_precache.py      (--comprobar: falla si precache.json no está al día)"""
import json, pathlib, sys

RAIZ = pathlib.Path(__file__).resolve().parents[2]
THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/'
EXTERNOS = [THREE + p for p in ('build/three.module.js', 'examples/jsm/loaders/GLTFLoader.js',
                                'examples/jsm/utils/BufferGeometryUtils.js', 'examples/jsm/geometries/RoundedBoxGeometry.js')]
FUERA = ('pruebas', 'vendor', 'node_modules')            # pruebas y la copia local opcional de Three.js no van a la app


def rel(p): return p.relative_to(RAIZ).as_posix()


def modelos_usados():
    """Hojas del modelo de cada álbum de la web: ceil(páginas / 2), con 9 cartas por página (web/js/album/distribucion.js)."""
    hojas = set()
    for f in (RAIZ / 'datos/catalogo').glob('coleccion-*.json'):
        n = len(json.loads(f.read_text(encoding='utf-8'))['cartas'])
        hojas.add(-(-(-(-n // 9)) // 2))
    return hojas


def lista():
    nucleo = ['./', 'index.html', 'manifest.webmanifest']
    for patron in ('web/**/*.html', 'web/**/*.css', 'web/**/*.js', 'web/editorial/*.png', 'web/editorial/*.svg',
                   'web/prueba-3d/assets/cartas/manifiesto.json', 'datos/catalogo/*.json', 'datos/albumes-artista.json'):
        for p in sorted(RAIZ.glob(patron)):
            if p.is_file() and not any(parte in FUERA for parte in p.relative_to(RAIZ).parts):
                nucleo.append(rel(p))
    # 3.37 · modelos 3D: solo los de los álbumes que trae la web (hay de 1 a 20 hojas para los que se crean en la app; esos se guardan al usarlos)
    for hojas in sorted(modelos_usados()):
        nucleo.append('web/prueba-3d/modelo/' + ('album.glb' if hojas == 9 else 'album-%dh.glb' % hojas))
    nucleo = list(dict.fromkeys(nucleo))
    minis = [rel(p) for p in sorted((RAIZ / 'web/prueba-3d/assets/cartas/mini').glob('*.webp'))]
    minis += [rel(p) for p in sorted((RAIZ / 'web/prueba-3d/assets/proxies').rglob('*.png'))]   # cartas sin imagen en TCGdex
    # sin «versión»: el código se pide siempre primero a la red, y la app revisa esta lista cada vez que se abre con conexión
    return {'nucleo': nucleo, 'miniaturas': minis, 'externos': EXTERNOS}


if __name__ == '__main__':
    datos = lista()
    texto = json.dumps(datos, ensure_ascii=False, indent=1) + '\n'
    if '--comprobar' in sys.argv:
        actual = (RAIZ / 'precache.json').read_text(encoding='utf-8') if (RAIZ / 'precache.json').exists() else ''
        if actual != texto:
            sys.exit('precache.json no está al día: ejecuta  python herramientas/pwa/generar_precache.py')
        print('precache.json al día'); sys.exit(0)
    (RAIZ / 'precache.json').write_text(json.dumps(datos, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('precache.json: %d archivos del núcleo, %d miniaturas, %d externos' % (len(datos['nucleo']), len(datos['miniaturas']), len(datos['externos'])))
