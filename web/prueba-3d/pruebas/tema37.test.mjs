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

test('T1 elegirTema: claro por defecto, acogedor/noche si se piden, valores raros → claro; Aspecto sin tema conserva el grafito de 3.7.2', () => {
  assert.equal(A.elegirTema(null), 'claro'); assert.equal(A.elegirTema('acogedor'), 'acogedor'); assert.equal(A.elegirTema('noche'), 'noche'); assert.equal(A.elegirTema('NOCHE'), 'noche'); assert.equal(A.elegirTema('zzz'), 'claro');
  assert.deepEqual([...A.NOMBRES_TEMA].sort(), ['acogedor', 'claro', 'noche']); assert.equal(A.TEMAS.noche.paleta, A.PALETA);
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
  const sinClaro = css.slice(0, css.indexOf('TEMA «CLARO»')); assert.ok(!/backdrop-filter|filter:\s*blur/.test(sinClaro), 'noche y acogedor: sin desenfoques');
  const vidrio = [...css.matchAll(/([^{}]+)\{[^{}]*backdrop-filter[^{}]*\}/g)].map((m) => m[1].trim()).filter((x) => !x.startsWith('@supports')); assert.ok(vidrio.length <= 4 && vidrio.every((x) => /data-tema="claro"\]\s+(h1|\.barra|\.ficha)$/.test(x)), 'el vidrio esmerilado solo en cabecera, barra y ficha del tema claro: ' + vidrio.join(' | '));
  assert.ok(html.includes("t === 'noche' || t === 'acogedor' ? t : 'claro'")); assert.ok(/elegirTema\(params\.get\('tema'\)\)/.test(main) && /fijarTemaMarcadores\(tema\)/.test(main) && /color: TEMAS\[tema\]\.aro/.test(main));
  assert.ok(css.indexOf('body[data-tema="acogedor"]') > css.indexOf('.ficha-abierta .barra'), 'el tema solo sobrescribe, no reemplaza la estructura');
});

// ======================================================================= 3.7.4: tema CLARO (Apple) + correcciones de «clipping»
test('T8 CAUSA del clipping en el lomo (medida en el GLB): la cara superior del lomo coincide con la de la tapa cerrada → z-fighting; se empuja el lomo atrás con polygonOffset', async () => {
  const m = await crearMundo(); const a = m.album;
  const lomo = a.cajaMalla('Lomo'), tapa = a.nodo.get('Tapa'), tap = a.cajaMalla('Tapa_Malla');
  a.estado.irA(0); a.aplicar(); const { aabbMundo } = await import('../js/encuadre.js');
  const yLomo = aabbMundo(a.cajaMalla('Lomo')).y[1], yTapa = aabbMundo(a.cajaMalla('Tapa_Malla')).y[1];
  assert.ok(Math.abs(yLomo - yTapa) < 1e-6, `cerrado: techo del lomo ${yLomo} == techo de la tapa ${yTapa} (coplanares)`);
  const { asp } = await montar('media', 'claro'); const mat = asp.recursos; const lm = (await montar('media', 'claro')).a.nodo.get('Lomo').material;
  assert.equal(lm.polygonOffset, true); assert.ok(lm.polygonOffsetFactor >= 1 && lm.polygonOffsetUnits >= 1);
  const cub = (await montar('media', 'claro')).a.nodo.get('Tapa_Malla').material; assert.ok(!cub.polygonOffset, 'la tapa no se desplaza: es la que gana');
});

test('T9 CAUSA de los marcos negros: vertexColors solo en materiales cuyas geometrías tienen color de vértice (sin atributo, Three pinta negro)', async () => {
  for (const tema of ['claro', 'acogedor', 'noche']) for (const nivel of ['baja', 'media', 'alta']) {
    const { a } = await montar(nivel, tema); const malla = new Set(); a.escena.traverse((o) => { if (o.isMesh && o.material.vertexColors) malla.add(o); });
    for (const o of malla) assert.ok(o.geometry.attributes.color && o.geometry.attributes.color.count === o.geometry.attributes.position.count, `${tema}/${nivel}: ${o.name} usa vertexColors y tiene color`);
    for (const n of ['Hoja_0_F_Soldaduras', 'Hoja_0_F_Funda']) assert.ok(!a.nodo.get(n).material.vertexColors, `${tema}/${nivel}: ${n} sin vertexColors`);
  }
});

