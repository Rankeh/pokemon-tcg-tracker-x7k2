// Almacenamiento local con IndexedDB. Aquí solo viven TUS datos (cantidades), nunca el catálogo.
import { sumarCopias, esCantidadValida } from "./coleccion.js";
import { normalizar, cambiarVariante, clasificar, fijarMostrar, cambiarTotal, aFila, conTotal } from "./variantes.js";

export const NOMBRE_BD = "coleccion-teselia";
export const VERSION_BD = 1;
const ALMACEN_COPIAS = "copias"; // { id: "svp-208", cantidad: 2, actualizado: "2026-...", variantes?: { normal: 1, reverse: 1 }, mostrar?: "reverse" } (3.16)
const ALMACEN_META = "meta";     // { clave: "antesDeImportar", ... } · 3.31: "sync:pendientes", "sync:estado", "antesDeSincronizar"
const PENDIENTES = "sync:pendientes";   // { clave, ids: { "<id carta>": "<ISO del cambio>" } }: cambios locales aún sin subir a la cuenta
const ESTADO_SYNC = "sync:estado";      // { clave, usuario, ultimaLectura, ultimaLecturaAlbumes }: con qué cuenta se sincroniza y hasta dónde se ha leído
const ALBUM = "album:";                 // 3.37 · álbumes creados en la app: { clave: "album:<id>", id, registro, datos: { catalogo, precios }, actualizado, borrado? }
const ALBUMES_PENDIENTES = "sync:albumes-pendientes";   // { clave, ids: { "<id álbum>": "<ISO>" } }: álbumes creados o quitados aún sin subir

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

/** 3.31 · Apunta en `meta` (dentro de la MISMA transacción que el cambio) qué cartas han cambiado y cuándo, para subirlas a la cuenta. */
async function marcarPendientes(tx, ids, ahora) {
  if (!ids.length) return;
  const meta = tx.objectStore(ALMACEN_META);
  const fila = (await promesa(meta.get(PENDIENTES))) || { clave: PENDIENTES, ids: {} };
  for (const id of ids) fila.ids[id] = ahora;
  meta.put(fila);
}
/** 3.31 · Milisegundos de una hora ISO, también con el formato de Postgres («…10:00:00.123456+00:00»), que Safari (iPhone) no siempre
 *  entiende con Date.parse. NaN si no es una hora. */
