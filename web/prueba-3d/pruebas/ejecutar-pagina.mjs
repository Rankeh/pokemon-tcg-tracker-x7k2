// Ejecuta la PÁGINA REAL (index.html + main.js + CSS + IndexedDB) en Chromium con viewport de iPhone, con Three.js simulado (sin WebGL).
// Comprueba el cableado de la 3.7.1: encuadre calculado con la interfaz real, estados de cámara, gestos, ficha, persistencia y orientación.
// Uso:  node web/prueba-3d/pruebas/ejecutar-pagina.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary' };
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
const resultados = []; let fallos = 0;
const ok = (c, msg) => { resultados.push((c ? 'OK      ' : 'FALLO   ') + msg); if (!c) fallos++; };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function sesion(viewport, fn) {
  const ctx = await nav.newContext({ viewport, deviceScaleFactor: 2, hasTouch: false });
  const pag = await ctx.newPage(); const errores = [];
  pag.on('pageerror', (e) => errores.push(String(e))); pag.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errores.push(m.text()));     // 404 esperados: copia local de Three.js y manifiesto de imágenes (no existen en este entorno)
  // Three.js simulado en lugar del CDN (el entorno no tiene red ni WebGL)
  await pag.route('**/cdn.jsdelivr.net/**/build/three.module.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export * from '${base}/web/prueba-3d/pruebas/three-navegador.mjs';` }));
  await pag.route('**/cdn.jsdelivr.net/**/GLTFLoader.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export * from '${base}/web/prueba-3d/pruebas/gltfloader-doble.mjs';` }));
  await pag.goto(`${base}/web/prueba-3d/index.html?bd=prueba371-${Math.random().toString(36).slice(2)}`);
  await pag.waitForFunction(() => window.__album3d && document.getElementById('cargando').hidden, null, { timeout: 20000 });
  await fn(pag, errores);
  ok(errores.length === 0, `sin errores de consola/JS (${viewport.width}×${viewport.height})` + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
}

// utilidades dentro de la página: proyección de puntos con la cámara que se dibujó y rectángulo libre real (DOM)
const medir = (pag) => pag.evaluate(async () => {
  const { puntosVista, proyectarPunto, claseVista } = await import('/web/prueba-3d/js/encuadre.js');
  const a = window.__album3d, r = a.renderer.ultima, cv = document.getElementById('lienzo').getBoundingClientRect();
  const t = r.mira, p = [r.pos.x, r.pos.y, r.pos.z], d = [p[0] - t[0], p[1] - t[1], p[2] - t[2]], rad = Math.hypot(...d);
  const el = Math.asin(d[1] / rad), az = Math.atan2(d[0], d[2]);
  const e = a.album.estado, modo = document.getElementById('b-vista').getAttribute('aria-label') === 'Ver dos páginas' ? 'pagina' : 'doble';
  return { cv: { w: cv.width, h: cv.height }, r, el, az, radio: rad, aspect: r.aspect, vueltas: e.vueltas, estado: document.getElementById('estado').textContent,
    modo, dibujos: a.renderer.dibujos,
    px: (pt) => 0 };
});
const proyectarCaja = (pag, opciones) => pag.evaluate(async (o) => {
  const { puntosVista, proyectarPunto } = await import('/web/prueba-3d/js/encuadre.js');
  const a = window.__album3d, r = a.renderer.ultima, t = r.mira, p = [r.pos.x, r.pos.y, r.pos.z];
  const d = [p[0] - t[0], p[1] - t[1], p[2] - t[2]], rad = Math.hypot(...d), el = Math.asin(d[1] / rad), az = Math.atan2(d[0], d[2]);
  const cv = document.getElementById('lienzo').getBoundingClientRect();
  const pts = o.nombre ? (() => { const m = a.album.matrizMundo(o.nombre); return [[m[12], m[13], m[14]]]; })() : puntosVista({ vueltas: a.album.estado.vueltas, dim: a.dim, modo: o.modo, lado: o.lado });
  const px = pts.map((q) => { const n = proyectarPunto(q, p, t, r.fov ?? 32, r.aspect, az, el); return { x: cv.left + (n.x + 1) / 2 * cv.width, y: cv.top + (1 - n.y) / 2 * cv.height, z: n.z }; });
  const xs = px.map((q) => q.x), ys = px.map((q) => q.y);
  const bar = document.getElementById('barra'), vis = getComputedStyle(bar).visibility !== 'hidden', cab = document.getElementById('estado').getBoundingClientRect();
  const fi = document.getElementById('ficha');
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), w: cv.width, h: cv.height, barraTop: vis ? bar.getBoundingClientRect().top : cv.height, cabBottom: cab.bottom,
    fichaTop: fi.hidden ? null : fi.getBoundingClientRect().top, fichaLeft: fi.hidden ? null : fi.getBoundingClientRect().left, px, radio: rad, az, el };
}, opciones);