test('T10 tema claro: grafito + blanco roto, sin color saturado; escenario = suelo perla sin alfombra; marcos más oscuros que la hoja; aro azul del sistema', async () => {
  const { asp, scene } = await montar('media', 'claro'); const t = A.TEMAS.claro;
  assert.ok(scene.children.find((o) => o.name === 'Suelo') && !scene.children.find((o) => o.name === 'Alfombra') && !asp.alfombra, 'sin alfombra');
  const sat = (h) => { const [r, g, b] = [(h >> 16) & 255, (h >> 8) & 255, h & 255]; return Math.max(r, g, b) - Math.min(r, g, b); };
  for (const [n, h] of Object.entries(t.paleta)) assert.ok(sat(h) <= 40, `${n} poco saturado (${sat(h)})`);
  const o = { luces: t.luces, exposicion: t.exposicion, activas: ['hemi', 'principal', 'relleno'] }, E = (h) => lum(A.estimarSalida(h, o));
  assert.ok(E(t.paleta.pagina) > 0.75 && E(t.paleta.pagina) < 0.93, 'página luminosa sin quemarse'); assert.ok(E(t.paleta.cubierta) < 0.2 && E(t.paleta.cubierta) > 0.08, 'cubierta oscura con detalle');
  assert.ok(E(t.paleta.soldadura) < E(t.paleta.pagina) - 0.12, 'marco de bolsillo legible sobre la hoja'); assert.ok(E(t.paleta.lomo) > E(t.paleta.cubierta), 'lomo algo más claro');
  assert.ok(Math.abs(E(t.paleta.mesa) - 0.82) < 0.1, 'el suelo es gris perla claro, como el fondo'); assert.equal(t.aro, 0x0a84ff);
  const sombra = Math.max(...[...asp.sombra.material.map.datos].filter((_, i) => i % 4 === 3)); assert.ok(sombra <= 0.33 * 255);
  const px = (tx, i, j) => [...tx.datos.slice((j * tx.ancho + i) * 4, (j * tx.ancho + i) * 4 + 4)]; const sa = scene.children.find((o) => o.name === 'Suelo').material.map;
  assert.ok(px(sa, 10, 64).slice(0, 3).every((v, k) => Math.abs(v - px(sa, 11, 64)[k]) <= 2), 'sin tablones: color continuo (solo viñeta suave)'); assert.equal(px(sa, 64, 64)[3], 255); assert.equal(px(sa, 0, 0)[3], 0);
});

test('T11 alfombra del tema acogedor: bordes antialias a 512 px (sin escalones al ampliar)', () => {
  const N = 512, d = A.generarAlfombra(N), px = (i, j) => [...d.slice((j * N + i) * 4, (j * N + i) * 4 + 4)];
  let salto = 0; for (let i = N / 2; i < N - 1; i++) { const a = px(i, N / 2), b = px(i + 1, N / 2); salto = Math.max(salto, Math.abs(a[0] - b[0]), Math.abs(a[3] - b[3])); }
  assert.ok(salto < 120, 'transiciones repartidas en varios píxeles (máx. salto ' + salto + ')'); assert.equal(d.length, N * N * 4); assert.equal(px(0, 0)[3], 0);
});

test('T12 marcadores del tema claro: placa gris hundida y texto casi negro', () => {
  const usados = []; const ctx = new Proxy({}, { get: () => () => ({ width: 10 }), set: (_, k, v) => { if (k === 'fillStyle') usados.push(v); return true; } });
  M.fijarTemaMarcadores('claro'); M.dibujarEtiquetaPendiente({ getContext: () => ctx }, 128, 179, { nombre: 'Pikachu', numero: '25' });
  const L = (h) => { const n = parseInt(h.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  assert.ok(L(usados[0]) > 0.75 && L(usados[0]) < 0.9); assert.ok(L(usados[1]) < 0.25); M.fijarTemaMarcadores('noche');
});
