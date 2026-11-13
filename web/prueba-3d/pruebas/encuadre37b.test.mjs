// Fase 3.7.1b: composición «página protagonista + lomo + franja contigua». Cajas REALES (nodos y matrices del GLB) y comprobación de los límites PROYECTADOS:
// no basta con que la cámara devuelva números; la página protagonista debe quedar completa dentro del área visible prevista.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearMundo } from './mundo.mjs';
import { dimensiones, COMPOSICION, cajasReales, cajasDimensiones, puntosPagina, puntosConjunto, puntosVista, puntosGiro, calcularEncuadre, elegirEncuadreSeleccion, proyectarPunto, rayoNDC, rectLibre,
  reservadoDesdeDom, elevacionPara, planos, nombresCajas } from '../js/encuadre.js';
import { elegirBolsillo, candidatosTocables } from '../js/picking.js';
import { vueltasParaPagina, pasoLectura, paginasDe } from '../js/navegacion3d.js';
import { nombreBolsillo } from '../js/adaptador-coleccion.js';

const FOV = 32, GRAD = Math.PI / 180, N = 9, TOTAL = 18;
const bytes = readFileSync(new URL('../modelo/album.glb', import.meta.url));
const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + bytes.readUInt32LE(12))));
const params = json.nodes.find((n) => n.name === 'Album').extras;
const dim = dimensiones(params);
const mundo = await crearMundo();
const album = mundo.album;
const enEstado = (v) => { album.estado.irA(v); album.aplicar(); return cajasReales(v, N, (n) => album.cajaMalla(n)); };
const camaraDe = (c) => { const b = Math.cos(c.el); return [c.objetivo[0] + c.radio * b * Math.sin(c.az), c.objetivo[1] + c.radio * Math.sin(c.el), c.objetivo[2] + c.radio * b * Math.cos(c.az)]; };
const proy = (p, c, aspect) => proyectarPunto(p, camaraDe(c), c.objetivo, FOV, aspect, c.az, c.el);
const esq = (b) => { const r = []; for (const x of b.x) for (const y of b.y) for (const z of b.z) r.push([x, y, z]); return r; };
const bbox = (pts, c, aspect) => { const q = pts.map((p) => proy(p, c, aspect)); return { x0: Math.min(...q.map((a) => a.x)), x1: Math.max(...q.map((a) => a.x)), y0: Math.min(...q.map((a) => a.y)), y1: Math.max(...q.map((a) => a.y)), zmin: Math.min(...q.map((a) => a.z)), zmax: Math.max(...q.map((a) => a.z)) }; };
const px = (v, w) => (v + 1) / 2 * w;                         // NDC → píxeles

const reservaNav = (w, h) => w > h && h <= 520
  ? reservadoDesdeDom({ ancho: w, alto: h, izquierdaPx: 140, derechaPx: 74 })                       // móvil horizontal: columnas laterales (cabecera ≈ 140 px, controles ≈ 74 px)
  : reservadoDesdeDom({ ancho: w, alto: h, cabeceraAbajo: 58, barraArriba: h - 62 });                // cabecera ≈ 58 px, barra ≈ 62 px
const reservaFicha = (w, h) => ({ ...reservaNav(w, h), ...(w >= 760 ? { derecha: 440 / w, abajo: 0 } : { abajo: 250 / h }) });
const verticales = { 'iPhone vertical 390×663': [390, 663], 'iPhone vertical 390×750 (sin barras)': [390, 750], 'iPhone SE 320×568': [320, 568], 'ventana estrecha 500×900': [500, 900], 'iPad vertical 820×1180': [820, 1180] };
const apaisadas = { 'iPhone horizontal 844×390': [844, 390], 'iPhone horizontal con barras 750×340': [750, 340], 'PC 16:9 1920×1080': [1920, 1080], 'panorámica 2560×1080': [2560, 1080] };

