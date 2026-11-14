// Proxies de las 5 promos sin imagen: existen, tienen tamaño de mini, y el productor `mini` los usa solo si no hay copia oficial.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './mundo.mjs';   // registra los dobles de three
import { PROXIES, rutaProxy } from '../js/proxies.js';

const raiz = new URL('../', import.meta.url);
const catalogo = JSON.parse(fs.readFileSync(new URL('../../../datos/catalogo/coleccion-teselia.json', import.meta.url), 'utf8'));
const cartas = Array.isArray(catalogo) ? catalogo : catalogo.cartas;

test('P1: cada carta sin imagen oficial tiene proxy, y solo esas', () => {
  const sin = cartas.filter((c) => c.estadoImagen === 'sin-imagen').map((c) => c.id).sort();
  assert.deepEqual(Object.keys(PROXIES).sort(), sin);
  assert.equal(sin.length, 5);
  assert.equal(rutaProxy('svp-1'), null);
});

test('P2: los PNG existen, son PNG de 256x358', () => {
  for (const ruta of Object.values(PROXIES)) {
    const b = fs.readFileSync(new URL(ruta, raiz));
    assert.equal(b.subarray(1, 4).toString(), 'PNG');
    assert.equal(b.readUInt32BE(16), 256); assert.equal(b.readUInt32BE(20), 358);
  }
});

test('P3: el catálogo no se ha tocado (158 cartas, imagen vacía en las 5)', () => {
  assert.equal(cartas.length, 158);
  assert.ok(cartas.filter((c) => c.estadoImagen === 'sin-imagen').every((c) => !c.imagen));
});

test('P4: sin copia oficial, el productor mini carga el proxy; con copia oficial usa la oficial; sin ninguna, rechaza', async () => {
  const { crearProductores } = await import('../js/texturas3d.js');
  const prod = crearProductores({ manifiesto: { cartas: { 'svp-1': { mini: 'x/svp-1.webp' } } }, crearLienzo: () => ({}) });
  const r = await prod.mini({ id: 'svp-208' })();
  assert.match(String(r.textura.url || r.textura.image?.src || ''), /proxies\/svp-208\.png/);
  const o = await prod.mini({ id: 'svp-1' })();
  assert.match(String(o.textura.url || ''), /x\/svp-1\.webp/);
  await assert.rejects(prod.mini({ id: 'zzz-1' })());
});
