// 3.16 · Prueba de navegador de las VARIANTES (normal / reverse / holo) con IndexedDB REAL (Chromium, BD desechable) y Three.js simulado.
// Uso:  node web/prueba-3d/pruebas/ejecutar-variantes.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png' };
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
const ctx = await nav.newContext({ viewport: { width: 1280, height: 860 } });
const pag = await ctx.newPage(); const errores = [];
pag.on('pageerror', (e) => errores.push(String(e))); pag.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errores.push(m.text()));
await pag.route('**/cdn.jsdelivr.net/**/build/three.module.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export * from '${base}/web/prueba-3d/pruebas/three-navegador.mjs';` }));
await pag.route('**/cdn.jsdelivr.net/**/geometries/RoundedBoxGeometry.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export class RoundedBoxGeometry { constructor() { throw new Error("doble"); } }' }));
await pag.route('**/cdn.jsdelivr.net/**/GLTFLoader.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export * from '${base}/web/prueba-3d/pruebas/gltfloader-doble.mjs';` }));

const bd = 'prueba-variantes-' + Math.random().toString(36).slice(2), ID = 'swsh12.5-109';      // Snorlax (normal + reverse)
const filas = () => pag.evaluate(async (bd) => { const { Almacen } = await import('/web/js/almacen.js'); const a = await Almacen.abrir(bd);
  const tx = a.db.transaction('copias'); const r = await new Promise((ok) => { const q = tx.objectStore('copias').getAll(); q.onsuccess = () => ok(q.result); });
  a.cerrar(); return Object.fromEntries(r.map((f) => [f.id, { cantidad: f.cantidad, variantes: f.variantes, mostrar: f.mostrar }])); }, bd);
await pag.goto(`${base}/web/prueba-3d/pruebas/integracion.html`).catch(() => {});
await pag.evaluate(async ([bd, id]) => { const { Almacen } = await import('/web/js/almacen.js'); const a = await Almacen.abrir(bd); await a.fijar(id, 1); await a.fijar('sv10.5w-166', 2); a.cerrar(); }, [bd, ID]);
await pag.goto(`${base}/web/prueba-3d/index.html?album=asako-ito&bd=${bd}`);
await pag.waitForFunction(() => window.__album3d && document.getElementById('cargando').hidden, null, { timeout: 30000 });
const abrir = (id) => pag.evaluate((id) => { const a = window.__album3d; a.ctrl.cerrar(); a.ctrl.ultimoCierre = -Infinity; return a.ctrl.seleccionar(a.adaptador.mapa.porId.get(id).nombre); }, id);
const brillo3d = (id) => pag.evaluate((id) => window.__album3d.vista.porId.get(id)?.tipoBrillo ?? null, id);

ok(await abrir(ID), 'se abre la ficha de Snorlax');
ok(!(await pag.isHidden('#f-variantes')) && await pag.isHidden('.ficha-cantidad'), 'carta con variantes: filas por variante en lugar del contador único');
ok((await pag.$$eval('#f-variantes .variante', (f) => f.map((x) => x.dataset.variante))).join() === 'normal,reverse', 'filas Normal y Reverse holo');
ok(/1 copia sin clasificar/.test(await pag.textContent('#f-variantes')), 'la copia de antes aparece «sin clasificar»');
await pag.click('#f-variantes .v-libres .v-chip:has-text("Reverse holo")'); await dormir(400);
let f = (await filas())[ID];
ok(f.cantidad === 1 && JSON.stringify(f.variantes) === '{"reverse":1}' && f.mostrar === 'reverse', 'clasificar: la copia pasa a Reverse (total 1) y se ve: ' + JSON.stringify(f));
ok(await pag.getAttribute('#f-imagen', 'data-acabado') === 'reverse', 'la imagen de la ficha lleva el brillo reverse');
ok(await brillo3d(ID) === 'reverse', 'el bolsillo 3D lleva el brillo reverse');
await pag.click('#f-variantes .variante[data-variante="normal"] .v-mas'); await dormir(400);
f = (await filas())[ID];
ok(f.cantidad === 2 && f.variantes.normal === 1 && f.variantes.reverse === 1 && f.mostrar === 'reverse', '+ Normal: total 2 y se sigue viendo la reverse: ' + JSON.stringify(f));
ok(/2 de 37|1 de 37/.test(await pag.textContent('#progreso')), 'el progreso cuenta cartas, no copias: ' + (await pag.textContent('#progreso')).trim());
await pag.check('#f-variantes .variante[data-variante="normal"] .v-radio'); await dormir(400);
f = (await filas())[ID];
ok(f.mostrar === 'normal' && await pag.getAttribute('#f-imagen', 'data-acabado') === '' && await brillo3d(ID) === null, 'elegir «Normal» para el álbum: sin brillo en ficha y 3D');
await pag.click('#f-variantes .variante[data-variante="reverse"] .v-menos'); await dormir(400);
f = (await filas())[ID];
ok(f.cantidad === 1 && JSON.stringify(f.variantes) === '{"normal":1}', '− Reverse: queda 1 Normal: ' + JSON.stringify(f));

// los cambios en bloque conservan el desglose (y deshacer lo devuelve exacto)
await pag.click('#f-cerrar'); await dormir(400);
const antes = await filas();
await pag.click('#b-opciones'); await pag.click('#m-todas'); await pag.click('#d-aceptar'); await dormir(700);
ok(JSON.stringify((await filas())[ID].variantes) === '{"normal":1}', '«añadir todas» no toca el desglose de una carta que ya tenías');
await pag.click('#b-opciones'); await pag.click('#m-deshacer'); await dormir(700);
ok(JSON.stringify(await filas()) === JSON.stringify(antes), 'deshacer «añadir todas» devuelve las filas exactas (con variantes)');
await pag.click('#b-opciones'); await pag.click('#m-quitar'); await pag.waitForFunction(() => !document.getElementById('d-aceptar').disabled); await pag.click('#d-aceptar'); await dormir(700);
ok(!(await filas())[ID] && (await filas())['sv10.5w-166'].cantidad === 2, '«eliminar todas» quita la carta y no toca otros álbumes');
await pag.click('#b-opciones'); await pag.click('#m-deshacer'); await dormir(700);
ok(JSON.stringify(await filas()) === JSON.stringify(antes), 'deshacer «eliminar todas» recupera la carta con su desglose y su variante visible');

// Teselia (sin variantes en el catálogo): la ficha de siempre
await pag.goto(`${base}/web/prueba-3d/index.html?bd=${bd}`);
await pag.waitForFunction(() => window.__album3d && document.getElementById('cargando').hidden, null, { timeout: 30000 });
ok(await abrir('sv10.5w-166'), 'Teselia: se abre la ficha');
ok(await pag.isHidden('#f-variantes') && !(await pag.isHidden('.ficha-cantidad')), 'Teselia: ficha clásica (sin filas de variantes)');
ok(await pag.getAttribute('#f-imagen', 'data-acabado') === 'holo-completo', '3.18 · Teselia: la IR que tienes lleva brillo holo de carta completa en la ficha');
await pag.evaluate(() => { const a = window.__album3d, pg = a.adaptador.mapa.porId.get('sv10.5w-166').pagina; a.vista.sincronizar(new Map([[pg, 0]])); });   // monta su página
ok(await brillo3d('sv10.5w-166') === 'holo-completo', '3.18 · …y en el bolsillo 3D');
// 3.22 · tocar la carta de la ficha la amplía; Esc / toque cierran SOLO la ampliación
await pag.waitForFunction(() => document.getElementById('f-imagen').dataset.estado === 'imagen', null, { timeout: 8000 });
await pag.click('#f-imagen');
ok(await pag.isVisible('.zoom-carta img'), 'tocar la carta la amplía a pantalla completa');
ok(await pag.getAttribute('.zoom-figura', 'data-acabado') === 'holo-completo', 'la carta ampliada conserva su brillo holo');
await pag.keyboard.press('Escape'); await dormir(200);
ok(!(await pag.$('.zoom-carta')) && await pag.evaluate(() => window.__album3d.ctrl.fichaAbierta), 'Esc cierra la ampliación y deja la ficha abierta');
await pag.click('#f-imagen'); await pag.click('.zoom-carta', { position: { x: 10, y: 10 } }); await dormir(200);
ok(!(await pag.$('.zoom-carta')), 'tocar fuera de la carta también la cierra');
// 3.19 · Esc por capas: ficha → menú → confirmación → biblioteca
await pag.keyboard.press('Escape'); await dormir(400);
ok(!(await pag.evaluate(() => window.__album3d.ctrl.fichaAbierta)) && /prueba-3d/.test(pag.url()), 'Esc con la ficha abierta: solo la cierra');
await pag.click('#b-opciones'); await pag.keyboard.press('Escape'); await dormir(300);
ok(await pag.isHidden('#menu-album') && /prueba-3d/.test(pag.url()), 'Esc con el menú ⋯ abierto: solo lo cierra');
await pag.click('#b-opciones'); await pag.click('#m-todas'); await pag.keyboard.press('Escape'); await dormir(300);
ok(!(await pag.evaluate(() => document.getElementById('d-todas').open)) && /prueba-3d/.test(pag.url()), 'Esc con la confirmación abierta: solo la cierra');
await pag.focus('body'); await pag.mouse.click(5, 300);
await Promise.all([pag.waitForURL((u) => !/prueba-3d/.test(String(u)), { timeout: 8000 }).catch(() => {}), pag.keyboard.press('Escape')]);
ok(/\/index\.html$/.test(new URL(pag.url()).pathname), 'Esc sin nada abierto: vuelve a la biblioteca (' + new URL(pag.url()).pathname + ')');
ok(errores.filter((x) => !/doble|RoundedBox/.test(x)).length === 0, 'sin errores de consola/JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
await ctx.close(); await nav.close(); servidor.close();
console.log(`\n${total} comprobaciones, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
