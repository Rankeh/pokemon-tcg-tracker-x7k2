"""Genera el catálogo (y los precios) de un álbum dedicado a un ILUSTRADOR a partir de TCGdex, con el mismo formato que
datos/catalogo/coleccion-teselia.json, para que el visor 3D lo use sin cambios.

Uso (en la raíz del repo, con acceso a api.tcgdex.net):
    python herramientas/catalogo-ilustrador/generar.py --ilustrador "Asako Ito" --id asako-ito [--incluir-pocket]

Escribe datos/catalogo/coleccion-<id>.json y datos/catalogo/precios-<id>.json.
- Coincidencia EXACTA del nombre del ilustrador (TCGdex «illustrator=eq:…»): «like» mezclaría a otros (p. ej. Masako).
- Por defecto se excluyen las cartas de Pokémon TCG Pocket (serie «tcgp»: juego digital, no se coleccionan en papel).
- Datos en español cuando TCGdex los tiene; si no, en inglés (se marca en idiomaImagen/estadoImagen).
- Precios: Cardmarket vía TCGdex (pricing.cardmarket, EUR). No distinguen el idioma de la carta.
Solo usa la biblioteca estándar de Python."""
import argparse, json, pathlib, time, urllib.parse, urllib.request

RAIZ = pathlib.Path(__file__).resolve().parents[2]
API = 'https://api.tcgdex.net/v2/'
UA = {'User-Agent': 'pokemon-tcg-tracker (uso personal)'}

# rareza (inglés, TCGdex) → categoría del álbum (la usa el progreso por categoría y el orden dentro de una especie)
CATEGORIAS = {
    'common': 'comun', 'uncommon': 'infrecuente', 'rare': 'rara', 'rare holo': 'rara', 'holo rare': 'rara',
    'illustration rare': 'ir', 'special illustration rare': 'sir', 'promo': 'promo',
}


def pedir(ruta, intentos=4):
    for i in range(intentos):
        try:
            with urllib.request.urlopen(urllib.request.Request(API + ruta, headers=UA), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            if i == intentos - 1: raise
        except Exception:
            if i == intentos - 1: raise
        time.sleep(2 * (i + 1) ** 2)


def categoria(rareza_en):
    r = (rareza_en or '').strip().lower()
    return CATEGORIAS.get(r, 'otra')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ilustrador', required=True)
    ap.add_argument('--id', required=True, help='identificador del álbum (minúsculas y guiones), p. ej. asako-ito')
    ap.add_argument('--incluir-pocket', action='store_true', help='incluir también cartas de Pokémon TCG Pocket (digitales)')
    a = ap.parse_args()

    lista = pedir('en/cards?illustrator=' + urllib.parse.quote('eq:' + a.ilustrador)) or []
    print('%d cartas de %s en TCGdex' % (len(lista), a.ilustrador))
    cartas, precios, fuera = [], {}, []
    for i, resumen in enumerate(lista, 1):
        en = pedir('en/cards/' + urllib.parse.quote(resumen['id']))
        if not en or en.get('illustrator') != a.ilustrador:          # comprobación doble: solo coincidencias exactas
            fuera.append((resumen['id'], 'ilustrador distinto')); continue
        serie = (en.get('set') or {}).get('serie', {}).get('id') or ''
        if not serie:
            serie = (pedir('en/sets/' + en['set']['id']) or {}).get('serie', {}).get('id', '')
        if serie == 'tcgp' and not a.incluir_pocket:
            fuera.append((en['id'], 'TCG Pocket (digital)')); continue
        es = pedir('es/cards/' + urllib.parse.quote(en['id']))
        es = es if es and es.get('id') else None
        fuente = es or en
        imagen = (es or {}).get('image') or en.get('image')
        idioma = 'es' if (es or {}).get('image') else 'en'
        cartas.append({
            'id': en['id'],
            'categoriaColeccion': categoria(en.get('rarity')),
            'nombre': fuente.get('name') or en.get('name'),
            'numero': en.get('localId'),
            'expansion': en['set']['id'],
            'nombreExpansion': ((es or {}).get('set') or {}).get('name') or en['set']['name'],
            'serie': serie,
            'rareza': (es or {}).get('rarity') or en.get('rarity'),
            'ilustrador': en.get('illustrator'),
            'imagen': (imagen + '/high.webp') if imagen else None,
            'dexId': en.get('dexId'),
            'estadoImagen': ('espanol-verificada' if idioma == 'es' else 'otro-idioma') if imagen else 'sin-imagen',
            'idiomaImagen': idioma if imagen else None,
            'imagenCarga': bool(imagen),
            'origenImagen': 'TCGdex (campo image)' if imagen else None,
        })
        cm = ((es or en).get('pricing') or {}).get('cardmarket') or {}
        v = {'tendencia': cm.get('trend', cm.get('trend-holo')), 'bajo': cm.get('low', cm.get('low-holo')),
             'medio30': cm.get('avg30', cm.get('avg30-holo')), 'actualizado': cm.get('updated')}
        if v['tendencia'] is not None or v['bajo'] is not None:
            precios[en['id']] = {k: x for k, x in v.items() if x is not None}
        print('%3d/%d %-16s %-14s %s' % (i, len(lista), en['id'], cartas[-1]['nombre'][:14], idioma))
        time.sleep(0.1)

    hoy = time.strftime('%Y-%m-%d')
    total = {'total': len(cartas), 'imagenEspanol': sum(c['idiomaImagen'] == 'es' for c in cartas),
             'imagenOtroIdioma': sum(c['idiomaImagen'] == 'en' for c in cartas), 'sinImagen': sum(not c['imagenCarga'] for c in cartas),
             'excluidas': [{'id': x, 'motivo': m} for x, m in fuera]}
    destino = RAIZ / 'datos/catalogo' / ('coleccion-%s.json' % a.id)
    destino.write_text(json.dumps({'generado': hoy, 'fuente': 'TCGdex (datos MIT), ilustrador = «%s» (coincidencia exacta)' % a.ilustrador,
                                   'ilustrador': a.ilustrador, 'totales': total, 'cartas': cartas}, ensure_ascii=False, indent=1), encoding='utf-8')
    (RAIZ / 'datos/catalogo' / ('precios-%s.json' % a.id)).write_text(json.dumps({
        'fecha': hoy, 'fuente': 'Cardmarket vía TCGdex (api.tcgdex.net)', 'unidad': 'EUR',
        'nota': 'Precio del mercado europeo; Cardmarket no separa por idioma de la carta.', 'cartas': precios}, ensure_ascii=False, indent=1), encoding='utf-8')
    print('\n%s: %d cartas (%d con imagen en español), %d con precio, %d excluidas' % (destino.name, len(cartas), total['imagenEspanol'], len(precios), len(fuera)))


if __name__ == '__main__':
    main()
