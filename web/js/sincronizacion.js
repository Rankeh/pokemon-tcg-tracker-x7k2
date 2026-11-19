// 3.31 · Sincronización de la colección con la cuenta (Supabase), para ver lo mismo en el móvil y en el ordenador.
// IndexedDB sigue siendo la fuente de verdad de cada navegador: la web funciona igual sin cuenta y sin conexión.
// Cada carta se resuelve por separado y gana el cambio más reciente (también lo exige el servidor: ver supabase/migrations).
// Una carta quitada viaja como cantidad 0, para que la baja llegue a los demás dispositivos.
//
// `remoto` es una interfaz pequeña (así la lógica se prueba sin red; el conector real está en conectarSupabase):
//   usuario()            → id de la cuenta con sesión iniciada, o null
//   leer(desde)          → filas cuya hora de llegada al servidor es posterior a `desde` (null = todas), con `servidor`
//   subir(filas)         → guarda las filas y devuelve lo que ha quedado en el servidor (si había algo más nuevo, eso)

import { instante } from "./almacen.js";

const LOTE = 500;
export const SOLAPE_MS = 5 * 60 * 1000;
/** ¿La hora `a` es posterior a `b`? (mismo milisegundo: decide el texto, que en el servidor siempre tiene el mismo formato) */
const despues = (a, b) => instante(a) > instante(b) || (instante(a) === instante(b) && a > b);

/**
 * Una pasada completa: (1a vez con esta cuenta: foto + todo pendiente) → leer lo nuevo de la cuenta → aplicar → subir lo pendiente
 * → corregir con lo que diga el servidor. Devuelve { estado: 'sin-sesion' | 'ok', cambiadas: [ids], subidas, primera }.
 * Si algo falla (sin conexión…), lanza: lo pendiente sigue apuntado y se reintenta en la siguiente pasada.
 */
export async function sincronizar(almacen, remoto) {
  const usuario = await remoto.usuario();
  if (!usuario) return { estado: "sin-sesion", cambiadas: [], subidas: 0, primera: false };
  let est = await almacen.estadoSincronizacion();
  const primera = !est || est.usuario !== usuario;
  if (primera) { await almacen.prepararPrimeraSincronizacion(usuario); est = { usuario, ultimaLectura: null }; }

  // 1) lo nuevo de la cuenta (en orden de llegada al servidor)
  // se repasan también los últimos minutos: la hora de llegada es la del inicio de cada transacción del servidor, y una subida de otro
  // dispositivo que empezó antes pero terminó después de nuestra última lectura se perdería. Releer filas iguales no cambia nada.
  const desde = est.ultimaLectura && !isNaN(instante(est.ultimaLectura)) ? new Date(instante(est.ultimaLectura) - SOLAPE_MS).toISOString() : null;
  const remotas = await remoto.leer(desde);
  const cambiadas = new Set(await almacen.aplicarRemotas(remotas));
  let ultimaLectura = est.ultimaLectura;
  for (const f of remotas) if (f.servidor && (!ultimaLectura || despues(f.servidor, ultimaLectura))) ultimaLectura = f.servidor;

  // 2) lo pendiente de aquí, por lotes; el servidor devuelve lo que ha quedado (si alguien guardó algo más nuevo, eso se aplica aquí)
  const pend = await almacen.pendientes();
  const filas = await almacen.filasParaSubir(pend);
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const guardadas = await remoto.subir(lote.map((f) => ({ usuario, ...f })));
    const enviada = new Map(lote.map((f) => [f.carta, f.actualizado]));
    const masNuevas = (guardadas || []).filter((g) => enviada.has(g.carta) && instante(g.actualizado) > instante(enviada.get(g.carta)));
    await almacen.confirmarSubidas(lote.filter((f) => !masNuevas.some((g) => g.carta === f.carta)));
    if (masNuevas.length) {
      await almacen.confirmarSubidas(masNuevas.map((g) => ({ carta: g.carta, actualizado: enviada.get(g.carta) })));
      for (const id of await almacen.aplicarRemotas(masNuevas)) cambiadas.add(id);
    }
  }
  await almacen.guardarEstadoSincronizacion({ usuario, ultimaLectura, ultima: new Date().toISOString() });
  return { estado: "ok", cambiadas: [...cambiadas], subidas: filas.length, primera };
}

