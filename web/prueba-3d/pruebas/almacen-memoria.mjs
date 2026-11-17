import { sumarCopias, esCantidadValida } from '../../js/coleccion.js';
import { normalizar, cambiarVariante, clasificar, fijarMostrar, cambiarTotal, aFila } from '../../js/variantes.js';
/** Doble de Almacen: misma interfaz (leerTodas, leerRegistros, cantidad, sumar, fijar, sumarVariante, clasificarVariante, fijarVarianteVisible,
 *  cerrar) y las mismas reglas (sumarCopias, variantes.js; 0 borra la fila). Solo para pruebas en Node. */
export class AlmacenMemoria {
  constructor() { this.filas = new Map(); }                     // id -> fila tal como se guardaría en IndexedDB
  async leerTodas() { return new Map([...this.filas].map(([id, f]) => [id, f.cantidad])); }
  async leerRegistros() { return new Map([...this.filas].map(([id, f]) => [id, normalizar(f)])); }
  async cantidad(id) { return this.filas.get(id)?.cantidad ?? 0; }
  async _modificar(id, cambio) {
    if (typeof id !== 'string' || id === '') throw new TypeError('id de carta no válido');
    await Promise.resolve();
    const previo = normalizar(this.filas.get(id)), nuevo = cambio(previo), f = aFila(id, nuevo);
    if (f) this.filas.set(id, f); else this.filas.delete(id);
    return { antes: previo.cantidad, despues: nuevo.cantidad, registro: nuevo };
  }
  async sumar(id, delta) { sumarCopias(0, delta); return (await this._modificar(id, (r) => cambiarTotal(r, delta))).despues; }
  sumarVariante(id, v, d) { return this._modificar(id, (r) => cambiarVariante(r, v, d)); }
  clasificarVariante(id, v) { return this._modificar(id, (r) => clasificar(r, v)); }
  fijarVarianteVisible(id, v) { return this._modificar(id, (r) => fijarMostrar(r, v)); }
  async fijar(id, c) { if (!esCantidadValida(c)) throw new RangeError('no válida'); return this.sumar(id, c - (await this.cantidad(id))); }
  cerrar() {}
}
