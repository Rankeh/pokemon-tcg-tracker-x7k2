// 3.38 · ¿Es esta la cuenta del administrador (el dueño de la web)? Solo ella ve los álbumes de la web (Teselia, artistas, Pikachu 30…);
// el resto de visitantes empiezan con la biblioteca vacía y crean los suyos. La lista de admins está en Supabase (tabla administradores:
// cada cuenta solo puede consultar si ELLA lo es, y nadie puede añadirse desde la web).
// OJO: es una cuestión de qué se enseña, no de seguridad: los catálogos e imágenes de esos álbumes son archivos públicos del repositorio.
import { haySesionGuardada } from "./sincronizacion.js";

const CLAVE = "cuenta.admin";
const guardar = (si) => { try { if (si) localStorage.setItem(CLAVE, "1"); else localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ } };

/** Lo último que se supo (al instante y sin conexión). Sin sesión guardada, nunca. */
export function adminGuardado() {
  try { return haySesionGuardada() && localStorage.getItem(CLAVE) === "1"; } catch { return false; }
}

/** Lo pregunta a Supabase (y lo recuerda). Sin conexión o si algo falla, devuelve lo último que se supo. */
export async function comprobarAdmin() {
  if (!haySesionGuardada()) { guardar(false); return false; }
  try {
    const { supabase } = await import("./supabase-config.js");
    const id = (await supabase.auth.getSession()).data?.session?.user?.id;
    if (!id) { guardar(false); return false; }
    const { data, error } = await supabase.from("administradores").select("usuario").eq("usuario", id).maybeSingle();
    if (error) return adminGuardado();
    guardar(Boolean(data));
    return Boolean(data);
  } catch { return adminGuardado(); }
}
