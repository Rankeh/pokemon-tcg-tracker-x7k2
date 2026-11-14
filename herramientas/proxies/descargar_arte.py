"""Descarga el arte real de las 5 promos que TCGdex no tiene, desde tu PC (el entorno de Claude no tiene red).
Uso (en la raíz del repo):  python herramientas/proxies/descargar_arte.py
Guarda web/prueba-3d/assets/proxies/arte/<id>.webp. Si un archivo existe, la app lo usa en lugar del proxy.
Fuente probada para svp-208: cdn.pokedexia.com (imagen 'low'). Las otras cuatro siguen el mismo patrón, sin verificar.
Uso personal de tu colección; revisa los derechos de las imágenes si algún día publicas la app."""
import pathlib, urllib.request, sys
RAIZ = pathlib.Path(__file__).resolve().parents[2]
SALIDA = RAIZ / 'web/prueba-3d/assets/proxies/arte'; SALIDA.mkdir(parents=True, exist_ok=True)
PATRONES = ['https://cdn.pokedexia.com/cards/sv/SVP/cards/{id}-high.webp', 'https://cdn.pokedexia.com/cards/sv/SVP/cards/{id}-low.webp']
ok = 0
for n in range(208, 213):
    id_ = 'svp-%d' % n
    for p in PATRONES:
        try:
            req = urllib.request.Request(p.format(id=id_), headers={'User-Agent': 'Mozilla/5.0'})
            datos = urllib.request.urlopen(req, timeout=20).read()
            if datos[:4] == b'RIFF' and len(datos) > 2000:
                (SALIDA / (id_ + '.webp')).write_bytes(datos); print('OK ', id_, p.split('/')[-1], len(datos), 'bytes'); ok += 1; break
        except Exception as e:
            print('fallo', id_, p.split('/')[-1], e)
    else: print('SIN ARTE', id_, '(seguirá el proxy)')
print(ok, 'de 5 descargadas'); sys.exit(0 if ok else 1)
