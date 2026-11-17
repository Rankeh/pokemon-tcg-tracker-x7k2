// 3.13 · «Añadir todas las cartas»: partes puras + que combinar no baja cantidades y que deshacer vuelve a la foto (almacén en memoria).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cartasPendientes, copiasParaCompletar, textoConfirmacion } from '../js/completar.js';

const cartas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

test('pendientes: solo las que tienen 0 copias (o no constan)', () => {
  const m = new Map([['a', 2], ['c', 0]]);
  assert.deepEqual(cartasPendientes(cartas, (id) => m.get(id) ?? 0), ['b', 'c']);
  assert.deepEqual(cartasPendientes(cartas, () => 1), []);
});

test('copias para completar: 1 de cada pendiente', () => {
  assert.deepEqual([...copiasParaCompletar(['b', 'c'])], [['b', 1], ['c', 1]]);
  assert.equal(copiasParaCompletar([]).size, 0);
});

test('texto de confirmación: cuenta, aclara que lo que tienes no cambia y que se puede deshacer; caso «ya las tienes»', () => {
  const t = textoConfirmacion('Asako Ito', 12, 37);
  assert.ok(t.includes('12 cartas') && t.includes('de 37') && /no cambian/.test(t) && /deshacer/i.test(t));
  assert.ok(textoConfirmacion('X', 1, 5).includes('la carta que te falta de 5'));
  assert.ok(textoConfirmacion('X', 5, 5).includes('las 5 cartas del álbum'), 'si faltan todas no dice «te faltan 5 de 5»');
  assert.ok(/Ya tienes todas/.test(textoConfirmacion('X', 0, 5)));
});

import { cartasConseguidas, copiasSinAlbum, compartidasCon, textoEliminar } from '../js/completar.js';

test('eliminar: conseguidas = las que tienen copias; la colección se reescribe SIN las del álbum y el resto con su cantidad exacta', () => {
  const m = new Map([['a', 2], ['b', 0], ['x', 4]]);
  assert.deepEqual(cartasConseguidas(cartas, (id) => m.get(id) ?? 0), ['a']);
  assert.deepEqual([...copiasSinAlbum(new Map([['a', 3], ['c', 1], ['x', 4], ['y', 1]]), ['a', 'b', 'c'])], [['x', 4], ['y', 1]]);
  assert.equal(copiasSinAlbum(new Map(), ['a']).size, 0);
});

test('eliminar: detecta cartas compartidas con otros álbumes y el texto avisa con el nombre del álbum', () => {
  const c = compartidasCon(['sv10.5b-151', '30th-027'], [{ nombre: 'Teselia', ids: ['sv10.5b-151', 'sv10.5w-166'] }, { nombre: 'Otro', ids: [] }]);
  assert.deepEqual(c, [{ album: 'Teselia', ids: ['sv10.5b-151'] }]);
  const t = textoEliminar('Asako Ito', 2, 4, c);
  assert.ok(/2 cartas/.test(t) && /4 copias/.test(t) && /«Teselia»/.test(t) && /1 de ellas está/.test(t) && /deshacer/i.test(t), t);
  assert.ok(!/copias en total/.test(textoEliminar('X', 2, 2)), 'si hay 1 copia de cada, no se repite el total');
  assert.ok(/No tienes ninguna/.test(textoEliminar('X', 0, 0)));
});
