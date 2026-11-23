// Dirección y clave publicable del proyecto de Supabase, sin cargar la librería (la usan módulos que no necesitan el cliente entero).
// La clave publicable es pública por diseño. NUNCA pongas aquí la clave secreta / service_role.
export const SUPABASE_URL = "https://untiwlxjdklqjwjbvdym.supabase.co";
export const SUPABASE_CLAVE_PUBLICABLE = "sb_publishable_pdnTzHUN0zWiwS3cBZo8rA_yb4yu757";
/** 3.39 · intermediario de imágenes de limitlesstcg (supabase/functions/imagen-limitless): ?buscar=1&set&num&id → { ruta }; ?ruta= → PNG con CORS */
export const FUNCION_LIMITLESS = SUPABASE_URL + "/functions/v1/imagen-limitless";
