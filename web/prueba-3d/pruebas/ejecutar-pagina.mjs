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

// utilidades dentro de la página: proyección de puntos/mallas con la cámara que se dibujó y rectángulo libre real (el mismo que mide main.js)
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
const dentro = (c, tol = 2) => c.x0 >= c.libre.x0 - tol && c.x1 <= c.libre.x1 + tol && c.y0 >= c.libre.y0 - tol && c.y1 <= c.libre.y1 + tol;
const deslizar = async (pag, dir) => {         // dir -1 = dedo hacia la izquierda (siguiente), +1 = hacia la derecha (anterior)
  const x0 = dir < 0 ? 300 : 90, x1 = x0 + dir * 190;
  await pag.mouse.move(x0, 330); await pag.mouse.down(); await pag.mouse.move((x0 + x1) / 2, 335, { steps: 4 }); await pag.mouse.move(x1, 335, { steps: 4 }); await pag.mouse.up(); await dormir(1900);
};
const etiqueta = (pag) => pag.evaluate(() => document.getElementById('estado').textContent);
const hojaDe = (p) => Math.ceil(p / 2) - 1;               // página → hoja física (0-based)
const losa = (p) => `Hoja_${hojaDe(p)}_Losa`;

/** Comprueba la composición «protagonista + lomo + franja» de la página `p` en vertical. */
async function composicion(pag, p, ctx) {
  const lado = p % 2 === 1 ? 'der' : 'izq';
  const pr = await proyectar(pag, { malla: losa(p) }), lomo = await proyectar(pag, { malla: 'Lomo' });
  const frac = (pr.x1 - pr.x0) / pr.w;
  ok(pr.x0 >= -1 && pr.x1 <= pr.w + 1 && pr.y0 >= pr.libre.y0 - 2 && pr.y1 <= pr.libre.y1 + 2, `${ctx}: página ${p} completa dentro del viewport y del área libre (x ${pr.x0.toFixed(0)}–${pr.x1.toFixed(0)})`);
  ok(frac >= 0.68 && frac <= 0.84, `${ctx}: página ${p} ocupa ${(100 * frac).toFixed(0)} % del ancho (objetivo 70–82 %)`);
  const lc = (lomo.x0 + lomo.x1) / 2, mitad = (pr.x0 + pr.x1) / 2, ancho = pr.x1 - pr.x0;
  const lomoOk = lado === 'der' ? lc < mitad - 0.3 * ancho && lc > 0 : lc > mitad + 0.3 * ancho && lc < pr.w;       // el lomo queda en el lado del borde interior de la página, dentro de pantalla
  if (process.env.DEP) console.log('LOMO', ctx, lc.toFixed(1), pr.x0.toFixed(1), pr.x1.toFixed(1));
  ok(lomoOk, `${ctx}: el lomo está ${lado === 'der' ? 'a la izquierda' : 'a la derecha'} de la página ${p}`);
  const franja = lado === 'der' ? lomo.x0 - 0 : pr.w - lomo.x1;       // lo que queda entre el lomo y el borde de pantalla = página contigua
  ok(franja > pr.w * 0.03 && franja < pr.w * 0.14, `${ctx}: franja de la página contigua ≈ ${(100 * franja / pr.w).toFixed(1)} % del ancho (más lomo)`);
}

