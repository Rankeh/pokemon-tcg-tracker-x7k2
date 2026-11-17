"""Actualiza los álbumes de ARTISTA (datos/albumes-artista.json): regenera cada catálogo desde TCGdex (cartas nuevas incluidas),
descarga las imágenes que falten y, si el álbum necesita más hojas, genera su modelo 3D (web/prueba-3d/modelo/album-<n>h.glb).
La colección de nadie se toca: las cartas nuevas aparecen como pendientes. Lo ejecuta cada semana .github/workflows/actualizar-artistas.yml.
Uso (en la raíz del repo, con acceso a api.tcgdex.net y assets.tcgdex.net):  python herramientas/catalogo-ilustrador/actualizar.py"""
import json, math, os, pathlib, shutil, subprocess, sys, tempfile

RAIZ = pathlib.Path(__file__).resolve().parents[2]
POR_PAGINA = 9                                          # web/js/album/distribucion.js


def ids(ruta):
    try: return {c['id'] for c in json.loads(ruta.read_text(encoding='utf-8'))['cartas']}
    except FileNotFoundError: return set()


def main():
    resumen = []
    for a in json.loads((RAIZ / 'datos/albumes-artista.json').read_text(encoding='utf-8')):
        cat = RAIZ / 'datos/catalogo' / ('coleccion-%s.json' % a['id'])
        antes = ids(cat)
        subprocess.run([sys.executable, 'herramientas/catalogo-ilustrador/generar.py', '--ilustrador', a['ilustrador'], '--id', a['id']], cwd=RAIZ, check=True)
        despues = ids(cat)
        nuevas, retiradas = sorted(despues - antes), sorted(antes - despues)
        # imágenes: un fallo puntual no tumba la actualización (la carta se ve con marcador hasta la próxima vez)
        subprocess.run([sys.executable, 'herramientas/texturas/descargar_cartas.py', '--catalogo', str(cat.relative_to(RAIZ))], cwd=RAIZ)
        hojas = math.ceil(math.ceil(len(despues) / POR_PAGINA) / 2)
        modelo = RAIZ / 'web/prueba-3d/modelo' / ('album.glb' if hojas == 9 else 'album-%dh.glb' % hojas)
        if not modelo.exists():                         # el álbum ha crecido: un modelo con más hojas (Python puro, sin Blender)
            with tempfile.TemporaryDirectory() as tmp:
                subprocess.run([sys.executable, 'blender/exportar_glb.py', '--hojas', str(hojas), '--salida', tmp], cwd=RAIZ, check=True)
                shutil.copy(pathlib.Path(tmp) / 'modelo' / 'album.glb', modelo)
        linea = '%s: %d cartas (%d nuevas%s), modelo %s' % (a['ilustrador'], len(despues), len(nuevas), ', %d retiradas' % len(retiradas) if retiradas else '', modelo.name)
        print(linea, nuevas or '')
        resumen.append('- ' + linea + (': ' + ', '.join(nuevas) if nuevas else ''))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f: f.write('## Álbumes de artista\n' + '\n'.join(resumen) + '\n')


if __name__ == '__main__':
    main()
