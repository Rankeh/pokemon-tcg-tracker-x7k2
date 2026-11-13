// Almacenamiento local con IndexedDB. Aquí solo viven TUS datos (cantidades), nunca el catálogo.
import { sumarCopias, esCantidadValida } from "./coleccion.js";

export const NOMBRE_BD = "coleccion-teselia";
export const VERSION_BD = 1;
const ALMACEN_COPIAS = "copias"; // { id: "svp-208", cantidad: 2, actualizado: "2026-..." }
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
    if (typeof id !== "string" || id === "") throw new TypeError("id de carta no válido");
    const tx = this.db.transaction(ALMACEN_COPIAS, "readwrite");
    const almacen = tx.objectStore(ALMACEN_COPIAS);
    const fila = await promesa(almacen.get(id));
    const nueva = sumarCopias(fila?.cantidad ?? 0, delta);
    if (nueva === 0) {
      almacen.delete(id);
    } else {
      almacen.put({ id, cantidad: nueva, actualizado: new Date().toISOString() });
    }
    await terminada(tx);
    return nueva;
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
  async importar(copias, modo) {
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
      copias: actuales.map(({ id, cantidad }) => ({ id, cantidad })),
    });
    const ahora = new Date().toISOString();
    if (modo === "reemplazar") {
      almacen.clear();
      for (const [id, cantidad] of copias) {
        if (cantidad > 0) almacen.put({ id, cantidad, actualizado: ahora });
      }
    } else {
      const previas = new Map(actuales.map((f) => [f.id, f.cantidad]));
      for (const [id, cantidad] of copias) {
        if (cantidad > (previas.get(id) ?? 0)) almacen.put({ id, cantidad, actualizado: ahora });
      }
    }
    await terminada(tx);
  }

  /** Deshace la última importación (vuelve a la foto guardada). Devuelve false si no hay ninguna. */
  async deshacerImportacion() {
    const foto = await promesa(this.db.transaction(ALMACEN_META, "readonly").objectStore(ALMACEN_META).get("antesDeImportar"));
    if (!foto) return false;
    const mapa = new Map(foto.copias.map((f) => [f.id, f.cantidad]));
    const tx = this.db.transaction([ALMACEN_COPIAS, ALMACEN_META], "readwrite");
    const almacen = tx.objectStore(ALMACEN_COPIAS);
    almacen.clear();
    for (const [id, cantidad] of mapa) {
      if (cantidad > 0) almacen.put({ id, cantidad, actualizado: new Date().toISOString() });
    }
    tx.objectStore(ALMACEN_META).delete("antesDeImportar");
    await terminada(tx);
    return true;
  }
}