// ------------------------------------------------------------------ conector real con Supabase
const CLAVE_SESION = /^sb-[a-z0-9]+-auth-token$/;
/** ¿Hay una sesión de Supabase guardada en este navegador? (sin cargar la librería: si no hay cuenta, la web no descarga nada más) */
export function haySesionGuardada(almacenamiento = globalThis.localStorage) {
  try { for (let i = 0; i < almacenamiento.length; i++) if (CLAVE_SESION.test(almacenamiento.key(i))) return true; } catch { /* sin localStorage */ }
  return false;
}

/** Interfaz `remoto` sobre el cliente de Supabase (tabla public.copias, protegida con RLS: cada cuenta solo ve y cambia lo suyo). */
export function conectarSupabase(supabase) {
  const columnas = "carta,cantidad,variantes,mostrar,actualizado,servidor";
  return {
    async usuario() { const { data } = await supabase.auth.getSession(); return data?.session?.user?.id ?? null; },
    async leer(desde) {
      const res = [];
      for (let desdeFila = 0; ; desdeFila += 1000) {
        let q = supabase.from("copias").select(columnas).order("servidor", { ascending: true }).order("carta", { ascending: true });
        if (desde) q = q.gt("servidor", desde);
        const { data, error } = await q.range(desdeFila, desdeFila + 999);
        if (error) throw new Error("No se pudo leer la colección de la cuenta: " + error.message);
        res.push(...data);
        if (data.length < 1000) return res;
      }
    },
    async subir(filas) {
      const { data, error } = await supabase.from("copias").upsert(filas, { onConflict: "usuario,carta" }).select(columnas);
      if (error) throw new Error("No se pudo guardar en la cuenta: " + error.message);
      return data;
    },
  };
}

/**
 * Sincroniza en segundo plano mientras la página está abierta: al empezar, al volver a la pestaña, cada minuto y poco después de
 * cada cambio. Solo si hay sesión guardada. Nunca dos pasadas a la vez. `alCambiar(ids)` se llama cuando llegan cambios de otro dispositivo.
 * Devuelve { ahora(), estado } o null (sin sesión).
 */
export function iniciarSincronizacion(almacen, { alCambiar = () => {}, alEstado = () => {}, conectar = null } = {}) {
  if (!conectar && !haySesionGuardada()) return null;
  let remoto = null, enCurso = null, otraVez = false, espera = null;
  const obtener = async () => remoto || (remoto = conectar ? await conectar() : conectarSupabase((await import("./supabase-config.js")).supabase));
  const pasada = async () => {
    if (enCurso) { otraVez = true; return enCurso; }
    enCurso = (async () => {
      try {
        alEstado({ estado: "sincronizando" });
        const r = await sincronizar(almacen, await obtener());
        alEstado({ ...r, cuando: new Date() });
        if (r.cambiadas.length) alCambiar(r.cambiadas, r);
        return r;
      } catch (e) {
        alEstado({ estado: "error", error: e });
        return null;
      } finally {
        enCurso = null;
        if (otraVez) { otraVez = false; setTimeout(pasada, 0); }
      }
    })();
    return enCurso;
  };
  const anterior = almacen.alCambiar;
  almacen.alCambiar = () => { anterior?.(); clearTimeout(espera); espera = setTimeout(pasada, 1500); };   // varios toques seguidos = una subida
  addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pasada(); });
  addEventListener("online", () => pasada());
  setInterval(() => { if (document.visibilityState === "visible") pasada(); }, 60000);
  pasada();
  return { ahora: pasada };
}
