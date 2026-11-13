// Prototipo 3.2 (giro 3D de hojas y navegación circular): une las piezas (catálogo, IndexedDB de la Fase 2, distribución, escena 3D, ficha, animaciones).
// Regla de oro: primero se guarda en IndexedDB y SOLO si se confirma se anima y se cambia lo que se ve.
import { Almacen, solicitarPersistencia } from "./almacen.js";
import { validarCatalogo } from "./coleccion.js";
import { distribuir, numeroPokedex, esEntrenador } from "./album/distribucion.js";
import { ModeloColeccion } from "./album/modelo.js";
import { crearEscena } from "./album/escena.js";
import { Pagina } from "./album/pagina.js";
import { Ficha } from "./album/ficha.js";
import { ajustes, insertarCarta, extraerCarta, pulsoCantidad, movimientoReducido } from "./album/animaciones.js";
import { ADELANTE, ATRAS, destino, leerPagina, urlConPagina } from "./album/navegacion.js";
import { girar } from "./album/giro.js";
import { instalarGestos } from "./album/gestos.js";
import { esperarImagenes } from "./album/precarga.js";

const $ = (id) => document.getElementById(id);
const URL_CATALOGO = "../datos/catalogo/coleccion-teselia.json";
const PREFERENCIA_MOVIMIENTO = "album-reducir-movimiento";

let modelo, escena, pagina, ficha, distribucion, paginaActual = 1, filtro = "todas";
let navegando = false; // true mientras una hoja está girando: no se acepta otra orden de navegación
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
function aplicarFiltro(p = pagina) {
  for (const b of p.bolsillos) b.elemento.classList.toggle("atenuado", Boolean(b.carta) && !coincideFiltro(b.carta));
}

/** Vuelve a pintar la página desde lo guardado (sin animar) y reaplica el resaltado. */
function refrescarPagina(p = pagina) {
  p.sincronizar(modelo);
  aplicarFiltro(p);
}

/** Monta la página n (solo su DOM: 9 bolsillos) dentro de un contenedor de hoja. */
function montarPagina(n, contenedor) {
  const p = new Pagina(contenedor, distribucion.paginas[n - 1]);
  refrescarPagina(p);
  return p;
}

/** Indicador de página y URL (replaceState: no añade entradas al historial y conserva los demás parámetros). */
function fijarIndicador(n) {
  const total = distribucion.paginas.length;
  const cartas = distribucion.paginas[n - 1].bolsillos.filter(Boolean);
  $("pagina-numero").textContent = `Página ${n} de ${total}`;
  $("pagina-rango").textContent = cartas.length === 1 ? etiquetaCarta(cartas[0]) : `${etiquetaCarta(cartas[0])} – ${etiquetaCarta(cartas.at(-1))}`;
  try { history.replaceState(history.state, "", urlConPagina(location.href, n)); } catch { /* sin History API: no pasa nada */ }
}

/** Cambio inmediato (carga inicial y movimiento reducido): sin giro. */
function mostrarPagina(n) {
  paginaActual = n;
  pagina = montarPagina(n, escena.bolsillos);
  fijarIndicador(n);
}

const puedeNavegar = () => !bloqueado && !navegando && !ficha.abierta;

/**
 * ÚNICO punto de navegación: botones, teclado y gestos llaman aquí con "adelante" o "atras".
 * Calcula el destino circular, monta SOLO esa página en la hoja de reposo y hace girar la hoja.
 */
async function navegar(sentido) {
  if (!puedeNavegar()) return; // durante un giro (o un guardado o con la ficha abierta) la orden se descarta, no se acumula
  const n = destino(paginaActual, sentido, distribucion.paginas.length);
  navegando = true;
  try {
    if (movimientoReducido()) {
      mostrarPagina(n);
      return;
    }
    const siguiente = montarPagina(n, escena.reposo.bolsillos);
    await esperarImagenes(escena.reposo.hoja, 350); // que la hoja que aparece no muestre imágenes a medias
    fijarIndicador(n);
    await girar(escena, sentido);
    pagina = siguiente;
    paginaActual = n;
  } catch (error) {
    avisar(`Error al girar la hoja: ${error?.message ?? error}`);
    mostrarPagina(n);
  } finally {
    navegando = false;
  }
}

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
  if (bloqueado || navegando || ficha.abierta) return;
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
    // ?bd=prueba-xxx permite que las pruebas automáticas usen una base temporal y no toquen tu colección real.
    const bd = new URLSearchParams(location.search).get("bd");
    almacen = await Almacen.abrir(bd && bd.startsWith("prueba-") ? bd : undefined);
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
  // Delegación sobre toda la escena: hay dos hojas que se alternan, así que no se puede escuchar en una sola.
  $("escena").addEventListener("click", (e) => {
    const b = e.target.closest(".hoja.activa .bolsillo[data-id]");
    if (b) abrirFicha(b);
  });
  $("escena").addEventListener("keydown", (e) => {
    const b = e.target.closest(".hoja.activa .bolsillo[data-id]");
    if (b && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrirFicha(b); }
  });

  $("anterior").addEventListener("click", () => navegar(ATRAS));
  $("siguiente").addEventListener("click", () => navegar(ADELANTE));
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    if (e.key === "ArrowLeft") navegar(ATRAS);
    else if (e.key === "ArrowRight") navegar(ADELANTE);
  });
  instalarGestos($("escena"), { alGesto: navegar });
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

  mostrarPagina(leerPagina(location.search, distribucion.paginas.length));
  pintarProgreso();
  solicitarPersistencia();
}

iniciar();
