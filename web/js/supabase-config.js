// Conexión con Supabase (proyecto «pokemon-tcg-tracker», región eu-west-3).
// La clave publicable es pública por diseño: puede ir en el navegador. La seguridad la dan las políticas RLS de la BD.
// NUNCA pongas aquí la clave secreta / service_role.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";

export const SUPABASE_URL = "https://untiwlxjdklqjwjbvdym.supabase.co";
export const SUPABASE_CLAVE_PUBLICABLE = "sb_publishable_pdnTzHUN0zWiwS3cBZo8rA_yb4yu757";

export const supabase = createClient(SUPABASE_URL, SUPABASE_CLAVE_PUBLICABLE);
