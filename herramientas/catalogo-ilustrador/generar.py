"""Genera el catálogo (y los precios) de un álbum dedicado a un ILUSTRADOR, o a un POKÉMON dentro de una expansión, a partir de TCGdex,
con el mismo formato que datos/catalogo/coleccion-teselia.json, para que el visor 3D lo use sin cambios.

Uso (en la raíz del repo, con acceso a api.tcgdex.net):
    python herramientas/catalogo-ilustrador/generar.py --ilustrador "Asako Ito" --id asako-ito [--incluir-pocket]
    python herramientas/catalogo-ilustrador/generar.py --expansion 30th --pokemon Pikachu --id pikachu-30

Escribe datos/catalogo/coleccion-<id>.json y datos/catalogo/precios-<id>.json.
- Coincidencia EXACTA del nombre del ilustrador o del Pokémon (en inglés: «Pikachu» no incluye «Pikachu ex») (TCGdex «illustrator=eq:…»): «like» mezclaría a otros (p. ej. Masako).
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


SELLOS = {'30th-anniversary': 'sello 30.º aniversario'}
NOMBRES = {'normal': 'Normal', 'holo': 'Holo', 'reverse': 'Reverse holo', 'firstEdition': '1.ª edición', 'wPromo': 'Sello W'}
import re
EXPANSION_PRINCIPAL_SM = re.compile(r'^sm\d+$')        # sm1..sm12: en Sol y Luna las comunes, infrecuentes y raras salían también en reverse


def variantes(en, cat):
    """Variantes de la carta según TCGdex (variants_detailed; si falta, variants) + el reverse que TCGdex no registra en Sol y Luna."""
    lista, vistos = [], set()
    for v in en.get('variants_detailed') or []:
        t = v.get('type')
        if not t or t in vistos: continue
        vistos.add(t)
        e = {'id': t, 'nombre': NOMBRES.get(t, t)}
        sellos = [SELLOS.get(x, x) for x in (v.get('stamp') or [])]
        if sellos: e['nombre'] += ' · ' + ', '.join(sellos); e['sello'] = v['stamp']
        lista.append(e)
    if not lista:
        lista = [{'id': t, 'nombre': NOMBRES.get(t, t)} for t, si in (en.get('variants') or {}).items() if si]
    if (EXPANSION_PRINCIPAL_SM.match(en['set']['id']) and cat in ('comun', 'infrecuente', 'rara')
            and 'reverse' not in {x['id'] for x in lista}):
        lista.append({'id': 'reverse', 'nombre': 'Reverse holo', 'deducida': True})
    orden = {'normal': 0, 'reverse': 1, 'holo': 2}
    return sorted(lista, key=lambda x: orden.get(x['id'], 9))


def precio_variantes(fuente):
    """Precio Cardmarket por variante (variants_detailed[].pricing.cardmarket)."""
    out = {}
    for v in fuente.get('variants_detailed') or []:
        cm = (v.get('pricing') or {}).get('cardmarket') or {}
        t = cm.get('trend', cm.get('trend-holo')); b = cm.get('low', cm.get('low-holo'))
        if v.get('type') and (t is not None or b is not None):
            out[v['type']] = {k: x for k, x in {'tendencia': t, 'bajo': b}.items() if x is not None}
    return out


def arte_completo(en, cat):
    """Ilustración a sangre (el brillo holo cubre toda la carta): ilustraciones raras y galerías (GG/TG)."""
    return cat in ('ir', 'sir') or bool(re.match(r'^(GG|TG)\d', en.get('localId') or ''))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ilustrador')
    ap.add_argument('--expansion', help='id de expansión de TCGdex (con --pokemon), p. ej. 30th')
    ap.add_argument('--pokemon', help='nombre exacto en inglés, p. ej. Pikachu')
    ap.add_argument('--id', required=True, help='identificador del álbum (minúsculas y guiones), p. ej. asako-ito')
    ap.add_argument('--incluir-pocket', action='store_true', help='incluir también cartas de Pokémon TCG Pocket (digitales)')
    a = ap.parse_args()
    if bool(a.ilustrador) == bool(a.expansion and a.pokemon):
        ap.error('usa --ilustrador, o bien --expansion y --pokemon')

    if a.ilustrador:
        lista = pedir('en/cards?illustrator=' + urllib.parse.quote('eq:' + a.ilustrador)) or []
        valida = lambda en: en.get('illustrator') == a.ilustrador
        fuente_txt, quien = 'ilustrador = «%s» (coincidencia exacta)' % a.ilustrador, a.ilustrador
    else:
        lista = [c for c in (pedir('en/sets/' + urllib.parse.quote(a.expansion)) or {}).get('cards', []) if c.get('name') == a.pokemon]
        valida = lambda en: en.get('name') == a.pokemon and en['set']['id'] == a.expansion
        fuente_txt, quien = 'expansión %s, Pokémon = «%s» (coincidencia exacta)' % (a.expansion, a.pokemon), '%s (%s)' % (a.pokemon, a.expansion)
    print('%d cartas de %s en TCGdex' % (len(lista), quien))
    cartas, precios, fuera = [], {}, []
    for i, resumen in enumerate(lista, 1):
        en = pedir('en/cards/' + urllib.parse.quote(resumen['id']))
        if not en or not valida(en):                                 # comprobación doble: solo coincidencias exactas
            fuera.append((resumen['id'], 'no coincide')); continue
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
            'variantes': variantes(en, categoria(en.get('rarity'))),
            'arteCompleto': arte_completo(en, categoria(en.get('rarity'))),
        })
        cm = ((es or en).get('pricing') or {}).get('cardmarket') or {}
        v = {'tendencia': cm.get('trend', cm.get('trend-holo')), 'bajo': cm.get('low', cm.get('low-holo')),
             'medio30': cm.get('avg30', cm.get('avg30-holo')), 'actualizado': cm.get('updated')}
        pv = precio_variantes(en)
        if v['tendencia'] is not None or v['bajo'] is not None or pv:
            precios[en['id']] = {k: x for k, x in v.items() if x is not None}
            if pv: precios[en['id']]['variantes'] = pv
        print('%3d/%d %-16s %-14s %s' % (i, len(lista), en['id'], cartas[-1]['nombre'][:14], idioma))
        time.sleep(0.1)

    hoy = time.strftime('%Y-%m-%d')
    total = {'total': len(cartas), 'imagenEspanol': sum(c['idiomaImagen'] == 'es' for c in cartas),
             'imagenOtroIdioma': sum(c['idiomaImagen'] == 'en' for c in cartas), 'sinImagen': sum(not c['imagenCarga'] for c in cartas),
             'excluidas': [{'id': x, 'motivo': m} for x, m in fuera]}
    destino = RAIZ / 'datos/catalogo' / ('coleccion-%s.json' % a.id)
    try:                                                   # sin cambios en las cartas: se conserva la fecha (no hay commits vacíos)
        previo = json.loads(destino.read_text(encoding='utf-8'))
        if previo.get('cartas') == cartas and previo.get('totales') == total: hoy = previo.get('generado', hoy)
    except FileNotFoundError:
        pass
    cabecera = {'generado': hoy, 'fuente': 'TCGdex (datos MIT), ' + fuente_txt}
    cabecera.update({'ilustrador': a.ilustrador} if a.ilustrador else {'expansion': a.expansion, 'pokemon': a.pokemon})
    destino.write_text(json.dumps({**cabecera, 'totales': total, 'cartas': cartas}, ensure_ascii=False, indent=1), encoding='utf-8')
    (RAIZ / 'datos/catalogo' / ('precios-%s.json' % a.id)).write_text(json.dumps({
        'fecha': hoy, 'fuente': 'Cardmarket vía TCGdex (api.tcgdex.net)', 'unidad': 'EUR',
        'nota': 'Precio del mercado europeo; Cardmarket no separa por idioma de la carta.', 'cartas': precios}, ensure_ascii=False, indent=1), encoding='utf-8')
    print('\n%s: %d cartas (%d con imagen en español), %d con precio, %d excluidas' % (destino.name, len(cartas), total['imagenEspanol'], len(precios), len(fuera)))


if __name__ == '__main__':
    main()
