// Almacenamiento local con IndexedDB. Aquí solo viven TUS datos (cantidades), nunca el catálogo.
import { sumarCopias, esCantidadValida } from "./coleccion.js";
import { normalizar, cambiarVariante, clasificar, fijarMostrar, cambiarTotal, aFila, conTotal } from "./variantes.js";

export const NOMBRE_BD = "coleccion-teselia";
export const VERSION_BD = 1;
const ALMACEN_COPIAS = "copias"; // { id: "svp-208", cantidad: 2, actualizado: "2026-...", variantes?: { normal: 1, reverse: 1 }, mostrar?: "reverse" } (3.16)
const ALMACEN_META = "meta";     // { clave: "antesDeImportar", ... }

/** Convierte una petición de IndexedDB (basada en eventos) en una Promise. */
function promesa(peticion) {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

/** Espera a que la transacción termine DE VERDAD (los datos ya están guardados en disco). */
function terminada(tx) {
  return new Promise((resolver, rechazar) => {
    tx.oncomplete = () => resolver();
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error ?? new Error("Transacción cancelada"));
  });
}

/** Pide al navegador que no borre los datos por falta de espacio (mejor esfuerzo; en iOS no es seguro). */
export async function solicitarPersistencia() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export class Almacen {
  constructor(db) {
    this.db = db;
  }

  /** Abre (o crea) la base de datos. `nombre` permite usar una distinta en las pruebas. */
  static abrir(nombre = NOMBRE_BD) {
    return new Promise((resolver, rechazar) => {
      const peticion = indexedDB.open(nombre, VERSION_BD);
      // Solo se ejecuta al crear la base de datos o al subir VERSION_BD: aquí se definen las "tablas".
      peticion.onupgradeneeded = () => {
        const db = peticion.result;
        if (!db.objectStoreNames.contains(ALMACEN_COPIAS)) {
          db.createObjectStore(ALMACEN_COPIAS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(ALMACEN_META)) {
          db.createObjectStore(ALMACEN_META, { keyPath: "clave" });
        }
      };
      peticion.onsuccess = () => resolver(new Almacen(peticion.result));
      peticion.onerror = () => rechazar(peticion.error);
      peticion.onblocked = () => rechazar(new Error("La base de datos está bloqueada por otra pestaña"));
    });
  }

  cerrar() {
    this.db.close();
  }

  /** Todas las cantidades guardadas como Map id -> cantidad (lo que no está, es 0). */
  async leerTodas() {
    const tx = this.db.transaction(ALMACEN_COPIAS, "readonly");
    const filas = await promesa(tx.objectStore(ALMACEN_COPIAS).getAll());
    return new Map(filas.filter((f) => esCantidadValida(f.cantidad)).map((f) => [f.id, f.cantidad]));
  }

  /** 3.16 · Todas las filas normalizadas: Map id -> { cantidad, variantes, mostrar } (ver variantes.js). */
  async leerRegistros() {
    const tx = this.db.transaction(ALMACEN_COPIAS, "readonly");
    const filas = await promesa(tx.objectStore(ALMACEN_COPIAS).getAll());
    return new Map(filas.filter((f) => f && typeof f.id === "string").map((f) => [f.id, normalizar(f)]).filter(([, r]) => r.cantidad > 0));
  }

  /** 3.16 · Lee la fila, aplica `cambio(registro)` y guarda en UNA transacción (los toques rápidos no se pisan). Devuelve { antes, despues, registro }. */
  async _modificar(id, cambio) {
    if (typeof id !== "string" || id === "") throw new TypeError("id de carta no válido");
    const tx = this.db.transaction(ALMACEN_COPIAS, "readwrite");
    const almacen = tx.objectStore(ALMACEN_COPIAS);
    const previo = normalizar(await promesa(almacen.get(id)));
    const nuevo = cambio(previo);
    const fila = aFila(id, nuevo);
    if (fila) almacen.put(fila); else almacen.delete(id);
    await terminada(tx);
    return { antes: previo.cantidad, despues: nuevo.cantidad, registro: nuevo };
  }

  /** 3.16 · +1/−1 copia de una variante (el total cambia en lo mismo). */
  sumarVariante(id, variante, delta) { return this._modificar(id, (r) => cambiarVariante(r, variante, delta)); }
  /** 3.16 · Pasa UNA copia sin clasificar a `variante` (el total no cambia). */
  clasificarVariante(id, variante) { return this._modificar(id, (r) => clasificar(r, variante)); }
  /** 3.16 · Variante que se ve en el álbum (null = automática). */
  fijarVarianteVisible(id, variante) { return this._modificar(id, (r) => fijarMostrar(r, variante)); }

  async cantidad(id) {
    const tx = this.db.transaction(ALMACEN_COPIAS, "readonly");
    const fila = await promesa(tx.objectStore(ALMACEN_COPIAS).get(id));
    return fila && esCantidadValida(fila.cantidad) ? fila.cantidad : 0;
  }

  /**
   * Suma (+1) o resta (-1) copias y devuelve la cantidad nueva.
   * Se hace leer+escribir en UNA transacción: dos pulsaciones seguidas nunca se pisan.
   * Al llegar a 0 se borra la fila: "no hay fila" significa 0 copias.
   */
  async sumar(id, delta) {
    if (!Number.isInteger(delta)) throw new TypeError("El cambio de copias debe ser un entero");
    sumarCopias(0, delta);                                          // misma validación de siempre
    // 3.16: el desglose por variantes se conserva (+ suma una copia sin clasificar; − quita primero de las sin clasificar)
    return (await this._modificar(id, (r) => cambiarTotal(r, delta))).despues;
  }

  /** Fija una cantidad concreta (0 la borra). */
  async fijar(id, cantidad) {
    if (!esCantidadValida(cantidad)) throw new RangeError("Cantidad no válida: " + cantidad);
    const actual = await this.cantidad(id);
    return this.sumar(id, cantidad - actual);
  }

  /**
   * Aplica una copia de seguridad YA VALIDADA y confirmada por la persona.
   * modo "reemplazar": la colección pasa a ser exactamente la copia.
   * modo "combinar": por cada carta se queda la cantidad mayor.
   * Antes guarda una foto de la colección actual (meta/antesDeImportar) para poder deshacerlo.
   */
  async importar(copias, modo, extras = null) {   // 3.16: `extras` = Map id -> { variantes, mostrar } (copias de seguridad v2)
    if (!(copias instanceof Map)) throw new TypeError("Se esperaba un Map id -> cantidad");
    if (modo !== "reemplazar" && modo !== "combinar") throw new RangeError("Modo de importación desconocido");
    for (const [id, c] of copias) {
      if (typeof id !== "string" || id === "" || !esCantidadValida(c)) {
        throw new RangeError("Copia no válida para " + id);
      }
    }
    const tx = this.db.transaction([ALMACEN_COPIAS, ALMACEN_META], "readwrite");
    const almacen = tx.objectStore(ALMACEN_COPIAS);
    const actuales = await promesa(almacen.getAll());
    tx.objectStore(ALMACEN_META).put({
      clave: "antesDeImportar",
      fecha: new Date().toISOString(),
      // 3.16: la foto guarda la fila COMPLETA (con variantes y variante visible): deshacer lo devuelve todo tal cual
      copias: actuales.map((f) => ({ id: f.id, cantidad: f.cantidad, ...(f.variantes ? { variantes: f.variantes } : {}), ...(f.mostrar ? { mostrar: f.mostrar } : {}) })),
    });
    const ahora = new Date().toISOString();
    const previas = new Map(actuales.map((f) => [f.id, normalizar(f)])), filasPrevias = new Map(actuales.map((f) => [f.id, f]));
    // con desglose en la copia (v2) se usa ese; si no, se conserva el que ya había mientras siga cuadrando con el total nuevo
    const registro = (id, cantidad) => (extras && extras.has(id) ? conTotal(normalizar({ cantidad, ...extras.get(id) }), cantidad) : conTotal(previas.get(id) || normalizar(), cantidad));
    if (modo === "reemplazar") {
      almacen.clear();
      for (const [id, cantidad] of copias) {
        const f = cantidad > 0 && aFila(id, registro(id, cantidad), ahora);
        const igual = previas.get(id)?.cantidad === cantidad && !(extras && extras.has(id));   // sin cambios: la fila tal cual (con su fecha)
        if (f) almacen.put(igual ? filasPrevias.get(id) : f);
      }
    } else {
      for (const [id, cantidad] of copias) {
        if (cantidad > (previas.get(id)?.cantidad ?? 0)) { const f = aFila(id, registro(id, cantidad), ahora); if (f) almacen.put(f); }
      }
    }
    await terminada(tx);
  }

  /** Deshace la última importación (vuelve a la foto guardada). Devuelve false si no hay ninguna. */
  async deshacerImportacion() {
    const foto = await promesa(this.db.transaction(ALMACEN_META, "readonly").objectStore(ALMACEN_META).get("antesDeImportar"));
    if (!foto) return false;
    const tx = this.db.transaction([ALMACEN_COPIAS, ALMACEN_META], "readwrite");
    const almacen = tx.objectStore(ALMACEN_COPIAS);
    almacen.clear();
    const ahora = new Date().toISOString();
    for (const f of foto.copias) {                                  // fotos antiguas: { id, cantidad }; desde 3.16 también variantes y visible
      const fila = f && typeof f.id === "string" && aFila(f.id, normalizar(f), ahora);
      if (fila) almacen.put(fila);
    }
    tx.objectStore(ALMACEN_META).delete("antesDeImportar");
    await terminada(tx);
    return true;
  }
}
