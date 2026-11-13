// Pruebas de integridad en Node (almacén en memoria con la MISMA interfaz pública que Almacen). Las de IndexedDB real están en ejecutar-navegador.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ejecutarSuite } from './suite-coleccion.mjs';
import { AlmacenMemoria } from './almacen-memoria.mjs';

const catalogo = JSON.parse(readFileSync(new URL('../../../datos/catalogo/coleccion-teselia.json', import.meta.url), 'utf8'));

test('suite de integridad (Node, almacén en memoria)', async () => {
  const res = await ejecutarSuite({ catalogo, crearAlmacen: async () => new AlmacenMemoria() }, (e, t) => console.log(e, t));
  const malas = res.filter((r) => !r.ok);
  assert.equal(malas.length, 0, malas.map((m) => m.nombre + ': ' + m.error).join('\n'));
  assert.ok(res.length >= 14);
});