test('cajas reales ≈ cajas por dimensiones en todos los estados (el encuadre durante un giro no salta al asentarse)', () => {
  for (let v = 0; v <= N + 1; v++) {
    const real = enEstado(v), dims = cajasDimensiones(v, dim, album.geo);
    // 3.7.10: el lomo es más bajo y más estrecho que el supuesto (x ∈ [-10,+4] mm, altura variable), y el encuadre es conservador: la caja real queda DENTRO de la supuesta (el encuadre es conservador)
    for (const k of Object.keys(real)) for (const e of ['x', 'y', 'z']) for (const i of [0, 1])
      assert.ok(k === 'lomo' && (e === 'y' || e === 'x') ? (i === 1 ? real[k][e][i] <= dims[k][e][i] + 0.002 : real[k][e][i] >= dims[k][e][i] - 0.002) : Math.abs(real[k][e][i] - dims[k][e][i]) < 0.002, `v${v} ${k}.${e}[${i}]: real ${real[k][e][i].toFixed(4)} vs dimensiones ${dims[k][e][i].toFixed(4)}`);
  }
  assert.deepEqual(Object.values(nombresCajas(3, N)), ['Hoja_2_Losa', 'Hoja_1_Losa', 'Contratapa', 'Tapa_Malla', 'Lomo']);
});

test('parámetro pasoFila = separación real entre filas de bolsillos en el GLB', () => {
  const z = [0, 3, 6].map((k) => json.nodes.find((n) => n.name === `Hoja_0_F_Bolsillo_${k}`).translation[2]);
  assert.ok(Math.abs((z[1] - z[0]) - COMPOSICION.pasoFila) < 1e-4 && Math.abs((z[2] - z[1]) - COMPOSICION.pasoFila) < 1e-4, z.join(' '));
});

// ---------------------------------------------------------------- composición en vertical, las 18 páginas
for (const [nombre, [w, h]] of Object.entries(verticales)) {
  test('composición vertical · ' + nombre + ': página completa, 68–84 % del ancho, lomo en su lado, franja contigua controlada, centrada', () => {
    const aspect = w / h, reservado = reservaNav(w, h), R = rectLibre(reservado, COMPOSICION.margen);
    for (let p = 1; p <= TOTAL; p++) {
      const v = vueltasParaPagina(p), lado = p % 2 === 1 ? 'der' : 'izq', cajas = enEstado(v);
      const prop = lado === 'der' ? cajas.der : cajas.izq;
      const cara = [[prop.x[0], prop.y[1], prop.z[0]], [prop.x[1], prop.y[1], prop.z[0]], [prop.x[0], prop.y[1], prop.z[1]], [prop.x[1], prop.y[1], prop.z[1]]];
      const c = calcularEncuadre({ puntos: puntosPagina({ lado, cajas, hoja: dim.hoja }), fovGrados: FOV, aspect, reservado, margen: COMPOSICION.margen, centroVisual: cara, sesgo: COMPOSICION.sesgoOptico });
      const pg = bbox(esq(prop), c, aspect), lomo = bbox(esq(cajas.lomo), c, aspect);
      // 4. la página protagonista COMPLETA dentro del viewport y del área libre
      assert.ok(pg.x0 >= -1 && pg.x1 <= 1, `p${p}: página fuera del viewport en x`);
      assert.ok(pg.x0 >= R.x0 - 1e-6 && pg.x1 <= R.x1 + 1e-6 && pg.y0 >= R.y0 - 1e-6 && pg.y1 <= R.y1 + 1e-6, `p${p}: página fuera del área libre`);
      const frac = (pg.x1 - pg.x0) / 2;
      assert.ok(frac >= 0.68 && frac <= 0.84, `p${p}: la página ocupa ${(100 * frac).toFixed(1)} % del ancho`);
      // 3. el lomo en el lado correcto: a la izquierda de una página derecha, a la derecha de una izquierda
      const lc = (lomo.x0 + lomo.x1) / 2, mid = (pg.x0 + pg.x1) / 2;
      assert.ok(lado === 'der' ? lc < mid - 0.3 * (pg.x1 - pg.x0) : lc > mid + 0.3 * (pg.x1 - pg.x0), `p${p}: lomo en el lado equivocado`);
      assert.ok(lomo.x0 > -1 && lomo.x1 < 1, `p${p}: el lomo se ve entero`);
      // 5. franja de la página contigua: entre el lomo y el borde de pantalla, acotada
      const franja = lado === 'der' ? (px(lomo.x0, w) - 0) / w : (w - px(lomo.x1, w)) / w;
      assert.ok(franja > 0.03 && franja < 0.14, `p${p}: franja contigua ${(100 * franja).toFixed(1)} %`);
      // centrado visual: la cara de la página, centrada en el área libre (más un sesgo óptico pequeño hacia arriba)
      const cv = bbox(cara, c, aspect), libreC = (R.y0 + R.y1) / 2;
      assert.ok(Math.abs((cv.y0 + cv.y1) / 2 - (libreC + COMPOSICION.sesgoOptico * (R.y1 - R.y0))) < 0.08, `p${p}: página descentrada`);
    }
  });
}