// ------------------------------------------------------------------ iPhone vertical 390×663 (Safari con barras)
await sesion({ width: 390, height: 663 }, async (pag) => {
  await dormir(500);
  let c = await proyectarCaja(pag, { modo: 'doble' });
  ok(c.x0 >= -1 && c.x1 <= c.w + 1 && c.y0 >= c.cabBottom - 2 && c.y1 <= c.barraTop + 2, `cerrado: el álbum cabe entre cabecera y barra (${c.x0.toFixed(0)}–${c.x1.toFixed(0)} px de ${c.w}; y ${c.y0.toFixed(0)}–${c.y1.toFixed(0)} entre ${c.cabBottom.toFixed(0)} y ${c.barraTop.toFixed(0)})`);
  ok((c.x1 - c.x0) > 390 * 0.85, `cerrado: ocupa ${(100 * (c.x1 - c.x0) / 390).toFixed(0)} % del ancho`);
  ok(await pag.evaluate(() => getComputedStyle(document.getElementById('b-metricas')).display === 'none'), 'los botones de diagnóstico no se ven sin ?debug=1');
  const altoBarra = await pag.evaluate(() => Math.round(document.getElementById('barra').getBoundingClientRect().height));
  ok(altoBarra <= 72, `la barra inferior cabe en una sola fila (${altoBarra} px de alto)`);

  await pag.click('#b-abrir'); await dormir(2200);
  const e = await pag.evaluate(() => document.getElementById('estado').textContent);
  ok(/Página 1 de 18/.test(e), 'abrir: modo página en vertical, «' + e + '»');
  c = await proyectarCaja(pag, { modo: 'pagina', lado: 'der' });
  ok(c.x0 >= -1 && c.x1 <= c.w + 1 && c.y0 >= c.cabBottom - 2 && c.y1 <= c.barraTop + 2, `primera página dentro del área libre (x ${c.x0.toFixed(0)}–${c.x1.toFixed(0)}, y ${c.y0.toFixed(0)}–${c.y1.toFixed(0)})`);
  ok((c.x1 - c.x0) > 390 * 0.85, `primera página ocupa ${(100 * (c.x1 - c.x0) / 390).toFixed(0)} % del ancho (antes ≈ 44 %)`);
  ok(c.el > 40 * Math.PI / 180 && c.el < 70 * Math.PI / 180, `cámara elevada ${(c.el * 180 / Math.PI).toFixed(0)}° (ni cenital ni plana)`);

  // selección: tocar un bolsillo con el ratón/dedo
  const nombre = 'Hoja_0_F_Bolsillo_4';
  const antes = await proyectarCaja(pag, { nombre });
  await pag.mouse.click(antes.px[0].x, antes.px[0].y); await dormir(1500);
  const abierta = await pag.evaluate(() => !document.getElementById('ficha').hidden);
  ok(abierta, 'tocar un bolsillo abre la ficha (raycast con la cámara nueva)');
  const sel = await proyectarCaja(pag, { nombre });
  ok(sel.px[0].y < sel.fichaTop - 10 && sel.px[0].y > sel.cabBottom && sel.px[0].x > 0 && sel.px[0].x < sel.w, `la carta seleccionada queda visible sobre la ficha (y ${sel.px[0].y.toFixed(0)} < ficha ${sel.fichaTop.toFixed(0)})`);
  const pag9 = await proyectarCaja(pag, { modo: 'pagina', lado: 'der' });
  ok(pag9.y1 <= sel.fichaTop && pag9.x0 >= -1 && pag9.x1 <= pag9.w + 1, `con la ficha se mantiene el contexto: toda la página visible (y hasta ${pag9.y1.toFixed(0)} < ${sel.fichaTop.toFixed(0)})`);
  const hl = await pag.evaluate(() => window.__album3d.resaltado.malla.visible);
  ok(hl, 'la carta seleccionada tiene resalte');

  // colección: añadir y retirar con persistencia real
  const id = await pag.evaluate((n) => window.__album3d.adaptador.bolsillo(n).carta.id, nombre);
  await pag.click('#f-mas'); await dormir(300);
  ok(await pag.evaluate((i) => window.__album3d.adaptador.cantidad(i), id) === 1, 'añadir guarda 1 copia en IndexedDB');
  await pag.click('#f-menos'); await dormir(300);
  ok(await pag.evaluate((i) => window.__album3d.adaptador.cantidad(i), id) === 0, 'retirar deja 0 copias');
  await pag.click('#f-mas'); await dormir(300);
  await pag.click('#f-cerrar'); await dormir(1400);
  ok(await pag.evaluate(() => document.getElementById('ficha').hidden), 'cerrar la ficha la oculta');
  const despues = await proyectarCaja(pag, { modo: 'pagina', lado: 'der' });
  ok(Math.abs(despues.radio - c.radio) < 0.002 && Math.abs(despues.x0 - c.x0) < 2, `cerrar la ficha vuelve al encuadre de navegación (radio ${despues.radio.toFixed(3)} vs ${c.radio.toFixed(3)})`);
  ok(await pag.evaluate(() => document.getElementById('f-cant').textContent) === '1', 'el contador de la ficha reflejaba 1');
  const prog = await pag.evaluate(() => document.getElementById('progreso').textContent);
  ok(/^1 de 158/.test(prog), 'contador general: «' + prog + '»');

  // gestos: deslizar a la izquierda = siguiente; página 1 → giro de hoja → página 2/3
  await pag.mouse.move(300, 330); await pag.mouse.down(); await pag.mouse.move(200, 335, { steps: 5 }); await pag.mouse.move(120, 335, { steps: 5 }); await pag.mouse.up(); await dormir(2200);
  const e2 = await pag.evaluate(() => document.getElementById('estado').textContent);
  ok(/Página 3 de 18/.test(e2), 'deslizar a la izquierda pasa a la hoja siguiente: «' + e2 + '»');
  const c2 = await proyectarCaja(pag, { modo: 'pagina', lado: 'der' });
  ok(c2.x0 >= -1 && c2.x1 <= c2.w + 1, 'tras el giro la página sigue encuadrada');
  await pag.mouse.move(100, 330); await pag.mouse.down(); await pag.mouse.move(200, 330, { steps: 5 }); await pag.mouse.move(300, 330, { steps: 5 }); await pag.mouse.up(); await dormir(1200);
  const e3 = await pag.evaluate(() => document.getElementById('estado').textContent);
  ok(/Página 2 de 18/.test(e3), 'deslizar a la derecha pasa a la página izquierda: «' + e3 + '»');
  const c3 = await proyectarCaja(pag, { modo: 'pagina', lado: 'izq' });
  ok(c3.x0 >= -1 && c3.x1 <= c3.w + 1 && c3.y0 >= c3.cabBottom - 2, 'la página izquierda queda dentro de pantalla');

  // vista doble
  await pag.click('#b-vista'); await dormir(1300);
  const cd = await proyectarCaja(pag, { modo: 'doble' });
  ok(cd.x0 >= -1 && cd.x1 <= cd.w + 1, 'vista de dos páginas: cabe en el ancho');
  // salto a la página 18 y cierre
  await pag.selectOption('#b-salto', '18'); await dormir(1800);
  ok(/18 de 18/.test(await pag.evaluate(() => document.getElementById('estado').textContent)), 'salto directo a la página 18');
  await pag.click('#b-abrir'); await dormir(1500);
  ok(/cerrado/i.test(await pag.evaluate(() => document.getElementById('estado').textContent)), 'cerrar el álbum');

  // rotación a horizontal: se recalcula todo
  await pag.click('#b-abrir'); await dormir(1800);
  await pag.setViewportSize({ width: 844, height: 390 }); await dormir(900);
  const h = await proyectarCaja(pag, { modo: await pag.evaluate(() => (document.getElementById('b-vista').getAttribute('aria-label') === 'Ver dos páginas' ? 'pagina' : 'doble')), lado: 'der' });
  ok(h.x0 >= -1 && h.x1 <= h.w + 1 && h.y0 >= h.cabBottom - 2 && h.y1 <= h.barraTop + 2, `giro a horizontal 844×390: sigue dentro del área libre (x ${h.x0.toFixed(0)}–${h.x1.toFixed(0)}, y ${h.y0.toFixed(0)}–${h.y1.toFixed(0)}, libre ${h.cabBottom.toFixed(0)}–${h.barraTop.toFixed(0)})`);
  await pag.setViewportSize({ width: 390, height: 750 }); await dormir(900);    // Safari oculta sus barras
  const v2 = await proyectarCaja(pag, { modo: 'pagina', lado: 'der' });
  ok(v2.y1 <= v2.barraTop + 2 && v2.x1 <= v2.w + 1, 'Safari sin barras 390×750: reencuadre correcto');
});

