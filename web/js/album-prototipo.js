// Prototipo 3.1.1 (orden Pokédex): une las piezas (catálogo, IndexedDB de la Fase 2, distribución, escena 3D, ficha, animaciones).
// Regla de oro: primero se guarda en IndexedDB y SOLO si se confirma se anima y se cambia lo que se ve.
import { Almacen, solicitarPersistencia } from "./almacen.js";
import { validarCatalogo } from "./coleccion.js";
import { distribuir, numeroPokedex, esEntrenador } from "./album/distribucion.js";
import { ModeloColeccion } from "./album/modelo.js";
import { crearEscena } from "./album/escena.js";
import { Pagina } from "./album/pagina.js";
import { Ficha } from "./album/ficha.js";
import { ajustes, insertarCarta, extraerCarta, pulsoCantidad } from "./album/animaciones.js";

const $ = (id) => document.getElementById(id);
const URL_CATALOGO = "../datos/catalogo/coleccion-teselia.json";
const PREFERENCIA_MOVIMIENTO = "album-reducir-movimiento";

let modelo, escena, pagina, ficha, distribucion, paginaActual = 1, filtro = "todas";
let bloqueado = false; // true durante un guardado + animación: nadie puede abrir o pulsar nada

function avisar(texto) {
  $("aviso").textContent = texto;
  $("aviso").hidden = !texto;
}

function pintarProgreso() {
  const p = modelo.progreso(); // por cartas DISTINTAS conseguidas, no por copias
  $("progreso").innerHTML = `<strong>${p.conseguidas}</strong> de ${p.total} · ${p.porcentaje} %`;
  $("barra").style.width = `${p.porcentaje}%`;
}

const etiquetaCarta = (c) => (esEntrenador(c) ? c.nombre : `#${numeroPokedex(c)} ${c.nombre}`);

function coincideFiltro(carta) {
  if (!carta) return true;
  if (filtro === "todas") return true;
  if (filtro === "pendientes") return modelo.cantidad(carta.id) === 0;
  return carta.expansion === filtro;
}

/** El filtro solo resalta: nunca cambia qué carta está en cada bolsillo. */
function aplicarFiltro() {
  for (const b of pagina.bolsillos) b.elemento.classList.toggle("atenuado", Boolean(b.carta) && !coincideFiltro(b.carta));
}

/** Vuelve a pintar la página desde lo guardado (sin animar) y reaplica el resaltado. */
function refrescarPagina() {
  pagina.sincronizar(modelo);
  aplicarFiltro();
}

function mostrarPagina(n) {
  const total = distribucion.paginas.length;
  paginaActual = Math.min(total, Math.max(1, n));
  const datos = distribucion.paginas[paginaActual - 1];
  pagina = new Pagina(escena.bolsillos, datos);
  refrescarPagina();
  const cartas = datos.bolsillos.filter(Boolean);
  $("pagina-numero").textContent = `Página ${paginaActual} de ${total}`;
  $("pagina-rango").textContent = cartas.length === 1 ? etiquetaCarta(cartas[0]) : `${etiquetaCarta(cartas[0])} – ${etiquetaCarta(cartas.at(-1))}`;
  $("anterior").disabled = paginaActual === 1;
  $("siguiente").disabled = paginaActual === total;
}

const puedeNavegar = () => !bloqueado && !ficha.abierta;

async function guardar(id, delta) {
  try {
    return await modelo.cambiar(id, delta);
  } catch (error) {
    ficha.mostrarError(`No se pudo guardar el cambio: ${error?.message ?? error}. No se ha modificado nada.`);
    return null;
  }
}

async function alAnadir(carta) {
  bloqueado = true;
  try {
    const bolsillo = pagina.porId.get(carta.id);
    const r = await guardar(carta.id, +1);
    if (!r) return; // fallo de guardado: no se anima ni se muestra como conseguida
    pintarProgreso();
    if (r.antes === 0) {
      await ficha.cerrar({ forzar: true });
      await insertarCarta(bolsillo, escena.bolsillos, r.despues);
    } else {
      ficha.actualizar(r.despues);
      bolsillo.actualizarCantidad(r.despues);
      pulsoCantidad(bolsillo);
    }
  } catch (error) {
    avisar(`Error al mostrar la animación: ${error?.message ?? error}`);
  } finally {
    refrescarPagina(); // lo que se ve vuelve a derivarse siempre de lo guardado
    bloqueado = false;
  }
}

