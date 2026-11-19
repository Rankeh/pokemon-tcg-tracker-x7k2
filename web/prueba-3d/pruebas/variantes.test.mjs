// 3.16 · Variantes (normal / holo / reverse…): lógica pura de web/js/variantes.js y el doble de almacén con las mismas reglas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, sinClasificar, aMostrar, cambiarVariante, clasificar, fijarMostrar, cambiarTotal, aFila, conTotal } from '../../js/variantes.js';
import { AlmacenMemoria } from './almacen-memoria.mjs';

test('normalizar: filas antiguas (solo cantidad) = todo sin clasificar; basura descartada; nunca se pierden copias', () => {
  assert.deepEqual(normalizar({ id: 'a', cantidad: 2 }), { cantidad: 2, variantes: {}, mostrar: null });
  assert.deepEqual(normalizar(undefined), { cantidad: 0, variantes: {}, mostrar: null });
  const r = normalizar({ cantidad: 1, variantes: { normal: 2, 'mal nombre': 3, reverse: -1, holo: 1.5 }, mostrar: 'normal' });
  assert.deepEqual(r, { cantidad: 2, variantes: { normal: 2 }, mostrar: 'normal' }, 'si las variantes suman más que el total, manda la suma');
  assert.equal(sinClasificar(normalizar({ cantidad: 3, variantes: { reverse: 1 } })), 2);
});

test('cambiarVariante: el total sube/baja con la variante; la primera conseguida pasa a verse; a 0 deja de verse', () => {
  let r = normalizar({ cantidad: 1 });                                     // 1 copia antigua sin clasificar
  r = cambiarVariante(r, 'reverse', +1);
  assert.deepEqual(r, { cantidad: 2, variantes: { reverse: 1 }, mostrar: 'reverse' });
  r = cambiarVariante(r, 'normal', +1);
  assert.equal(r.mostrar, 'reverse', 'añadir otra variante no cambia la que se ve');
  r = cambiarVariante(r, 'reverse', -1);
  assert.deepEqual(r, { cantidad: 2, variantes: { normal: 1 }, mostrar: null });
  assert.deepEqual(cambiarVariante(r, 'holo', -1), r, 'quitar de una variante sin copias no hace nada');
  assert.throws(() => cambiarVariante(r, '', 1), RangeError);
  assert.equal(cambiarVariante(normalizar({ cantidad: 999 }), 'holo', +1).cantidad, 999, 'el total nunca pasa de 999');
});

test('clasificar: mueve UNA copia sin clasificar a la variante sin cambiar el total; sin copias libres no hace nada', () => {
  const r = clasificar(normalizar({ cantidad: 2 }), 'holo');
  assert.deepEqual(r, { cantidad: 2, variantes: { holo: 1 }, mostrar: 'holo' });
  const lleno = normalizar({ cantidad: 1, variantes: { normal: 1 } });
  assert.deepEqual(clasificar(lleno, 'holo'), lleno);
});

test('aMostrar: la elegida si tiene copias; si no, la más vistosa (holo > reverse > normal); null si solo hay sin clasificar', () => {
  assert.equal(aMostrar(normalizar({ cantidad: 2, variantes: { normal: 1, reverse: 1 } })), 'reverse');
  assert.equal(aMostrar(normalizar({ cantidad: 2, variantes: { normal: 1, reverse: 1 }, mostrar: 'normal' })), 'normal');
  assert.equal(aMostrar(normalizar({ cantidad: 1 })), null);
  assert.equal(fijarMostrar(normalizar({ cantidad: 1, variantes: { normal: 1 } }), 'holo').mostrar, null, 'no se puede ver una variante que no tienes');
});

test('cambiarTotal (pantallas sin variantes): + suma sin clasificar; − quita primero sin clasificar y luego de la variante no visible', () => {
  let r = normalizar({ cantidad: 3, variantes: { holo: 1, normal: 1 }, mostrar: 'holo' });
  r = cambiarTotal(r, -1); assert.deepEqual(r, { cantidad: 2, variantes: { holo: 1, normal: 1 }, mostrar: 'holo' });
  r = cambiarTotal(r, -1); assert.deepEqual(r, { cantidad: 1, variantes: { holo: 1 }, mostrar: 'holo' }, 'la visible se conserva mientras se pueda');
  r = cambiarTotal(r, +1); assert.deepEqual(r, { cantidad: 2, variantes: { holo: 1 }, mostrar: 'holo' });
  assert.equal(cambiarTotal(normalizar({ cantidad: 1, variantes: { holo: 1 } }), -1).cantidad, 0);
});