// ------------------------------------------------------------------ iPhone vertical 390×663 (Safari con barras)
await sesion({ width: 390, height: 663 }, async (pag) => {
  await dormir(500);
  let c = await proyectar(pag, { malla: 'Tapa_Malla' });
  ok(dentro(c) && (c.x1 - c.x0) > 390 * 0.85, `cerrado: la cubierta cabe en el área libre y ocupa ${(100 * (c.x1 - c.x0) / 390).toFixed(0)} % del ancho`);
  ok(await pag.evaluate(() => getComputedStyle(document.getElementById('b-metricas')).display === 'none'), 'los botones de diagnóstico no se ven sin ?debug=1');
  const altoBarra = await pag.evaluate(() => Math.round(document.getElementById('barra').getBoundingClientRect().height));
  ok(altoBarra <= 72, `la barra inferior cabe en una sola fila (${altoBarra} px de alto)`);

  await pag.click('#b-abrir'); await dormir(2200);
  ok(/Página 1 de 18/.test(await etiqueta(pag)), 'abrir: página 1 protagonista');
  await composicion(pag, 1, 'p1');
  c = await proyectar(pag, { malla: losa(1) });
  ok(c.el > 40 * Math.PI / 180 && c.el < 70 * Math.PI / 180, `cámara elevada ${(c.el * 180 / Math.PI).toFixed(0)}° (ni cenital ni plana)`);
  // centrado visual: la página queda centrada verticalmente en el área libre (con el pequeño sesgo hacia arriba)
  const centro = (c.y0 + c.y1) / 2, libreC = (c.libre.y0 + c.libre.y1) / 2;
  ok(Math.abs(centro - libreC) < c.h * 0.05, `página centrada en el área libre (centro ${centro.toFixed(0)} vs ${libreC.toFixed(0)} px)`);

  // lectura en orden: 1 → 2 → 3 → 4 → 5 → 6 (giros entre impar→par, sin giro de par→impar)
  const t0 = await pag.evaluate(() => window.__album3d.album.estado.vueltas);
  for (const p of [2, 3, 4, 5, 6]) {
    await deslizar(pag, -1);
    ok(new RegExp(`Página ${p} de 18`).test(await etiqueta(pag)), `deslizar a la izquierda → página ${p}`);
    await composicion(pag, p, `p${p}`);
  }
  for (const p of [5, 4, 3, 2, 1]) {
    await deslizar(pag, +1);
    ok(new RegExp(`Página ${p} de 18`).test(await etiqueta(pag)), `deslizar a la derecha → página ${p}`);
    await composicion(pag, p, `p${p}`);
  }
  ok(await pag.evaluate(() => window.__album3d.album.estado.vueltas) === t0, 'ida y vuelta: mismo estado de hojas');

  // 17 ↔ 18
  await pag.selectOption('#b-salto', '17'); await dormir(1800);
  await composicion(pag, 17, 'p17');
  await deslizar(pag, -1); ok(/Página 18 de 18/.test(await etiqueta(pag)), 'p17 → p18'); await composicion(pag, 18, 'p18');
  await deslizar(pag, +1); ok(/Página 17 de 18/.test(await etiqueta(pag)), 'p18 → p17'); await composicion(pag, 17, 'p17');
  await pag.selectOption('#b-salto', '1'); await dormir(1800);

  // selección en la primera y en la última fila
  for (const [nombre, etq] of [['Hoja_0_F_Bolsillo_1', 'primera fila'], ['Hoja_0_F_Bolsillo_7', 'última fila']]) {
    const antes = await proyectar(pag, { nombre }), nav = await proyectar(pag, { malla: losa(1) });
    await pag.mouse.click(antes.px[0].x, antes.px[0].y); await dormir(1600);
    ok(await pag.evaluate(() => !document.getElementById('ficha').hidden), `${etq}: tocar abre la ficha`);
    const sel = await proyectar(pag, { nombre }), pg = await proyectar(pag, { malla: losa(1) });
    ok(sel.px[0].y < sel.fichaTop - 10 && sel.px[0].y > sel.libre.y0 && sel.px[0].x > 0 && sel.px[0].x < sel.w, `${etq}: la carta queda visible sobre la ficha (y ${sel.px[0].y.toFixed(0)} < ${sel.fichaTop.toFixed(0)})`);
    ok(await pag.evaluate(() => window.__album3d.resaltado.malla.visible), `${etq}: carta resaltada`);
    const desplaza = (nav.y0 + nav.y1) / 2 - (pg.y0 + pg.y1) / 2;
    ok(desplaza < sel.h * 0.2, `${etq}: el álbum no se desplaza de forma exagerada (${desplaza.toFixed(0)} px hacia arriba; nivel «${sel.nivel}»)`);
    ok(pg.y0 >= sel.libre.y0 - 2 || sel.nivel === 'filas', `${etq}: contexto de página (nivel «${sel.nivel}»)`);
    await pag.click('#f-cerrar'); await dormir(1500);
    const despues = await proyectar(pag, { malla: losa(1) });
    ok(Math.abs(despues.radio - nav.radio) < 0.002 && Math.abs(despues.x0 - nav.x0) < 2, `${etq}: cerrar la ficha vuelve al encuadre de navegación`);
  }

  // colección: añadir y retirar con persistencia real (no debe alterarse)
  const nombre = 'Hoja_0_F_Bolsillo_4', a0 = await proyectar(pag, { nombre });
  await pag.mouse.click(a0.px[0].x, a0.px[0].y); await dormir(1500);
  const id = await pag.evaluate((n) => window.__album3d.adaptador.bolsillo(n).carta.id, nombre);
  await pag.click('#f-mas'); await dormir(300);
  ok(await pag.evaluate((i) => window.__album3d.adaptador.cantidad(i), id) === 1, 'añadir guarda 1 copia en IndexedDB');
  await pag.click('#f-menos'); await dormir(300);
  ok(await pag.evaluate((i) => window.__album3d.adaptador.cantidad(i), id) === 0, 'retirar deja 0 copias');
  await pag.click('#f-mas'); await dormir(300); await pag.click('#f-cerrar'); await dormir(1300);
  ok(/^1 de 158/.test(await pag.evaluate(() => document.getElementById('progreso').textContent)), 'contador general 1 de 158');

  // vista doble
  await pag.click('#b-vista'); await dormir(1300);
  const cd = await proyectar(pag, { malla: 'Lomo' });
  const tapas = [await proyectar(pag, { malla: 'Contratapa' }), await proyectar(pag, { malla: 'Tapa_Malla' })];
  ok(Math.min(...tapas.map((q) => q.x0)) >= -1 && Math.max(...tapas.map((q) => q.x1)) <= cd.w + 1, 'vista de dos páginas: cubiertas y lomo caben en el ancho');
  await pag.selectOption('#b-salto', '18'); await dormir(1800);
  ok(/18 de 18/.test(await etiqueta(pag)) || /Páginas 1[78]/.test(await etiqueta(pag)), 'salto directo a la página 18 en vista doble');
  const fin = [await proyectar(pag, { malla: 'Contratapa' }), await proyectar(pag, { malla: 'Tapa_Malla' }), await proyectar(pag, { malla: 'Hoja_8_Losa' })];
  ok(fin.every((q) => q.x0 >= -1 && q.x1 <= q.w + 1), 'final: pila y contratapa dentro de pantalla (3.7.1 recortaba la contratapa)');
  await pag.click('#b-vista'); await dormir(1200);
  await pag.click('#b-abrir'); await dormir(1500);
  ok(/cerrado/i.test(await etiqueta(pag)), 'cerrar el álbum');

  // rotación y barras de Safari
  await pag.click('#b-abrir'); await dormir(1800);
  await pag.setViewportSize({ width: 844, height: 390 }); await dormir(1200);
  const res = await pag.evaluate(() => window.__album3d.reservado());
  ok(res.izquierda > 0.05 && res.derecha > 0.03 && res.arriba === 0 && res.abajo === 0, `horizontal: la interfaz pasa a columnas laterales (izq ${res.izquierda.toFixed(2)}, der ${res.derecha.toFixed(2)}, arriba ${res.arriba}, abajo ${res.abajo})`);
  const h = await proyectar(pag, { malla: 'Lomo' });
  const h1 = await proyectar(pag, { malla: 'Tapa_Malla' });
  if (process.env.DEP) console.log('ROT', JSON.stringify({ h1, libre: h.libre, res }));
  ok(dentro({ ...h1, libre: h.libre }), 'giro a 844×390: sigue dentro del área libre');
  await pag.setViewportSize({ width: 390, height: 750 }); await dormir(1200);   // Safari oculta sus barras
  const v2 = await proyectar(pag, { malla: 'Tapa_Malla' });
  ok(v2.x1 <= v2.w + 1 && v2.y1 <= v2.libre.y1 + 2, 'Safari sin barras 390×750: reencuadre correcto');
});

