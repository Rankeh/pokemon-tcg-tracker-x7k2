// Cartas PROXY: imágenes propias (generadas por herramientas/proxies/generar_proxies.py) para las promos sin imagen oficial.
// Solo se usan si no hay copia local oficial en el manifiesto. Llevan un sello "PROXY" visible: no se confunden con las reales.
export const PROXIES = {
  'svp-208': 'assets/proxies/svp-208.png', 'svp-209': 'assets/proxies/svp-209.png', 'svp-210': 'assets/proxies/svp-210.png',
  'svp-211': 'assets/proxies/svp-211.png', 'svp-212': 'assets/proxies/svp-212.png',
};
export const rutaProxy = (id) => PROXIES[id] || null;
