// Pruebas de la lógica pura del álbum 3D y de la cámara. Ejecutar:  node --test web/prueba-3d/pruebas/
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearGeometria, EstadoAlbum, pose, centradoX, analizarNombre, memoriaTexturaBytes, MedidorFps, PI } from '../js/logica.js';
import { OrbitaLigera } from '../js/camara.js';

const P = { n_hojas: 6, paso: 0.0035, grosor_tapa: 0.006, y_base: 0, ancho_tapa: 0.258 };
const geo = () => crearGeometria(P);
const cerca = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≠ ${b}`);

test('poses: extremos exactos y elevación a mitad de giro', () => {
  const g = geo();
  for (let i = 0; i < g.elementos; i++) {
    const a = pose(g, i, 0), b = pose(g, i, 1), m = pose(g, i, 0.5);
    cerca(a.rotZ, 0); cerca(b.rotZ, PI);
    cerca(a.y, g.yDerecha(i)); cerca(b.y, g.yIzquierda(i));
    assert.ok(m.y > Math.max(a.y, b.y) - 1e-9, 'a mitad de giro la hoja sube sobre las pilas');
    cerca(m.rotZ, PI / 2);
  }
});

test('las pilas están ordenadas: la hoja 1 queda arriba a la derecha y abajo a la izquierda', () => {
  const g = geo();
  for (let i = 1; i < g.n; i++) {
    assert.ok(g.yDerecha(i) > g.yDerecha(i + 1), 'derecha: la hoja menor está encima');
    assert.ok(g.yIzquierda(i) < g.yIzquierda(i + 1), 'izquierda: la hoja menor está debajo');
  }
  assert.ok(g.yDerecha(0) > g.yDerecha(1), 'la tapa cubre la pila derecha');
  assert.ok(g.yIzquierda(0) < g.yIzquierda(1), 'la tapa queda bajo la pila izquierda');
});

test('las pilas no se atraviesan (separación ≥ grosor de una hoja)', () => {
  const g = geo();
  for (let i = 1; i < g.n; i++) assert.ok(g.yDerecha(i) - g.yDerecha(i + 1) >= 0.0012 + 1e-9);
});

test('animar: avanzar/retroceder, cola, y no pasarse de los límites', () => {
  const e = new EstadoAlbum(geo(), 1);
  assert.equal(e.vueltas, 0);
  assert.ok(!e.puedeRetroceder());
  e.avanzar(); e.avanzar();
  assert.equal(e.objetivo, 2);
  e.actualizar(0.5);
  cerca(e.progreso[0], 0.5);
  e.actualizar(0.5); assert.equal(e.progreso[0], 1);
  e.actualizar(10);
  assert.equal(e.progreso[1], 1); assert.equal(e.vueltas, 2); assert.ok(!e.animando);
  e.retroceder(); e.actualizar(10);
  assert.equal(e.vueltas, 1); assert.equal(e.progreso[1], 0);
  while (e.avanzar());
  assert.equal(e.objetivo, geo().elementos); assert.ok(!e.avanzar());
  e.actualizar(100);
  assert.equal(e.vueltas, geo().elementos);
});

test('un dt grande atraviesa varios pasos de la cola sin saltarse ninguno', () => {
  const e = new EstadoAlbum(geo(), 0.9);
  for (let i = 0; i < 4; i++) e.avanzar();
  e.actualizar(0.9 * 2 + 0.45);
  assert.equal(e.progreso[0], 1); assert.equal(e.progreso[1], 1); cerca(e.progreso[2], 0.5);
  assert.equal(e.progreso[3], 0);
});

test('centrado: cerrado a la izquierda media tapa, abierto 0, al final media tapa a la derecha; continuo', () => {
  const g = geo(), e = new EstadoAlbum(g);
  cerca(centradoX(g, e.progreso), -g.ancho / 2);
  e.irA(1); cerca(centradoX(g, e.progreso), 0);
  e.irA(g.elementos); cerca(centradoX(g, e.progreso), g.ancho / 2);
  e.irA(0); e.avanzar(); e.actualizar(0.45);
  const x = centradoX(g, e.progreso); assert.ok(x > -g.ancho / 2 && x < 0);
});

test('visibilidad: se ocultan las hojas enterradas (ahorro de dibujo) y se muestran las que se mueven', () => {
  const g = geo(), e = new EstadoAlbum(g);
  e.irA(0);
  assert.ok(e.visibles().size < g.elementos, 'cerrado: no se dibuja todo');
  assert.ok(e.visibles().has(0) && e.visibles().has(1));
  assert.ok(!e.visibles().has(g.n));
  e.irA(3);
  const v = e.visibles();
  for (const i of [1, 2, 3, 4]) assert.ok(v.has(i), 'hoja ' + i);
  assert.ok(!v.has(0) && !v.has(g.n));
  e.avanzar(); e.actualizar(0.1);
  assert.ok(e.visibles().has(3), 'la hoja en movimiento siempre se dibuja');
});

test('cartas tocables: solo las dos hojas superiores, y ninguna con el álbum cerrado o en animación', () => {
  const g = geo(), e = new EstadoAlbum(g);
  assert.deepEqual(e.tocables(), []);
  e.irA(1); assert.deepEqual(e.tocables(), [{ hoja: 1, cara: 'F' }]);
  e.irA(3); assert.deepEqual(e.tocables(), [{ hoja: 2, cara: 'D' }, { hoja: 3, cara: 'F' }]);
  e.irA(g.elementos); assert.deepEqual(e.tocables(), [{ hoja: g.n, cara: 'D' }]);
  e.irA(2); e.avanzar(); e.actualizar(0.1); assert.deepEqual(e.tocables(), []);
});

test('texturas necesarias: frente en la derecha, dorso en la izquierda, ambas para la que gira; no se piden las enterradas', () => {
  const g = geo(), e = new EstadoAlbum(g);
  e.irA(3);
  const r = e.carasNecesarias(1);
  assert.ok(r.some((x) => x.hoja === 2 && x.cara === 'D'));
  assert.ok(r.some((x) => x.hoja === 3 && x.cara === 'F'));
  assert.ok(!r.some((x) => x.hoja === g.n), 'la hoja enterrada no carga texturas');
  assert.ok(r.length <= 4);
  e.avanzar(); e.actualizar(0.3);
  const m = e.carasNecesarias(1);
  assert.ok(m.some((x) => x.hoja === 3 && x.cara === 'F') && m.some((x) => x.hoja === 3 && x.cara === 'D'));
});

test('analizarNombre', () => {
  assert.deepEqual(analizarNombre('Hoja_2_F_Bolsillo_4'), { hoja: 3, cara: 'F', tipo: 'Bolsillo', k: 4 });
  assert.deepEqual(analizarNombre('Hoja_0_D_Carta_8'), { hoja: 1, cara: 'D', tipo: 'Carta', k: 8 });
  assert.equal(analizarNombre('Tapa'), null);
});

test('memoria de textura 256x358 con mipmaps ≈ 0,49 MB', () => {
  assert.equal(memoriaTexturaBytes(256, 358, false), 256 * 358 * 4);
  assert.ok(Math.abs(memoriaTexturaBytes(256, 358) / 1048576 - 0.4667) < 0.01);
});

test('medidor de FPS: media, mínimo y descarte de pausas', () => {
  const m = new MedidorFps();
  for (let i = 0; i < 59; i++) m.marca(16);
  m.marca(32); m.marca(2000);        // la pausa de 2 s no cuenta
  const r = m.resumen();
  assert.equal(r.muestras, 60); assert.ok(r.fps > 58 && r.fps < 63); cerca(r.fpsMin, 31.25, 1e-6);
});

test('cámara: el arrastre queda limitado (giro ligero) y la transición llega exacta', () => {
  const o = new OrbitaLigera();
  o.arrastrar(-1e6, -1e6, 400);
  assert.ok(Math.abs(o.az) <= 14 * Math.PI / 180 + 1e-9);
  assert.ok(o.el >= 38 * Math.PI / 180 - 1e-9 && o.el <= 78 * Math.PI / 180 + 1e-9);
  o.llevarA({ az: 0, el: 1.2, radio: 0.2, objetivo: [0.1, 0, 0] }, 0.5);
  o.arrastrar(100, 100, 400);        // ignorado durante la transición
  o.actualizar(0.25); assert.ok(o.tween);
  o.actualizar(0.3);
  assert.equal(o.tween, null); cerca(o.el, 1.2); cerca(o.radio, 0.2); cerca(o.objetivo[0], 0.1);
  const p = o.posicion(); assert.ok(p[1] > 0);
});
