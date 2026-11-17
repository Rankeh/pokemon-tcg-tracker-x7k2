// Imágenes de cartas en GitHub Pages (prefijo /pokemon-tcg-tracker-x7k2/, sistema de archivos con mayúsculas): rutas relativas, archivos en el repo, nombres exactos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raiz = path.resolve(app, '../..');
const leer = (f) => fs.readFileSync(path.join(app, f), 'utf8');

test('IP1 · ninguna ruta de imagen es absoluta ni externa (funciona bajo cualquier prefijo)', () => {
  for (const f of ['js/texturas3d.js', 'js/ficha-ui.js', 'js/proxies.js']) {
    const rutas = [...leer(f).matchAll(/'(assets\/[^']*)'/g)].map((m) => m[1]);
    assert.ok(rutas.length > 0, f);
    for (const r of rutas) assert.ok(!r.startsWith('/') && !/^https?:/.test(r), f + ' ' + r);
  }
});

test('IP2 · los proxies/arte referenciados existen con el nombre EXACTO (mayúsculas incluidas)', () => {
  const dir = path.join(app, 'assets/proxies');
  const reales = new Set(fs.readdirSync(dir));
  for (const id of ['svp-208', 'svp-209', 'svp-210', 'svp-211', 'svp-212']) assert.ok(reales.has(id + '.png'), id);
});

test('IP3 · si existe manifiesto: cada archivo existe, en minúsculas y con el id del catálogo (sin 404)', () => {
  const m = path.join(app, 'assets/cartas/manifiesto.json');
  if (!fs.existsSync(m)) return;   // aún no generado: la app muestra marcadores y avisa por consola
  const man = JSON.parse(fs.readFileSync(m, 'utf8'));
  const cat = JSON.parse(fs.readFileSync(path.join(raiz, 'datos/catalogo/coleccion-teselia.json'), 'utf8'));
  const ids = new Set((cat.cartas || cat).filter((c) => c.imagen && c.estadoImagen !== 'sin-imagen').map((c) => c.id));
  assert.deepEqual([...ids].filter((i) => !man.cartas[i]), [], 'cartas sin imagen en el manifiesto');
  for (const [id, e] of Object.entries(man.cartas)) {
    for (const rel of [e.mini, e.grande]) {
      assert.equal(rel, rel.toLowerCase(), 'mayúsculas en ' + rel);
      const [carpeta, nombre] = rel.split('/');
      assert.ok(fs.readdirSync(path.join(app, 'assets/cartas', carpeta)).includes(nombre), 'falta ' + rel);   // comparación exacta, como hace Linux
      assert.ok(fs.statSync(path.join(app, 'assets/cartas', rel)).size > 1500, rel);
    }
  }
});

test('IP4 · el cargador avisa por consola si falta el manifiesto y no rompe', async () => {
  const { cargarManifiesto } = await import('../js/texturas3d.js').catch(() => ({}));
  if (!cargarManifiesto) return;   // sin 'three' en este entorno de pruebas
  const f = globalThis.fetch, w = console.warn; let avisos = 0;
  globalThis.fetch = async () => ({ ok: false, status: 404 }); console.warn = () => { avisos++; };
  try { assert.equal(await cargarManifiesto(), null); assert.equal(avisos, 1); } finally { globalThis.fetch = f; console.warn = w; }
});
