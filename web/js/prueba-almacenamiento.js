// Página de prueba de la Fase 2: demuestra que el almacenamiento funciona. La interfaz real llega en la Fase 3.
import { Almacen, solicitarPersistencia } from "./almacen.js";
import { validarCatalogo, progreso, huerfanas, estaConseguida } from "./coleccion.js";
import { crearCopia, nombreArchivoCopia, prepararImportacion, textoConfirmacion } from "./copias.js";
import { crearImagenCarta } from "./imagen.js";

const $ = (id) => document.getElementById(id);
const usarFixture = new URLSearchParams(location.search).get("catalogo") === "pruebas";
const URL_CATALOGO = usarFixture ? "pruebas/catalogo-prueba.json" : "../datos/catalogo/coleccion-teselia.json";

let almacen, catalogo, cartas, cantidades;

function mensaje(texto) {
  $("mensaje").textContent = texto;
  $("mensaje").hidden = !texto;
}

async function cargarCatalogo() {
  // cache: "no-cache" = pregunta al servidor si cambió; así una actualización del catálogo se ve enseguida.
  const respuesta = await fetch(URL_CATALOGO, { cache: "no-cache" });
  if (!respuesta.ok) {
    throw new Error(`No se pudo cargar ${URL_CATALOGO} (HTTP ${respuesta.status}). ¿Has hecho commit de datos/catalogo/coleccion-teselia.json?`);
  }
  catalogo = await respuesta.json();
  const v = validarCatalogo(catalogo);
  if (!v.ok) throw new Error("Catálogo no válido: " + v.errores.join("; "));
  cartas = v.cartas;
}

function pintarProgreso() {
  const p = progreso(cartas, cantidades);
  const orf = huerfanas(cartas, cantidades);
  const cat = Object.entries(p.porCategoria).map(([k, v]) => `${k}: ${v.conseguidas}/${v.total}`).join(" · ");
  $("progreso").innerHTML = `<strong>${p.conseguidas} de ${p.total}</strong> conseguidas (${p.porcentaje} %) · ${p.pendientes} pendientes<br><small>${cat}` +
    (orf.length ? ` · ${orf.length} cantidades guardadas de cartas que ya no están en el catálogo (se conservan)` : "") + "</small>";
}

function pintarLista() {
  const lista = $("lista");
  lista.replaceChildren();
  for (const carta of cartas) {
    const fila = document.createElement("div");
    fila.className = "fila";
    fila.dataset.id = carta.id;

    const imagen = crearImagenCarta(carta);
    const info = document.createElement("div");
    info.innerHTML = `<strong></strong><br><small></small>`;
    info.querySelector("strong").textContent = carta.nombre;
    info.querySelector("small").textContent = `${carta.id} · ${carta.rareza ?? ""}`;

    const ctl = document.createElement("div");
    ctl.className = "ctl";
    const menos = document.createElement("button");
    menos.textContent = "−";
    menos.setAttribute("aria-label", `Quitar una copia de ${carta.nombre}`);
    const cant = document.createElement("span");
    cant.className = "cant";
    const mas = document.createElement("button");
    mas.textContent = "+";
    mas.setAttribute("aria-label", `Añadir una copia de ${carta.nombre}`);
    const estado = document.createElement("span");

    const refrescar = () => {
      const n = cantidades.get(carta.id) ?? 0;
      cant.textContent = n;
      menos.disabled = n === 0;
      estado.textContent = estaConseguida(n) ? "✓" : "pendiente";
      estado.className = estaConseguida(n) ? "ok" : "pend";
    };
    const cambiar = async (delta) => {
      const nueva = await almacen.sumar(carta.id, delta); // se guarda ANTES de actualizar la pantalla
      if (nueva === 0) cantidades.delete(carta.id); else cantidades.set(carta.id, nueva);
      refrescar();
      pintarProgreso();
    };
    menos.addEventListener("click", () => cambiar(-1));
    mas.addEventListener("click", () => cambiar(+1));
    refrescar();

    ctl.append(menos, cant, mas, estado);
    fila.append(imagen, info, ctl);
    lista.append(fila);
  }
}

async function recargarTodo() {
  cantidades = await almacen.leerTodas();
  pintarLista();
  pintarProgreso();
}

function exportar() {
  const copia = crearCopia(cantidades, { generado: catalogo.generado, cartas: cartas.length });
  const blob = new Blob([JSON.stringify(copia, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivoCopia();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  mensaje(`Copia exportada con ${Object.keys(copia.copias).length} cartas.`);
}

async function importarArchivo(archivo) {
  const texto = await archivo.text();
  const plan = prepararImportacion(texto, cantidades, new Set(cartas.map((c) => c.id)));
  if (!plan.ok) {
    mensaje("NO se ha importado nada. Problemas:\n- " + plan.errores.join("\n- "));
    return;
  }
  $("dialogo-texto").textContent = textoConfirmacion(plan) + (plan.avisos.length ? "\n\nAvisos:\n- " + plan.avisos.join("\n- ") : "");
  const dialogo = $("dialogo");
  dialogo.returnValue = "cancelar";
  dialogo.showModal();
  dialogo.addEventListener("close", async () => {
    if (dialogo.returnValue === "cancelar") {
      mensaje("Importación cancelada: tu colección no ha cambiado.");
      return;
    }
    await almacen.importar(plan.copias, dialogo.returnValue);
    await recargarTodo();
    mensaje(`Importación aplicada (${dialogo.returnValue}).`);
  }, { once: true });
}

async function iniciar() {
  try {
    await cargarCatalogo();
    almacen = await Almacen.abrir();
  } catch (e) {
    $("progreso").textContent = "Error: " + e.message;
    return;
  }
  const persistente = await solicitarPersistencia();
  await recargarTodo();
  $("exportar").addEventListener("click", exportar);
  $("importar").addEventListener("click", () => $("archivo").click());
  $("archivo").addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) importarArchivo(f);
  });
  $("deshacer").addEventListener("click", async () => {
    if (!confirm("¿Volver a la colección que tenías antes de la última importación?")) return;
    mensaje((await almacen.deshacerImportacion()) ? "Importación deshecha." : "No hay ninguna importación que deshacer.");
    await recargarTodo();
  });
  if (!persistente) {
    mensaje("Aviso: el navegador no garantiza conservar los datos para siempre. Haz copias de seguridad con frecuencia.");
  }
}

iniciar();
