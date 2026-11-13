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

test('M1 elegirAcabado: valores válidos, mayúsculas y por defecto tejido (el preferido del usuario)', () => {
  for (const n of Object.keys(A.ACABADOS)) assert.equal(A.elegirAcabado(n), n);
  assert.equal(A.elegirAcabado('CUERO'), 'cuero'); assert.equal(A.elegirAcabado('x'), 'tejido'); assert.equal(A.elegirAcabado(null), 'tejido'); assert.equal(A.ACABADO_DEFECTO, 'tejido'); assert.equal(A.elegirAcabado('grafito'), 'grafito');
  assert.equal(A.elegirAcabado('toString'), 'tejido', 'no se cuelan propiedades heredadas');
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

test('M9 modelo refinado (3.7.6): misma estructura y dimensiones que antes, más suave y dentro del presupuesto', async () => {
  const m = await crearMundo(), a = m.album;
  for (const n of ['Album', 'Contratapa', 'Lomo', 'Tapa', 'Tapa_Malla', 'Hoja_0', 'Hoja_8', 'Hoja_0_Losa', 'Hoja_0_F_Soldaduras', 'Hoja_0_D_Funda', 'Hoja_8_D_Bolsillo_8']) assert.ok(a.nodo.get(n), n);
  assert.equal(a.geo.n, 9); assert.equal(a.params.ancho_tapa, 0.258); assert.equal(a.params.paso, 0.0035);
  const c = a.cajaMalla('Tapa_Malla');                                  // el bisel se talla hacia dentro: la caja exterior no cambia (258 × 322 mm, 6 mm)
  assert.ok(Math.abs((c.max[0] - c.min[0]) - 0.258) < 1e-4 && Math.abs((c.max[2] - c.min[2]) - 0.322) < 1e-4 && Math.abs((c.max[1] - c.min[1]) - 0.006) < 1e-5);
  const l = a.cajaMalla('Lomo'); assert.ok(Math.abs(l.max[1] - 0.0435) < 1e-5 && Math.abs(l.min[1]) < 1e-6, 'el lomo conserva su altura (la cara superior coincide con la de la tapa)');
  const tris = (n) => { const g = a.nodo.get(n).geometry; return g.index.count / 3; };
  assert.ok(tris('Tapa_Malla') > 800 && tris('Lomo') > 800 && tris('Hoja_0_Losa') > 300, 'bordes biselados (ya no son losas de ~100 triángulos)');
  const n = a.nodo.get('Tapa_Malla').geometry.attributes.normal; let inclinadas = 0;
  for (let i = 0; i < n.count; i++) { const y = Math.abs(n.getY(i)); if (y > 0.05 && y < 0.95) inclinadas++; }
  assert.ok(inclinadas > 100, 'hay normales intermedias (bisel suave, no aristas vivas)');
  assert.ok(a.contarEscena({ soloVisibles: false }).triangulos < 40000, 'presupuesto para iPhone');
});

test('M10 estilo carpeta de cuero: banda y panel en la tapa, SIN costuras (3.7.9) ni pestañas (3.7.8)', async () => {
  const m = await crearMundo(), a = m.album;
  for (const n of ['Tapa_Banda', 'Tapa_Panel']) assert.ok(a.nodo.get(n), n);
  assert.equal(a.nodo.get('Tapa_Banda').material.name, 'Cubierta', 'comparten material (y por tanto el relieve y el acabado ?tapa=) con la tapa');
  assert.ok(!a.nodo.get('Tapa_Costura'), 'sin costuras');
  for (let i = 0; i < 9; i++) assert.ok(!a.nodo.get('Hoja_' + i + '_Pestana_Losa'), 'sin pestaña en la hoja ' + i);
});

test('M11 construcción física (3.7.9): el lomo sigue el grosor de las pilas y cada hoja lleva su canto de encuadernación', async () => {
  const m = await crearMundo(), a = m.album, g = a.geo, p = a.params;
  const alto = (v) => { a.estado.irA(v); a.aplicar(); const b = a.lomo.geometry.boundingBox; return (b.max.y - b.min.y) * a.lomo.scale.y; };
  assert.ok(Math.abs(alto(0) - 0.0435) < 1e-6, 'cerrado: abarca todo el álbum');
  const hs = [...Array(g.elementos + 1).keys()].map(alto);
  assert.ok(hs[4] < hs[0] && hs[5] < hs[0], 'abierto por la mitad: lomo más bajo que cerrado');
  for (let v = 0; v <= g.elementos; v++) {
    a.estado.irA(v); a.aplicar();
    const izq = Math.max(...a.elemento.map((e, i) => (a.estado.progreso[i] >= 1 ? a.elemento[i].position.y : 0))), der = Math.max(...a.elemento.map((e, i) => (a.estado.progreso[i] <= 0 ? a.elemento[i].position.y : 0)));
    assert.ok(hs[v] + 1e-4 >= Math.max(izq, der), 'v=' + v + ': el lomo nunca queda por debajo de la pila más alta');
  }
  a.estado.irA(4); a.estado.avanzar(); let prev = alto(4), salto = 0;           // continuo mientras gira una hoja
  for (let k = 0; k < 30; k++) { a.estado.actualizar(0.03); a.aplicar(); const h = a.lomo.geometry.boundingBox.max.y * a.lomo.scale.y; salto = Math.max(salto, Math.abs(h - prev)); prev = h; }
  assert.ok(salto < 0.0012, 'sin saltos bruscos al girar (máx ' + salto.toFixed(5) + ')');
  for (let i = 0; i < 9; i++) { const b = a.nodo.get('Hoja_' + i + '_Bisagra_Losa'); assert.ok(b && b.material.name === 'Hoja', 'bisagra ' + i); }
  const cb = a.cajaMalla('Hoja_0_Bisagra_Losa'); assert.ok(Math.abs(cb.max[0] + cb.min[0]) < 1e-6 && cb.max[0] > 0.0012, 'barril centrado en el eje del lomo y más grueso que la hoja');
});
