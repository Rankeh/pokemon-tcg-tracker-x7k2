// 3.27 — flechas entre cartas (cartaVecina / cartaDeEntrada) y tocar el álbum cerrado (rayoCaja). Funciones PURAS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cartaVecina, cartaDeEntrada } from '../js/navegacion3d.js';
import { rayoCaja } from '../js/picking.js';

// doble página: 6 columnas (3 por página, con el lomo en medio) × 3 filas; z crece hacia abajo en pantalla
const X = [-0.22, -0.15, -0.08, 0.08, 0.15, 0.22], Z = [-0.1, 0, 0.1];
const rejilla = (quitar = []) => X.flatMap((x, i) => Z.map((z, j) => ({ nombre: `c${i}${j}`, x, z }))).filter((c) => !quitar.includes(c.nombre));
const en = (l, n) => l.find((c) => c.nombre === n);

test('cartaVecina: misma fila a izquierda/derecha y misma columna arriba/abajo; cruza el lomo dentro de la doble página', () => {
  const l = rejilla();
  assert.equal(cartaVecina(en(l, 'c11'), l, 'der').nombre, 'c21');
  assert.equal(cartaVecina(en(l, 'c11'), l, 'izq').nombre, 'c01');
  assert.equal(cartaVecina(en(l, 'c11'), l, 'arriba').nombre, 'c10');
  assert.equal(cartaVecina(en(l, 'c11'), l, 'abajo').nombre, 'c12');
  assert.equal(cartaVecina(en(l, 'c21'), l, 'der').nombre, 'c31', 'de la página izquierda a la derecha');
});

test('cartaVecina: null en los bordes (ahí se gira la hoja o se queda quieto); salta los huecos sin carta', () => {
  const l = rejilla();
  assert.equal(cartaVecina(en(l, 'c51'), l, 'der'), null); assert.equal(cartaVecina(en(l, 'c01'), l, 'izq'), null);
  assert.equal(cartaVecina(en(l, 'c30'), l, 'arriba'), null); assert.equal(cartaVecina(en(l, 'c32'), l, 'abajo'), null);
  const h = rejilla(['c41', 'c42']);                               // última página con huecos
  assert.equal(cartaVecina(en(h, 'c31'), h, 'der').nombre, 'c51', 'salta el hueco de la misma fila');
  const u = rejilla(['c41', 'c51']);
  const v = cartaVecina(en(u, 'c31'), u, 'der');
  assert.ok(v && v.x > 0.08 && v.z !== 0, 'sin nada en la fila, va a la fila más cercana: ' + v?.nombre);
});

test('cartaDeEntrada: al cruzar el borde se entra por la misma fila, por el lado de entrada; sin fila, la primera carta', () => {
  const l = rejilla();
  assert.equal(cartaDeEntrada(l, 'der', 0.1).nombre, 'c02', 'yendo a la derecha: columna izquierda, fila de abajo');
  assert.equal(cartaDeEntrada(l, 'izq', 0).nombre, 'c51', 'yendo a la izquierda: columna derecha');
  assert.equal(cartaDeEntrada(l, 'der').nombre, 'c00', 'primera pulsación: arriba a la izquierda');
  assert.equal(cartaDeEntrada(rejilla(['c02']), 'der', 0.1).nombre, 'c12', 'fila con hueco al principio');
  assert.equal(cartaDeEntrada([], 'der'), null);
});

test('rayoCaja: el rayo de la cámara toca la tapa cerrada; fuera de ella, no (con margen táctil)', () => {
  const tapa = { x: [-0.12, 0.12], y: [0.03, 0.035], z: [-0.16, 0.16] }, o = [0, 0.8, 0.5];
  const hacia = (p) => { const d = p.map((v, i) => v - o[i]), n = Math.hypot(...d); return d.map((v) => v / n); };
  assert.ok(rayoCaja(o, hacia([0, 0.035, 0]), tapa) > 0, 'centro');
  assert.equal(rayoCaja(o, hacia([0.3, 0.035, 0]), tapa), null, 'al lado del álbum');
  assert.equal(rayoCaja(o, hacia([0.125, 0.035, 0]), tapa), null);
  assert.ok(rayoCaja(o, hacia([0.125, 0.035, 0]), tapa, 0.01) > 0, 'el margen amplía la zona');
  assert.equal(rayoCaja(o, [0, 1, 0], tapa), null, 'mirando hacia otro lado');
});

test('3.28 · Controlador.cambiarA: con la ficha abierta pasa a otra carta sin cerrarla ni esperar; nunca sin ficha, a un hueco ni durante un giro', async () => {
  const { Controlador } = await import('../js/controlador.js');
  const abiertas = [], estado = { animando: false };
  const c = new Controlador({ adaptador: { puedeEditar: (n) => n !== 'hueco', fichaDe: (n) => ({ id: 'id-' + n }) }, estado, vista: {}, ficha: { abrir: (d) => abiertas.push(d.id), cerrar() {} } });
  assert.equal(c.cambiarA('b'), false, 'sin ficha abierta no hace nada');
  assert.ok(c.seleccionar('a')); assert.ok(c.cambiarA('b')); assert.deepEqual(c.seleccion, { nombre: 'b', id: 'id-b' });
  assert.equal(c.cambiarA('hueco'), false); assert.equal(c.cambiarA('b'), false, 'misma carta');
  estado.animando = true; assert.equal(c.cambiarA('a'), false, 'durante un giro no'); estado.animando = false;
  assert.deepEqual(abiertas, ['id-a', 'id-b']);
});

test('3.28 · brillo: si la carta solo existe en una variante (holo), las copias sin clasificar se ven con esa variante', async () => {
  const { AdaptadorColeccion, crearMapa } = await import('../js/adaptador-coleccion.js');
  const cartas = [
    { id: 'p1', nombre: 'Pikachu', numero: '023', dexId: [25], categoriaColeccion: 'otra', variantes: [{ id: 'holo', nombre: 'Holo' }] },
    { id: 'p2', nombre: 'Pikachu', numero: '024', dexId: [25], categoriaColeccion: 'otra', variantes: [{ id: 'normal', nombre: 'Normal' }, { id: 'reverse', nombre: 'Reverse' }] },
    { id: 'p3', nombre: 'Pikachu', numero: '025', dexId: [25], categoriaColeccion: 'otra', variantes: [{ id: 'holo', nombre: 'Holo' }] },
  ];
  const filas = { p1: 1, p2: 1, p3: 0 };
  const modelo = { cargar: async () => {}, cantidad: (id) => filas[id] || 0, registro: (id) => ({ cantidad: filas[id] || 0, variantes: {}, mostrar: null }) };
  const a = new AdaptadorColeccion(crearMapa({ cartas }), modelo);
  assert.equal(a.acabado('p1'), 'holo', 'solo holo: la copia sin clasificar brilla como holo');
  assert.equal(a.acabado('p2'), null, 'normal o reverse: sin clasificar no se adivina');
  assert.equal(a.acabado('p3'), null, 'sin copias, sin brillo');
});
