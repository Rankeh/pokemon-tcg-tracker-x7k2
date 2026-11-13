// Fase 3.7.3 (primera pasada) — tema «acogedor» de videojuego: paleta cálida, luces, escenario (suelo + alfombra), marcadores e interfaz.
// Three.js SIMULADO: valida configuración y cableado; el aspecto real depende de una comprobación visual en navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearMundo, T } from './mundo.mjs';
const A = await import('../js/aspecto.js');
const M = await import('../js/marcadores.js');
const leer = (r) => readFile(new URL(r, import.meta.url), 'utf8');
const montar = async (nivel, tema) => { const m = await crearMundo(); const scene = new T.Object3D(); const asp = new A.Aspecto({ renderer: {}, scene, nivel, tema }); asp.aplicarAlbum(m.album); return { m, scene, asp, a: m.album }; };
const lum = (c) => A.luminanciaSrgb(c);

test('T1 elegirTema: acogedor por defecto, noche si se pide, valores raros → acogedor; Aspecto sin tema conserva el grafito de 3.7.2', () => {
  assert.equal(A.elegirTema(null), 'acogedor'); assert.equal(A.elegirTema('noche'), 'noche'); assert.equal(A.elegirTema('NOCHE'), 'noche'); assert.equal(A.elegirTema('zzz'), 'acogedor');
  assert.deepEqual(A.NOMBRES_TEMA.sort(), ['acogedor', 'noche']); assert.equal(A.TEMAS.noche.paleta, A.PALETA);
});

test('T2 acogedor: materiales con la paleta cálida (cubierta teal, hojas crema, lomo caramelo, marcos tostados) y luces cálidas con exposición propia', async () => {
  const { a, asp, scene } = await montar('media', 'acogedor'); const P = A.TEMAS.acogedor.paleta;
  assert.equal(a.nodo.get('Tapa_Malla').material.color.v, P.cubierta); assert.equal(a.nodo.get('Hoja_0_Losa').material.color.v, P.pagina);
  assert.equal(a.nodo.get('Lomo').material.color.v, P.lomo); assert.equal(a.nodo.get('Hoja_0_F_Soldaduras').material.color.v, P.soldadura);
  assert.notEqual(P.cubierta, A.PALETA.cubierta);
  const L = asp.luces; assert.equal(L.hemi.args[0], A.TEMAS.acogedor.luces.hemi.cielo); assert.equal(L.principal.args[0], 0xffe3bd); assert.equal(asp.renderer.toneMappingExposure, 1.08);
  assert.equal(scene.children.filter((o) => o.args).length, 4); assert.equal(asp.resumen().tema, 'acogedor');
});

test('T3 escenario: suelo de madera que se desvanece + alfombra redonda (2 planos, 2 texturas sRGB), ordenados antes de la sombra, sin mesa plana', async () => {
  const { asp, scene } = await montar('media', 'acogedor');
  const suelo = scene.children.find((o) => o.name === 'Suelo'), alf = scene.children.find((o) => o.name === 'Alfombra');
  assert.ok(suelo && alf && !scene.children.find((o) => o.name === 'Mesa'));
  assert.ok(suelo.renderOrder < alf.renderOrder && alf.renderOrder < asp.sombra.renderOrder, 'orden de dibujo: suelo < alfombra < sombra');
  assert.ok(suelo.position.y < alf.position.y && alf.position.y < asp.sombra.position.y && asp.sombra.position.y < 0, 'capas sin cruzarse, todas bajo el álbum');
  for (const o of [suelo, alf]) { assert.equal(o.material.transparent, true); assert.equal(o.material.depthWrite, false); assert.equal(o.material.map.colorSpace, T.SRGBColorSpace); }
  const px = (t, i, j) => { const n = t.ancho; return [...t.datos.slice((j * n + i) * 4, (j * n + i) * 4 + 4)]; };
  const sa = suelo.material.map, aa = alf.material.map;
  assert.equal(px(sa, 64, 64)[3], 255); assert.equal(px(sa, 0, 0)[3], 0, 'suelo transparente en la esquina: se ve el fondo con bokeh'); assert.equal(px(aa, 128, 128)[3], 255); assert.equal(px(aa, 0, 0)[3], 0, 'la alfombra es redonda');
  assert.ok(px(aa, 128, 128)[0] > 220, 'centro crema'); const anillo = px(aa, 128 + 100, 128); assert.ok(anillo[0] > anillo[2], 'anillo rosado/cálido');
  assert.ok(Math.max(...[...asp.sombra.material.map.datos].filter((_, i) => i % 4 === 3)) <= 0.41 * 255, 'sombra más ligera sobre superficie clara');
  const noche = await montar('media', 'noche'); assert.ok(noche.scene.children.find((o) => o.name === 'Mesa') && !noche.scene.children.find((o) => o.name === 'Alfombra'), 'noche: sigue la mesa de siempre');
  const leg = await montar('legado', 'acogedor'); assert.ok(leg.scene.children.find((o) => o.name === 'Mesa') && !leg.asp.alfombra, 'legado = línea base sin tocar');
});