// ------------------------------------------------------------------ iPhone horizontal y escritorio
for (const vp of [{ width: 844, height: 390 }, { width: 750, height: 340 }, { width: 1920, height: 1080 }]) {
  await sesion(vp, async (pag) => {
    await pag.click('#b-abrir'); await dormir(2200); await pag.click('#b-sig'); await dormir(2200);
    const e = await etiqueta(pag);
    const piezas = [await proyectar(pag, { malla: 'Contratapa' }), await proyectar(pag, { malla: 'Tapa_Malla' }), await proyectar(pag, { malla: 'Lomo' }), await proyectar(pag, { malla: 'Hoja_0_Losa' })];
    const caja = { x0: Math.min(...piezas.map((q) => q.x0)), x1: Math.max(...piezas.map((q) => q.x1)), y0: Math.min(...piezas.map((q) => q.y0)), y1: Math.max(...piezas.map((q) => q.y1)), libre: piezas[0].libre };
    if (process.env.DEP) console.log('DEP', vp.width, JSON.stringify({ res: await pag.evaluate(() => window.__album3d.reservado()), caja, radio: piezas[0].radio, diag: await pag.evaluate(() => window.__album3d.diagCam), obj: await pag.evaluate(() => window.__album3d.orbita.estado()), cam: await pag.evaluate(() => window.__album3d.camara.aspect) }));
    const lw = caja.libre.x1 - caja.libre.x0, lh = caja.libre.y1 - caja.libre.y0;
    ok(dentro(caja), `${vp.width}×${vp.height}: dos páginas con cubiertas y lomo dentro del área libre (${(100 * (caja.x1 - caja.x0) / lw).toFixed(0)} % del ancho libre, ${(100 * (caja.y1 - caja.y0) / lh).toFixed(0)} % del alto libre) «${e}»`);
    ok(Math.max((caja.x1 - caja.x0) / lw, (caja.y1 - caja.y0) / lh) > 0.9, `${vp.width}×${vp.height}: aprovecha el área libre`);
    const nombre = 'Hoja_1_D_Bolsillo_2', a = await proyectar(pag, { nombre });
    await pag.mouse.click(a.px[0].x, a.px[0].y); await dormir(1600);
    ok(await pag.evaluate(() => !document.getElementById('ficha').hidden), `${vp.width}×${vp.height}: se abre la ficha al tocar`);
    const s = await proyectar(pag, { nombre });
    const libreX = s.fichaLeft > s.w * 0.4 ? s.fichaLeft : s.w, libreY = s.fichaLeft > s.w * 0.4 ? s.h : s.fichaTop;
    ok(s.px[0].x > 0 && s.px[0].x < libreX && s.px[0].y < libreY && s.px[0].y > 0, `${vp.width}×${vp.height}: la carta seleccionada no queda tapada por la ficha (nivel «${s.nivel}»)`);
    await pag.keyboard.press('Escape'); await dormir(900);
  });
}

console.log(resultados.join('\n') + `\n\n${resultados.length} comprobaciones, ${fallos} fallos`);
await nav.close(); servidor.close();
process.exit(fallos ? 1 : 0);