// ------------------------------------------------------------------ iPhone horizontal y escritorio
for (const vp of [{ width: 844, height: 390 }, { width: 1920, height: 1080 }]) {
  await sesion(vp, async (pag) => {
    await pag.click('#b-abrir'); await dormir(2200); await pag.click('#b-sig'); await dormir(2200);
    const c = await proyectarCaja(pag, { modo: 'doble' });
    ok(c.x0 >= -1 && c.x1 <= c.w + 1 && c.y0 >= c.cabBottom - 2 && c.y1 <= c.barraTop + 2, `${vp.width}×${vp.height}: dos páginas dentro del área libre (ocupan ${(100 * (c.x1 - c.x0) / c.w).toFixed(0)} % del ancho, ${(100 * (c.y1 - c.y0) / (c.barraTop - c.cabBottom)).toFixed(0)} % del alto libre)`);
    const nombre = 'Hoja_1_D_Bolsillo_2';
    const a = await proyectarCaja(pag, { nombre });
    await pag.mouse.click(a.px[0].x, a.px[0].y); await dormir(1500);
    ok(await pag.evaluate(() => !document.getElementById('ficha').hidden), `${vp.width}×${vp.height}: se abre la ficha al tocar`);
    const s = await proyectarCaja(pag, { nombre });
    const libreX = s.fichaLeft > s.w * 0.4 ? s.fichaLeft : s.w, libreY = s.fichaLeft > s.w * 0.4 ? s.h : s.fichaTop;
    ok(s.px[0].x > 0 && s.px[0].x < libreX && s.px[0].y < libreY && s.px[0].y > s.cabBottom, `${vp.width}×${vp.height}: la carta seleccionada no queda tapada por la ficha`);
    await pag.keyboard.press('Escape'); await dormir(800);
  });
}

console.log(resultados.join('\n') + `\n\n${resultados.length} comprobaciones, ${fallos} fallos`);
await nav.close(); servidor.close();
process.exit(fallos ? 1 : 0);