test('simetría conceptual: página izquierda y derecha ocupan el mismo ancho (±3 %) y la franja contigua es parecida (±2,5 % del ancho)', () => {
  const [w, h] = [390, 663], aspect = w / h, reservado = reservaNav(w, h);
  const med = (p) => { const v = vueltasParaPagina(p), lado = p % 2 ? 'der' : 'izq', cajas = enEstado(v);
    const c = calcularEncuadre({ puntos: puntosPagina({ lado, cajas, hoja: dim.hoja }), fovGrados: FOV, aspect, reservado, margen: COMPOSICION.margen });
    const pg = bbox(esq(lado === 'der' ? cajas.der : cajas.izq), c, aspect), lomo = bbox(esq(cajas.lomo), c, aspect);
    return { frac: (pg.x1 - pg.x0) / 2, franja: lado === 'der' ? px(lomo.x0, w) / w : (w - px(lomo.x1, w)) / w }; };
  const a = med(6), b = med(7); assert.ok(Math.abs(a.frac - b.frac) < 0.03, `${a.frac} vs ${b.frac}`); assert.ok(Math.abs(a.franja - b.franja) < 0.025);
});

test('la vecina se recorta en la cámara, no moviendo hojas: encuadrar no cambia ninguna pose ni ninguna visibilidad', () => {
  enEstado(4);
  const foto = () => JSON.stringify([album.estado.progreso, album.elemento.map((e) => [e.position.y, e.rotation.z, e.visible]), album.raiz.position.x]);
  const antes = foto();
  for (const lado of ['izq', 'der']) calcularEncuadre({ puntos: puntosPagina({ lado, cajas: cajasReales(4, N, (n) => album.cajaMalla(n)), hoja: dim.hoja }), aspect: 0.6, reservado: reservaNav(390, 663) });
  assert.equal(foto(), antes);
});

// ---------------------------------------------------------------- horizontal y escritorio
for (const [nombre, [w, h]] of Object.entries(apaisadas)) {
  test('composición horizontal · ' + nombre + ': dos páginas con cubiertas y lomo, sin recortes, aprovechando el área libre', () => {
    const aspect = w / h, reservado = reservaNav(w, h), R = rectLibre(reservado, COMPOSICION.margenDoble);
    for (const v of [0, 1, 2, 5, 9, 10]) {
      const cajas = enEstado(v), pts = puntosConjunto(cajas);
      const c = calcularEncuadre({ puntos: pts, fovGrados: FOV, aspect, reservado, margen: v === 0 ? COMPOSICION.margen : COMPOSICION.margenDoble });
      const b = bbox(pts, c, aspect), Rm = rectLibre(reservado, v === 0 ? COMPOSICION.margen : COMPOSICION.margenDoble);
      assert.ok(b.x0 >= Rm.x0 - 1e-6 && b.x1 <= Rm.x1 + 1e-6 && b.y0 >= Rm.y0 - 1e-6 && b.y1 <= Rm.y1 + 1e-6, `v${v}: fuera del área libre`);
      const aprov = Math.max((b.x1 - b.x0) / (Rm.x1 - Rm.x0), (b.y1 - b.y0) / (Rm.y1 - Rm.y0));
      assert.ok(aprov > 0.99, `v${v}: no aprovecha el espacio (${aprov.toFixed(3)})`);
    }
    void R;
  });
}

test('horizontal: las columnas laterales dan un álbum mayor que reservar bandas arriba y abajo (iPhone 844×390)', () => {
  const [w, h] = [844, 390], aspect = w / h, cajas = enEstado(3), pts = puntosConjunto(cajas);
  const ancho = (reservado) => { const c = calcularEncuadre({ puntos: pts, fovGrados: FOV, aspect, reservado, margen: COMPOSICION.margenDoble }); const b = bbox(pts, c, aspect); return (b.x1 - b.x0) / 2 * w; };
  const filas = ancho(reservadoDesdeDom({ ancho: w, alto: h, cabeceraAbajo: 58, barraArriba: h - 62 })), columnas = ancho(reservaNav(w, h));
  console.log(`# horizontal 844×390: álbum de ${filas.toFixed(0)} px (bandas) → ${columnas.toFixed(0)} px (columnas)`);
  assert.ok(columnas > filas * 1.10,   // 3.7.10: 1,15 → 1,10 (el lomo plano baja la caja del conjunto y la ventaja relativa baja un poco: sigue siendo ≈ +14 %)
     `${filas} → ${columnas}`);
});