export function instante(iso) {
  if (typeof iso !== "string") return NaN;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:[.,](\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(iso.trim());
  if (!m) return NaN;
  const frac = ((m[3] || "") + "000").slice(0, 3);
  let zona = m[4] || "Z";
  if (/^[+-]\d{2}$/.test(zona)) zona += ":00"; else if (/^[+-]\d{4}$/.test(zona)) zona = zona.slice(0, 3) + ":" + zona.slice(3);
  return Date.parse(`${m[1]}T${m[2]}.${frac}${zona}`);
}

/** Fila guardada → { cantidad, variantes, mostrar } comparable (para saber si algo cambió de verdad). */
const huella = (f) => JSON.stringify(f ? [f.cantidad, f.variantes || {}, f.mostrar || null] : [0, {}, null]);

export class Almacen {
  constructor(db) {
    this.db = db;
    this.alCambiar = null;          // 3.31: aviso tras cada cambio guardado (la sincronización lo usa para subirlo enseguida)
  }
  _avisar() { try { this.alCambiar?.(); } catch { /* un oyente roto no debe romper el guardado */ } }

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
    const tx = this.db.transaction([ALMACEN_COPIAS, ALMACEN_META], "readwrite");
    const almacen = tx.objectStore(ALMACEN_COPIAS);
    const filaPrevia = await promesa(almacen.get(id));
    const previo = normalizar(filaPrevia);
    const nuevo = cambio(previo);
    const ahora = new Date().toISOString();
    const fila = aFila(id, nuevo, ahora);
    if (fila) almacen.put(fila); else almacen.delete(id);
    if (huella(fila) !== huella(filaPrevia && normalizar(filaPrevia))) await marcarPendientes(tx, [id], ahora);
    await terminada(tx);
    this._avisar();
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
    await this._marcarDiferencias(tx, filasPrevias, ahora);
    await terminada(tx);
    this._avisar();
  }

  /** 3.31 · Compara las filas de antes con las de ahora (misma transacción) y apunta como pendientes las cartas que cambiaron. */
  async _marcarDiferencias(tx, filasPrevias, ahora) {
    const ahoraFilas = new Map((await promesa(tx.objectStore(ALMACEN_COPIAS).getAll())).map((f) => [f.id, f]));
    const ids = [...new Set([...filasPrevias.keys(), ...ahoraFilas.keys()])]
      .filter((id) => huella(filasPrevias.get(id) && normalizar(filasPrevias.get(id))) !== huella(ahoraFilas.get(id) && normalizar(ahoraFilas.get(id))));
    await marcarPendientes(tx, ids, ahora);
  }

  /** Deshace la última importación (vuelve a la foto guardada). Devuelve false si no hay ninguna. */
  async deshacerImportacion() {
    const foto = await promesa(this.db.transaction(ALMACEN_META, "readonly").objectStore(ALMACEN_META).get("antesDeImportar"));
    if (!foto) return false;
    return this._volverAFoto(foto, "antesDeImportar");
  }

  /** Vuelve a una foto { copias: [...] } guardada en meta y la borra. Las cartas que cambian quedan pendientes de subir (3.31). */
  async _volverAFoto(foto, clave) {
    const tx = this.db.transaction([ALMACEN_COPIAS, ALMACEN_META], "readwrite");
    const almacen = tx.objectStore(ALMACEN_COPIAS);
    const filasPrevias = new Map((await promesa(almacen.getAll())).map((f) => [f.id, f]));
    almacen.clear();
    const ahora = new Date().toISOString();
    for (const f of foto.copias) {                                  // fotos antiguas: { id, cantidad }; desde 3.16 también variantes y visible
      const fila = f && typeof f.id === "string" && aFila(f.id, normalizar(f), ahora);
      if (fila) almacen.put(fila);
    }
    tx.objectStore(ALMACEN_META).delete(clave);
    await this._marcarDiferencias(tx, filasPrevias, ahora);
    await terminada(tx);
    this._avisar();
    return true;
  }

  // ------------------------------------------------------------------ 3.31 · sincronización con la cuenta (ver sincronizacion.js)
  async _meta(clave) { return promesa(this.db.transaction(ALMACEN_META, "readonly").objectStore(ALMACEN_META).get(clave)); }
  async _ponerMeta(fila) { const tx = this.db.transaction(ALMACEN_META, "readwrite"); tx.objectStore(ALMACEN_META).put(fila); await terminada(tx); }

  /** { usuario, ultimaLectura } de la última sincronización, o null si este navegador nunca se ha sincronizado. */
  async estadoSincronizacion() { const f = await this._meta(ESTADO_SYNC); return f ? { usuario: f.usuario, ultimaLectura: f.ultimaLectura ?? null, ultimaLecturaAlbumes: f.ultimaLecturaAlbumes ?? null, ultima: f.ultima ?? null } : null; }
  async guardarEstadoSincronizacion(e) { await this._ponerMeta({ clave: ESTADO_SYNC, ...e }); }

  /** Cambios locales sin subir: Map id -> ISO. */
  async pendientes() { const f = await this._meta(PENDIENTES); return new Map(Object.entries(f?.ids || {})); }

  /** Filas a subir para esos ids: { carta, cantidad, variantes, mostrar, actualizado } (sin fila local = cantidad 0: la carta se quitó). */
  async filasParaSubir(pendientes) {
    const tx = this.db.transaction(ALMACEN_COPIAS, "readonly"), almacen = tx.objectStore(ALMACEN_COPIAS);
    const res = [];
    for (const [id, cuando] of pendientes) {
      const r = normalizar(await promesa(almacen.get(id)));
      res.push({ carta: id, cantidad: r.cantidad, variantes: r.variantes, mostrar: r.mostrar && r.variantes[r.mostrar] > 0 ? r.mostrar : null, actualizado: cuando });
    }
    return res;
  }

  /** Quita de pendientes las cartas ya subidas, SOLO si no han vuelto a cambiar mientras tanto (misma hora). */
  async confirmarSubidas(subidas) {
    const tx = this.db.transaction(ALMACEN_META, "readwrite"), meta = tx.objectStore(ALMACEN_META);
    const fila = await promesa(meta.get(PENDIENTES));
    if (fila) { for (const s of subidas) if (fila.ids[s.carta] === s.actualizado) delete fila.ids[s.carta]; meta.put(fila); }
    await terminada(tx);
  }

  /**
   * Aplica filas que vienen de la cuenta ({ carta, cantidad, variantes, mostrar, actualizado }) en UNA transacción.
   * Gana la versión más reciente: si aquí hay un cambio pendiente más nuevo que la fila remota, se conserva el local (y se subirá).
   * Devuelve los ids que cambiaron en este navegador.
   */
  async aplicarRemotas(filas) {
    const tx = this.db.transaction([ALMACEN_COPIAS, ALMACEN_META], "readwrite");
    const almacen = tx.objectStore(ALMACEN_COPIAS), meta = tx.objectStore(ALMACEN_META);
    const pend = (await promesa(meta.get(PENDIENTES))) || { clave: PENDIENTES, ids: {} };
    const cambiadas = [];
    for (const f of filas) {
      if (!f || typeof f.carta !== "string" || !f.carta || !esCantidadValida(f.cantidad) || isNaN(instante(f.actualizado))) continue;   // datos raros: se ignoran
      const local = pend.ids[f.carta];
      if (local && !(instante(f.actualizado) >= instante(local))) continue;         // lo de aquí es más nuevo (o no se puede comparar): se conserva
      if (local) delete pend.ids[f.carta];                                         // lo remoto es más nuevo: gana y ya no hay nada que subir
      const actual = await promesa(almacen.get(f.carta));
      const fila = aFila(f.carta, normalizar({ cantidad: f.cantidad, variantes: f.variantes || {}, mostrar: f.mostrar || null }), f.actualizado);
      if (huella(fila) === huella(actual && normalizar(actual))) continue;         // ya estaba igual
      if (fila) almacen.put(fila); else almacen.delete(f.carta);
      cambiadas.push(f.carta);
    }
    meta.put(pend);
    await terminada(tx);
    return cambiadas;
  }

  /** Primera sincronización con una cuenta: foto de la colección (para deshacer) y TODAS las cartas locales pendientes de subir,
   *  cada una con la hora de su último cambio. Así se juntan las dos colecciones sin borrar nada. */
  async prepararPrimeraSincronizacion(usuario) {
    const tx = this.db.transaction([ALMACEN_COPIAS, ALMACEN_META], "readwrite");
    const filas = await promesa(tx.objectStore(ALMACEN_COPIAS).getAll()), meta = tx.objectStore(ALMACEN_META);
    meta.put({ clave: "antesDeSincronizar", fecha: new Date().toISOString(), usuario,
      copias: filas.map((f) => ({ id: f.id, cantidad: f.cantidad, ...(f.variantes ? { variantes: f.variantes } : {}), ...(f.mostrar ? { mostrar: f.mostrar } : {}) })) });
    const pend = (await promesa(meta.get(PENDIENTES))) || { clave: PENDIENTES, ids: {} };
    const ahora = new Date().toISOString();
    for (const f of filas) if (!pend.ids[f.id]) pend.ids[f.id] = isNaN(instante(f.actualizado)) ? ahora : f.actualizado;
    meta.put(pend);
    const albumes = await promesa(meta.getAll(IDBKeyRange.bound(ALBUM, ALBUM + "\uffff")));
    const pa = (await promesa(meta.get(ALBUMES_PENDIENTES))) || { clave: ALBUMES_PENDIENTES, ids: {} };
    for (const a of albumes) if (!pa.ids[a.id]) pa.ids[a.id] = a.actualizado || ahora;
    meta.put(pa);
    meta.put({ clave: ESTADO_SYNC, usuario, ultimaLectura: null, ultima: null });
    await terminada(tx);
  }

  // ------------------------------------------------------------------ 3.37 · álbumes creados en la app (sus definiciones; nunca tus cartas)
  async _albumes() {
    const tx = this.db.transaction(ALMACEN_META, "readonly");
    return promesa(tx.objectStore(ALMACEN_META).getAll(IDBKeyRange.bound(ALBUM, ALBUM + "\uffff")));
  }
  /** Álbumes creados en la app (sin los quitados), del más antiguo al más nuevo. */
  async albumesPropios() {
    return (await this._albumes()).filter((a) => !a.borrado).sort((a, b) => (a.creado || "").localeCompare(b.creado || ""));
  }
  async albumPropio(id) { const a = await this._meta(ALBUM + id); return a && !a.borrado ? a : null; }

  /** Guarda (o reemplaza) un álbum creado en la app y lo deja pendiente de subir a la cuenta. */
  async guardarAlbumPropio({ id, registro, datos, creado }) {
    if (typeof id !== "string" || !/^mio-[a-z0-9-]{1,60}$/.test(id)) throw new TypeError("id de álbum no válido");
    const ahora = new Date().toISOString();
    const tx = this.db.transaction(ALMACEN_META, "readwrite"), meta = tx.objectStore(ALMACEN_META);
    const previo = await promesa(meta.get(ALBUM + id));
    meta.put({ clave: ALBUM + id, id, registro, datos, creado: creado || previo?.creado || ahora, actualizado: ahora });
    await this._marcarAlbum(meta, id, ahora);
    await terminada(tx);
    this._avisar();
  }
  /** Quita un álbum creado en la app. SOLO su definición: las cartas marcadas siguen en la colección. Queda una marca para que la baja
   *  llegue a los demás dispositivos. */
  async quitarAlbumPropio(id) {
    const ahora = new Date().toISOString();
    const tx = this.db.transaction(ALMACEN_META, "readwrite"), meta = tx.objectStore(ALMACEN_META);
    const previo = await promesa(meta.get(ALBUM + id));
    if (!previo || previo.borrado) { await terminada(tx); return false; }
    meta.put({ clave: ALBUM + id, id, borrado: true, creado: previo.creado, actualizado: ahora });
    await this._marcarAlbum(meta, id, ahora);
    await terminada(tx);
    this._avisar();
    return true;
  }
  async _marcarAlbum(meta, id, ahora) {
    const f = (await promesa(meta.get(ALBUMES_PENDIENTES))) || { clave: ALBUMES_PENDIENTES, ids: {} };
    f.ids[id] = ahora; meta.put(f);
  }
  /** Álbumes pendientes de subir: [{ id, datos: { registro, datos } | null, borrado, actualizado }]. */
  async albumesParaSubir() {
    const p = (await this._meta(ALBUMES_PENDIENTES))?.ids || {}, res = [];
    for (const [id, cuando] of Object.entries(p)) {
      const a = await this._meta(ALBUM + id);
      if (!a) continue;
      res.push({ id, borrado: Boolean(a.borrado), datos: a.borrado ? null : { registro: a.registro, datos: a.datos, creado: a.creado }, actualizado: cuando });
    }
    return res;
  }
  async confirmarAlbumesSubidos(subidos) {
    const tx = this.db.transaction(ALMACEN_META, "readwrite"), meta = tx.objectStore(ALMACEN_META);
    const f = await promesa(meta.get(ALBUMES_PENDIENTES));
    if (f) { for (const s of subidos) if (f.ids[s.id] === s.actualizado) delete f.ids[s.id]; meta.put(f); }
    await terminada(tx);
  }
  /** Álbumes que llegan de la cuenta: gana el más reciente (si aquí hay un cambio pendiente más nuevo, se conserva). Devuelve los ids cambiados. */
  async aplicarAlbumesRemotos(filas) {
    const tx = this.db.transaction(ALMACEN_META, "readwrite"), meta = tx.objectStore(ALMACEN_META);
    const pend = (await promesa(meta.get(ALBUMES_PENDIENTES))) || { clave: ALBUMES_PENDIENTES, ids: {} };
    const cambiados = [];
    for (const f of filas) {
      if (!f || typeof f.id !== "string" || !/^mio-[a-z0-9-]{1,60}$/.test(f.id) || isNaN(instante(f.actualizado))) continue;
      const local = pend.ids[f.id];
      if (local && !(instante(f.actualizado) >= instante(local))) continue;
      if (local) delete pend.ids[f.id];
      const actual = await promesa(meta.get(ALBUM + f.id));
      if (actual && instante(actual.actualizado) >= instante(f.actualizado)) continue;          // ya estaba (o es más nuevo)
      if (f.borrado) { if (actual && !actual.borrado) { meta.put({ clave: ALBUM + f.id, id: f.id, borrado: true, creado: actual.creado, actualizado: f.actualizado }); cambiados.push(f.id); } continue; }
      if (!f.datos || !f.datos.registro || !f.datos.datos) continue;
      meta.put({ clave: ALBUM + f.id, id: f.id, registro: f.datos.registro, datos: f.datos.datos, creado: f.datos.creado || f.actualizado, actualizado: f.actualizado });
      cambiados.push(f.id);
    }
    meta.put(pend);
    await terminada(tx);
    return cambiados;
  }

  /** ¿Hay foto de antes de la primera sincronización? { fecha, cartas } o null. */
  async fotoAntesDeSincronizar() { const f = await this._meta("antesDeSincronizar"); return f ? { fecha: f.fecha, cartas: f.copias.length } : null; }
  /** Vuelve a la colección de antes de la primera sincronización (lo que cambie se sube a la cuenta en la siguiente). */
  async deshacerSincronizacion() {
    const foto = await this._meta("antesDeSincronizar");
    return foto ? this._volverAFoto(foto, "antesDeSincronizar") : false;
  }
}
