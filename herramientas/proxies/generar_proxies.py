"""Genera cartas PROXY (imagen propia, no oficial) para las cartas que no tienen imagen en TCGdex ni arte en limitlesstcg (ver COLORES).
Uso: python3 herramientas/proxies/generar_proxies.py   (necesita Pillow)
Salida: web/prueba-3d/assets/proxies/<id>.png (256x358) — mismo tamaño que las minis de textura.
Los datos salen del catálogo; la ilustración es solo un motivo abstracto: NO usa arte oficial."""
import json, pathlib
from PIL import Image, ImageDraw, ImageFont

RAIZ = pathlib.Path(__file__).resolve().parents[2]
W, H = 256, 358
FUENTES = '/usr/share/fonts/truetype/dejavu/'
COLORES = {'svp-208': ((244, 160, 60), (150, 60, 20)), 'svp-209': ((245, 214, 70), (140, 110, 20)),
           'svp-210': ((110, 200, 170), (30, 90, 80)), 'svp-211': ((170, 130, 210), (70, 40, 110)),
           'svp-212': ((150, 150, 225), (50, 50, 120)),
           # 3.33 · Shinji Kanda: ni TCGdex ni limitlesstcg tienen su imagen
           'swshp-SWSH284': ((175, 90, 170), (70, 25, 80)),        # Moltres de Galar (promo Espada y Escudo)
           '30th-c-030': ((240, 120, 80), (150, 45, 35))}          # Magikarp (Colección Clásica del 30.º Aniversario)

def fuente(n, t):
    try: return ImageFont.truetype(FUENTES + n, t)
    except OSError: return ImageFont.load_default()

def carta(c):
    c1, c2 = COLORES[c['id']]
    im = Image.new('RGB', (W, H), (235, 230, 215)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((4, 4, W - 5, H - 5), 14, fill=c1, outline=(30, 30, 30), width=3)
    for y in range(10, 190):                                   # degradado vertical del recuadro de ilustración
        t = (y - 10) / 180; d.line((14, y, W - 15, y), fill=tuple(int(c1[i] * (1 - t) + c2[i] * t) for i in range(3)))
    d.rounded_rectangle((12, 46, W - 13, 200), 8, outline=(250, 250, 250), width=2)
    d.ellipse((78, 80, 178, 180), outline=(255, 255, 255), width=4)  # motivo abstracto (no es arte oficial)
    d.text((W // 2, 130), '?', font=fuente('DejaVuSans-Bold.ttf', 70), fill=(255, 255, 255), anchor='mm')
    d.text((16, 14), c['nombre'], font=fuente('DejaVuSans-Bold.ttf', 22), fill=(20, 20, 20))
    d.rounded_rectangle((12, 212, W - 13, 300), 8, fill=(248, 244, 232))
    d.text((W // 2, 232), 'N.º %s · %s' % (c['numero'], c['expansion'].upper()), font=fuente('DejaVuSans-Bold.ttf', 15), fill=(40, 40, 40), anchor='mm')
    exp = 'Promociones Escarlata y Púrpura' if c['id'].startswith('svp-') else c.get('nombreExpansion') or c['expansion']
    d.text((W // 2, 256), exp, font=fuente('DejaVuSans.ttf', 11), fill=(60, 60, 60), anchor='mm')
    d.text((W // 2, 278), 'Ilus.: ' + c['ilustrador'], font=fuente('DejaVuSans.ttf', 12), fill=(60, 60, 60), anchor='mm')
    d.rectangle((0, 314, W, 342), fill=(200, 30, 40))              # sello inconfundible
    d.text((W // 2, 328), 'PROXY · SIN IMAGEN OFICIAL', font=fuente('DejaVuSans-Bold.ttf', 13), fill=(255, 255, 255), anchor='mm')
    return im

if __name__ == '__main__':
    out = RAIZ / 'web/prueba-3d/assets/proxies'; out.mkdir(parents=True, exist_ok=True)
    hechas = set()
    for f in sorted((RAIZ / 'datos/catalogo').glob('coleccion-*.json')):   # todos los álbumes: una carta puede estar en varios
        cat = json.load(open(f, encoding='utf-8'))
        for c in (cat if isinstance(cat, list) else cat['cartas']):
            if c['id'] in COLORES and c['id'] not in hechas and c.get('estadoImagen') == 'sin-imagen':
                hechas.add(c['id'])
                # nombre en minúsculas: GitHub Pages distingue mayúsculas y algunos ids las llevan («SWSH284»)
                carta(c).save(out / (c['id'].lower() + '.png'), optimize=True); print('proxy', c['id'], c['nombre'])