test('T4 legibilidad del tema (estimación analítica, NO medición): hojas claras sin quemarse, cubierta y lomo claramente distintos, marcos más oscuros que la hoja, aro naranja visible', () => {
  const t = A.TEMAS.acogedor, o = { luces: t.luces, exposicion: t.exposicion, activas: ['hemi', 'principal', 'relleno'] }, E = (h) => A.estimarSalida(h, o);
  const pag = E(t.paleta.pagina), cub = E(t.paleta.cubierta), lomo = E(t.paleta.lomo), sol = E(t.paleta.soldadura);
  assert.ok(Math.max(...pag) < 0.93, 'página crema sin quemarse'); assert.ok(lum(pag) > 0.6, 'página luminosa'); assert.ok(Math.abs(lum(pag) - lum(cub)) > 0.2, 'hoja ≠ cubierta');
  assert.ok(lomo[0] > lomo[2] * 2, 'lomo cálido (caramelo)'); assert.ok(cub[2] > cub[0] * 2, 'cubierta fría (teal)'); assert.ok(lum(sol) < lum(pag) * 0.85, 'marco de bolsillo más oscuro que la hoja: se lee el hueco');
  const ring = A.hexLineal(t.aro); assert.ok(ring[0] > 0.5 && ring[2] < 0.05, 'aro naranja intenso, no neón blanco');
  assert.ok(A.TEMAS.acogedor.cantos.pagina.canto[2] < A.TEMAS.acogedor.cantos.pagina.canto[0], 'canto de hoja dorado');
});

test('T5 marcadores: huecos pendientes en beis con texto marrón (acogedor) y vuelta al tema noche', () => {
  const usados = []; const ctx = new Proxy({}, { get: () => () => ({ width: 10 }), set: (_, k, v) => { if (k === 'fillStyle') usados.push(v); return true; } });
  M.fijarTemaMarcadores('acogedor'); M.dibujarEtiquetaPendiente({ getContext: () => ctx }, 128, 179, { nombre: 'Pikachu', numero: '25' });
  const L = (h) => { const n = parseInt(h.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  assert.ok(L(usados[0]) > 0.7 && L(usados[0]) < 0.9, 'placa beis: más oscura que la hoja crema, pero clara'); assert.ok(L(usados[1]) < 0.35, 'nombre en marrón oscuro: contraste alto');
  usados.length = 0; M.fijarTemaMarcadores('noche'); M.dibujarEtiquetaPendiente({ getContext: () => ctx }, 128, 179, { nombre: 'Pikachu', numero: '25' });
  assert.ok(L(usados[0]) < 0.2, 'noche restaurado');
});

test('T6 liberar() del tema acogedor devuelve a cero texturas y materiales propios', async () => {
  const m = await crearMundo(), sc = new T.Object3D();
  const t0 = T.stats.texturasCreadas - T.stats.texturasLiberadas, m0 = T.stats.materiales - T.stats.materialesLiberados;
  const asp = new A.Aspecto({ renderer: {}, scene: sc, nivel: 'alta', tema: 'acogedor' }); asp.aplicarAlbum(m.album); const n = asp.recursos.length; asp.liberar();
  assert.equal(T.stats.texturasCreadas - T.stats.texturasLiberadas, t0); assert.equal(sc.children.length, 0); assert.ok(n >= 8, 'suelo, alfombra, sombra, relieve, rugosidad, reflejo…');
});

test('T7 interfaz: reglas del tema en CSS (paneles crema, botones con sombra, verde/azul/naranja, tipografía redondeada), tema aplicado desde la URL y aro/marcadores cableados', async () => {
  const css = await leer('../css/prueba-3d.css'), html = await leer('../index.html'), main = await leer('../js/main.js');
  for (const r of ['body[data-tema="acogedor"] h1', 'body[data-tema="acogedor"] button.principal', 'body[data-tema="acogedor"] .ficha', 'ui-rounded', '--crema', 'radial-gradient']) assert.ok(css.includes(r), r);
  assert.ok(!/backdrop-filter|filter:\s*blur/.test(css), 'sin desenfoques costosos: el bokeh es solo degradados');
  assert.ok(html.includes("dataset.tema = t === 'noche' ? 'noche' : 'acogedor'")); assert.ok(/elegirTema\(params\.get\('tema'\)\)/.test(main) && /fijarTemaMarcadores\(tema\)/.test(main) && /color: TEMAS\[tema\]\.aro/.test(main));
  assert.ok(css.indexOf('body[data-tema="acogedor"]') > css.indexOf('.ficha-abierta .barra'), 'el tema solo sobrescribe, no reemplaza la estructura');
});
