// Fase 3.7.5 — cristal visionOS, movimiento tipo muelle, aro con entrada y acabados táctiles de tapa. Three.js SIMULADO: valida cableado y matemática,
// NO el aspecto en GPU (eso queda para las capturas reales del iPhone).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearMundo, T } from './mundo.mjs';
const A = await import('../js/aspecto.js');
const css = readFileSync(new URL('../css/prueba-3d.css', import.meta.url), 'utf8');
const bloque = css.slice(css.indexOf('3.7.5 ·'));
const nuevo = async (tapa, nivel = 'media') => {
  const m = await crearMundo(); const scene = new T.Object3D();
  const asp = new A.Aspecto({ renderer: {}, scene, nivel, tema: 'claro', tapa }); asp.aplicarAlbum(m.album);
  return { m, asp, a: m.album };
};

test('M1 elegirAcabado: valores válidos, mayúsculas y por defecto grafito', () => {
  for (const n of Object.keys(A.ACABADOS)) assert.equal(A.elegirAcabado(n), n);
  assert.equal(A.elegirAcabado('CUERO'), 'cuero'); assert.equal(A.elegirAcabado('x'), 'grafito'); assert.equal(A.elegirAcabado(null), 'grafito');
  assert.equal(A.elegirAcabado('toString'), 'grafito', 'no se cuelan propiedades heredadas');
});

test('M2 relieves: periódicos, en [0,1], distintos entre sí y sin cambiar el grano de siempre', () => {
  const base = A.alturaRelieve(32), ref = A.alturaRelieve(32, 7, 'grano');
  assert.deepEqual([...base], [...ref]);
  const vistos = new Set();
  for (const t of ['fieltro', 'cuero', 'tejido', 'acolchado']) {
    const h = A.alturaRelieve(64, 7, t);
    assert.ok(h.every((v) => v >= 0 && v <= 1), t);
    const media = h.reduce((x, y) => x + y, 0) / h.length, varz = h.reduce((x, y) => x + (y - media) ** 2, 0) / h.length;
    assert.ok(varz > 1e-3, t + ' tiene relieve (no es plano)');
    vistos.add(h.slice(0, 200).join());
    const n = A.generarNormales(64, 2, 7, t);                                   // sin costuras: la normal de la fila 0 y de la última son coherentes (periódica)
    assert.equal(n.length, 64 * 64 * 4); assert.ok(n.every((v, i) => i % 4 !== 3 || v === 255));
  }
  assert.equal(vistos.size, 4, 'los cuatro relieves son distintos');
});

test('M3 acabado cuero: tapas y lomo cambian de color/rugosidad/relieve; páginas y soldadura no se tocan; el lomo hereda tono, no color de tapa', async () => {
  const g = await nuevo('grafito'), c = await nuevo('cuero');
  const mc = c.a.nodo.get('Tapa_Malla').material, mg = g.a.nodo.get('Tapa_Malla').material, ml = c.a.nodo.get('Lomo').material;
  assert.notEqual(mc.color.v, mg.color.v); assert.equal(mc.color.v, A.ACABADOS.cuero.color); assert.equal(ml.color.v, A.ACABADOS.cuero.lomo);
  assert.equal(mc.roughness, A.ACABADOS.cuero.rugosidad); assert.equal(mc.normalScale.x, A.ACABADOS.cuero.relieve);
  assert.ok(ml.normalScale.x < mc.normalScale.x, 'lomo más liso');
  assert.equal(c.a.nodo.get('Hoja_0_Losa').material.color.v, g.a.nodo.get('Hoja_0_Losa').material.color.v, 'las hojas no cambian');
  assert.equal(c.asp.resumen().tapa, 'cuero'); assert.equal(g.asp.resumen().tapa, 'grafito');
});

test('M4 grafito = comportamiento anterior; baja calidad: color y rugosidad del acabado siguen sin mapas', async () => {
  const g = await nuevo(undefined), mg = g.a.nodo.get('Tapa_Malla').material;
  assert.equal(mg.color.v, A.TEMAS.claro.paleta.cubierta);
  const b = await nuevo('fieltro', 'baja'), mb = b.a.nodo.get('Tapa_Malla').material;
  assert.equal(mb.color.v, A.ACABADOS.fieltro.color); assert.ok(!mb.normalMap, 'en baja no hay mapa de normales');
});

test('M5 todos los acabados: crea recursos propios y liberar() los libera sin fallos', async () => {
  for (const t of Object.keys(A.ACABADOS)) { const { asp } = await nuevo(t, 'alta'); assert.doesNotThrow(() => asp.liberar(), t); }
});

