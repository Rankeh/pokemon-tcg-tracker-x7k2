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

/** Caja (puntos del mundo) que debe verse en un estado asentado. `modo` 'doble' | 'pagina'; `lado` 'izq' | 'der' (solo en modo página). */
export function puntosVista({ vueltas, dim, modo = 'doble', lado = 'der' }) {
  const { a, d, h, n } = dim, z = d / 2, clase = claseVista(vueltas, n);
  let x;
  if (clase === 'cerrado' || clase === 'final') x = [-a / 2, a / 2];             // el conjunto se centra solo (centradoX)
  else if (modo === 'pagina') x = lado === 'izq' && clase !== 'portada' ? [-a, 0] : [0, a];
  else x = [-a, a];
  return esquinas(x, [0, h], [-z, z]);
}

/** Barrido de una hoja al girar: sube hasta quedar vertical sobre el lomo. Se añade a la caja mientras dura el giro para que no se recorte. */
export function puntosGiro(dim, elevacion = 0.03) {
  const { hoja, d, h } = dim, z = Math.min(d, 0.3) / 2, res = [];
  for (const g of [45, 90, 135]) res.push(...esquinas([hoja * Math.cos(g * GRAD)], [h + elevacion + hoja * Math.sin(g * GRAD)], [-z, z]));
  return res;
}

/** Elevación de la cámara: más baja en vertical (se aprecia el grosor), algo más alta en horizontal (hay menos alto disponible). */
export const elevacionPara = (aspect) => (aspect < 0.9 ? 52 : 58) * GRAD;

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
export function calcularEncuadre({ puntos, fovGrados = 32, aspect, az = 0, el = elevacionPara(aspect), reservado = {}, margen = 0.02 }) {
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
  while (!enRect(medir(obj, radio), R) && radio < 8) radio *= 1.005;          // seguro final: tras centrar, todo dentro del rectángulo
  return { az, el, radio, objetivo: obj };
}
const enRect = (m, R) => m.x0 >= R.x0 - 1e-6 && m.x1 <= R.x1 + 1e-6 && m.y0 >= R.y0 - 1e-6 && m.y1 <= R.y1 + 1e-6;

/** Planos near/far para una cámara en `radio` mirando una caja de radio `rc`: el álbum entero queda siempre entre ambos (lección de 3.5.1). */
export function planos(radio, radioMax, rc = 0.4) {
  return { near: Math.max(0.01, (radio - rc) * 0.5), far: Math.max(3, (radioMax + rc) * 4) };
}

/** Fracciones de interfaz reservadas a partir de rectángulos del DOM (todo en px del lienzo). `ficha`: rect o null. */
export function reservadoDesdeDom({ ancho, alto, cabeceraAbajo = 0, barraArriba = alto, ficha = null }) {
  const r = { arriba: Math.min(0.45, Math.max(0, cabeceraAbajo) / alto), abajo: Math.min(0.5, Math.max(0, alto - barraArriba) / alto), izquierda: 0, derecha: 0 };
  if (ficha) {
    if (ficha.left > ancho * 0.4) r.derecha = Math.min(0.6, Math.max(0, ancho - ficha.left) / ancho);       // tarjeta lateral (pantallas anchas)
    else r.abajo = Math.min(0.6, Math.max(0, alto - ficha.top) / alto);                                       // hoja inferior (móvil vertical)
  }
  return r;
}
