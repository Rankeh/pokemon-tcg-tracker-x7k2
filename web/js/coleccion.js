// Lógica pura de la colección (sin IndexedDB ni DOM): fácil de probar y de entender.

/** Tope razonable por carta: evita que un fallo al teclear o un archivo corrupto guarde 99999999. */
export const MAX_COPIAS = 999;

/** Una cantidad válida es un entero entre 0 y MAX_COPIAS. */
export function esCantidadValida(n) {
  return Number.isInteger(n) && n >= 0 && n <= MAX_COPIAS;
}

/** Suma (o resta) copias sin salirse nunca de 0..MAX_COPIAS. */
export function sumarCopias(actual, delta) {
  if (!Number.isInteger(delta)) {
    throw new TypeError("El cambio de copias debe ser un entero");
  }
  const base = esCantidadValida(actual) ? actual : 0;
  return Math.min(MAX_COPIAS, Math.max(0, base + delta));
}

/** Conseguida = al menos una copia (tener 3 sigue contando como 1 objetivo). */
export function estaConseguida(cantidad) {
  return Number.isInteger(cantidad) && cantidad >= 1;
}

/** Comprueba la forma del catálogo de referencia (coleccion-teselia.json). */
export function validarCatalogo(obj) {
  const errores = [];
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.cartas)) {
    return { ok: false, errores: ["El catálogo no tiene la lista 'cartas'"], cartas: [] };
  }
  const vistos = new Set();
  obj.cartas.forEach((c, i) => {
    if (!c || typeof c.id !== "string" || c.id === "") {
      errores.push(`La carta nº ${i + 1} no tiene 'id'`);
    } else if (vistos.has(c.id)) {
      errores.push(`Id repetido en el catálogo: ${c.id}`);
    } else {
      vistos.add(c.id);
    }
  });
  return { ok: errores.length === 0, errores, cartas: errores.length === 0 ? obj.cartas : [] };
}

/**
 * Progreso calculado SOLO sobre las cartas del catálogo.
 * `mapa` es un Map id -> cantidad. Las cantidades de ids que ya no están en el catálogo no cuentan.
 */
export function progreso(cartas, mapa) {
  const sumar = (grupo, clave, conseguida) => {
    grupo[clave] ??= { total: 0, conseguidas: 0 };
    grupo[clave].total++;
    if (conseguida) grupo[clave].conseguidas++;
  };
  const porCategoria = {};
  const porExpansion = {};
  let conseguidas = 0;
  for (const c of cartas) {
    const ok = estaConseguida(mapa.get(c.id));
    if (ok) conseguidas++;
    sumar(porCategoria, c.categoriaColeccion ?? "?", ok);
    sumar(porExpansion, c.expansion ?? "?", ok);
  }
  const total = cartas.length;
  return {
    total,
    conseguidas,
    pendientes: total - conseguidas,
    porcentaje: total === 0 ? 0 : Math.round((conseguidas / total) * 1000) / 10,
    porCategoria,
    porExpansion,
  };
}

/** Ids con cantidad guardada que ya no están en el catálogo (se conservan, no se borran). */
export function huerfanas(cartas, mapa) {
  const ids = new Set(cartas.map((c) => c.id));
  return [...mapa.keys()].filter((id) => !ids.has(id));
}