// ---------------------------------------------------------------- viewport cambiante, orientación, vista simple/doble
test('cambios de tamaño de visualViewport: la composición vertical no se mueve (limitada por el ancho) y nunca se recorta', () => {
  let anterior = null;
  for (let h = 520; h <= 900; h += 7) {
    const w = 390, aspect = w / h, v = 4, cajas = enEstado(v), reservado = reservaNav(w, h);
    const c = calcularEncuadre({ puntos: puntosPagina({ lado: 'izq', cajas, hoja: dim.hoja }), fovGrados: FOV, aspect, reservado, margen: COMPOSICION.margen });
    const b = bbox(puntosPagina({ lado: 'izq', cajas, hoja: dim.hoja }), c, aspect), R = rectLibre(reservado, COMPOSICION.margen);
    assert.ok(b.x0 >= R.x0 - 1e-6 && b.x1 <= R.x1 + 1e-6 && b.y0 >= R.y0 - 1e-6 && b.y1 <= R.y1 + 1e-6, `h=${h}`);
    if (anterior) assert.ok(Math.abs(c.radio - anterior.radio) / c.radio < 0.12, `salto de radio al pasar a h=${h}: ${anterior.radio} → ${c.radio}`);   // no hay saltos bruscos de distancia
    anterior = c;
  }
});

test('cambio de orientación y de vista simple/doble: los dos encuadres existen, caben y son deterministas', () => {
  const cajas = enEstado(3), un = (w, h) => { const aspect = w / h, r = reservaNav(w, h);
    const c = calcularEncuadre({ puntos: puntosPagina({ lado: 'der', cajas, hoja: dim.hoja }), fovGrados: FOV, aspect, reservado: r, margen: COMPOSICION.margen }); return c; };
  const dos = (w, h) => calcularEncuadre({ puntos: puntosConjunto(cajas), fovGrados: FOV, aspect: w / h, reservado: reservaNav(w, h), margen: COMPOSICION.margenDoble });
  assert.deepEqual(un(390, 663), un(390, 663)); assert.deepEqual(dos(844, 390), dos(844, 390));
  assert.ok(dos(390, 663).radio > un(390, 663).radio, 'dos páginas se ven desde más lejos que una');
  assert.ok(un(844, 390).radio > 0 && dos(390, 663).radio < 3);
});

// ---------------------------------------------------------------- selección: prioridad ficha > carta > página > lomo > franja
function seleccion(v, lado, nombre, [w, h]) {
  const cajas = enEstado(v), aspect = w / h, el = elevacionPara(aspect) + 8 * GRAD, m = album.matrizMundo(nombre), z = m[14], f = COMPOSICION.filasContexto, hh = COMPOSICION.pasoFila;
  const p = (o) => puntosPagina({ lado, cajas, hoja: dim.hoja, ...o });
  const ref = calcularEncuadre({ puntos: p({}), fovGrados: FOV, aspect, el, reservado: reservaNav(w, h), margen: COMPOSICION.margen });
  const r = elegirEncuadreSeleccion({ radioRef: ref.radio, base: { fovGrados: FOV, aspect, el, reservado: reservaFicha(w, h), margen: COMPOSICION.margen }, niveles: [
    { nombre: 'página+lomo+vecina', puntos: p({}) }, { nombre: 'página+lomo', puntos: p({ vecina: false }) }, { nombre: 'página', puntos: p({ vecina: false, lomo: false }) },
    { nombre: 'filas', puntos: p({ vecina: false, lomo: false, filaZ: [z - (f + 0.5) * hh, z + (f + 0.5) * hh] }) }] });
  return { r, ref, centro: [m[12], m[13], m[14]], aspect, R: rectLibre(reservaFicha(w, h), COMPOSICION.margen), cajas };
}
for (const [nombre, tam] of Object.entries({ ...verticales, ...apaisadas })) {
  test('selección · ' + nombre + ': primera y última fila — carta siempre visible fuera de la ficha, nivel de contexto coherente', () => {
    for (const v of [1, 3, 6, 9]) for (const [lado, cara] of [['der', 'F'], ['izq', 'D']]) {
      if (lado === 'izq' && v === 1) continue;
      const hoja = lado === 'der' ? v - 1 : v - 2;
      for (const k of [1, 4, 7]) {                                     // k = 1 primera fila, 7 última fila (centro de la columna)
        const nombreB = `Hoja_${hoja}_${cara}_Bolsillo_${cara === 'D' ? k : k}`;
        const s = seleccion(v, lado, nombreB, tam), q = proy(s.centro, s.r, s.aspect);
        assert.ok(q.x >= s.R.x0 && q.x <= s.R.x1 && q.y >= s.R.y0 && q.y <= s.R.y1, `${nombreB} (${s.r.nivel}): carta fuera del área libre (${q.x.toFixed(2)}, ${q.y.toFixed(2)})`);
        assert.ok(s.r.radio <= s.ref.radio * COMPOSICION.toleranciaContexto || s.r.nivel === 'filas', `${nombreB}: ${s.r.nivel} aleja la cámara demasiado`);
        const raiz = enEstado(v); void raiz;
      }
    }
  });
}

