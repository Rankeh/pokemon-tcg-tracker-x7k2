// Encuadre cinematográfico PURO (sin Three.js ni DOM): calcula dónde poner la cámara para que una caja del álbum quepa en el rectángulo
// de pantalla que NO ocupa la interfaz, sea cual sea el viewport. Se prueba en Node con las dimensiones reales del modelo (pruebas/encuadre37.test.mjs).
//
// Convenciones (las mismas que OrbitaLigera/Three.js): Y arriba, el álbum yace en el plano XZ con el lomo en x = 0; la cámara mira desde +z y
// desde arriba. Posición = objetivo + radio·(cos el·sin az, sin el, cos el·cos az).
const GRAD = Math.PI / 180;
const ALTO_TAPA_DEFECTO = 0.322;      // el GLB no lo publica en extras; pruebas/encuadre37.test.mjs lo comprueba contra el modelo real

export const dimensiones = (p, altoTapa = p.alto_tapa || ALTO_TAPA_DEFECTO) => ({
  a: p.ancho_tapa,                                           // ancho de una tapa (también cubre la hoja)
  d: altoTapa,                                               // fondo (eje z)
  h: p.y_base + 2 * p.grosor_tapa + p.n_hojas * p.paso,      // altura del álbum cerrado
  hoja: p.ancho_hoja, n: p.n_hojas,
});

const esquinas = (x, y, z) => { const r = []; for (const a of x) for (const b of y) for (const c of z) r.push([a, b, c]); return r; };

/** Clase de encuadre según las hojas giradas: 'cerrado' | 'portada' (solo la tapa abierta) | 'doble' | 'final' (todo girado). */
export const claseVista = (vueltas, n) => (vueltas <= 0 ? 'cerrado' : vueltas >= n + 1 ? 'final' : vueltas === 1 ? 'portada' : 'doble');

/** Posición x del lomo en el mundo: el conjunto se centra solo (centradoX de logica.js): cerrado → -a/2, abierto → 0, todo girado → +a/2. */
export const lomoX = (vueltas, dim) => (vueltas <= 0 ? -dim.a / 2 : vueltas >= dim.n + 1 ? dim.a / 2 : 0);

/** Caja (puntos del mundo) que debe verse en un estado asentado (vista de dos páginas o álbum cerrado), a partir de las dimensiones del modelo. */
export function puntosVista({ vueltas, dim, modo = 'doble', lado = 'der' }) {
  const { a, d, h, n } = dim, z = d / 2, clase = claseVista(vueltas, n), sp = lomoX(vueltas, dim);
  let x;
  if (clase === 'cerrado') x = [sp, sp + a];                                     // solo la cubierta, sobre la pila derecha
  else if (modo === 'pagina') x = lado === 'izq' && clase !== 'portada' ? [sp - a, sp] : [sp, sp + a];
  else x = [sp - a, sp + a];                                                     // dos páginas (en «final»: pila a la izquierda y contratapa a la derecha)
  return esquinas(x, [0, h], [-z, z]);
}

/** Barrido de una hoja al girar: sube hasta quedar vertical sobre el lomo. Se añade a la caja mientras dura el giro para que no se recorte. */
export function puntosGiro(dim, elevacion = 0.03, factor = 1) {
  const { hoja, d, h } = dim, z = Math.min(d, 0.3) / 2, res = [];
  for (const g of [45, 90, 135]) res.push(...esquinas([hoja * Math.cos(g * GRAD)], [h + (elevacion + hoja * Math.sin(g * GRAD)) * factor], [-z, z]));
  return res;
}

/** Elevación de la cámara: más baja en vertical (se aprecia el grosor), algo más alta en horizontal (hay menos alto disponible). */
export const elevacionPara = (aspect) => (aspect < 0.9 ? 52 : 58) * GRAD;

// ------------------------------------------------------------------ composición artística (3.7.1b) — TODOS los parámetros en un solo sitio
export const COMPOSICION = {
  vecina: 0.12,          // franja visible de la página contigua, como fracción del ancho de la hoja (≈ 9 % del ancho de pantalla en vertical); además se ve el lomo
  margen: 0.035,         // margen exterior de la vista de una página y del álbum cerrado (coordenadas NDC: 0,035 = 1,75 % del ancho a cada lado)
  margenDoble: 0.02,     // margen de la vista de dos páginas (más ajustado: es la que más sufre en horizontal)
  sesgoOptico: 0.02,     // el centro VISUAL queda un 2 % del alto libre por encima del centro matemático (un objeto se percibe más «bajo» de lo que está)
  toleranciaContexto: 1.15, // con la ficha abierta se renuncia a vecina/lomo/página completa si obligan a alejar la cámara más de un 15 % respecto a la navegación
  filasContexto: 1,      // cuando ni la página cabe junto a la ficha: filas de cartas que se conservan sobre y bajo la carta seleccionada
  barridoGiro: 0.25,     // 3.7.10: fracción del barrido vertical de la hoja que cuenta al encuadrar un giro en doble página (1 = todo: alejaba la cámara +50 % en horizontal y molestaba)
  pasoFila: 0.0965,      // separación entre filas de bolsillos en el modelo (m); una prueba lo comprueba contra el GLB real
};

