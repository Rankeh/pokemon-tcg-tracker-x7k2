// 3.43 · Prueba de navegador de «Usar mi imagen»: elegir archivo, pegar (Ctrl+V), quitar, persistencia y rechazo de lo que no es imagen.
// IndexedDB real (Chromium, BD desechable) y Three.js simulado (las texturas guardan su dirección: se ve qué imagen usa el bolsillo 3D).
// Uso:  node web/prueba-3d/pruebas/ejecutar-imagen.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
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

const bd = 'prueba-imagen-' + Math.random().toString(36).slice(2), ID = 'sv10.5b-151';
await pag.goto(`${base}/web/prueba-3d/pruebas/integracion.html`).catch(() => {});
await pag.evaluate(async ([bd, id]) => { const { Almacen } = await import('/web/js/almacen.js'); const a = await Almacen.abrir(bd); await a.fijar(id, 1); a.cerrar(); }, [bd, ID]);
const abrirAlbum = async () => {
  await pag.goto(`${base}/web/prueba-3d/index.html?album=asako-ito&bd=${bd}`);
  await pag.waitForFunction(() => window.__album3d && document.getElementById('cargando').hidden, null, { timeout: 30000 });
  await pag.evaluate((id) => { const a = window.__album3d, pg = a.adaptador.mapa.porId.get(id).pagina; a.vista.sincronizar(new Map([[pg, 0]])); }, ID);
  await dormir(500);
  await pag.evaluate((id) => { const a = window.__album3d; a.ctrl.ultimoCierre = -Infinity; a.ctrl.seleccionar(a.adaptador.mapa.porId.get(id).nombre); }, ID);
  await dormir(400);
};
const textura = () => pag.evaluate((id) => window.__album3d.vista.porId.get(id).tarjeta?.material.map?.url || '', ID);
const fichaSrc = () => pag.getAttribute('#f-imagen img', 'src').then((s) => s || '');
const guardadas = () => pag.evaluate(async (bd) => { const { Almacen } = await import('/web/js/almacen.js'); const a = await Almacen.abrir(bd);
  const m = await a.imagenesPropias(), p = await a.imagenesParaSubir(); a.cerrar(); return { ids: [...m.keys()], largo: [...m.values()].map((v) => v.length), tipo: [...m.values()].map((v) => v.slice(0, 15)), pend: p.map((x) => [x.carta, x.borrado]) }; }, bd);

await abrirAlbum();
ok((await pag.textContent('#f-mi-imagen')) === 'Usar mi imagen' && await pag.isHidden('#f-quitar-imagen'), 'la ficha ofrece «Usar mi imagen»');
const antes = await textura();
ok(antes && !antes.startsWith('data:'), 'antes: el bolsillo usa la imagen de siempre (' + antes.split('/').pop() + ')');

// 1) elegir un archivo (en el iPhone abre la galería o la cámara)
await pag.setInputFiles('#f-archivo', path.join(raiz, 'web/editorial/icono-512.png'));
await pag.waitForFunction(async () => (document.querySelector('#f-imagen img')?.src || '').startsWith('data:image/jpeg'), null, { timeout: 10000 }).catch(() => {});
let g = await guardadas();
ok(g.ids.includes(ID) && g.tipo[0] === 'data:image/jpeg' && g.largo[0] < 600000, `guardada en el dispositivo como JPEG reducido (${Math.round(g.largo[0] / 1024)} KB)`);
ok(JSON.stringify(g.pend) === JSON.stringify([[ID, false]]), 'pendiente de subir a la cuenta');
ok((await fichaSrc()).startsWith('data:image/jpeg'), 'la ficha la enseña al momento');
await dormir(400);
ok((await textura()).startsWith('data:image/jpeg'), 'el bolsillo 3D también, sin recargar');
ok((await pag.textContent('#f-mi-imagen')) === 'Cambiar mi imagen' && await pag.isVisible('#f-quitar-imagen'), 'ahora ofrece «Cambiar» y «Quitar»');
const primera = (await guardadas()).largo[0];

// 2) pegar una imagen (Ctrl+V) con la ficha abierta
await pag.evaluate(async () => {
  const b = await (await fetch('/web/editorial/favicon-32.png')).blob(), dt = new DataTransfer();
  dt.items.add(new File([b], 'pegada.png', { type: 'image/png' }));
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
});
await dormir(1200);
g = await guardadas();
ok(g.ids.length === 1 && g.largo[0] !== primera, 'pegar una imagen la sustituye');

// 3) sigue ahí al volver a abrir el álbum
await abrirAlbum(); await dormir(400);
ok((await fichaSrc()).startsWith('data:image/jpeg') && (await textura()).startsWith('data:image/jpeg'), 'al volver a abrir el álbum sigue tu imagen');

// 4) lo que no es una imagen se rechaza sin tocar nada
const tmp = path.join(raiz, 'web/prueba-3d/pruebas/integracion.html');
await pag.setInputFiles('#f-archivo', tmp); await dormir(600);
ok((await pag.textContent('#aviso')).includes('No se pudo usar esa imagen') && (await guardadas()).ids.length === 1, 'un archivo que no es imagen: lo dice y no cambia nada');

// 5) quitar: vuelve la de siempre (y la baja queda pendiente de subir)
await pag.click('#f-quitar-imagen'); await dormir(800);
g = await guardadas();
ok(g.ids.length === 0 && JSON.stringify(g.pend) === JSON.stringify([[ID, true]]), 'quitada (pendiente de subir como «borrada»)');
ok(!(await fichaSrc()).startsWith('data:') && !(await textura()).startsWith('data:'), 'vuelve la imagen de siempre en la ficha y en el 3D');
ok((await pag.textContent('#f-mi-imagen')) === 'Usar mi imagen' && await pag.isHidden('#f-quitar-imagen'), 'y el botón vuelve a «Usar mi imagen»');
const cantidad = await pag.evaluate((id) => window.__album3d.adaptador.cantidad(id), ID);
ok(cantidad === 1, 'poner o quitar tu imagen no toca cuántas copias tienes');
ok(errores.length === 0, 'sin errores de consola/JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
await ctx.close(); await nav.close(); servidor.close();
console.log(`\n${total} comprobaciones, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
