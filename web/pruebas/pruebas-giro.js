// Pruebas de la Fase 3.2 (giro de hojas y navegación circular) EN EL NAVEGADOR.
// Abren el prototipo real en un iframe, lo manejan como lo haría una persona (clics, teclas, gestos) y comprueban el resultado.
// Usan una base temporal "prueba-…" (?bd=): tu colección real no se toca.
import { distribuir } from "../js/album/distribucion.js";
import { Almacen } from "../js/almacen.js";

const pruebas = [];
const prueba = (nombre, fn) => pruebas.push({ nombre, fn });
const igual = (real, esperado, msg = "") => {
  if (JSON.stringify(real) !== JSON.stringify(esperado)) throw new Error(`${msg} esperado ${JSON.stringify(esperado)} y salió ${JSON.stringify(real)}`);
};
const cierto = (c, m) => { if (!c) throw new Error(m); };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperarHasta(cond, ms = 8000, que = "condición") {
  const t = performance.now();
  while (!cond()) {
    if (performance.now() - t > ms) throw new Error(`tiempo agotado esperando ${que}`);
    await esperar(15);
  }
}

const URL_ALBUM = new URL("../album-prototipo.html", import.meta.url);
const URL_CATALOGO = new URL("../../datos/catalogo/coleccion-teselia.json", import.meta.url);
const catalogo = (await (await fetch(URL_CATALOGO)).json()).cartas;
const distribucion = distribuir(catalogo);
const idsEsperados = (n) => distribucion.paginas[n - 1].bolsillos.filter(Boolean).map((c) => c.id);