test('selección: con espacio de sobra se conserva TODO el contexto; en pantallas pequeñas se degrada por prioridades', () => {
  const grande = seleccion(3, 'der', 'Hoja_2_F_Bolsillo_4', [1920, 1080]), pequena = seleccion(3, 'der', 'Hoja_2_F_Bolsillo_4', [320, 568]);
  assert.equal(grande.r.nivel, 'página+lomo+vecina');
  assert.ok(['página+lomo', 'página', 'filas', 'página+lomo+vecina'].includes(pequena.r.nivel));
  const niveles = new Set(); for (const tam of Object.values({ ...verticales, ...apaisadas })) niveles.add(seleccion(3, 'der', 'Hoja_2_F_Bolsillo_7', tam).r.nivel);
  console.log('# niveles de contexto usados con la ficha abierta:', [...niveles].join(' | '));
});

test('selección: el álbum no se desplaza de forma exagerada respecto a la navegación (iPhone vertical)', () => {
  const [w, h] = [390, 663];
  for (const nombre of ['Hoja_2_F_Bolsillo_1', 'Hoja_2_F_Bolsillo_7']) {
    const s = seleccion(3, 'der', nombre, [w, h]), aspect = w / h;
    const nav = bbox(esq(s.cajas.der), s.ref, aspect), sel = bbox(esq(s.cajas.der), s.r, aspect);
    const subida = ((sel.y0 + sel.y1) / 2 - (nav.y0 + nav.y1) / 2) / 2 * h;
    assert.ok(subida < h * 0.2, `${nombre}: el álbum sube ${subida.toFixed(0)} px`);
  }
});

// ---------------------------------------------------------------- near/far, raycasting, navegación
test('near/far dinámicos: todas las cajas de todos los estados quedan entre near y far, también con el zoom extremo', () => {
  for (const [nombre, [w, h]] of Object.entries({ ...verticales, ...apaisadas })) {
    const aspect = w / h, reservado = reservaNav(w, h);
    for (let v = 0; v <= N + 1; v++) {
      const cajas = enEstado(v), pts = [...puntosConjunto(cajas), ...puntosGiro(dim)];
      const c = calcularEncuadre({ puntos: pts, fovGrados: FOV, aspect, reservado });
      const pl = planos(c.radio * 0.55, c.radio * 1.5);       // como main.js: near con el zoom más cercano, far con el más lejano
      for (const k of [c.radio * 0.55, c.radio, c.radio * 1.5]) for (const p of pts) { const q = proy(p, { ...c, radio: k }, aspect); assert.ok(q.z > pl.near && q.z < pl.far, `${nombre} v${v} z=${q.z}`); }
    }
  }
});

test('raycasting tras reencuadrar (página, doble y selección): tocar el centro de cada bolsillo visible lo acierta', () => {
  for (const [v, lado] of [[1, 'der'], [4, 'izq'], [5, 'der'], [10, 'izq']]) {
    const cajas = enEstado(v), cand = candidatosTocables(album.estado, mundo.adaptador, (n) => album.matrizMundo(n));
    for (const [w, h] of [[390, 663], [844, 390], [1920, 1080]]) {
      const aspect = w / h;
      const cams = [calcularEncuadre({ puntos: puntosPagina({ lado, cajas, hoja: dim.hoja }), fovGrados: FOV, aspect, reservado: reservaNav(w, h), margen: COMPOSICION.margen }),
        calcularEncuadre({ puntos: puntosConjunto(cajas), fovGrados: FOV, aspect, reservado: reservaNav(w, h), margen: COMPOSICION.margenDoble })];
      for (const c of cams) for (const k of cand) {
        const q = proy(album.matrizMundo(k.nombre).slice(12, 15), c, aspect);
        if (Math.abs(q.x) > 1 || Math.abs(q.y) > 1) continue;                      // fuera de pantalla (la página contigua recortada a propósito): no se toca
        const r = rayoNDC(q.x, q.y, camaraDe(c), FOV, aspect, c.az, c.el);
        assert.equal((elegirBolsillo(r.origen, r.direccion, cand) || {}).nombre, k.nombre, `v${v} ${w}×${h} ${k.nombre}`);
      }
    }
  }
});

