"""Descarga el arte real de las 5 promos (y otras cartas, ver EXTRA) que TCGdex no tiene, desde tu PC (el entorno de Claude no tiene red).
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
# 3.15 · otras cartas que TCGdex no tiene (sin proxy): URL comprobada en limitlesstcg.com. Nombre en minúsculas (GitHub Pages).
L = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/'
EXTRA = {'swsh12.5gg-gg19': 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/CRZ/CRZ_GG19_R_ES_LG.png',   # Altaria (Asako Ito)
         # 3.33 · Akira Egawa (galerías de Cenit Supremo, Astros Brillantes, Tempestad Plateada y Origen Perdido) y Shinji Kanda (promo MEP)
         'swsh12.5gg-gg67': L + 'CRZ/CRZ_GG67_R_ES_LG.png', 'swsh12.5gg-gg68': L + 'CRZ/CRZ_GG68_R_ES_LG.png',
         'swsh12.5gg-gg69': L + 'CRZ/CRZ_GG69_R_ES_LG.png', 'swsh12.5gg-gg70': L + 'CRZ/CRZ_GG70_R_ES_LG.png',
         'swsh9tg-tg05': L + 'BRS/BRS_TG5_R_ES_LG.png', 'swsh12tg-tg05': L + 'SIT/SIT_TG5_R_ES_LG.png',
         'swsh11tg-tg18': L + 'LOR/LOR_TG18_R_ES_LG.png', 'swsh12tg-tg21': L + 'SIT/SIT_TG21_R_ES_LG.png',
         'mep-024': L + 'MEP/MEP_024_R_ES_LG.png',
         # 3.35 · promos de Espada y Escudo: carpeta SP (solo en inglés la SWSH284); Colección Clásica del 30.º: 30C con número «CC»
         'swshp-swsh284': L + 'SP/SP_284_R_EN_LG.png', '30th-c-030': L + '30C/30C_CC30_R_ES_LG.png'}
for id_, url in EXTRA.items():
    try:
        datos = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=20).read()
        if datos[:4] == b'\x89PNG' and len(datos) > 2000: (SALIDA / (id_ + '.png')).write_bytes(datos); print('OK ', id_, len(datos), 'bytes'); ok += 1
        else: print('SIN ARTE', id_)
    except Exception as e: print('fallo', id_, e)
print(ok, 'de', 5 + len(EXTRA), 'descargadas'); sys.exit(0 if ok else 1)
