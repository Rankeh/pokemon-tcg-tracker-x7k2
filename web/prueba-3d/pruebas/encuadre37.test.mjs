// Fase 3.7.1: cámara, encuadre y composición. Geometría PURA + dimensiones y nodos REALES del GLB (Three.js simulado).
// Estas pruebas demuestran que las matemáticas del encuadre son coherentes; NO sustituyen a mirar el resultado en Safari.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { crearMundo, T } from './mundo.mjs';
import { dimensiones, claseVista, puntosVista, puntosGiro, elevacionPara, proyectarPunto, rayoNDC, rectLibre, calcularEncuadre, planos, reservadoDesdeDom } from '../js/encuadre.js';
import { distanciaEncuadre } from '../js/camara.js';
import { elegirBolsillo, candidatosTocables } from '../js/picking.js';
import { vueltasParaPagina } from '../js/navegacion3d.js';
import { nombreBolsillo } from '../js/adaptador-coleccion.js';
const { datosMarco } = await import('../js/resaltado.js');   // dinámico: necesita el gancho que registra mundo.mjs para 'three'

const FOV = 32, GRAD = Math.PI / 180;
const pantallas = {
  'iPhone vertical 390×663 (Safari con barras)': [390, 663], 'iPhone vertical 390×750 (barras ocultas)': [390, 750], 'iPhone SE 320×568': [320, 568],
  'iPhone horizontal 844×390': [844, 390], 'iPhone horizontal con barras 750×340': [750, 340], 'PC 16:9 1920×1080': [1920, 1080],
  'ventana estrecha 500×900': [500, 900], 'panorámica 2560×1080': [2560, 1080], 'iPad vertical 820×1180': [820, 1180],
};
// Interfaz reservada medida en el prototipo: cabecera ≈ 60 px arriba, barra de navegación ≈ 62 px abajo
const reservaNav = (w, h) => reservadoDesdeDom({ ancho: w, alto: h, cabeceraAbajo: 60, barraArriba: h - 62 });
// Ficha: hoja inferior (≈ 250 px) en pantallas estrechas, tarjeta lateral de 420 px + 20 de margen en anchas
const reservaFicha = (w, h) => reservadoDesdeDom({ ancho: w, alto: h, cabeceraAbajo: 60, barraArriba: h, ficha: w >= 760 ? { left: w - 440, top: 20 } : { left: 0, top: h - 250 } });

const bytes = readFileSync(new URL('../modelo/album.glb', import.meta.url));
const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + bytes.readUInt32LE(12))));
const params = json.nodes.find((n) => n.name === 'Album').extras;
const dim = dimensiones(params);
const enRect = (q, R, tol = 1e-6) => q.x >= R.x0 - tol && q.x <= R.x1 + tol && q.y >= R.y0 - tol && q.y <= R.y1 + tol;
const camaraDe = (c) => { const b = Math.cos(c.el); return [c.objetivo[0] + c.radio * b * Math.sin(c.az), c.objetivo[1] + c.radio * Math.sin(c.el), c.objetivo[2] + c.radio * b * Math.cos(c.az)]; };
const proy = (p, c, aspect) => proyectarPunto(p, camaraDe(c), c.objetivo, FOV, aspect, c.az, c.el);

test('dimensiones reales: el GLB confirma ancho de tapa, fondo (z) y altura que usa el encuadre', () => {
  const acc = (mesh) => { const m = json.meshes.find((x) => x.name === mesh); return json.accessors[m.primitives[0].attributes.POSITION]; };
  const t = acc('tapa'), lomo = acc('lomo');
  assert.ok(Math.abs((t.max[0] - t.min[0]) - dim.a) < 1e-6, 'ancho de tapa');
  assert.ok(Math.abs((t.max[2] - t.min[2]) - dim.d) < 1e-6, 'fondo de tapa (alto_tapa) = ' + dim.d);
  assert.ok(Math.abs(lomo.max[1] - dim.h) < 1e-3, 'altura del álbum ' + dim.h + ' vs lomo ' + lomo.max[1]);
  assert.equal(dim.n, 9);
});

