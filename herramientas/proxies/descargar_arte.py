"""Descarga el arte real de las 5 promos que TCGdex no tiene, desde tu PC (el entorno de Claude no tiene red).
Uso (en la raíz del repo):  python herramientas/proxies/descargar_arte.py
Guarda web/prueba-3d/assets/proxies/arte/<id>.png/.webp. Si un archivo existe, la app lo usa en lugar del proxy.
Fuente principal: limitlesstcg.com (SVP_208_R_ES_LG.png, URL leída de su página); respaldo: pokedexia. Las URLs de 209-212 siguen el mismo patrón, sin verificar.
Uso personal de tu colección; revisa los derechos de las imágenes si algún día publicas la app."""
import pathlib, urllib.request, sys
RAIZ = pathlib.Path(__file__).resolve().parents[2]
SALIDA = RAIZ / 'web/prueba-3d/assets/proxies/arte'; SALIDA.mkdir(parents=True, exist_ok=True)
LIMITLESS = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/SVP/SVP_{n}_{r}_{i}{t}.png'   # {t}: '' (URL que has comprobado tú) o '_LG'
PATRONES = [LIMITLESS.format(n='{num}', r=r, i=i, t=t) for t in ('', '_LG') for i in ('ES', 'EN') for r in ('R', 'U', 'C', 'RR')] + ['https://cdn.pokedexia.com/cards/sv/SVP/cards/{id}-high.webp', 'https://cdn.pokedexia.com/cards/sv/SVP/cards/{id}-low.webp']
ok = 0
for n in range(208, 213):
    id_ = 'svp-%d' % n
    for p in PATRONES:
        try:
            req = urllib.request.Request(p.format(id=id_, num=n), headers={'User-Agent': 'Mozilla/5.0'})
            datos = urllib.request.urlopen(req, timeout=20).read()
            if (datos[:4] == b'RIFF' or datos[:4] == b'\x89PNG') and len(datos) > 2000:
                (SALIDA / (id_ + ('.png' if datos[:4] == b'\x89PNG' else '.webp'))).write_bytes(datos); print('OK ', id_, p.split('/')[-1], len(datos), 'bytes'); ok += 1; break
        except Exception as e:
            print('fallo', id_, p.split('/')[-1], e)
    else: print('SIN ARTE', id_, '(seguirá el proxy)')
print(ok, 'de 5 descargadas'); sys.exit(0 if ok else 1)