test('M6 aro: entrada con rebote (escala 1,22 → sobrepasa → 1), solo escala y opacidad; reduce-movimiento = instantáneo', async () => {
  const { escalaEntrada, Resaltado } = await import('../js/resaltado.js');
  assert.ok(Math.abs(escalaEntrada(0) - 1.22) < 1e-9); assert.ok(Math.abs(escalaEntrada(1) - 1) < 1e-9);
  const m = Array.from({ length: 101 }, (_, i) => escalaEntrada(i / 100)); assert.ok(Math.min(...m) < 1, 'sobrepasa por debajo de 1 (rebote)'); assert.ok(Math.min(...m) > 0.9, 'rebote pequeño');
  const nodo = new T.Object3D(); nodo.userData = { cara: 'F' };
  const r = new Resaltado({ reducirMovimiento: () => false }); r.mostrar(nodo);
  assert.ok(r.malla.scale.x > 1.2); let n = 0; while (r.avanzar(1 / 60) && n++ < 200);
  assert.ok(Math.abs(r.malla.scale.x - 1) < 1e-9 && Math.abs(r.mat.opacity - 0.95) < 1e-6 && !r.avanzar(1 / 60), 'termina y deja de pedir frames');
  const q = new Resaltado({ reducirMovimiento: () => true }); q.mostrar(nodo);
  assert.equal(q.malla.scale.x, 1); assert.equal(q.mat.opacity, 0.95);
});

test('M7 CSS: muelles, entrada/salida de ficha, brillo especular, hover solo con ratón y reduce-movimiento', () => {
  for (const k of ['--muelle', '@keyframes ficha-entra', '@keyframes ficha-sale', '.ficha.saliendo', '--brillo', '@media (hover: hover)', 'prefers-reduced-motion: reduce']) assert.ok(bloque.includes(k), k);
  assert.match(bloque, /cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)/);
  assert.match(bloque, /ficha-sale 0\.22s/, 'la salida dura lo mismo que SALIDA_MS');
  assert.ok(!/body\[data-tema="(noche|acogedor)"\]/.test(bloque), 'solo afecta al tema claro');
});

test('M8 FichaUI.cerrar: sin animación se oculta al instante; con animación espera SALIDA_MS y reabrir cancela la salida', async () => {
  const { FichaUI, SALIDA_MS } = await import('../js/ficha-ui.js');
  assert.equal(SALIDA_MS, 220);
  const cls = () => { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), has: (c) => s.has(c), toggle(c, b) { b ? s.add(c) : s.delete(c); } }; };
  const mk = () => ({ hidden: true, isConnected: true, classList: cls(), dataset: {}, onclick: null, textContent: '', focus() {}, replaceChildren() {}, append() {}, disabled: false });
  const el = { raiz: mk(), fondo: mk(), cerrar: mk(), anadir: mk(), retirar: mk(), imagen: mk(), nombre: mk(), expansion: mk(), numero: mk(), cantidad: mk(), estadoTxt: mk(), error: mk() };
  const body = cls(); globalThis.document = { body: { classList: body }, createElement: () => mk() }; globalThis.Image = class { set src(v) {} };
  const d = { id: 'x', nombre: 'N', expansion: 'E', numero: 1, pagina: 1, posicion: 1, cantidad: 0 };
  const f = new FichaUI(el, { alCerrar() {}, alAnadir() {}, alRetirar() {} });
  globalThis.getComputedStyle = () => ({ animationName: 'none' });
  f.abrir(d); assert.equal(el.raiz.hidden, false); f.cerrar(); assert.equal(el.raiz.hidden, true, 'sin animación: instantáneo'); assert.ok(!body.has('ficha-abierta'));
  globalThis.getComputedStyle = () => ({ animationName: 'ficha-entra' });
  f.abrir(d); f.cerrar(); assert.equal(el.raiz.hidden, false); assert.ok(el.raiz.classList.has('saliendo'));
  f.abrir(d); assert.ok(!el.raiz.classList.has('saliendo'), 'reabrir cancela la salida'); await new Promise((r) => setTimeout(r, SALIDA_MS + 60)); assert.equal(el.raiz.hidden, false, 'no se oculta tras reabrir');
  f.cerrar(); await new Promise((r) => setTimeout(r, SALIDA_MS + 60)); assert.equal(el.raiz.hidden, true); assert.ok(!el.raiz.classList.has('saliendo'));
  delete globalThis.getComputedStyle;
});
