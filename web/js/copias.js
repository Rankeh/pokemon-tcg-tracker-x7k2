// Copias de seguridad en JSON: crear, validar y preparar la importación (sin tocar nada hasta confirmar).
import { esCantidadValida, MAX_COPIAS } from "./coleccion.js";
import { normalizar } from "./variantes.js";

export const FORMATO = "coleccion-teselia-copia";
export const VERSION_COPIA = 2;   // 3.16: v2 añade la sección opcional "variantes" (desglose normal/reverse/holo y variante visible); se siguen leyendo las v1

/** Crea el contenido de la copia. Solo se guardan las cartas con 1 o más copias.
 *  3.16: `registros` (opcional, Map id -> { variantes, mostrar }) añade el desglose por variantes de las cartas que lo tengan. */
export function crearCopia(mapa, infoCatalogo = {}, registros = null) {
  const copias = {}, variantes = {};
  for (const id of [...mapa.keys()].sort()) {
    if (mapa.get(id) > 0) copias[id] = mapa.get(id);
    const r = registros && registros.get(id);
    if (copias[id] && r && Object.keys(r.variantes || {}).length) variantes[id] = { variantes: { ...r.variantes }, ...(r.mostrar ? { mostrar: r.mostrar } : {}) };
  }
  return {
    ...(Object.keys(variantes).length ? { variantes } : {}),
    formato: FORMATO,
    version: VERSION_COPIA,
    creado: new Date().toISOString(),
    catalogo: { generado: infoCatalogo.generado ?? null, cartas: infoCatalogo.cartas ?? null },
    copias,
  };
}

export function nombreArchivoCopia(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `copia-teselia-${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}-${p(fecha.getHours())}${p(fecha.getMinutes())}.json`;
}

const esObjetoPlano = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

/**
 * Valida una copia ya convertida de JSON. No modifica nada.
 * Devuelve { ok, errores, avisos, copias: Map, desconocidas: [ids que no están en el catálogo] }.
 */
export function validarCopia(obj, idsCatalogo = null) {
  const errores = [];
  const avisos = [];
  const copias = new Map();
  const desconocidas = [];

  if (!esObjetoPlano(obj)) {
    return { ok: false, errores: ["El archivo no contiene un objeto JSON"], avisos, copias, desconocidas };
  }
  if (obj.formato !== FORMATO) {
    errores.push(`No es una copia de esta aplicación (formato "${obj.formato ?? "ausente"}")`);
  }
  if (!Number.isInteger(obj.version) || obj.version < 1) {
    errores.push("La versión de la copia no es válida");
  } else if (obj.version > VERSION_COPIA) {
    errores.push(`La copia es de una versión más nueva (${obj.version}); esta aplicación solo entiende hasta la ${VERSION_COPIA}`);
  }
  if (!esObjetoPlano(obj.copias)) {
    errores.push("Falta la sección 'copias' o no tiene el formato esperado");
  } else {
    const malas = [];
    for (const [id, cantidad] of Object.entries(obj.copias)) {
      if (id === "") {
        malas.push("(id vacío)");
      } else if (!esCantidadValida(cantidad)) {
        malas.push(`${id}=${JSON.stringify(cantidad)}`);
      } else if (cantidad > 0) {
        copias.set(id, cantidad);
        if (idsCatalogo && !idsCatalogo.has(id)) desconocidas.push(id);
      }
    }
    if (malas.length > 0) {
      errores.push(`${malas.length} cantidades no válidas (deben ser enteros de 0 a ${MAX_COPIAS}), por ejemplo: ${malas.slice(0, 5).join(", ")}`);
    }
  }
  if (obj.creado !== undefined && Number.isNaN(Date.parse(obj.creado))) {
    avisos.push("La fecha de creación de la copia no es válida (se ignora)");
  }
  if (desconocidas.length > 0) {
    avisos.push(`${desconocidas.length} cartas de la copia no están en el catálogo actual; se conservan por si vuelven: ${desconocidas.slice(0, 5).join(", ")}`);
  }
  // 3.16 · desglose por variantes (v2, opcional): solo de cartas que están en la copia; lo que no cuadre se descarta con aviso
  const extras = new Map();
  if (errores.length === 0 && obj.variantes !== undefined) {
    if (!esObjetoPlano(obj.variantes)) avisos.push("La sección 'variantes' no tiene el formato esperado (se ignora)");
    else for (const [id, e] of Object.entries(obj.variantes)) {
      const r = normalizar({ cantidad: copias.get(id) ?? 0, ...(esObjetoPlano(e) ? e : {}) });
      if (copias.has(id) && r.cantidad === copias.get(id) && Object.keys(r.variantes).length) extras.set(id, { variantes: r.variantes, mostrar: r.mostrar });
      else avisos.push(`Variantes de ${id} ignoradas (no cuadran con sus copias)`);
    }
  }
  return { ok: errores.length === 0, errores, avisos, copias: errores.length === 0 ? copias : new Map(), desconocidas, extras };
}

/** Lee el texto del archivo, lo valida y calcula qué cambiaría. No guarda nada. */
export function prepararImportacion(texto, actual, idsCatalogo = null) {
  let obj;
  try {
    obj = JSON.parse(texto);
  } catch {
    return { ok: false, errores: ["El archivo no es JSON válido"], avisos: [], copias: new Map(), desconocidas: [], resumen: null };
  }
  const v = validarCopia(obj, idsCatalogo);
  if (!v.ok) return { ...v, resumen: null };

  const resumen = { nuevas: 0, aumentan: 0, disminuyen: 0, iguales: 0, soloEnActual: 0 };
  for (const [id, c] of v.copias) {
    const a = actual.get(id) ?? 0;
    if (a === 0) resumen.nuevas++;
    else if (c > a) resumen.aumentan++;
    else if (c < a) resumen.disminuyen++;
    else resumen.iguales++;
  }
  for (const id of actual.keys()) {
    if (!v.copias.has(id)) resumen.soloEnActual++;
  }
  return { ...v, resumen, creado: obj.creado ?? null };
}

/** Texto para el cuadro de confirmación (sirve igual en la prueba y en la interfaz definitiva). */
export function textoConfirmacion(plan) {
  const r = plan.resumen;
  return [
    `Copia con ${plan.copias.size} cartas.`,
    `Cartas nuevas: ${r.nuevas}. Con más copias: ${r.aumentan}. Con menos copias: ${r.disminuyen}. Iguales: ${r.iguales}.`,
    `Cartas que tienes ahora y NO están en la copia: ${r.soloEnActual}.`,
  ].join("\n");
}
