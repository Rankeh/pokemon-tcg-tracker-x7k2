// 3.34 — cartas V-UNIÓN: las 4 piezas en un bloque 2×2 de la misma página, en orden de mosaico, sin huecos nuevos ni páginas de más.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { distribuir, ordenarPorPokedex, mosaicos } from '../../js/album/distribucion.js';

const dir = new URL('../../../datos/catalogo/', import.meta.url);
const catalogo = (n) => JSON.parse(readFileSync(new URL('coleccion-' + n + '.json', dir), 'utf8')).cartas;
const fila = (pos) => Math.floor((pos - 1) / 3), col = (pos) => (pos - 1) % 3;

test('Akira Egawa: Mewtwo V-UNIÓN (SWSH159–162) en bloque 2×2 de una misma página: 159 y 160 arriba, 161 y 162 abajo', () => {
  const r = distribuir(catalogo('akira-egawa'));
  const p = ['swshp-SWSH159', 'swshp-SWSH160', 'swshp-SWSH161', 'swshp-SWSH162'].map((id) => r.posiciones.get(id));
  assert.ok(p.every((x) => x.pagina === p[0].pagina), 'misma página');
  assert.equal(fila(p[0].posicion), fila(p[1].posicion)); assert.equal(col(p[1].posicion), col(p[0].posicion) + 1, '160 a la derecha de 159');
  assert.equal(fila(p[2].posicion), fila(p[0].posicion) + 1); assert.equal(col(p[2].posicion), col(p[0].posicion), '161 debajo de 159');
  assert.equal(fila(p[3].posicion), fila(p[1].posicion) + 1); assert.equal(col(p[3].posicion), col(p[1].posicion), '162 debajo de 160');
  assert.equal(r.paginas.length, Math.ceil(95 / 9), 'mismas páginas que sin mosaico (el modelo de 6 hojas sigue valiendo)');
  assert.equal(r.paginas.slice(0, -1).flatMap((x) => x.bolsillos).filter((b) => b === null).length, 0, 'sin huecos en medio del álbum');
  assert.equal(r.posiciones.size, 95, 'todas las cartas, una sola vez');
  const pg = r.paginas[p[0].pagina - 1].bolsillos.filter(Boolean).map((c) => c.dexId?.[0]);
  assert.ok(pg.includes(150) && r.posiciones.get('sv03.5-150').pagina === p[0].pagina, 'el Mewtwo de 151 sigue junto a su V-UNIÓN');
});

test('los Armarouge (original y reimpresión con la misma ilustración) siguen juntos', () => {
  const r = distribuir(catalogo('akira-egawa')), a = r.posiciones.get('sv01-041'), b = r.posiciones.get('sv04.5-015');
  assert.equal(a.pagina, b.pagina); assert.equal(Math.abs(a.posicion - b.posicion), 1);
});

test('los álbumes sin V-UNIÓN quedan EXACTAMENTE como antes (Pokédex seguido, solo la última página con huecos)', () => {
  for (const f of readdirSync(dir).filter((n) => /^coleccion-.*\.json$/.test(n))) {
    const cartas = JSON.parse(readFileSync(new URL(f, dir), 'utf8')).cartas;
    if (mosaicos(cartas).size) continue;
    const r = distribuir(cartas), orden = ordenarPorPokedex(cartas).ordenadas;
    orden.forEach((c, i) => assert.deepEqual(r.posiciones.get(c.id), { pagina: Math.floor(i / 9) + 1, posicion: (i % 9) + 1 }, f + ': ' + c.id));
  }
});

const carta = (id, dex, extra = {}) => ({ id, nombre: 'P' + dex, numero: String(dex), expansion: 'x', dexId: [dex], categoriaColeccion: 'rara', ...extra });
const union = (n) => carta('u' + n, 150, { nombre: 'Mewtwo V-UNIÓN', numero: 'SWSH' + (158 + n), categoriaColeccion: 'promo' });

test('si el bloque no cabe en la página, va a la siguiente y los bolsillos que deja libres los ocupan las cartas siguientes', () => {
  const antes = Array.from({ length: 5 }, (_, i) => carta('a' + i, 10 + i)), despues = Array.from({ length: 9 }, (_, i) => carta('d' + i, 200 + i));
  const r = distribuir([...antes, union(1), union(2), union(3), union(4), ...despues]);
  assert.equal(r.posiciones.get('u1').pagina, 2); assert.equal(r.posiciones.get('u1').posicion, 1, 'página siguiente, arriba a la izquierda');
  assert.deepEqual(['d0', 'd1', 'd2', 'd3'].map((id) => r.posiciones.get(id)), [6, 7, 8, 9].map((posicion) => ({ pagina: 1, posicion })), 'los 4 libres de la página 1');
  assert.equal(r.paginas.length, 2); assert.equal(r.huecos, 0);
});

test('un V-UNIÓN incompleto (3 piezas) va como cartas sueltas; y si el bloque obligara a una página más, también', () => {
  const r = distribuir([union(1), union(2), union(3), carta('z', 300)]);
  assert.deepEqual(['u1', 'u2', 'u3'].map((id) => r.posiciones.get(id).posicion), [1, 2, 3]);
  const lleno = Array.from({ length: 5 }, (_, i) => carta('a' + i, 10 + i));
  const r2 = distribuir([...lleno, union(1), union(2), union(3), union(4)]);   // 9 cartas: el bloque en la página 2 dejaría 5 libres y 2 páginas
  assert.equal(r2.paginas.length, 1, 'el modelo 3D tiene las hojas justas: no se añade una página'); assert.equal(r2.huecos, 0);
});
