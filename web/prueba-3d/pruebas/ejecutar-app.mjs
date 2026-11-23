// 3.32 · Prueba de navegador de la APP INSTALABLE (PWA): manifiesto, service worker real (Chromium), qué guarda, que el álbum abre SIN
// CONEXIÓN, que el código y los datos se piden primero a la red (un cambio publicado se ve al momento) y que Supabase nunca se guarda.
// Three.js simulado (las rutas del contexto también interceptan las peticiones del service worker).
// Uso:  node web/prueba-3d/pruebas/ejecutar-app.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const cambiado = new Map();                                    // ruta → contenido nuevo (como si se hubiera publicado un cambio)
const servidor = http.createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (cambiado.has(p)) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(cambiado.get(p)); return; }
    const ruta = path.join(raiz, p.endsWith('/') ? p + 'index.html' : p);
    if (!ruta.startsWith(raiz)) throw new Error('fuera');
    const cuerpo = await readFile(ruta);
    res.writeHead(200, { 'Content-Type': tipos[path.extname(ruta)] || 'application/octet-stream' }); res.end(req.method === 'HEAD' ? undefined : cuerpo);
  } catch { res.writeHead(404); res.end('no'); }
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const { chromium } = createRequire(import.meta.url)('playwright');
const nav = await chromium.launch();
let fallos = 0, total = 0;
const ok = (c, msg) => { total++; console.log((c ? 'OK      ' : 'FALLO   ') + msg); if (!c) fallos++; };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const precache = JSON.parse(await readFile(path.join(raiz, 'precache.json'), 'utf8'));
const urlsMinis = () => precache.miniaturas.map((u) => new URL(u, base + '/').href);   // miniaturas + arte y proxies de cartas sin imagen
const manifiesto = JSON.parse(await readFile(path.join(raiz, 'manifest.webmanifest'), 'utf8'));

// ------------------------------------------------ manifiesto
ok(manifiesto.display === 'standalone' && manifiesto.start_url === './' && manifiesto.scope === './', 'manifiesto: pantalla completa, empieza y abarca toda la web');
for (const i of manifiesto.icons) {
  const b = await readFile(path.join(raiz, i.src)).catch(() => null);
  const w = b && b.readUInt32BE(16), h = b && b.readUInt32BE(20);
  ok(b && `${w}x${h}` === i.sizes, `icono ${i.src} (${i.sizes}${i.purpose === 'maskable' ? ', maskable' : ''})`);
}
ok(manifiesto.icons.some((i) => i.purpose === 'maskable') && manifiesto.icons.some((i) => i.sizes === '512x512'), 'icono de 512 px y versión «maskable» para Android');

const ctx = await nav.newContext({ serviceWorkers: 'allow' });
const doblesCdn = async (r) => {
  const u = r.request().url();
  if (u.includes('/build/three.module.js')) return r.fulfill({ contentType: 'text/javascript', body: `export * from '${base}/web/prueba-3d/pruebas/three-navegador.mjs';` });
  if (u.includes('/GLTFLoader.js')) return r.fulfill({ contentType: 'text/javascript', body: `export * from '${base}/web/prueba-3d/pruebas/gltfloader-doble.mjs';` });
  if (u.includes('@supabase')) return r.fulfill({ contentType: 'text/javascript', body: 'export function createClient() { return { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange() {} } }; }' });
  return r.fulfill({ contentType: 'text/javascript', body: 'export {};' });
};
await ctx.route('**/cdn.jsdelivr.net/**', doblesCdn);
await ctx.route('**/untiwlxjdklqjwjbvdym.supabase.co/**', (r) => r.fulfill({ contentType: 'application/json', body: '{"en":"directo"}' }));
const pag = await ctx.newPage(); const errores = [];
pag.on('pageerror', (e) => errores.push(String(e)));

// ------------------------------------------------ en las pruebas sin ?sw=1 no se registra (taparía los dobles de las demás pruebas)
await pag.goto(`${base}/web/cuenta.html`); await dormir(800);
ok((await pag.evaluate(() => navigator.serviceWorker.getRegistrations())).length === 0, 'navegador automático sin ?sw=1: no se instala el service worker');

