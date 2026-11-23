// Dirección y clave publicable del proyecto de Supabase, sin cargar la librería (la usan módulos que no necesitan el cliente entero).
// La clave publicable es pública por diseño. NUNCA pongas aquí la clave secreta / service_role.
export const SUPABASE_URL = "https://untiwlxjdklqjwjbvdym.supabase.co";
export const SUPABASE_CLAVE_PUBLICABLE = "sb_publishable_pdnTzHUN0zWiwS3cBZo8rA_yb4yu757";
/** 3.39 · intermediario de imágenes de limitlesstcg (supabase/functions/imagen-limitless): ?buscar=1&set&num&id → { ruta }; ?ruta= → PNG con CORS */
export const FUNCION_LIMITLESS = SUPABASE_URL + "/functions/v1/imagen-limitless";
/** 3.41 · Muchas imágenes de TCGdex llevan la cabecera CORS duplicada («*, *») y los navegadores las rechazan cuando se piden con CORS
 *  (3D, portada, miniaturas). El intermediario las devuelve con una sola. `porIntermediario`: esa versión de una imagen de TCGdex (o null). */
export const porIntermediario = (url) => {
  const m = typeof url === "string" && /^https:\/\/assets\.tcgdex\.net\/([a-z]{2}\/.+\/(?:low|high)\.webp)$/.exec(url);
  return m ? `${FUNCION_LIMITLESS}?tcgdex=${encodeURIComponent(m[1])}` : null;
};
/** Las de ESPAÑOL fallan siempre: van por el intermediario desde el principio. Las demás, directas (y si fallan, `porIntermediario`). */
export const conCors = (url) => (typeof url === "string" && url.startsWith("https://assets.tcgdex.net/es/") ? porIntermediario(url) || url : url);
/** Las direcciones a probar, en orden: la directa (o ya por el intermediario) y, si es otra, la del intermediario. */
export const conRespaldo = (url) => [...new Set([conCors(url), porIntermediario(url)].filter(Boolean))];
