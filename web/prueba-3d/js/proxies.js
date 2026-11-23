// Cartas PROXY: imágenes propias (generadas por herramientas/proxies/generar_proxies.py) para las promos sin imagen oficial.
// Solo se usan si no hay copia local oficial en el manifiesto. Llevan un sello "PROXY" visible: no se confunden con las reales.
export const PROXIES = {
  'svp-208': 'assets/proxies/svp-208.png', 'svp-209': 'assets/proxies/svp-209.png', 'svp-210': 'assets/proxies/svp-210.png',
  'svp-211': 'assets/proxies/svp-211.png', 'svp-212': 'assets/proxies/svp-212.png',
  // 3.33 · Shinji Kanda: sin imagen en TCGdex ni en limitlesstcg
  'swshp-SWSH284': 'assets/proxies/swshp-swsh284.png', '30th-c-030': 'assets/proxies/30th-c-030.png',
};
export const rutaProxy = (id) => PROXIES[id] || null;
// 3.15 · Arte real descargado (limitlesstcg.com, en español) de cartas que TCGdex no tiene y que no necesitan proxy. Nombre de archivo en
// minúsculas (GitHub Pages distingue mayúsculas y el id lleva «GG19»). Lo descarga herramientas/proxies/descargar_arte.py.
export const ARTE = {
  'swsh12.5gg-GG19': 'assets/proxies/arte/swsh12.5gg-gg19.png',     // Altaria · Cenit Supremo Galería de Galar (Asako Ito)
  // 3.33 · Akira Egawa: galerías de Cenit Supremo, Astros Brillantes, Tempestad Plateada y Origen Perdido · Shinji Kanda: promo MEP
  'swsh12.5gg-GG67': 'assets/proxies/arte/swsh12.5gg-gg67.png', 'swsh12.5gg-GG68': 'assets/proxies/arte/swsh12.5gg-gg68.png',
  'swsh12.5gg-GG69': 'assets/proxies/arte/swsh12.5gg-gg69.png', 'swsh12.5gg-GG70': 'assets/proxies/arte/swsh12.5gg-gg70.png',
  'swsh9tg-TG05': 'assets/proxies/arte/swsh9tg-tg05.png', 'swsh12tg-TG05': 'assets/proxies/arte/swsh12tg-tg05.png',
  'swsh11tg-TG18': 'assets/proxies/arte/swsh11tg-tg18.png', 'swsh12tg-TG21': 'assets/proxies/arte/swsh12tg-tg21.png',
  'mep-024': 'assets/proxies/arte/mep-024.png',
};
// Si has ejecutado herramientas/proxies/descargar_arte.py existe también el arte real en esta ruta; la app lo prueba primero.
export const rutasArte = (id) => (ARTE[id] ? [ARTE[id]] : PROXIES[id] ? ['png', 'webp'].map((e) => 'assets/proxies/arte/' + id + '.' + e) : []);
