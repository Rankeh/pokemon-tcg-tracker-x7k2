// Precios en euros de las cartas (Cardmarket vía TCGdex), leídos de datos/catalogo/precios-teselia.json.
// El archivo lo genera herramientas/precios/descargar_precios.py y se versiona en el repo: la web NUNCA llama a APIs externas.
// Si el archivo no existe todavía, todo esto se apaga solo (la ficha no enseña precio y la cabecera no enseña total).

/** Carga el JSON de precios. null si no existe o no tiene la forma esperada (no es un error). */
export async function cargarPrecios(url = '../../datos/catalogo/precios-teselia.json') {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return null;
    const m = await r.json();
    return m && m.cartas && typeof m.cartas === 'object' ? m : null;
  } catch { return null; }
}

export const precioDe = (precios, id) => (precios && precios.cartas && precios.cartas[id]) || null;

const FMT = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const FMT_ENTERO = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, minimumFractionDigits: 0 });
export const eur = (n) => FMT.format(n);
export const eurEntero = (n) => FMT_ENTERO.format(n);

/** Valor de la colección: Σ tendencia × copias de las cartas conseguidas. PURO (se prueba en Node).
 *  Devuelve también cuántas cartas conseguidas tienen precio y cuántas no (para ser honestos con el «≈»). */
export function valorColeccion(precios, ids, cantidadDe) {
  let total = 0, valoradas = 0, sinPrecio = 0;
  for (const id of ids) {
    const n = cantidadDe(id);
    if (!n) continue;
    const p = precioDe(precios, id);
    if (p && p.tendencia != null) { total += p.tendencia * n; valoradas++; } else sinPrecio++;
  }
  return { total, valoradas, sinPrecio };
}

/** Línea de precio para la ficha: «≈ 3,20 € · mín. 1,50 € · Cardmarket 2026-11-16». Enseña lo que haya (tendencia y/o mínimo); '' si no hay nada. */
export function lineaPrecio(precios, id) {
  const p = precioDe(precios, id);
  if (!p || (p.tendencia == null && p.bajo == null)) return '';
  const partes = [];
  if (p.tendencia != null) partes.push(`≈ ${eur(p.tendencia)}`);
  if (p.bajo != null) partes.push(`mín. ${eur(p.bajo)}`);
  // «guía» y fecha: es la guía DIARIA de Cardmarket (vía TCGdex), no el precio en vivo; el mínimo cuenta cualquier condición e idioma
  const fecha = ((p.actualizado || '').slice(0, 10)) || precios.fecha || '';
  return `${partes.join(' · ')} · guía Cardmarket${fecha ? ' ' + fecha : ''}`;
}

/** Enlace a las ofertas EN ESPAÑOL de la carta en Cardmarket. Solo valen enlaces DIRECTOS a cardmarket.com:
 *  los redirectores (prices.pokemontcg.io, de la primera descarga) pierden ?language=4 al redirigir, así que se ocultan. */
export const enlaceCardmarket = (precios, id) => {
  const p = precioDe(precios, id);
  const u = p && p.enlace;
  return u && /^https:\/\/www\.cardmarket\.com\//.test(u) ? u : null;
};