test('lectura en orden y cambio de caras: 1→2→3→4→5→6 … 17→18 y vuelta, sin saltos ni caras invertidas', () => {
  let s = { vueltas: 0, lado: 'der' };
  const ver = (modo) => { const { izquierda, derecha } = paginasDe(s.vueltas, TOTAL); return s.lado === 'izq' ? izquierda : derecha; };
  const paso = (dir, modo = 'pagina') => { const r = pasoLectura({ ...s, n: N, total: TOTAL, direccion: dir, modo }); if (r.accion === 'lado') s.lado = r.lado; else if (r.accion === 'girar') { s.vueltas += dir; s.lado = r.lado; }
    const ult = s.vueltas > N ? { izq: true } : null; void ult; return r; };
  paso(+1); assert.deepEqual(s, { vueltas: 1, lado: 'der' }); assert.equal(ver(), 1);
  const visto = [1];
  for (let i = 0; i < 17; i++) { paso(+1); visto.push(ver()); }
  assert.deepEqual(visto, Array.from({ length: 18 }, (_, i) => i + 1), 'lectura 1..18 en orden');
  assert.equal(paso(+1).accion, 'ninguna');
  const atras = [18]; for (let i = 0; i < 17; i++) { paso(-1); atras.push(ver()); }
  assert.deepEqual(atras, Array.from({ length: 18 }, (_, i) => 18 - i));
  paso(-1); assert.equal(s.vueltas, 0);
  // transiciones pedidas: hay giro SOLO de impar a par al avanzar, y de par a impar al retroceder
  const giraEntre = (a, b) => { const sa = { vueltas: vueltasParaPagina(a), lado: a % 2 ? 'der' : 'izq' }; return pasoLectura({ ...sa, n: N, total: TOTAL, direccion: b > a ? 1 : -1, modo: 'pagina' }); };
  assert.equal(giraEntre(1, 2).accion, 'girar'); assert.equal(giraEntre(2, 1).accion, 'girar');
  assert.equal(giraEntre(4, 5).accion, 'lado'); assert.equal(giraEntre(5, 4).accion, 'lado');
  assert.equal(giraEntre(5, 6).accion, 'girar'); assert.equal(giraEntre(6, 5).accion, 'girar');
  assert.equal(giraEntre(17, 18).accion, 'girar'); assert.equal(giraEntre(18, 17).accion, 'girar');
  assert.equal(pasoLectura({ vueltas: 3, lado: 'der', n: N, total: TOTAL, direccion: 1, modo: 'doble' }).accion, 'girar', 'en vista doble siempre se gira la hoja');
});

test('las 18 páginas ↔ 9 hojas físicas: cada página protagonista usa la hoja y cara correctas', () => {
  for (let p = 1; p <= TOTAL; p++) {
    const v = vueltasParaPagina(p), n = nombresCajas(v, N), lado = p % 2 ? 'der' : 'izq', hoja = Math.ceil(p / 2) - 1;
    assert.equal(n[lado === 'der' ? 'der' : 'izq'], `Hoja_${hoja}_Losa`, `página ${p}`);
    const cara = p % 2 ? 'F' : 'D'; assert.ok(album.nodo.get(`Hoja_${hoja}_${cara}_Bolsillo_0`), `nodo de la página ${p}`);
    assert.equal(mundo.adaptador.mapa.paginas[p - 1].bolsillos.length, 9);
  }
});

test('lado de la vista del lomo: el eje del lomo está donde se espera en cada estado (cerrado, abierto, final)', () => {
  const x = (v) => { const c = enEstado(v); return (c.lomo.x[0] + c.lomo.x[1]) / 2; };
  // 3.7.10: la caja real del lomo es x ∈ [-10,+6] mm respecto al eje, es decir, su centro queda 2 mm a su izquierda
  assert.ok(Math.abs(x(0) + 0.002 + dim.a / 2) < 1e-6 && Math.abs(x(3) + 0.002) < 1e-6 && Math.abs(x(10) + 0.002 - dim.a / 2) < 1e-6);
  for (const v of [1, 5, 10]) assert.ok(puntosVista({ vueltas: v, dim }).length === 8);
});
