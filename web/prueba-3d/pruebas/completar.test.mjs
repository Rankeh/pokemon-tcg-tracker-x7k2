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
