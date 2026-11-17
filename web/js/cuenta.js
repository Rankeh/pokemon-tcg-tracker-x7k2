// Registro, inicio y cierre de sesión con Supabase Auth.
import { supabase } from "./supabase-config.js";

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

async function pintarSesion() {
  const { data: { session } } = await supabase.auth.getSession();
  $("#formularios").hidden = !!session;
  $("#sesion").hidden = !session;
  if (!session) return;

  const { data: perfil } = await supabase
    .from("perfiles").select("nombre_usuario").eq("id", session.user.id).maybeSingle();
  $("#usuario").textContent = perfil?.nombre_usuario || session.user.email;
  $("#correo").textContent = session.user.email;
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
      emailRedirectTo: location.href.split("?")[0],
    },
  });
  boton.disabled = false;
  if (error) return avisar(traducir(error), "error");
  // Con la confirmación por correo activada, signUp no devuelve sesión hasta que el usuario confirma.
  if (!data.session) avisar("Cuenta creada. Te hemos enviado un correo para confirmarla.", "ok");
  else avisar("Cuenta creada. ¡Bienvenido!", "ok");
  e.target.reset();
});

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
  avisar("Sesión cerrada.");
});

supabase.auth.onAuthStateChange(() => { setTimeout(pintarSesion, 0); });
pintarSesion();
