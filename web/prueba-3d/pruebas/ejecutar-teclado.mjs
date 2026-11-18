// 3.27 · Prueba de navegador: tocar el álbum cerrado lo abre (iPhone) y las flechas mueven un cursor entre cartas (ordenador).
// Chromium real + IndexedDB desechable; Three.js simulado (valida cableado y posiciones, no el dibujo).
// Uso:  node web/prueba-3d/pruebas/ejecutar-teclado.mjs
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
async function rutas(pag, errores) {
  pag.on('pageerror', (e) => errores.push(String(e))); pag.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errores.push(m.text()));
  await pag.route('**/cdn.jsdelivr.net/**/build/three.module.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export * from '${base}/web/prueba-3d/pruebas/three-navegador.mjs';` }));
  await pag.route('**/cdn.jsdelivr.net/**/GLTFLoader.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export * from '${base}/web/prueba-3d/pruebas/gltfloader-doble.mjs';` }));
}
const proyectar = (pag, o) => pag.evaluate(async (o) => {
  const { proyectarPunto, aabbMundo } = await import('/web/prueba-3d/js/encuadre.js');
  const a = window.__album3d, r = a.renderer.ultima, t = r.mira, p = [r.pos.x, r.pos.y, r.pos.z];
  const d = [p[0] - t[0], p[1] - t[1], p[2] - t[2]], rad = Math.hypot(...d), el = Math.asin(d[1] / rad), az = Math.atan2(d[0], d[2]);
  const cv = document.getElementById('lienzo').getBoundingClientRect();
  let pts;
  if (o.malla) { const c = aabbMundo(a.album.cajaMalla(o.malla)); pts = []; for (const x of c.x) for (const y of c.y) for (const z of c.z) pts.push([x, y, z]); }
  else { const m = a.album.matrizMundo(o.nombre); pts = [[m[12], m[13], m[14]]]; }
  const px = pts.map((q) => { const n = proyectarPunto(q, p, t, 32, r.aspect, az, el); return { x: cv.left + (n.x + 1) / 2 * cv.width, y: cv.top + (1 - n.y) / 2 * cv.height }; });
  const xs = px.map((q) => q.x), ys = px.map((q) => q.y), res = a.reservado(), fi = document.getElementById('ficha');
  const libre = { x0: res.izquierda * cv.width, x1: cv.width * (1 - res.derecha), y0: res.arriba * cv.height, y1: cv.height * (1 - res.abajo) };
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), w: cv.width, h: cv.height, libre, px, radio: rad, el, nivel: a.diagCam.nivel,
    fichaTop: fi.hidden ? null : fi.getBoundingClientRect().top, fichaLeft: fi.hidden ? null : fi.getBoundingClientRect().left, estado: document.getElementById('estado').textContent };
}, o);
const quieto = async (pag) => { for (let k = 0; k < 40; k++) { await dormir(150); if (await pag.evaluate(() => !window.__album3d.album.estado.animando && !window.__album3d.orbita.tween)) break; } await dormir(200); };
const estado = (pag) => pag.evaluate(() => { const a = window.__album3d; return { v: a.album.estado.objetivo, foco: a.foco.nombre, visible: a.foco.visible, aro: a.cursor.malla.visible,
  ficha: a.ctrl.fichaAbierta, etq: document.getElementById('estado').textContent }; });
const centro = (pag, n) => pag.evaluate((n) => { const m = window.__album3d.album.matrizMundo(n); return { x: m[12], z: m[14] }; }, n);
const tecla = async (pag, k, n = 1) => { for (let i = 0; i < n; i++) { await pag.keyboard.press(k); await dormir(60); } await quieto(pag); };