// ------------------------------------------------------------------ cajas del mundo (transformaciones REALES de los nodos, o dimensiones del modelo mientras algo se mueve)
/** Caja alineada con los ejes en el mundo de una malla: min/max locales + matriz del mundo (16 números, column-major). Vale con rotaciones de 0 o π en Z, como las hojas. */
export function aabbMundo({ min, max, matriz: m }) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
    const p = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  }
  return { x: [lo[0], hi[0]], y: [lo[1], hi[1]], z: [lo[2], hi[2]] };
}

/** Nombres de las mallas reales que forman cada parte visible en el estado `vueltas`. */
export function nombresCajas(vueltas, n) {
  return { der: vueltas <= n ? `Hoja_${Math.max(0, vueltas - 1)}_Losa` : 'Contratapa', izq: vueltas >= 2 ? `Hoja_${vueltas - 2}_Losa` : 'Tapa_Malla',
    baseDer: 'Contratapa', baseIzq: 'Tapa_Malla', lomo: 'Lomo' };
}

/** Cajas reales del estado asentado: `malla(nombre)` devuelve {min,max,matriz} de la malla del GLB. */
export function cajasReales(vueltas, n, malla) {
  const nombres = nombresCajas(vueltas, n), r = {};
  for (const [k, nombre] of Object.entries(nombres)) { const m = malla(nombre); if (!m) return null; r[k] = aabbMundo(m); }
  return r;
}

/** Las mismas cajas calculadas con las dimensiones del modelo (para estados intermedios, mientras una hoja gira y no hay transformación final que medir). */
export function cajasDimensiones(vueltas, dim, geo) {
  const { a, hoja, n } = dim, sp = lomoX(vueltas, dim), z = dim.d / 2, zh = Math.min(dim.d, 0.3) / 2, g = 0.0006;
  const hojaDer = (e) => ({ x: [sp, sp + hoja], y: [geo.yDerecha(e) - g, geo.yDerecha(e) + g], z: [-zh, zh] });
  const hojaIzq = (e) => ({ x: [sp - hoja, sp], y: [geo.yIzquierda(e) - g, geo.yIzquierda(e) + g], z: [-zh, zh] });
  // la cubierta delantera está sobre la pila derecha con el álbum cerrado y sobre la izquierda en cuanto se abre
  const tapaIzq = vueltas <= 0 ? { x: [sp, sp + a], y: [geo.yDerecha(0) - 0.003, geo.yDerecha(0) + 0.003], z: [-z, z] }
    : { x: [sp - a, sp], y: [geo.yIzquierda(0) - 0.003, geo.yIzquierda(0) + 0.003], z: [-z, z] };
  const contratapa = { x: [sp, sp + a], y: [0, 0.006], z: [-z, z] };
  return { der: vueltas <= n ? hojaDer(Math.max(1, vueltas)) : contratapa, izq: vueltas >= 2 ? hojaIzq(vueltas - 1) : tapaIzq, baseDer: contratapa, baseIzq: tapaIzq,
    lomo: { x: [sp - 0.01, sp + 0.01], y: [0, dim.h], z: [-z, z] } };
}

const esquinasCaja = (c) => esquinas(c.x, c.y, c.z);
const recortar = (c, rx, rz) => ({ x: rx ? [Math.max(c.x[0], rx[0]), Math.min(c.x[1], rx[1])] : c.x, y: c.y, z: rz ? [Math.max(c.z[0], rz[0]), Math.min(c.z[1], rz[1])] : c.z });
const vacia = (c) => c.x[0] > c.x[1] || c.z[0] > c.z[1];

/**
 * Puntos de la composición «página protagonista + lomo + franja de la contigua» (vista de una página en vertical).
 *  lado: 'der' | 'izq' (página protagonista); vecina: incluir la franja contigua; lomo: incluir el lomo.
 *  La franja es el lomo más COMPOSICION.vecina × ancho de hoja de la página contigua: se recorta la caja, no se mueve ninguna hoja.
 *  filaZ: [z0, z1] para quedarse solo con unas filas de la página (último recurso con la ficha abierta).
 */