/** Abre el álbum en un iframe (con base temporal). */
async function abrir({ pagina = 1, reducir = false } = {}) {
  const bd = `prueba-giro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let previo = null;
  try { previo = localStorage.getItem("album-reducir-movimiento"); localStorage.setItem("album-reducir-movimiento", reducir ? "1" : "0"); } catch { /* sin localStorage */ }
  const marco = document.createElement("iframe");
  marco.style.cssText = "position:fixed;right:8px;bottom:8px;width:1100px;height:760px;transform:scale(.33);transform-origin:bottom right;border:1px solid #888;background:#000";
  marco.src = `${URL_ALBUM.href}?pagina=${pagina}&bd=${bd}`;
  document.body.append(marco);
  await new Promise((r) => marco.addEventListener("load", r, { once: true }));
  const win = marco.contentWindow, doc = marco.contentDocument;
  await esperarHasta(() => doc.querySelector(".bolsillo[data-id]"), 8000, "el álbum");
  await esperar(250);
  const a = {
    marco, win, doc, bd,
    mesa: () => doc.querySelector(".mesa"),
    pagina: () => parseInt(/Página (\d+) de/.exec(doc.getElementById("pagina-numero").textContent)?.[1], 10),
    ids: () => [...doc.querySelectorAll(".hoja.activa .bolsillo[data-id]")].map((b) => b.dataset.id),
    girando: () => Boolean(doc.querySelector(".mesa")?.dataset.giro),
    giros: () => doc.getAnimations().filter((x) => (x.effect?.getKeyframes?.() ?? []).some((k) => /rotateY/.test(k.transform ?? ""))),
    async pulsar(id) { doc.getElementById(id).click(); },
    async finGiro() { await esperarHasta(() => !a.girando(), 8000, "el fin del giro"); },
    /** Pulsa y espera a que acabe, devolviendo el sentido del giro y lo que tardó. */
    async ir(id) {
      const t0 = performance.now(); const antes = a.pagina();
      doc.getElementById(id).click();
      await esperarHasta(() => a.pagina() !== antes, 4000, "el cambio de página");
      const sentido = a.mesa().dataset.giro ?? null;
      await a.finGiro();
      return { sentido, ms: performance.now() - t0 };
    },
    tecla(key) { doc.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true })); },
    async cerrar() {
      marco.remove();
      try { if (previo === null) localStorage.removeItem("album-reducir-movimiento"); else localStorage.setItem("album-reducir-movimiento", previo); } catch { /* nada */ }
      await new Promise((r) => { const q = indexedDB.deleteDatabase(bd); q.onsuccess = q.onerror = q.onblocked = () => r(); });
    },
  };
  return a;
}
async function con(opciones, fn) {
  const a = await abrir(opciones);
  try { return await fn(a); } finally { await a.cerrar(); }
}

// ---------------- Animaciones ----------------
prueba("Anim 7: al avanzar el giro va hacia delante (rotateY 0° → -180°)", () => con({ pagina: 4 }, async (a) => {
  a.doc.getElementById("siguiente").click();
  await esperarHasta(() => a.girando(), 2000, "el inicio del giro");
  igual(a.mesa().dataset.giro, "adelante");
  const g = a.giros(); cierto(g.length >= 1, "no hay animación rotateY");
  const k = g[0].effect.getKeyframes();
  cierto(/rotateY\(0deg\)/.test(k[0].transform) && /rotateY\(-180deg\)/.test(k.at(-1).transform), `keyframes inesperados: ${k[0].transform} → ${k.at(-1).transform}`);
  await a.finGiro(); igual(a.pagina(), 5);
}));
prueba("Anim 8: al retroceder el giro va hacia atrás (rotateY -180° → 0°)", () => con({ pagina: 4 }, async (a) => {
  a.doc.getElementById("anterior").click();
  await esperarHasta(() => a.girando(), 2000, "el inicio del giro");
  igual(a.mesa().dataset.giro, "atras");
  const k = a.giros()[0].effect.getKeyframes();
  cierto(/rotateY\(-180deg\)/.test(k[0].transform) && /rotateY\(0deg\)/.test(k.at(-1).transform), `keyframes inesperados: ${k[0].transform} → ${k.at(-1).transform}`);
  await a.finGiro(); igual(a.pagina(), 3);
}));
prueba("Anim 9: 18 → 1 gira hacia delante, 1 → 18 hacia atrás, y duran lo mismo que un giro normal", () => con({ pagina: 18 }, async (a) => {
  const r1 = await a.ir("siguiente"); igual([r1.sentido, a.pagina()], ["adelante", 1]);
  const r2 = await a.ir("siguiente"); igual([r2.sentido, a.pagina()], ["adelante", 2]);
  const r3 = await a.ir("anterior"); igual([r3.sentido, a.pagina()], ["atras", 1]);
  const r4 = await a.ir("anterior"); igual([r4.sentido, a.pagina()], ["atras", 18]);
  igual(a.mesa().dataset.ultimoGiro, "atras");
  const ms = [r1, r2, r3, r4].map((r) => r.ms);
  cierto(Math.max(...ms) - Math.min(...ms) < 250, `duraciones muy distintas: ${ms.map(Math.round)}`);
  cierto(ms.every((m) => m >= 500 && m <= 1500), `duración fuera de rango: ${ms.map(Math.round)}`);
}));
prueba("Anim 10: no se permiten animaciones simultáneas ni se acumulan pulsaciones", () => con({ pagina: 4 }, async (a) => {
  a.doc.getElementById("siguiente").click();
  a.doc.getElementById("siguiente").click();
  a.doc.getElementById("anterior").click();
  a.tecla("ArrowRight");
  await esperarHasta(() => a.girando(), 2000, "el inicio del giro");
  a.doc.getElementById("siguiente").click(); a.tecla("ArrowLeft");
  igual(new Set(a.giros().map((g) => g.effect.target)).size, 1, "más de una hoja girando");
  await a.finGiro(); await esperar(300);
  igual(a.pagina(), 5, "solo debía contar la primera orden");
  // y después se puede seguir navegando
  await a.ir("siguiente"); igual(a.pagina(), 6);
}));
prueba("Anim 11 y 16: al terminar la página visible, el indicador y la URL coinciden", () => con({ pagina: 18 }, async (a) => {
  for (const [id, esperada] of [["siguiente", 1], ["siguiente", 2], ["anterior", 1], ["anterior", 18], ["anterior", 17]]) {
    await a.ir(id);
    igual(a.pagina(), esperada, "indicador");
    igual(a.ids(), idsEsperados(esperada), `cartas visibles en la página ${esperada}`);
    const p = new URLSearchParams(a.win.location.search);
    igual(p.get("pagina"), String(esperada), "URL");
    igual(p.get("bd"), a.bd, "se conservan los demás parámetros");
  }
}));
prueba("Anim 12: tras el giro no quedan elementos ni animaciones temporales", () => con({ pagina: 18 }, async (a) => {
  const nodosAntes = a.doc.querySelectorAll("*").length;
  await a.ir("siguiente"); await a.ir("anterior"); await esperar(100);
  igual(a.doc.getAnimations().length, 0, "animaciones vivas");
  igual(a.doc.querySelectorAll(".hoja.activa").length, 1);
  igual(a.doc.querySelectorAll(".hoja.reposo .bolsillo").length, 0, "la hoja de reposo debe estar vacía");
  igual(a.doc.querySelectorAll(".bolsillo").length, 9, "solo 9 bolsillos montados (no las 18 páginas)");
  igual(a.doc.querySelectorAll(".vuelo, .vuelo-sombra").length, 0);
  igual([...a.doc.querySelectorAll(".hoja")].map((h) => h.style.visibility), ["", ""], "estilos inline sobrantes");
  igual(a.mesa().dataset.giro, undefined);
  igual(a.doc.querySelectorAll("*").length, nodosAntes, "cambió el número de nodos del DOM");
}));
prueba("Anim: con la ficha abierta no se puede navegar", () => con({ pagina: 4, reducir: true }, async (a) => {
  a.doc.querySelector(".hoja.activa .bolsillo[data-id]").click();
  await esperarHasta(() => !a.doc.getElementById("ficha").hidden, 2000, "la ficha");
  a.tecla("ArrowRight"); a.doc.getElementById("siguiente").click();
  igual(a.pagina(), 4);
}));

// ---------------- Persistencia ----------------
async function anadirPrimera(a) {
  const bolsillo = a.doc.querySelector(".hoja.activa .bolsillo[data-id]");
  const id = bolsillo.dataset.id;
  bolsillo.click();
  await esperarHasta(() => !a.doc.getElementById("ficha").hidden, 2000, "la ficha");
  a.doc.querySelector('#ficha [data-accion="anadir"]').click();
  await esperarHasta(() => a.doc.querySelector(`.hoja.activa .bolsillo[data-id="${id}"]`)?.dataset.estado === "conseguida" && !a.doc.querySelector(".vuelo"), 9000, "la inserción");
  await esperar(500); // deja que termine el bloqueo posterior a la animación
  return id;
}
prueba("Pers 13, 14: una carta añadida en la 4 sigue en su sitio tras dar la vuelta completa; navegar no escribe en IndexedDB", () => con({ pagina: 4, reducir: true }, async (a) => {
  const id = await anadirPrimera(a);
  let escrituras = 0;
  for (const metodo of ["put", "add", "delete", "clear"]) {
    const original = a.win.IDBObjectStore.prototype[metodo];
    a.win.IDBObjectStore.prototype[metodo] = function (...args) { escrituras++; return original.apply(this, args); };
  }
  // 4 → 18 → 1 → 4, comprobando cada página
  const secuencia = [...Array(14).fill("siguiente"), "siguiente", "siguiente", "siguiente", "siguiente"]; // 4..18, 1, 2, 3, 4
  for (const boton of secuencia) {
    a.doc.getElementById(boton).click();
    igual(a.ids(), idsEsperados(a.pagina()), `cartas de la página ${a.pagina()}`);
  }
  igual(a.pagina(), 4);
  igual(a.doc.querySelector(`.hoja.activa .bolsillo[data-id="${id}"]`)?.dataset.estado, "conseguida", "la carta debe seguir conseguida");
  igual(a.doc.querySelectorAll('.hoja.activa .bolsillo[data-estado="conseguida"]').length, 1);
  igual(escrituras, 0, "navegar no debe escribir en IndexedDB");
  const almacen = await Almacen.abrir(a.bd);
  try { igual(await almacen.cantidad(id), 1, "cantidad guardada"); igual((await almacen.leerTodas()).size, 1, "filas guardadas"); } finally { almacen.cerrar(); }
}));
prueba("Pers 15: tras girar, la inserción y la extracción animadas siguen funcionando", () => con({ pagina: 4 }, async (a) => {
  await a.ir("siguiente"); await a.ir("anterior"); igual(a.pagina(), 4);
  const id = await anadirPrimera(a);
  // Mientras acaba el bloqueo posterior a la animación el clic se ignora (es lo correcto): se reintenta hasta que abra.
  const limite = performance.now() + 6000;
  while (a.doc.getElementById("ficha").hidden && performance.now() < limite) {
    a.doc.querySelector(`.hoja.activa .bolsillo[data-id="${id}"]`).click();
    await esperar(150);
  }
  cierto(!a.doc.getElementById("ficha").hidden, "la ficha no se abrió tras la inserción");
  a.doc.querySelector('#ficha [data-accion="retirar"]').click();
  await esperarHasta(() => a.doc.querySelector(`.hoja.activa .bolsillo[data-id="${id}"]`)?.dataset.estado === "pendiente" && !a.doc.querySelector(".vuelo"), 9000, "la extracción");
  await a.ir("siguiente"); igual(a.pagina(), 5);
}));

// ---------------- URL ----------------
prueba("URL 16: abrir ?pagina=18 muestra la 18; 18 → 1 y 1 → 18 actualizan la URL sin añadir historial", () => con({ pagina: 18 }, async (a) => {
  igual([a.pagina(), a.ids()], [18, idsEsperados(18)]);
  const historial = a.win.history.length;
  await a.ir("siguiente");
  igual(new URLSearchParams(a.win.location.search).get("pagina"), "1");
  await a.ir("anterior");
  igual(new URLSearchParams(a.win.location.search).get("pagina"), "18");
  igual(a.win.history.length, historial, "se han añadido entradas al historial");
}));
prueba("URL: recargar la página conserva la página actual", () => con({ pagina: 4, reducir: true }, async (a) => {
  a.doc.getElementById("anterior").click(); a.doc.getElementById("anterior").click(); a.doc.getElementById("anterior").click(); a.doc.getElementById("anterior").click(); // 4→3→2→1→18
  igual(a.pagina(), 18);
  a.win.location.reload();
  await new Promise((r) => a.marco.addEventListener("load", r, { once: true }));
  await esperarHasta(() => a.marco.contentDocument.querySelector(".bolsillo[data-id]"), 8000, "el álbum recargado");
  igual(parseInt(/Página (\d+)/.exec(a.marco.contentDocument.getElementById("pagina-numero").textContent)[1], 10), 18);
}));

// ---------------- Accesibilidad ----------------
prueba("Acc 17: con movimiento reducido se navega entre todas las páginas, circularmente, sin giro y actualizando la URL", () => con({ pagina: 18, reducir: true }, async (a) => {
  a.doc.getElementById("siguiente").click();
  igual([a.pagina(), a.girando(), a.giros().length], [1, false, 0], "debe ser inmediato");
  igual(new URLSearchParams(a.win.location.search).get("pagina"), "1");
  a.doc.getElementById("anterior").click();
  igual([a.pagina(), a.girando()], [18, false]);
  igual(a.ids(), idsEsperados(18));
  const vistas = new Set();
  for (let i = 0; i < 18; i++) { a.doc.getElementById("siguiente").click(); vistas.add(a.pagina()); }
  igual(vistas.size, 18); igual(a.pagina(), 18);
}));
prueba("Acc 18: las flechas del teclado navegan (con giro) y los botones nunca se desactivan", () => con({ pagina: 1 }, async (a) => {
  igual([a.doc.getElementById("anterior").disabled, a.doc.getElementById("siguiente").disabled], [false, false], "en la página 1");
  a.tecla("ArrowLeft"); await esperarHasta(() => a.pagina() === 18, 3000, "ArrowLeft"); await a.finGiro();
  igual([a.doc.getElementById("anterior").disabled, a.doc.getElementById("siguiente").disabled], [false, false], "en la página 18");
  a.tecla("ArrowRight"); await esperarHasta(() => a.pagina() === 1, 3000, "ArrowRight"); await a.finGiro();
  igual(a.pagina(), 1);
}));
prueba("Acc 19: un deslizamiento táctil cambia de página sin abrir la ficha; un toque abre la ficha; el scroll vertical no navega", () => con({ pagina: 4, reducir: true }, async (a) => {
  const bolsillo = () => a.doc.querySelector(".hoja.activa .bolsillo[data-id]");
  const toque = (tipo, x, y, pointerType = "touch") => bolsillo().dispatchEvent(new a.win.PointerEvent(tipo, { pointerType, isPrimary: true, pointerId: 7, clientX: x, clientY: y, bubbles: true }));
  const r = bolsillo().getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
  // deslizar a la izquierda = avanzar, y el clic que sigue al gesto NO abre la ficha
  toque("pointerdown", x, y); toque("pointerup", x - 150, y + 5);
  bolsillo().click();
  igual([a.pagina(), a.doc.getElementById("ficha").hidden], [5, true], "izquierda");
  // deslizar a la derecha = retroceder
  const r2 = bolsillo().getBoundingClientRect(); const x2 = r2.left + r2.width / 2, y2 = r2.top + r2.height / 2;
  toque("pointerdown", x2, y2); toque("pointerup", x2 + 150, y2);
  igual(a.pagina(), 4, "derecha");
  await esperar(450); // pasa la ventana en que se anula el clic posterior al gesto
  // gesto vertical (scroll): no navega
  const r3 = bolsillo().getBoundingClientRect(); const x3 = r3.left + r3.width / 2, y3 = r3.top + r3.height / 2;
  toque("pointerdown", x3, y3); toque("pointerup", x3 - 20, y3 + 160);
  igual(a.pagina(), 4, "vertical");
  // el ratón no navega con gestos
  toque("pointerdown", x3, y3, "mouse"); toque("pointerup", x3 - 200, y3, "mouse");
  igual(a.pagina(), 4, "ratón");
  // un toque normal sí abre la ficha
  toque("pointerdown", x3, y3); toque("pointerup", x3 + 2, y3 + 1); bolsillo().click();
  await esperarHasta(() => !a.doc.getElementById("ficha").hidden, 2000, "la ficha tras un toque");
}));

export async function ejecutar(log) {
  let ok = 0, fallos = 0;
  for (const p of pruebas) {
    try { await p.fn(); ok++; log("OK", p.nombre); } catch (e) { fallos++; log("FALLO", `${p.nombre} → ${e.message}`); }
  }
  log("RESUMEN", `${ok} correctas, ${fallos} fallos`);
  return fallos === 0;
}
