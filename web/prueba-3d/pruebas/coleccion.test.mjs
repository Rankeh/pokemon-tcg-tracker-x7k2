// Pruebas de integridad en Node (almacén en memoria con la MISMA interfaz pública que Almacen). Las de IndexedDB real están en ejecutar-navegador.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ejecutarSuite } from './suite-coleccion.mjs';
import { sumarCopias, esCantidadValida } from '../../js/coleccion.js';

const catalogo = JSON.parse(readFileSync(new URL('../../../datos/catalogo/coleccion-teselia.json', import.meta.url), 'utf8'));

/** Doble de Almacen: misma interfaz (leerTodas, cantidad, sumar, fijar, cerrar) y las mismas reglas (sumarCopias; 0 borra la fila). */
class AlmacenMemoria {
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

test('suite de integridad (Node, almacén en memoria)', async () => {
  const res = await ejecutarSuite({ catalogo, crearAlmacen: async () => new AlmacenMemoria() }, (e, t) => console.log(e, t));
  const malas = res.filter((r) => !r.ok);
  assert.equal(malas.length, 0, malas.map((m) => m.nombre + ': ' + m.error).join('\n'));
  assert.ok(res.length >= 14);
});