test('clases de vista: cerrado, portada, doble, final', () => {
  assert.deepEqual([0, 1, 2, 9, 10].map((v) => claseVista(v, 9)), ['cerrado', 'portada', 'doble', 'doble', 'final']);
});

// 1-3, 6, 7: encuadre en cada pantalla y estado, sin recortes y centrado en el espacio libre
for (const [nombre, [w, h]] of Object.entries(pantallas)) {
  test('encuadre sin recortes · ' + nombre, () => {
    const aspect = w / h, reservado = reservaNav(w, h), R = rectLibre(reservado, 0.015);
    for (const v of [0, 1, 2, 5, 9, 10]) for (const modo of ['doble', 'pagina']) for (const lado of ['izq', 'der']) {
      const puntos = puntosVista({ vueltas: v, dim, modo, lado });
      const c = calcularEncuadre({ puntos, fovGrados: FOV, aspect, reservado, margen: 0.015 });
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (const p of puntos) { const q = proy(p, c, aspect); assert.ok(q.z > 0, 'delante de la cámara'); assert.ok(enRect(q, R), `${nombre} v${v} ${modo}/${lado}: punto fuera (${q.x.toFixed(3)}, ${q.y.toFixed(3)})`); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      const ocupaX = (x1 - x0) / (R.x1 - R.x0), ocupaY = (y1 - y0) / (R.y1 - R.y0);
      assert.ok(Math.max(ocupaX, ocupaY) > 0.97, 'aprovecha el espacio libre (no queda flotando pequeño): ' + Math.max(ocupaX, ocupaY).toFixed(3));
      assert.ok(Math.abs((x0 + x1) / 2 - (R.x0 + R.x1) / 2) < 0.01 && Math.abs((y0 + y1) / 2 - (R.y0 + R.y1) / 2) < 0.01, 'centrado en el espacio libre');
    }
  });
}

test('mejora real en iPhone vertical: una página ocupa mucho más que el encuadre anterior (3.6.2)', () => {
  const aspect = 390 / 663;
  const antes = distanciaEncuadre({ fovGrados: FOV, aspect, elevacion: 62 * GRAD });
  const cAntes = { az: 0, el: 62 * GRAD, radio: antes, objetivo: [0, 0.01, 0] };
  const anchoPx = (c, puntos) => { const xs = puntos.map((p) => proy(p, c, aspect).x); return (Math.max(...xs) - Math.min(...xs)) / 2 * 390; };
  const doble = puntosVista({ vueltas: 3, dim, modo: 'doble' }), pag = puntosVista({ vueltas: 3, dim, modo: 'pagina', lado: 'der' });
  const cPag = calcularEncuadre({ puntos: pag, fovGrados: FOV, aspect, reservado: reservaNav(390, 663), margen: 0.015 });
  const cDoble = calcularEncuadre({ puntos: doble, fovGrados: FOV, aspect, reservado: reservaNav(390, 663), margen: 0.015 });
  // anchura en pantalla de UNA página (0..a) con cada cámara
  const pagina = puntosVista({ vueltas: 3, dim, modo: 'pagina', lado: 'der' });
  const antesPx = anchoPx(cAntes, pagina), despuesPx = anchoPx(cPag, pagina), dobleOk = anchoPx(cDoble, pagina);
  console.log(`# anchura de una página en iPhone vertical: antes ${antesPx.toFixed(0)} px → ahora ${despuesPx.toFixed(0)} px (doble: ${dobleOk.toFixed(0)} px)`);
  assert.ok(despuesPx > antesPx * 1.6, `página: ${antesPx.toFixed(0)} px → ${despuesPx.toFixed(0)} px`);
  assert.ok(dobleOk >= antesPx * 0.97, 'en vista doble no es más pequeño que antes');
});

test('4 cambios de viewport y de orientación: determinista y sin acumular deriva', () => {
  const calc = (w, h) => calcularEncuadre({ puntos: puntosVista({ vueltas: 3, dim, modo: w / h < 0.9 ? 'pagina' : 'doble', lado: 'der' }), fovGrados: FOV, aspect: w / h, reservado: reservaNav(w, h), margen: 0.015 });
  const v1 = calc(390, 663), h1 = calc(844, 390), v2 = calc(390, 663);
  assert.deepEqual(v1, v2); assert.notDeepEqual(v1.radio, h1.radio);
  for (let h = 560; h <= 900; h += 17) { const c = calc(390, h); assert.ok(c.radio > 0.1 && c.radio < 3); }   // Safari mostrando/ocultando barras: la altura cambia continuamente
});

test('cerrado y abierto: el cerrado se ve centrado y el abierto más ancho', () => {
  const aspect = 1920 / 1080, reservado = reservaNav(1920, 1080);
  const c0 = calcularEncuadre({ puntos: puntosVista({ vueltas: 0, dim }), fovGrados: FOV, aspect, reservado });
  const c1 = calcularEncuadre({ puntos: puntosVista({ vueltas: 3, dim }), fovGrados: FOV, aspect, reservado });
  assert.ok(Math.abs(c0.objetivo[0]) < 1e-6 && Math.abs(c1.objetivo[0]) < 1e-6, 'ambos centrados en el lomo/mundo');
  assert.ok(c1.radio > c0.radio * 0.9);
  assert.ok(c0.el < 70 * GRAD && c0.el > 40 * GRAD, 'ligeramente elevada, ni cenital ni plana');
  assert.ok(elevacionPara(0.6) < elevacionPara(1.8));
});

test('5 near/far: el álbum nunca se sale del frustum, ni con el zoom máximo (regresión 3.5.1)', () => {
  for (const [nombre, [w, h]] of Object.entries(pantallas)) {
    const aspect = w / h, reservado = reservaNav(w, h);
    for (const v of [0, 3, 10]) {
      const puntos = [...puntosVista({ vueltas: v, dim, modo: aspect < 0.9 ? 'pagina' : 'doble' }), ...puntosGiro(dim)];
      const c = calcularEncuadre({ puntos, fovGrados: FOV, aspect, reservado });
      for (const k of [c.radio * 0.55, c.radio, c.radio * 1.5]) {               // límites de zoom que fija main.js
        const pl = planos(c.radio, c.radio * 1.5), cc = { ...c, radio: k };
        for (const p of puntos) { const q = proy(p, cc, aspect); assert.ok(q.z > pl.near && q.z < pl.far, `${nombre} v${v} z=${q.z.toFixed(3)} near=${pl.near.toFixed(3)} far=${pl.far.toFixed(2)}`); }
      }
    }
  }
});

test('8 giro de hoja: con el barrido de la hoja vertical todo sigue dentro de pantalla', () => {
  for (const [nombre, [w, h]] of Object.entries(pantallas)) {
    const aspect = w / h, reservado = reservaNav(w, h), R = rectLibre(reservado, 0.015);
    const puntos = [...puntosVista({ vueltas: 3, dim }), ...puntosVista({ vueltas: 4, dim }), ...puntosGiro(dim)];
    const c = calcularEncuadre({ puntos, fovGrados: FOV, aspect, reservado, margen: 0.015 });
    for (const p of puntos) assert.ok(enRect(proy(p, c, aspect), R), nombre);
    const pasos = [45, 90, 135].map((g) => params.ancho_hoja * Math.sin(g * GRAD)); assert.ok(Math.max(...pasos) <= params.ancho_hoja + 1e-9);
  }
});

// Raycasting, selección y navegación con el modelo real
const mundoEn = async (v) => { const m = await crearMundo(); m.album.estado.irA(v); m.album.aplicar(); return m; };
const centroMundo = (m, nombre) => { const e = m.album.matrizMundo(nombre); return [e[12], e[13], e[14]]; };

test('11 raycasting con la cámara nueva: cada bolsillo tocable se acierta tocando su centro (todas las pantallas y estados)', async () => {
  for (const v of [1, 2, 5, 9]) {
    const m = await mundoEn(v);
    const cand = candidatosTocables(m.album.estado, m.adaptador, (n) => m.album.matrizMundo(n));
    assert.ok(cand.length >= 9);
    for (const [nombre, [w, h]] of Object.entries(pantallas)) {
      const aspect = w / h;
      for (const modo of ['doble', 'pagina']) {
        const c = calcularEncuadre({ puntos: puntosVista({ vueltas: v, dim, modo, lado: 'der' }), fovGrados: FOV, aspect, reservado: reservaNav(w, h), margen: 0.015 });
        const pos = camaraDe(c);
        for (const k of cand) {
          const q = proy(centroMundo(m, k.nombre), c, aspect);
          const r = rayoNDC(q.x, q.y, pos, FOV, aspect, c.az, c.el);
          const g = elegirBolsillo(r.origen, r.direccion, cand);
          assert.equal(g && g.nombre, k.nombre, `${nombre} v${v} ${modo}`);
        }
      }
    }
  }
});

test('9 y 10 selección y cierre de ficha: el bolsillo y su página quedan visibles junto a la ficha, y al cerrar se vuelve al mismo encuadre', async () => {
  for (const v of [1, 3, 6, 9]) {
    const m = await mundoEn(v);
    const cand = candidatosTocables(m.album.estado, m.adaptador, (n) => m.album.matrizMundo(n));
    for (const [nombre, [w, h]] of Object.entries(pantallas)) {
      const aspect = w / h, R = rectLibre(reservaFicha(w, h), 0.03);
      const previo = calcularEncuadre({ puntos: puntosVista({ vueltas: v, dim, modo: aspect < 0.9 ? 'pagina' : 'doble', lado: 'der' }), fovGrados: FOV, aspect, reservado: reservaNav(w, h), margen: 0.015 });
      for (const sel of cand.filter((_, i) => i % 4 === 0)) {
        const lado = sel.nombre.includes('_D_') ? 'izq' : 'der';
        const cSel = calcularEncuadre({ puntos: puntosVista({ vueltas: v, dim, modo: 'pagina', lado }), fovGrados: FOV, aspect, el: elevacionPara(aspect) + 8 * GRAD, reservado: reservaFicha(w, h), margen: 0.03 });
        const q = proy(centroMundo(m, sel.nombre), cSel, aspect);
        assert.ok(enRect(q, R), `${nombre} v${v} ${sel.nombre}: la ficha taparía la carta (${q.x.toFixed(2)}, ${q.y.toFixed(2)})`);
        // contexto: las cartas vecinas de la misma página también se ven
        const vecinas = cand.filter((c2) => c2.nombre.includes(lado === 'izq' ? '_D_' : '_F_') && c2.nombre.split('_')[1] === sel.nombre.split('_')[1]);
        for (const c2 of vecinas) assert.ok(enRect(proy(centroMundo(m, c2.nombre), cSel, aspect), R), 'contexto recortado: ' + c2.nombre);
        // y se puede tocar con la cámara de selección
        const r = rayoNDC(q.x, q.y, camaraDe(cSel), FOV, aspect, cSel.az, cSel.el);
        assert.equal((elegirBolsillo(r.origen, r.direccion, cand) || {}).nombre, sel.nombre);
      }
      const despues = calcularEncuadre({ puntos: puntosVista({ vueltas: v, dim, modo: aspect < 0.9 ? 'pagina' : 'doble', lado: 'der' }), fovGrados: FOV, aspect, reservado: reservaNav(w, h), margen: 0.015 });
      assert.deepEqual(despues, previo, 'cerrar la ficha recalcula exactamente el encuadre anterior');
    }
  }
});

test('12 y 14 recorrido de las 18 páginas: cada bolsillo queda dentro de pantalla en modo página y en doble (sin recortes)', async () => {
  for (let p = 1; p <= 18; p++) {
    const v = vueltasParaPagina(p), m = await mundoEn(v), lado = p % 2 === 1 ? 'der' : 'izq';
    const cand = candidatosTocables(m.album.estado, m.adaptador, (n) => m.album.matrizMundo(n));
    for (const [w, h] of [[390, 663], [844, 390], [1920, 1080]]) {
      const aspect = w / h, R = rectLibre(reservaNav(w, h), 0.015);
      for (const modo of ['pagina', 'doble']) {
        const c = calcularEncuadre({ puntos: puntosVista({ vueltas: v, dim, modo, lado }), fovGrados: FOV, aspect, reservado: reservaNav(w, h), margen: 0.015 });
        const propios = cand.filter((k) => modo === 'doble' || k.nombre.includes(lado === 'izq' ? '_D_' : '_F_'));
        for (const k of propios) assert.ok(enRect(proy(centroMundo(m, k.nombre), c, aspect), R), `p${p} ${modo} ${w}×${h} ${k.nombre}`);
        const pagina = m.adaptador.mapa.paginas[p - 1].bolsillos.filter(Boolean);       // todas las cartas de la página enfocada están entre los bolsillos tocables y encuadrados
        for (const carta of pagina) assert.ok(propios.some((k) => k.nombre === m.adaptador.mapa.porId.get(carta.id).nombre), `p${p} falta ${carta.id}`);
      }
    }
  }
});

test('reservado desde el DOM: cabecera, barra y ficha (hoja inferior o tarjeta lateral)', () => {
  assert.deepEqual(reservadoDesdeDom({ ancho: 400, alto: 800, cabeceraAbajo: 80, barraArriba: 720 }), { arriba: 0.1, abajo: 0.1, izquierda: 0, derecha: 0 });
  const hoja = reservadoDesdeDom({ ancho: 400, alto: 800, cabeceraAbajo: 80, barraArriba: 800, ficha: { left: 0, top: 560 } });
  assert.equal(hoja.abajo, 0.3); assert.equal(hoja.derecha, 0);
  const lateral = reservadoDesdeDom({ ancho: 1000, alto: 600, cabeceraAbajo: 60, barraArriba: 600, ficha: { left: 560, top: 100 } });
  assert.equal(lateral.derecha, 0.44); assert.equal(lateral.abajo, 0);
  assert.throws(() => calcularEncuadre({ puntos: puntosVista({ vueltas: 3, dim }), aspect: 1, reservado: { arriba: 0.5, abajo: 0.5 } }), RangeError);
});

test('resalte de la carta seleccionada: aro de 8 vértices y 8 triángulos, interior dentro del exterior', () => {
  const d = datosMarco(); assert.equal(d.posiciones.length, 24); assert.equal(d.indices.length, 24);
  assert.ok(Math.abs(d.posiciones[0]) > Math.abs(d.posiciones[12]) && Math.abs(d.posiciones[2]) > Math.abs(d.posiciones[14]));
  assert.ok(Math.abs(d.posiciones[12]) > 0.063 / 2, 'rodea la carta (63 mm de ancho en el modelo)');
});

test('13 sin regresiones de IndexedDB/colección: los módulos protegidos no han cambiado desde 3.6.2 (1230f6f) (bolsillos3d.js sale de la lista en 3.7.2a: solo se admite el cambio de material de carta, ver aspecto37.test.mjs)', (t) => {
  let cambiados;
  try { cambiados = execSync('git diff --name-only 1230f6f', { cwd: new URL('../../..', import.meta.url).pathname, encoding: 'utf8' }).split('\n').filter(Boolean); }
  catch { t.skip('git no disponible'); return; }
  const protegidos = ['web/js/almacen.js', 'web/js/coleccion.js', 'web/js/album/modelo.js', 'web/js/album/distribucion.js', 'web/prueba-3d/js/adaptador-coleccion.js', 'web/prueba-3d/js/texturas.js',
    /* texturas3d.js sale de la lista en 3.7.13: solo se añade el fallback a proxies */ 'web/prueba-3d/js/controlador.js', 'web/prueba-3d/js/picking.js', 'datos/catalogo/coleccion-teselia.json'];
  assert.deepEqual(cambiados.filter((f) => protegidos.includes(f)), []);
});
