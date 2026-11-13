import { sumarCopias, esCantidadValida } from '../../js/coleccion.js';
/** Doble de Almacen: misma interfaz (leerTodas, cantidad, sumar, fijar, cerrar) y las mismas reglas (sumarCopias; 0 borra la fila). Solo para pruebas en Node. */
export class AlmacenMemoria {
  constructor() { this.filas = new Map(); }
  async leerTodas() { return new Map(this.filas); }
  async cantidad(id) { return this.filas.get(id) ?? 0; }
  async sumar(id, delta) {
    if (typeof id !== 'string' || id === '') throw new TypeError('id de carta no válido');
    await Promise.resolve();
    const n = sumarCopias(this.filas.get(id) ?? 0, delta);
    if (n === 0) this.filas.delete(id); else this.filas.set(id, n);
    return n;
  }
  async fijar(id, c) { if (!esCantidadValida(c)) throw new RangeError('no válida'); return this.sumar(id, c - (await this.cantidad(id))); }
  cerrar() {}
}