// ------------------------------------------------ instalación y copias
await pag.goto(`${base}/web/cuenta.html?sw=1`);
await pag.evaluate(() => navigator.serviceWorker.ready);
await pag.reload(); await pag.evaluate(() => navigator.serviceWorker.ready);
ok(await pag.evaluate(() => !!navigator.serviceWorker.controller), 'service worker instalado y controlando la página');
const contar = () => pag.evaluate(async () => { const r = {}; for (const k of await caches.keys()) r[k] = (await (await caches.open(k)).keys()).map((q) => q.url); return r; });
// 3.38 · un visitante (sin la cuenta del administrador) no descarga las imágenes de los álbumes de la web
await dormir(2500);
ok(!((await contar())['recursos-v1'] || []).some((u) => u.includes('/mini/')), 'visitante: no se descargan las miniaturas de los álbumes de la web');
// como administrador (sesión guardada + «es admin»), sí: al volver a abrir la app, en segundo plano
await pag.evaluate(() => { localStorage.setItem('sb-prueba-auth-token', '{}'); localStorage.setItem('cuenta.admin', '1'); });
await pag.reload(); await pag.evaluate(() => navigator.serviceWorker.ready);
let copias = {};
for (let i = 0; i < 120; i++) {
  copias = await contar();
  const rec = copias['recursos-v1'] || [];
  if ((copias['nucleo-v1'] || []).length >= precache.nucleo.length && urlsMinis().every((u) => rec.includes(u))) break;
  await dormir(500);
}
const nucleo = copias['nucleo-v1'] || [], rec = copias['recursos-v1'] || [];
const faltan = precache.nucleo.map((u) => new URL(u, base + '/').href).filter((u) => !nucleo.includes(u));
ok(faltan.length === 0, `guarda el núcleo entero: ${nucleo.length} archivos (páginas, código, catálogos, modelos)` + (faltan.length ? ' · faltan: ' + faltan.slice(0, 5).join(', ') : ''));
ok(urlsMinis().every((u) => rec.includes(u)), `guarda en segundo plano las ${precache.miniaturas.length} imágenes de la lista (miniaturas, arte y proxies)`);
ok(precache.externos.every((u) => rec.includes(u)), 'guarda Three.js (versión fija)');
ok(!rec.some((u) => u.includes('/grande/')), 'las imágenes grandes no se precargan (solo al abrir una ficha)');

// el Three.js SIMULADO de las pruebas está en pruebas/, que la app no guarda a propósito: se abre el álbum una vez con conexión
// (como haría una persona) para que se quede guardado también lo que piden los dobles
await pag.goto(`${base}/web/prueba-3d/index.html?album=pikachu-30&sw=1&bd=prueba-app-calentar`);
await pag.waitForFunction(() => window.__album3d && document.getElementById('cargando').hidden, null, { timeout: 30000 });

// ------------------------------------------------ SIN CONEXIÓN
await ctx.setOffline(true);
await pag.goto(`${base}/index.html?sw=1`);
await pag.waitForFunction(() => document.querySelectorAll('#lista-albumes a').length > 0 || document.body.classList.contains('sin-3d'), null, { timeout: 15000 }).catch(() => {});
ok(await pag.evaluate(() => document.querySelectorAll('#lista-albumes a').length) === 6, 'sin conexión: la biblioteca abre (lista de los 6 álbumes)');
await pag.goto(`${base}/web/prueba-3d/index.html?album=pikachu-30&sw=1&bd=prueba-app-${Math.random().toString(36).slice(2)}`);
const abrio = await pag.waitForFunction(() => window.__album3d && document.getElementById('cargando').hidden, null, { timeout: 30000 }).then(() => true, () => false);
ok(abrio, 'sin conexión: el álbum 3D abre entero (código, Three.js, modelo y catálogo guardados)');
ok(abrio && await pag.evaluate(() => window.__album3d.adaptador.mapa.cartas.length) === 30, 'sin conexión: con sus 30 cartas');
const mini = await pag.evaluate(async (u) => (await fetch(u)).ok, `${base}/${precache.miniaturas[0]}`);
ok(mini, 'sin conexión: las miniaturas salen del dispositivo');
ok(await pag.evaluate(async () => (await fetch('../vendor/three/build/three.module.js', { method: 'HEAD' })).status) === 504, 'sin conexión: la comprobación de la copia local de Three.js responde «no está» (no rompe el arranque)');
await ctx.unroute('**/untiwlxjdklqjwjbvdym.supabase.co/**');              // la simulación respondería aunque no haya red
const supaSinRed = await pag.evaluate(async () => { try { await fetch('https://untiwlxjdklqjwjbvdym.supabase.co/rest/v1/copias'); return 'respondió'; } catch { return 'sin red'; } });
ok(supaSinRed === 'sin red', 'sin conexión: Supabase no responde con datos guardados (nunca se guarda)');

// ------------------------------------------------ con conexión: lo publicado se ve al momento (primero la red)
await ctx.setOffline(false);
cambiado.set('/datos/catalogo/precios-osare.json', '{"publicado":"nuevo"}');
const fresco = await pag.evaluate(async () => (await (await fetch('../../datos/catalogo/precios-osare.json')).json()).publicado);
ok(fresco === 'nuevo', 'con conexión: un dato publicado se ve al momento (primero la red)');
await ctx.setOffline(true);
const guardado = await pag.evaluate(async () => (await (await fetch('../../datos/catalogo/precios-osare.json')).json()).publicado);
ok(guardado === 'nuevo', 'y se guarda: sin conexión se ve la última versión recibida');
await ctx.setOffline(false); cambiado.clear();
await ctx.route('**/untiwlxjdklqjwjbvdym.supabase.co/**', (r) => r.fulfill({ contentType: 'application/json', body: '{"en":"directo"}' }));
await pag.evaluate(async () => { await fetch('https://untiwlxjdklqjwjbvdym.supabase.co/rest/v1/copias'); });
copias = await contar();
ok(!Object.values(copias).flat().some((u) => u.includes('supabase.co')), 'Supabase nunca se guarda en el dispositivo');
ok(errores.length === 0, 'sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
await ctx.close(); await nav.close(); servidor.close();
console.log(`\n${total} comprobaciones, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