async function alRetirar(carta) {
  bloqueado = true;
  try {
    const bolsillo = pagina.porId.get(carta.id);
    const r = await guardar(carta.id, -1);
    if (!r) return;
    pintarProgreso();
    if (r.antes >= 1 && r.despues === 0) {
      await ficha.cerrar({ forzar: true });
      await extraerCarta(bolsillo, escena.bolsillos);
    } else {
      ficha.actualizar(r.despues);
      bolsillo.actualizarCantidad(r.despues);
    }
  } catch (error) {
    avisar(`Error al mostrar la animación: ${error?.message ?? error}`);
  } finally {
    refrescarPagina();
    bloqueado = false;
  }
}

function abrirFicha(bolsilloElemento) {
  if (bloqueado || ficha.abierta) return;
  const bolsillo = pagina.porId.get(bolsilloElemento.dataset.id);
  if (bolsillo) ficha.abrir(bolsillo.carta, modelo.cantidad(bolsillo.carta.id));
}

function preferenciaMovimiento() {
  try { return localStorage.getItem(PREFERENCIA_MOVIMIENTO) === "1"; } catch { return false; }
}

async function iniciar() {
  let catalogo;
  try {
    const respuesta = await fetch(URL_CATALOGO, { cache: "no-cache" });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const v = validarCatalogo(await respuesta.json());
    if (!v.ok) throw new Error(v.errores.join("; "));
    catalogo = v.cartas;
  } catch (e) {
    $("progreso").textContent = "No se pudo cargar el catálogo";
    avisar(`No se pudo cargar ${URL_CATALOGO} (${e.message}). Abre el proyecto desde la raíz del repositorio con Live Server.`);
    return;
  }

  let almacen;
  try {
    almacen = await Almacen.abrir();
  } catch (e) {
    avisar(`No se pudo abrir el almacenamiento del navegador (${e.message}). Sin él no se puede guardar la colección; revisa si estás en modo privado.`);
    return;
  }
  modelo = new ModeloColeccion(almacen, catalogo);
  await modelo.cargar();
  distribucion = distribuir(catalogo); // determinista: las posiciones no dependen de lo que tengas

  escena = crearEscena($("escena"));
  ficha = new Ficha($("ficha"), {
    alAnadir, alRetirar,
    alCerrar: () => {},
  });
  escena.bolsillos.addEventListener("click", (e) => {
    const b = e.target.closest(".bolsillo[data-id]");
    if (b) abrirFicha(b);
  });
  escena.bolsillos.addEventListener("keydown", (e) => {
    const b = e.target.closest(".bolsillo[data-id]");
    if (b && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrirFicha(b); }
  });

  $("anterior").addEventListener("click", () => { if (puedeNavegar()) mostrarPagina(paginaActual - 1); });
  $("siguiente").addEventListener("click", () => { if (puedeNavegar()) mostrarPagina(paginaActual + 1); });
  document.addEventListener("keydown", (e) => {
    if (!puedeNavegar() || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowLeft") mostrarPagina(paginaActual - 1);
    else if (e.key === "ArrowRight") mostrarPagina(paginaActual + 1);
  });
  document.querySelectorAll("[data-filtro]").forEach((b) =>
    b.addEventListener("click", () => {
      if (!puedeNavegar()) return;
      filtro = b.dataset.filtro;
      document.querySelectorAll("[data-filtro]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      aplicarFiltro();
    }));

  ajustes.reducirMovimiento = preferenciaMovimiento();
  const botonMov = $("movimiento");
  botonMov.setAttribute("aria-pressed", String(ajustes.reducirMovimiento));
  botonMov.addEventListener("click", () => {
    ajustes.reducirMovimiento = !ajustes.reducirMovimiento;
    botonMov.setAttribute("aria-pressed", String(ajustes.reducirMovimiento));
    try { localStorage.setItem(PREFERENCIA_MOVIMIENTO, ajustes.reducirMovimiento ? "1" : "0"); } catch { /* sin almacenamiento: se usa solo en esta sesión */ }
  });

  const inicial = parseInt(new URLSearchParams(location.search).get("pagina"), 10);
  mostrarPagina(Number.isInteger(inicial) ? inicial : 1);
  pintarProgreso();
  solicitarPersistencia();
}

iniciar();
