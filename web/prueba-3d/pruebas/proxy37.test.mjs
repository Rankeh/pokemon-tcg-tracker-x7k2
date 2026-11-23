// Proxies de las cartas sin imagen (las 5 promos de Teselia y, desde 3.33, 2 de Shinji Kanda): existen, tienen tamaño de mini, y el productor `mini` los usa solo si no hay copia oficial.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './mundo.mjs';   // registra los dobles de three
import { PROXIES, ARTE, rutaProxy } from '../js/proxies.js';

const raiz = new URL('../', import.meta.url);
const catalogo = JSON.parse(fs.readFileSync(new URL('../../../datos/catalogo/coleccion-teselia.json', import.meta.url), 'utf8'));
const cartas = Array.isArray(catalogo) ? catalogo : catalogo.cartas;

test('P1: cada carta sin imagen oficial tiene proxy (Teselia: las 5 promos), y solo esas', () => {
  const sin = cartas.filter((c) => c.estadoImagen === 'sin-imagen').map((c) => c.id).sort();
  assert.deepEqual(Object.keys(PROXIES).filter((id) => id.startsWith('svp-')).sort(), sin);
  assert.equal(sin.length, 5);
  assert.equal(rutaProxy('svp-1'), null);
});

test('P1b (3.33): en TODOS los álbumes, cada carta sin imagen en TCGdex tiene arte real o proxy, y los proxies son solo de cartas sin imagen', () => {
  const dir = new URL('../../../datos/catalogo/', import.meta.url), sin = new Set();
  for (const f of fs.readdirSync(dir).filter((n) => /^coleccion-.*\.json$/.test(n))) {
    for (const c of JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')).cartas) if (c.estadoImagen === 'sin-imagen') sin.add(c.id);
  }
  for (const id of sin) assert.ok(ARTE[id] || PROXIES[id], id + ': sin arte ni proxy');
  for (const id of Object.keys(PROXIES)) assert.ok(sin.has(id), id + ': tiene proxy pero sí tiene imagen');
  for (const id of Object.keys(ARTE)) assert.ok(sin.has(id), id + ': tiene arte descargado pero sí tiene imagen');
  for (const r of [...Object.values(PROXIES), ...Object.values(ARTE)]) assert.equal(r, r.toLowerCase(), 'nombre en minúsculas (GitHub Pages): ' + r);
});

test('P2: los PNG existen, son PNG de 256x358', () => {
  for (const ruta of Object.values(PROXIES)) {
    const b = fs.readFileSync(new URL(ruta, raiz));
    assert.equal(b.subarray(1, 4).toString(), 'PNG');
    assert.equal(b.readUInt32BE(16), 256); assert.equal(b.readUInt32BE(20), 358);
  }
});

test('P3: el catálogo no se ha tocado (158 cartas, imagen vacía en las 5)', () => {
  assert.equal(cartas.length, 158);
  assert.ok(cartas.filter((c) => c.estadoImagen === 'sin-imagen').every((c) => !c.imagen));
});

test('P4: sin copia oficial, el productor mini carga el proxy; con copia oficial usa la oficial; sin ninguna, rechaza', async () => {
  const { crearProductores } = await import('../js/texturas3d.js');
  const prod = crearProductores({ manifiesto: { cartas: { 'svp-1': { mini: 'x/svp-1.webp' } } }, crearLienzo: () => ({}) });
  const T = (await import('./mundo.mjs')).T; T.TextureLoader.falla = (u) => /arte\//.test(u);   // sin arte descargado
  const r = await prod.mini({ id: 'svp-208' })();
  T.TextureLoader.falla = null;
  assert.match(String(r.textura.url || r.textura.image?.src || ''), /proxies\/svp-208\.png/);
  const o = await prod.mini({ id: 'svp-1' })();
  assert.match(String(o.textura.url || ''), /x\/svp-1\.webp/);
  await assert.rejects(prod.mini({ id: 'zzz-1' })());
});

test('P5: con arte descargado el productor lo prefiere al proxy; sin él cae al proxy', async () => {
  const { crearProductores } = await import('../js/texturas3d.js');
  const T = (await import('./mundo.mjs')).T;
  const prod = crearProductores({ manifiesto: { cartas: {} }, crearLienzo: () => ({}) });
  T.TextureLoader.falla = (u) => /arte\//.test(u);
  assert.match((await prod.mini({ id: 'svp-209' })()).textura.url, /proxies\/svp-209\.png/);
  T.TextureLoader.falla = null;
  assert.match((await prod.mini({ id: 'svp-209' })()).textura.url, /arte\/svp-209\.png/);
});

test('P6: la ficha (panel de detalle) también usa arte/proxy cuando no hay copia oficial en el manifiesto', async () => {
  const { FichaUI } = await import('../js/ficha-ui.js');
  const cls = () => { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), has: (c) => s.has(c), toggle() {} }; };
  const mk = () => ({ hidden: true, isConnected: true, classList: cls(), dataset: {}, onclick: null, textContent: '', focus() {}, replaceChildren() {}, append() {}, disabled: false });
  const el = { raiz: mk(), fondo: mk(), cerrar: mk(), anadir: mk(), retirar: mk(), imagen: mk(), nombre: mk(), expansion: mk(), numero: mk(), cantidad: mk(), estadoTxt: mk(), error: mk() };
  globalThis.document = { body: { classList: cls() }, createElement: () => mk() };
  const srcs = [];
  globalThis.Image = class { set src(v) { srcs.push(v); } };
  const f = new FichaUI(el, { alCerrar() {}, alAnadir() {}, alRetirar() {} });
  const d = { id: 'svp-209', nombre: 'Thundurus', expansion: 'svp', numero: 209, pagina: 1, posicion: 1, cantidad: 0 };
  f.abrir(d);
  assert.match(srcs[0], /proxies\/arte\/svp-209\.png/, 'intenta primero el arte real');

  const d2 = { id: 'zzz-1', nombre: 'X', expansion: 'e', numero: 1, pagina: 1, posicion: 1, cantidad: 0 };
  el.imagen.replaceChildren = function () { this._marcador = true; }; el.imagen.append = function () { this._tuvoMarcador = true; };
  f.abrir(d2);
  assert.ok(el.imagen._tuvoMarcador, 'sin oficial, arte ni proxy: cae al marcador');
});

