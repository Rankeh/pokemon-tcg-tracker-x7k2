// 3.13 · Prueba de navegador de «Añadir todas las cartas» con IndexedDB REAL (Chromium, base de datos desechable) y Three.js simulado.
// Comprueba: confirmación, que lo que ya tenías no baja, que se completa el álbum, el deshacer exacto y que tras un cambio a mano no se ofrece.
// Uso:  node web/prueba-3d/pruebas/ejecutar-completar.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp' };
const servidor = http.createServer(async (req, res) => {
  try {
    const ruta = path.join(raiz, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!ruta.startsWith(raiz)) throw new Error('fuera');
    const cuerpo = await readFile(ruta);
    res.writeHead(200, { 'Content-Type': tipos[path.extname(ruta)] || 'application/octet-stream' }); res.end(cuerpo);
  } catch { res.writeHead(404); res.end('no'); }
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const { chromium } = createRequire(import.meta.url)('playwright');
const nav = await chromium.launch();
let fallos = 0, total = 0;
const ok = (c, msg) => { total++; console.log((c ? 'OK      ' : 'FALLO   ') + msg); if (!c) fallos++; };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
const pag = await ctx.newPage(); const errores = [];
pag.on('pageerror', (e) => errores.push(String(e))); pag.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errores.push(m.text()));
await pag.route('**/cdn.jsdelivr.net/**/build/three.module.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export * from '${base}/web/prueba-3d/pruebas/three-navegador.mjs';` }));
await pag.route('**/cdn.jsdelivr.net/**/geometries/RoundedBoxGeometry.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export class RoundedBoxGeometry { constructor() { throw new Error("doble"); } }' }));
await pag.route('**/cdn.jsdelivr.net/**/GLTFLoader.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export * from '${base}/web/prueba-3d/pruebas/gltfloader-doble.mjs';` }));
const bd = 'prueba-completar-' + Math.random().toString(36).slice(2);
const url = `${base}/web/prueba-3d/index.html?album=asako-ito&bd=${bd}`;

// estado inicial: Audino con 3 copias y Pikachu con 1 (y una carta de OTRO álbum, que no debe tocarse)
await pag.goto(`${base}/web/prueba-3d/pruebas/integracion.html`).catch(() => {});
await pag.evaluate(async (bd) => {
  const { Almacen } = await import('/web/js/almacen.js');
  const a = await Almacen.abrir(bd); await a.fijar('sv10.5b-151', 3); await a.fijar('30th-027', 1); await a.fijar('sv10.5w-166', 2); a.cerrar();
}, bd);
await pag.goto(url);
await pag.waitForFunction(() => window.__album3d && document.getElementById('cargando').hidden, null, { timeout: 30000 });
const leer = () => pag.evaluate(async (bd) => { const { Almacen } = await import('/web/js/almacen.js'); const a = await Almacen.abrir(bd); const m = await a.leerTodas(); a.cerrar(); return Object.fromEntries(m); }, bd);
const catalogo = JSON.parse(await readFile(path.join(raiz, 'datos/catalogo/coleccion-asako-ito.json'), 'utf8')).cartas.map((c) => c.id);

ok(/2 de 37/.test(await pag.textContent('#progreso')), 'antes: 2 de 37 (' + (await pag.textContent('#progreso')).trim() + ')');
await pag.click('#b-opciones');
ok(!(await pag.isHidden('#menu-album')), 'el menú ⋯ se abre');
ok(/faltan 35/.test(await pag.textContent('#m-todas')), 'el menú dice cuántas faltan: ' + (await pag.textContent('#m-todas')));
ok(await pag.isHidden('#m-deshacer'), 'sin «Deshacer» antes de usarlo');
await pag.click('#m-todas');
ok(await pag.evaluate(() => document.getElementById('d-todas').open), 'pide confirmación antes de tocar nada');
ok(/35 cartas/.test(await pag.textContent('#d-todas-txt')) && /no cambian/.test(await pag.textContent('#d-todas-txt')), 'la confirmación explica qué pasará');
await pag.click('#d-cancelar'); await dormir(200);
ok(Object.keys(await leer()).length === 3, 'Cancelar no cambia nada');

await pag.click('#b-opciones'); await pag.click('#m-todas'); await pag.click('#d-aceptar'); await dormir(800);
let m = await leer();
ok(catalogo.every((id) => m[id] >= 1), 'todas las cartas del álbum tienen al menos 1 copia');
ok(m['sv10.5b-151'] === 3, 'lo que ya tenías no baja (Audino sigue con 3)');
ok(m['sv10.5w-166'] === 2, 'las cartas de otros álbumes no se tocan');
ok(/37 de 37/.test(await pag.textContent('#progreso')), 'la cabecera llega a 37 de 37');
ok(/35 cartas añadidas/.test(await pag.textContent('#aviso')), 'aviso: ' + (await pag.textContent('#aviso')));

await pag.click('#b-opciones');
ok(!(await pag.isHidden('#m-deshacer')), 'ahora se ofrece «Deshacer»');
ok(await pag.isDisabled('#m-todas'), '«Añadir todas» desactivado: ya están todas');
await pag.click('#m-deshacer'); await dormir(800);
m = await leer();
ok(JSON.stringify(m) === JSON.stringify({ '30th-027': 1, 'sv10.5b-151': 3, 'sv10.5w-166': 2 }), 'deshacer vuelve EXACTAMENTE al estado anterior: ' + JSON.stringify(m));
ok(/2 de 37/.test(await pag.textContent('#progreso')), 'la cabecera vuelve a 2 de 37');

// tras un cambio a mano, ya no se ofrece deshacer (pisaría ese cambio)
await pag.click('#b-opciones'); await pag.click('#m-todas'); await pag.click('#d-aceptar'); await dormir(800);
// volver a la pestaña relee la colección (pudo cambiar en otra página): igual que un cambio a mano, invalida el deshacer
await pag.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })));      // como el del navegador: burbujea hasta window
await dormir(500);
await pag.click('#b-opciones');
ok(await pag.isHidden('#m-deshacer'), 'tras releer la colección ya no se ofrece «Deshacer» (pisaría cambios posteriores)');
ok(errores.length === 0, 'sin errores de consola/JS' + (errores.length ? ': ' + errores.join(' | ') : ''));

await ctx.close(); await nav.close(); servidor.close();
console.log(`\n${total} comprobaciones, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
