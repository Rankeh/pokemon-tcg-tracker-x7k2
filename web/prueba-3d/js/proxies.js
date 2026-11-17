// Cartas PROXY: imágenes propias (generadas por herramientas/proxies/generar_proxies.py) para las promos sin imagen oficial.
// Solo se usan si no hay copia local oficial en el manifiesto. Llevan un sello "PROXY" visible: no se confunden con las reales.
export const PROXIES = {
  'svp-208': 'assets/proxies/svp-208.png', 'svp-209': 'assets/proxies/svp-209.png', 'svp-210': 'assets/proxies/svp-210.png',
  'svp-211': 'assets/proxies/svp-211.png', 'svp-212': 'assets/proxies/svp-212.png',
};
export const rutaProxy = (id) => PROXIES[id] || null;
// 3.15 · Arte real descargado (limitlesstcg.com, en español) de cartas que TCGdex no tiene y que no necesitan proxy. Nombre de archivo en
// minúsculas (GitHub Pages distingue mayúsculas y el id lleva «GG19»). Lo descarga herramientas/proxies/descargar_arte.py.
export const ARTE = { 'swsh12.5gg-GG19': 'assets/proxies/arte/swsh12.5gg-gg19.png' };     // Altaria · Cenit Supremo Galería de Galar
// Si has ejecutado herramientas/proxies/descargar_arte.py existe también el arte real en esta ruta; la app lo prueba primero.
export const rutasArte = (id) => (ARTE[id] ? [ARTE[id]] : PROXIES[id] ? ['png', 'webp'].map((e) => 'assets/proxies/arte/' + id + '.' + e) : []);