test('aFila / conTotal: la fila solo lleva variantes si las hay; a 0 se borra; un total nuevo conserva el desglose si cuadra', () => {
  assert.deepEqual(aFila('a', normalizar({ cantidad: 2 }), 'T'), { id: 'a', cantidad: 2, actualizado: 'T' });
  assert.equal(aFila('a', normalizar({ cantidad: 0 })), null);
  const r = normalizar({ cantidad: 2, variantes: { reverse: 2 }, mostrar: 'reverse' });
  assert.deepEqual(conTotal(r, 3).variantes, { reverse: 2 });
  assert.deepEqual(conTotal(r, 1), { cantidad: 1, variantes: {}, mostrar: null }, 'si ya no cuadra, el desglose se descarta (el total manda)');
});

test('doble de almacén: variantes persistidas en la fila y el total coherente tras cada operación', async () => {
  const a = new AlmacenMemoria();
  await a.sumar('x', 1);
  await a.sumarVariante('x', 'reverse', 1);
  await a.clasificarVariante('x', 'normal');
  assert.deepEqual(a.filas.get('x').variantes, { reverse: 1, normal: 1 });
  assert.equal(await a.cantidad('x'), 2);
  await a.fijarVarianteVisible('x', 'normal');
  assert.equal((await a.leerRegistros()).get('x').mostrar, 'normal');
  await a.sumar('x', -2);
  assert.equal(a.filas.has('x'), false);
});

import { holoImplicito, esArteCompleto, tipoBrillo } from '../../js/variantes.js';
test('3.18 · holo implícito: en catálogos sin variantes, IR/SIR/partidarios (arte completo) y promos (marco normal) son holo', () => {
  for (const cat of ['ir', 'sir', 'partidario']) {
    const c = { categoriaColeccion: cat };
    assert.ok(holoImplicito(c) && esArteCompleto(c), cat);
    assert.equal(tipoBrillo('holo', esArteCompleto(c)), 'holo-completo');
  }
  const promo = { categoriaColeccion: 'promo' };
  assert.ok(holoImplicito(promo)); assert.equal(tipoBrillo('holo', esArteCompleto(promo)), 'holo-arte');
  assert.ok(!holoImplicito({ categoriaColeccion: 'comun' }));
  assert.ok(!holoImplicito({ categoriaColeccion: 'ir', variantes: [{ id: 'holo' }] }), 'con variantes manda la variante elegida, no la regla');
  assert.ok(esArteCompleto({ categoriaColeccion: 'rara', arteCompleto: true }), 'galerías GG/TG marcadas por el catálogo');
});

test('3.18 · todas las cartas de Teselia tienen brillo holo (catálogo real)', async () => {
  const { readFile } = await import('node:fs/promises');
  const cat = JSON.parse(await readFile(new URL('../../../datos/catalogo/coleccion-teselia.json', import.meta.url), 'utf8'));
  assert.ok(cat.cartas.every(holoImplicito), 'las 158');
});

test('3.30 · brillo holo: la ventana de la ilustración acaba donde la medida (47 %), el brillo 3D es suave y la ficha no quema la imagen', async () => {
  const { VENTANA_ARTE: V, BRILLO } = await import('../../js/variantes.js');
  const { readFile } = await import('node:fs/promises');
  assert.ok(Math.abs(V.y1 - 0.47) < 0.01 && V.y0 > 0.09 && V.y0 < 0.11, 'ventana medida en 30th-027, sv06-034 y sv10.5w-057');
  assert.ok(Math.max(...BRILLO.franjas) * BRILLO.opacidad <= 0.12, 'alfa efectiva del arcoíris ≤ 0,12 (antes 0,30)');
  assert.ok(BRILLO.destelloMax * BRILLO.opacidad <= 0.15, 'destellos discretos');
  const css = await readFile(new URL('../css/prueba-3d.css', import.meta.url), 'utf8');
  assert.ok(!css.includes('color-dodge') && css.includes('soft-light'), 'ficha: soft-light en vez de color-dodge');
  assert.ok(css.includes('inset(10.5% 8% 53% 8%)') && css.includes('8% 47%, 92% 47%'), 'la ficha usa la misma ventana que el 3D');
});

test('3.31 · instante(): horas ISO del navegador y de Postgres (microsegundos, +00:00), que Safari no siempre entiende', async () => {
  const { instante } = await import('../../js/almacen.js');
  const ms = Date.UTC(2026, 10, 19, 10, 0, 0, 123);
  for (const t of ['2026-11-19T10:00:00.123Z', '2026-11-19T10:00:00.123456+00:00', '2026-11-19 10:00:00.123456+00', '2026-11-19T11:00:00.123+01:00', '2026-11-19T10:00:00.1234+0000'])
    assert.equal(instante(t), ms, t);
  assert.equal(instante('2026-11-19T10:00:00Z'), Date.UTC(2026, 10, 19, 10));
  for (const t of [null, undefined, '', 'ayer', '2026-11-19']) assert.ok(isNaN(instante(t)), String(t));
});
