// 3.25 — un solo tema (editorial): elección, escenario, marcadores, liberación y cableado de la interfaz; + correcciones de clipping y marcos negros (3.7.4).
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

test('T1 elegirTema: siempre editorial (los temas alternativos se retiraron en 3.25; ?tema=… antiguos no rompen)', () => {
  for (const v of [null, '', 'claro', 'noche', 'diorama', 'acogedor', 'zzz']) assert.equal(A.elegirTema(v), 'editorial');
  assert.deepEqual([...A.NOMBRES_TEMA], ['editorial']); assert.equal(A.TEMA_DEFECTO, 'editorial');
});

test('T2 escenario editorial: solo un suelo que se funde (sin alfombra, isla ni mesa), dibujado antes de la sombra', async () => {
  const { asp, scene } = await montar('media');
  const suelo = scene.children.find((o) => o.name === 'Suelo');
  assert.ok(suelo, 'suelo'); for (const n of ['Alfombra', 'Isla', 'Mesa']) assert.ok(!scene.children.find((o) => o.name === n), 'sin ' + n);
  assert.ok(suelo.renderOrder < asp.sombra.renderOrder && suelo.position.y < 0, 'suelo bajo el álbum y antes de la sombra');
  assert.equal(asp.resumen().tema, 'editorial');
});

test('T3 marcadores: paleta única grafito (placa oscura, nombre claro: contraste alto)', () => {
  const usados = []; const ctx = new Proxy({}, { get: () => () => ({ width: 10 }), set: (_, k, v) => { if (k === 'fillStyle') usados.push(v); return true; } });
  M.dibujarEtiquetaPendiente({ getContext: () => ctx }, 128, 179, { nombre: 'Pikachu', numero: '25' });
  const L = (h) => { const n = parseInt(h.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  assert.ok(L(usados[0]) < 0.2, 'placa oscura'); assert.ok(L(usados[1]) > 0.8, 'nombre claro');
});

test('T4 liberar() devuelve a cero texturas y vacía la escena', async () => {
  const m = await crearMundo(), sc = new T.Object3D();
  const t0 = T.stats.texturasCreadas - T.stats.texturasLiberadas;
  const asp = new A.Aspecto({ renderer: {}, scene: sc, nivel: 'alta' }); asp.aplicarAlbum(m.album); asp.liberar();
  assert.equal(T.stats.texturasCreadas - T.stats.texturasLiberadas, t0); assert.equal(sc.children.length, 0);
});

test('T5 interfaz: sin reglas ni hojas de los temas retirados; tema fijado en la página y aro/marcadores cableados', async () => {
  const css = await leer('../css/prueba-3d.css'), html = await leer('../index.html'), main = await leer('../js/main.js');
  for (const t of ['claro', 'acogedor', 'noche', 'diorama']) assert.ok(!css.includes(`data-tema="${t}"`), 'sin CSS del tema ' + t);
  assert.ok(css.includes('body[data-tema="editorial"]')); assert.ok(!html.includes('diorama'), 'sin hoja del diorama');
  assert.ok(html.includes("document.body.dataset.tema = 'editorial'")); assert.ok(/elegirTema\(/.test(main) && /color: TEMAS\[tema\]\.aro/.test(main));
});

// ======================================================================= 3.7.4: correcciones de «clipping»
test('T8 CAUSA del clipping en el lomo (medida en el GLB): la cara superior del lomo coincide con la de la tapa cerrada → z-fighting; se empuja el lomo atrás con polygonOffset', async () => {
  const m = await crearMundo(); const a = m.album;
  const lomo = a.cajaMalla('Lomo'), tapa = a.nodo.get('Tapa'), tap = a.cajaMalla('Tapa_Malla');
  a.estado.irA(0); a.aplicar(); const { aabbMundo } = await import('../js/encuadre.js');
  const yLomo = aabbMundo(a.cajaMalla('Lomo')).y[1], yTapa = aabbMundo(a.cajaMalla('Tapa_Malla')).y[1];
  assert.ok(Math.abs(yLomo - yTapa) < 1e-6, `cerrado: techo del lomo ${yLomo} == techo de la tapa ${yTapa} (coplanares)`);
  const { asp } = await montar('media', 'editorial'); const mat = asp.recursos; const lm = (await montar('media', 'editorial')).a.nodo.get('Lomo').material;
  assert.equal(lm.polygonOffset, true); assert.ok(lm.polygonOffsetFactor >= 1 && lm.polygonOffsetUnits >= 1);
  const cub = (await montar('media', 'editorial')).a.nodo.get('Tapa_Malla').material; assert.ok(!cub.polygonOffset, 'la tapa no se desplaza: es la que gana');
});

test('T9 CAUSA de los marcos negros: vertexColors solo en materiales cuyas geometrías tienen color de vértice (sin atributo, Three pinta negro)', async () => {
  for (const tema of ['editorial', 'acogedor', 'noche']) for (const nivel of ['baja', 'media', 'alta']) {
    const { a } = await montar(nivel, tema); const malla = new Set(); a.escena.traverse((o) => { if (o.isMesh && o.material.vertexColors) malla.add(o); });
    for (const o of malla) assert.ok(o.geometry.attributes.color && o.geometry.attributes.color.count === o.geometry.attributes.position.count, `${tema}/${nivel}: ${o.name} usa vertexColors y tiene color`);
    for (const n of ['Hoja_0_F_Soldaduras', 'Hoja_0_F_Funda']) assert.ok(!a.nodo.get(n).material.vertexColors, `${tema}/${nivel}: ${n} sin vertexColors`);
  }
});