// ------------------------------------------------ iPhone: tocar el centro del álbum cerrado lo abre
{
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const pag = await ctx.newPage(); const errores = []; await rutas(pag, errores);
  await pag.goto(`${base}/web/prueba-3d/index.html?album=pikachu-30&bd=prueba-tecl-${Math.random().toString(36).slice(2)}`);
  await pag.waitForFunction(() => window.__album3d && document.getElementById('cargando').hidden, null, { timeout: 30000 }); await quieto(pag);
  ok((await estado(pag)).v === 0, 'iPhone: el álbum empieza cerrado');
  const lado = await proyectar(pag, { malla: 'Tapa_Malla' });
  await pag.touchscreen.tap(lado.x1 + 40 > lado.w ? 5 : Math.min(lado.w - 5, lado.x1 + 40), (lado.y0 + lado.y1) / 2); await quieto(pag);
  ok((await estado(pag)).v === 0, 'tocar fuera del álbum no lo abre');
  const c = await proyectar(pag, { malla: 'Tapa_Malla' });
  await pag.touchscreen.tap((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2); await quieto(pag);
  const e = await estado(pag);
  ok(e.v === 1 && !e.ficha, `tocar el centro del álbum cerrado lo abre (${e.etq})`);
  ok(errores.length === 0, 'iPhone: sin errores de consola/JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
}

// ------------------------------------------------ ordenador: flechas entre cartas
{
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 860 } });
  const pag = await ctx.newPage(); const errores = []; await rutas(pag, errores);
  await pag.goto(`${base}/web/prueba-3d/index.html?album=pikachu-30&bd=prueba-tecl-${Math.random().toString(36).slice(2)}`);
  await pag.waitForFunction(() => window.__album3d && document.getElementById('cargando').hidden, null, { timeout: 30000 }); await quieto(pag);
  await tecla(pag, 'ArrowRight');
  let e = await estado(pag);
  ok(e.v === 1 && e.visible && e.aro && e.foco === 'Hoja_0_F_Bolsillo_0', `cerrado: → abre el álbum y pone el cursor en la primera carta (${e.foco})`);
  const c0 = await centro(pag, e.foco);
  await tecla(pag, 'ArrowRight'); e = await estado(pag); const c1 = await centro(pag, e.foco);
  ok(c1.x > c0.x + 0.03 && Math.abs(c1.z - c0.z) < 0.01 && e.v === 1, `→ va a la carta de la derecha, misma fila (${e.foco})`);
  await tecla(pag, 'ArrowDown'); e = await estado(pag); const c2 = await centro(pag, e.foco);
  const pDown = await proyectar(pag, { nombre: e.foco }), pUp = await proyectar(pag, { nombre: 'Hoja_0_F_Bolsillo_1' });
  ok(Math.abs(c2.x - c1.x) < 0.01 && pDown.px[0].y > pUp.px[0].y + 20, `↓ baja una fila en pantalla (${e.foco})`);
  await tecla(pag, 'ArrowUp', 3); e = await estado(pag);
  ok(Math.abs((await centro(pag, e.foco)).z - c0.z) < 0.01, '↑ en la fila de arriba: se queda en el borde');
  // página 1 (derecha): 3 columnas. Al pasar el borde derecho se gira la hoja y se entra por la misma fila
  await tecla(pag, 'ArrowDown'); const zFila = (await centro(pag, (await estado(pag)).foco)).z;
  await tecla(pag, 'ArrowRight', 2); e = await estado(pag);
  ok(e.v === 2 && e.visible && /^Hoja_0_D_/.test(e.foco) && Math.abs((await centro(pag, e.foco)).z - zFila) < 0.01, `borde derecho: gira la hoja y entra por la misma fila en la página 2 (${e.foco}, ${e.etq})`);
  await tecla(pag, 'ArrowRight', 3); e = await estado(pag);
  ok(e.v === 2 && /^Hoja_1_F_/.test(e.foco), `en la doble página cruza de la página 2 a la 3 sin girar (${e.foco})`);
  await tecla(pag, 'ArrowLeft', 3); e = await estado(pag);
  ok(e.v === 2 && /^Hoja_0_D_/.test(e.foco), `← vuelve a la página 2 (${e.foco})`);
  await tecla(pag, 'ArrowLeft', 3); e = await estado(pag);
  ok(e.v === 1 && /^Hoja_0_F_/.test(e.foco), `borde izquierdo: gira hacia atrás y entra por la columna derecha de la página 1 (${e.foco})`);
  // Intro abre la ficha de la carta del cursor; Esc la cierra y el cursor sigue ahí
  const id = await pag.evaluate((n) => window.__album3d.adaptador.bolsillo(n).carta.id, e.foco);
  await tecla(pag, 'Enter'); e = await estado(pag);
  ok(e.ficha && !e.aro && await pag.evaluate(() => window.__album3d.resaltado.malla.visible) && (await pag.textContent('#ficha')).includes('Pikachu'), `Intro abre la ficha de la carta del cursor (${id})`);
  // 3.28–3.29 · con la ficha abierta: ← → carta anterior/siguiente en orden de lectura; ↑ ↓ suman/restan; Intro amplía
  const nombreFicha = () => pag.evaluate(() => window.__album3d.ctrl.seleccion?.nombre);
  const cant = () => pag.evaluate(() => { const a = window.__album3d; return a.adaptador.cantidad(a.ctrl.seleccion.id); });
  const f0 = await nombreFicha(); await tecla(pag, 'ArrowLeft'); const f1 = await nombreFicha();
  ok((await estado(pag)).ficha && f1 && f1 !== f0 && (await centro(pag, f1)).x < (await centro(pag, f0)).x, `ficha abierta: ← pasa a la carta anterior (${f0} → ${f1})`);
  ok(await pag.evaluate((n) => window.__album3d.resaltado.nodo?.name === n, f1), 'el aro de selección sigue a la carta nueva');
  const titulo = await pag.textContent('#f-num'); await tecla(pag, 'ArrowRight');
  ok(await nombreFicha() === f0 && (await pag.textContent('#f-num')) !== titulo, `→ vuelve a la siguiente y la ficha cambia de datos (${titulo.trim()} → ${(await pag.textContent('#f-num')).trim()})`);
  await tecla(pag, 'ArrowRight'); const f2 = await nombreFicha();
  ok((await centro(pag, f2)).z > (await centro(pag, f0)).z + 0.03 && (await centro(pag, f2)).x < (await centro(pag, f0)).x, `al final de la fila, → baja a la primera carta de la siguiente (${f2})`);
  const n0 = await cant(); await tecla(pag, 'ArrowUp'); await dormir(400);
  ok(await cant() === n0 + 1 && (await estado(pag)).ficha && await nombreFicha() === f2, `↑ suma una copia (${n0} → ${await cant()}) y la ficha sigue en la misma carta`);
  ok(await pag.evaluate(() => { const a = window.__album3d; return a.adaptador.registro(a.ctrl.seleccion.id).variantes.holo === 1; }), '↑ suma a la variante holo (la única de estos Pikachu)');
  await tecla(pag, 'ArrowDown'); await dormir(400); ok(await cant() === n0, `↓ resta una copia (${await cant()})`);
  await tecla(pag, 'ArrowDown'); await dormir(400); await tecla(pag, 'ArrowDown'); await dormir(400); ok(await cant() === 0, '↓ nunca baja de 0');
  await tecla(pag, 'Enter'); ok(!!(await pag.$('.zoom-carta')) || (await pag.getAttribute('#f-imagen', 'data-estado')) !== 'imagen', 'Intro con la ficha abierta amplía la carta (si tiene imagen)');
  if (await pag.$('.zoom-carta')) { await tecla(pag, 'ArrowRight'); ok(await nombreFicha() === f2, 'con la carta ampliada las flechas no cambian de carta'); await tecla(pag, 'Enter'); ok(!(await pag.$('.zoom-carta')) && (await estado(pag)).ficha, 'Intro otra vez cierra la ampliación y deja la ficha'); }
  // al acabar la página, → gira la hoja y abre la primera carta de la página nueva; ← vuelve a la última
  for (let k = 0; k < 9 && (await estado(pag)).v === 1; k++) await tecla(pag, 'ArrowRight');
  await quieto(pag); await dormir(400); await quieto(pag); e = await estado(pag); const fx = await nombreFicha();
  ok(e.ficha && e.v === 2 && /^Hoja_0_D_/.test(fx || ''), `al final de la página, → gira la hoja y abre la primera carta de la página 2 (${fx}, ${e.etq})`);
  await tecla(pag, 'ArrowLeft'); await quieto(pag); await dormir(400); await quieto(pag); e = await estado(pag); const fu = await nombreFicha();
  ok(e.ficha && e.v === 1 && /^Hoja_0_F_/.test(fu || ''), `← en la primera carta: vuelve a la página 1, a su última carta (${fu})`);
  await tecla(pag, 'Escape'); e = await estado(pag);
  ok(!e.ficha && e.visible && e.aro && /prueba-3d/.test(pag.url()), 'Esc cierra la ficha y el cursor sigue en la carta');
  // Av Pág / Re Pág y Mayús+flecha giran la hoja como antes; el cursor que se queda fuera de la vista desaparece
  await tecla(pag, 'PageDown'); e = await estado(pag);
  ok(e.v === 2 && !e.visible, `Av Pág gira la hoja (${e.etq}) y quita el cursor de la página que ya no se ve`);
  await tecla(pag, 'Shift+ArrowLeft'); ok((await estado(pag)).v === 1, 'Mayús+← gira hacia atrás');
  // el ratón: tocar una carta y luego una flecha sigue desde esa carta
  const t = await proyectar(pag, { nombre: 'Hoja_0_F_Bolsillo_4' });
  await pag.mouse.click(t.px[0].x, t.px[0].y); await quieto(pag); await pag.click('#f-cerrar'); await quieto(pag);
  e = await estado(pag); ok(!e.aro && e.foco === 'Hoja_0_F_Bolsillo_4', 'con el ratón no aparece el cursor, pero recuerda la carta');
  await tecla(pag, 'ArrowLeft'); e = await estado(pag); ok(e.aro && e.foco === 'Hoja_0_F_Bolsillo_4', 'la primera flecha muestra el cursor en la carta tocada');
  // el selector de página conserva sus flechas
  await pag.focus('#b-salto'); const v0 = (await estado(pag)).v; await pag.keyboard.press('ArrowLeft'); await dormir(300);
  ok((await estado(pag)).foco === 'Hoja_0_F_Bolsillo_4' && (await estado(pag)).v === v0, 'en el selector de página las flechas no mueven el cursor');
  await pag.focus('body'); await pag.evaluate(() => document.activeElement.blur());
  await tecla(pag, 'Escape'); e = await estado(pag);
  ok(!e.visible && /prueba-3d/.test(pag.url()), 'Esc con el cursor visible: solo lo quita');
  // vista de una página: el cursor no sale de la página enfocada
  await pag.click('#b-vista'); await quieto(pag); await tecla(pag, 'ArrowRight'); e = await estado(pag);
  ok(e.visible && /_F_/.test(e.foco), 'vista de una página: el cursor está en la página enfocada');
  ok(errores.length === 0, 'ordenador: sin errores de consola/JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
}
await nav.close(); servidor.close();
console.log(`\n${total} comprobaciones, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
