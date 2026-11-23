// Cuenta (Supabase Auth) y, desde 3.31, sincronización de la colección entre dispositivos.
import { supabase, SUPABASE_URL, SUPABASE_CLAVE_PUBLICABLE } from "./supabase-config.js";
import { Almacen } from "./almacen.js";
import { iniciarSincronizacion, conectarSupabase } from "./sincronizacion.js";

const $ = (sel) => document.querySelector(sel);
const mensaje = $("#mensaje");

function avisar(texto, tipo = "info") {
  mensaje.textContent = texto;
  mensaje.dataset.tipo = tipo;
  mensaje.hidden = false;
}

const ERRORES = {
  "User already registered": "Ya existe una cuenta con ese correo.",
  "Invalid login credentials": "Correo o contraseña incorrectos.",
  "Email not confirmed": "Aún no has confirmado el correo. Revisa tu bandeja de entrada.",
  "Password should be at least 6 characters.": "La contraseña debe tener al menos 6 caracteres.",
};
const traducir = (error) => ERRORES[error.message] ?? error.message;

// ------------------------------------------------------------------ sincronización
let almacen = null, sync = null, huboPrimera = false;   // el aviso de la primera sincronización no lo pisa la pasada siguiente
const hora = (d) => d.toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
function pintarEstado(e) {
  const caja = $("#sync-estado"), texto = $("#sync-texto"), detalle = $("#sync-detalle");
  caja.dataset.estado = e.estado;
  if (e.estado === "sincronizando") { texto.textContent = "Sincronizando…"; return; }
  if (e.estado === "error") {
    texto.textContent = navigator.onLine === false ? "Sin conexión" : "No se pudo sincronizar";
    detalle.textContent = "Tus cambios siguen guardados en este navegador y se subirán en cuanto se pueda." + (e.error?.message ? " (" + e.error.message + ")" : "");
    return;
  }
  if (e.estado === "ok") {
    texto.textContent = "Sincronizada · " + hora(e.cuando);
    if (e.primera) huboPrimera = true;
    detalle.textContent = huboPrimera
      ? "Primera sincronización de este navegador: se han juntado las cartas de aquí con las de tu cuenta, sin borrar ninguna."
      : (e.cambiadas.length ? `${e.cambiadas.length} cartas actualizadas desde otro dispositivo.` : "Todo al día.");
    pintarDeshacer();
  }
}
async function pintarDeshacer() {
  const foto = almacen && await almacen.fotoAntesDeSincronizar();
  $("#sync-deshacer").hidden = !foto;
  if (foto) $("#sync-deshacer").title = `Vuelve a la colección que había en este navegador el ${hora(new Date(foto.fecha))} (${foto.cartas} cartas)`;
}
async function arrancarSincronizacion() {
  try { almacen = almacen || await Almacen.abrir(); }
  catch (e) { pintarEstado({ estado: "error", error: new Error("este navegador no deja guardar datos (¿modo privado?)") }); return; }
  if (sync) { sync.ahora(); return; }                             // al crearla ya hace la primera pasada
  sync = iniciarSincronizacion(almacen, { conectar: () => conectarSupabase(supabase), alEstado: pintarEstado });
}
$("#sync-ahora").addEventListener("click", () => sync?.ahora());
$("#sync-deshacer").addEventListener("click", async () => {
  if (!confirm("¿Volver a la colección que había en este navegador antes de la primera sincronización?\n\n"
    + "Ojo: el cambio también se guarda en tu cuenta. Las cartas que llegaron de tus otros dispositivos se quitarán también de ellos "
    + "en su próxima sincronización.")) return;
  await almacen.deshacerSincronizacion();
  avisar("Colección de antes restaurada en este navegador.", "ok");
  sync?.ahora();
});

// ------------------------------------------------------------------ sesión
async function pintarSesion() {
  const { data: { session } } = await supabase.auth.getSession();
  $("#formularios").hidden = !!session;
  $("#sesion").hidden = !session;
  if (!session) return;

  const { data: perfil } = await supabase
    .from("perfiles").select("nombre_usuario").eq("id", session.user.id).maybeSingle();
  const meta = session.user.user_metadata || {};
  $("#usuario").textContent = perfil?.nombre_usuario || meta.full_name || meta.name || session.user.email;
  $("#correo").textContent = session.user.email;
  arrancarSincronizacion();
}

$("#form-registro").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const boton = e.submitter; boton.disabled = true;
  const { data, error } = await supabase.auth.signUp({
    email: f.get("correo"),
    password: f.get("clave"),
    options: {
      data: { nombre_usuario: f.get("nombre").trim() },
      emailRedirectTo: location.href.split("?")[0].split("#")[0],
    },
  });
  boton.disabled = false;
  if (error) return avisar(traducir(error), "error");
  // Con la confirmación por correo activada, signUp no devuelve sesión hasta que el usuario confirma.
  if (!data.session) avisar("Cuenta creada. Te hemos enviado un correo para confirmarla; después entra aquí con tu correo y contraseña.", "ok");
  else avisar("Cuenta creada. ¡Bienvenido!", "ok");
  e.target.reset();
});

// ------------------------------------------------------------------ 3.36 · entrar con Google (Supabase OAuth)
/** ¿Está activado Google en Supabase? (Authentication → Providers). Si no, se avisa en vez de llevar a una página de error. */
async function googleActivado() {
  try {
    const r = await fetch(SUPABASE_URL + "/auth/v1/settings", { headers: { apikey: SUPABASE_CLAVE_PUBLICABLE } });
    return r.ok ? Boolean((await r.json()).external?.google) : null;
  } catch { return null; }                                             // sin conexión: lo dirá el propio intento
}
$("#entrar-google").addEventListener("click", async (e) => {
  const boton = e.currentTarget; boton.disabled = true;
  if ((await googleActivado()) === false) {
    boton.disabled = false;
    return avisar("El inicio de sesión con Google aún no está activado en Supabase (Authentication → Providers → Google). Mientras, puedes entrar con tu correo.", "error");
  }
  // vuelve a esta misma página; Supabase lee la sesión del enlace de vuelta y la sincronización arranca sola
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  if (error) { boton.disabled = false; avisar(traducir(error), "error"); }
});
// al volver de Google con un error (permiso denegado, enlace caducado…), se muestra y se limpia la dirección
{
  const q = new URLSearchParams(location.search + "&" + location.hash.slice(1));
  if (q.get("error")) {
    avisar(q.get("error") === "access_denied" ? "Has cancelado el inicio de sesión con Google." : "No se pudo entrar con Google: " + (q.get("error_description") || q.get("error")), "error");
    history.replaceState(null, "", location.pathname);
  }
}

$("#form-entrar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const boton = e.submitter; boton.disabled = true;
  const { error } = await supabase.auth.signInWithPassword({
    email: f.get("correo"), password: f.get("clave"),
  });
  boton.disabled = false;
  if (error) return avisar(traducir(error), "error");
  mensaje.hidden = true;
});

$("#salir").addEventListener("click", async () => {
  await supabase.auth.signOut();
  avisar("Sesión cerrada. Tu colección sigue guardada en este navegador.");
});

supabase.auth.onAuthStateChange(() => { setTimeout(pintarSesion, 0); });
pintarSesion();