export function puntosPagina({ lado, cajas, vecina = true, lomo = true, filaZ = null, hoja, composicion = COMPOSICION }) {
  const prop = lado === 'der' ? ['der', 'baseDer'] : ['izq', 'baseIzq'], otra = lado === 'der' ? ['izq', 'baseIzq'] : ['der', 'baseDer'];
  const lomoMitad = (cajas.lomo.x[1] - cajas.lomo.x[0]) / 2, sp = (cajas.lomo.x[0] + cajas.lomo.x[1]) / 2;
  const franja = lomoMitad + composicion.vecina * hoja;
  const rz = filaZ;
  const pts = [];
  for (const k of prop) pts.push(...esquinasCaja(recortar(cajas[k], null, rz)));
  if (lomo) pts.push(...esquinasCaja(recortar(cajas.lomo, null, rz)));
  if (vecina) for (const k of otra) { const c = recortar(cajas[k], lado === 'der' ? [sp - franja, sp] : [sp, sp + franja], rz); if (!vacia(c)) pts.push(...esquinasCaja(c)); }
  return pts;
}

/** Vista de dos páginas (o álbum cerrado) a partir de las cajas: todas las piezas visibles, ajustadas a lo que hay (no a una caja envolvente conservadora). */
export const puntosConjunto = (cajas) => Object.values(cajas).flatMap(esquinasCaja);

// ------------------------------------------------------------------ proyección
export function baseCamara(az, el) {
  const dir = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];       // del objetivo hacia la cámara
  const f = dir.map((v) => -v);
  let r = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0];                     // f × (0,1,0)
  const lr = Math.hypot(...r); r = r.map((v) => v / lr);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { dir, f, r, u };
}

/** Proyección en coordenadas normalizadas (-1..1) de un punto del mundo; z = profundidad a lo largo de la vista. */
export function proyectarPunto(p, pos, objetivo, fovGrados, aspect, az, el) {
  const b = baseCamara(az, el), d = [p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]], tv = Math.tan(fovGrados * GRAD / 2);
  const dot = (u) => d[0] * u[0] + d[1] * u[1] + d[2] * u[2], z = dot(b.f);
  return { x: dot(b.r) / (z * tv * aspect), y: dot(b.u) / (z * tv), z };
}

/** Rayo (origen, dirección) que sale de la cámara por el punto NDC (nx, ny): lo mismo que hace THREE.Raycaster.setFromCamera. */
export function rayoNDC(nx, ny, pos, fovGrados, aspect, az, el) {
  const b = baseCamara(az, el), tv = Math.tan(fovGrados * GRAD / 2);
  const d = [0, 1, 2].map((i) => b.f[i] + b.r[i] * nx * tv * aspect + b.u[i] * ny * tv), l = Math.hypot(...d);
  return { origen: pos, direccion: d.map((v) => v / l) };
}

const posicionDe = (obj, radio, az, el) => { const b = baseCamara(az, el); return [0, 1, 2].map((i) => obj[i] + radio * b.dir[i]); };

/** Rectángulo NDC libre a partir de lo que ocupa la interfaz (fracciones 0..1 del ancho/alto del lienzo). */
export function rectLibre({ arriba = 0, abajo = 0, izquierda = 0, derecha = 0 } = {}, margen = 0.02) {
  return { x0: -1 + 2 * (izquierda + margen), x1: 1 - 2 * (derecha + margen), y0: -1 + 2 * (abajo + margen), y1: 1 - 2 * (arriba + margen) };
}

/**
 * Cámara que encaja `puntos` en el rectángulo libre del viewport, centrados en él y lo más grandes posible.
 * Devuelve { az, el, radio, objetivo }. No usa una distancia fija: depende del fov, la proporción, la elevación y la interfaz.
 */