test('3.15 · toda carta sin imagen oficial en el manifiesto tiene arte descargado o proxy (archivo presente, nombre en minúsculas) en TODOS los álbumes', async () => {
  const { readFile, access } = await import('node:fs/promises');
  const { ARTE, rutasArte, rutaProxy } = await import('../js/proxies.js');
  const base = new URL('../', import.meta.url), raiz = new URL('../../../', import.meta.url);
  const manifiesto = JSON.parse(await readFile(new URL('assets/cartas/manifiesto.json', base), 'utf8')).cartas;
  for (const cat of ['coleccion-teselia.json', 'coleccion-asako-ito.json', 'coleccion-osare.json', 'coleccion-pikachu-30.json', 'coleccion-akira-egawa.json', 'coleccion-shinji-kanda.json']) {
    for (const c of JSON.parse(await readFile(new URL('datos/catalogo/' + cat, raiz), 'utf8')).cartas) {
      if (manifiesto[c.id]) continue;
      const rutas = [...rutasArte(c.id), rutaProxy(c.id)].filter(Boolean);
      assert.ok(rutas.length, `${cat}: ${c.id} no tiene imagen oficial, ni arte, ni proxy`);
      let alguna = false;
      for (const r of rutas) { try { await access(new URL(r, base)); alguna = true; } catch { /* siguiente */ } }
      assert.ok(alguna, `${cat}: ${c.id}: ningún archivo de ${rutas.join(', ')}`);
    }
  }
  for (const r of Object.values(ARTE)) assert.equal(r, r.toLowerCase(), 'nombre en minúsculas (GitHub Pages): ' + r);
  assert.deepEqual(rutasArte('swsh12.5gg-GG19'), ['assets/proxies/arte/swsh12.5gg-gg19.png']);
});