export function calcularEncuadre({ puntos, fovGrados = 32, aspect, az = 0, el = elevacionPara(aspect), reservado = {}, margen = 0.02, centroVisual = null, sesgo = 0 }) {
  const R = rectLibre(reservado, margen), W = R.x1 - R.x0, H = R.y1 - R.y0;
  if (!(W > 0.1) || !(H > 0.1)) throw new RangeError('la interfaz ocupa casi toda la pantalla');
  const b = baseCamara(az, el);
  const c = [0, 1, 2].map((i) => puntos.reduce((s, p) => s + p[i], 0) / puntos.length);
  let obj = c, radio = 0.5;
  const medir = (o, r) => {
    const pos = posicionDe(o, r, az, el);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zs = 0, zmin = Infinity;
    for (const p of puntos) { const q = proyectarPunto(p, pos, o, fovGrados, aspect, az, el); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); zs += q.z; zmin = Math.min(zmin, q.z); }
    return { x0, x1, y0, y1, z: zs / puntos.length, zmin };
  };
  const cabe = (o, r) => { const m = medir(o, r); return m.zmin > 0.01 && m.x1 - m.x0 <= W && m.y1 - m.y0 <= H; };
  const resolver = (o) => { let lo = 0.03, hi = 8; for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; cabe(o, mid) ? (hi = mid) : (lo = mid); } return hi; };
  const tv = Math.tan(fovGrados * GRAD / 2);
  for (let it = 0; it < 8; it++) {
    radio = resolver(obj);
    const m = medir(obj, radio), cx = (m.x0 + m.x1) / 2, cy = (m.y0 + m.y1) / 2, dx = (R.x0 + R.x1) / 2 - cx, dy = (R.y0 + R.y1) / 2 - cy;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) break;
    // mover cámara y objetivo juntos: la imagen se desplaza lo contrario
    obj = [0, 1, 2].map((i) => obj[i] - b.r[i] * dx * m.z * tv * aspect - b.u[i] * dy * m.z * tv);
  }
  radio = resolver(obj);
  if (centroVisual) {
    // Centrado VISUAL: el centro matemático de la caja incluye el grosor de las pilas, la cubierta y el lomo; lo que el ojo centra es la CARA de la página.
    // Se coloca el centro de `centroVisual` en el centro del rectángulo libre (+ un pequeño sesgo óptico hacia arriba) sin sacar nada del rectángulo.
    for (let it = 0; it < 3; it++) {
      const m = medir(obj, radio), pos = posicionDe(obj, radio, az, el), ys = centroVisual.map((p) => proyectarPunto(p, pos, obj, fovGrados, aspect, az, el).y);
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2, deseado = (R.y0 + R.y1) / 2 + sesgo * H;
      let dy = deseado - cy; dy = Math.max(R.y0 - m.y0, Math.min(R.y1 - m.y1, dy));                   // sin salirse del rectángulo libre
      if (Math.abs(dy) < 1e-6) break;
      obj = [0, 1, 2].map((i) => obj[i] - b.u[i] * dy * m.z * tv);
    }
  }
  while (!enRect(medir(obj, radio), R) && radio < 8) radio *= 1.005;          // seguro final: tras centrar, todo dentro del rectángulo
  return { az, el, radio, objetivo: obj };
}
const enRect = (m, R) => m.x0 >= R.x0 - 1e-6 && m.x1 <= R.x1 + 1e-6 && m.y0 >= R.y0 - 1e-6 && m.y1 <= R.y1 + 1e-6;

/** Planos near/far para una cámara en `radio` mirando una caja de radio `rc`: el álbum entero queda siempre entre ambos (lección de 3.5.1). */
export function planos(radio, radioMax, rc = 0.4) {
  return { near: Math.max(0.01, (radio - rc) * 0.5), far: Math.max(3, (radioMax + rc) * 4) };
}

/**
 * Fracciones de interfaz reservadas a partir de rectángulos del DOM (todo en px del lienzo). `ficha`: rect o null.
 * Con la interfaz en columnas laterales (móvil horizontal) se pasan `izquierdaPx`/`derechaPx` y arriba/abajo quedan libres.
 */
export function reservadoDesdeDom({ ancho, alto, cabeceraAbajo = 0, barraArriba = alto, izquierdaPx = 0, derechaPx = 0, ficha = null }) {
  const r = { arriba: Math.min(0.45, Math.max(0, cabeceraAbajo) / alto), abajo: Math.min(0.5, Math.max(0, alto - barraArriba) / alto),
    izquierda: Math.min(0.4, Math.max(0, izquierdaPx) / ancho), derecha: Math.min(0.4, Math.max(0, derechaPx) / ancho) };
  if (ficha) {
    if (ficha.left > ancho * 0.4) r.derecha = Math.min(0.6, Math.max(r.derecha, (ancho - ficha.left) / ancho));          // tarjeta lateral (pantallas anchas)
    else r.abajo = Math.min(0.6, Math.max(0, alto - ficha.top) / alto);                                       // hoja inferior (móvil vertical)
  }
  return r;
}

/**
 * Encuadre de la SELECCIÓN con la ficha abierta, en orden de prioridad (ficha utilizable → carta visible → contexto de su página → lomo → franja contigua).
 * `niveles`: lista de { nombre, puntos } de más a menos contexto; se elige el primero que NO obliga a alejar la cámara más de `toleranciaContexto`
 * respecto a `radioRef` (el encuadre de navegación). El último nivel se acepta siempre (es el que garantiza ver la carta).
 */
export function elegirEncuadreSeleccion({ niveles, base, radioRef, tolerancia = COMPOSICION.toleranciaContexto }) {
  let ultimo = null;
  for (let i = 0; i < niveles.length; i++) {
    ultimo = { ...calcularEncuadre({ ...base, puntos: niveles[i].puntos }), nivel: niveles[i].nombre, indice: i };
    if (ultimo.radio <= radioRef * tolerancia) return ultimo;
  }
  return ultimo;
}
