// Fase 3.7.2a — Aspecto: iluminación de estudio, materiales de grafito, sombra de contacto falsa y niveles de calidad.
// Todo es PROCEDURAL (sin imágenes externas) y sin sombras dinámicas, postprocesado ni bloom. No toca el GLB en disco: los materiales se ajustan en memoria
// al cargarlo (por NOMBRE de material: Cubierta, Hoja, Soldadura, Funda) y las UV (que el GLB trae a cero) se rellenan en memoria para poder aplicar relieve.
// Las funciones puras (parámetros, ruido, estimación de luminancia, elección de calidad) se prueban en Node; el dibujo real solo puede verlo un navegador.
import * as THREE from 'three';
import { aabbMundo } from './encuadre.js';

// ------------------------------------------------------------------ parámetros artísticos (un solo sitio)
export const PALETA = {
  cubierta: 0x384559,      // grafito azul noche: más claro que la mesa, sin llegar al gris lavado
  pagina: 0x4a4e58,        // grafito neutro y claramente más claro que la cubierta (se separan hoja y tapa)
  lomo: 0x3f4d6b,          // el mismo azul noche, más saturado y claro: el lomo se lee como pieza aparte
  soldadura: 0x7a8296,     // marco protector de cada bolsillo: plástico pulido, la pieza más clara (junto con los cantos) pero sin neón
  funda: 0xf2f6ff,
  mesa: 0x22262d,
};
export const MATERIALES = {
  cubierta: { rugosidad: 0.8, relieve: 0.5 },
  pagina: { rugosidad: 0.6, relieve: 0.0 },        // satinado suave
  lomo: { rugosidad: 0.55, relieve: 0.32 },        // más liso que las tapas: la luz de contorno le dibuja el redondeo
  soldadura: { rugosidad: 0.36 },                  // pulido: da un destello suave en el borde protector según el ángulo
  funda: { rugosidad: 0.45, opacidad: 1 },         // la transparencia sale del mapa de reflejo (alfa ≤ 0,06): jamás tapa ni lava la ilustración
  mesa: { rugosidad: 0.95 },
};
// Cantos: se pintan en los VÉRTICES (sin UV ni texturas ni mallas nuevas) según la normal: cara plana = 1, canto/bisel = multiplicador.
export const CANTOS = {
  cubierta: { canto: [1.55, 1.55, 1.6] },          // el bisel «atrapa» la luz: la tapa se separa del fondo y de las hojas
  pagina: { canto: [1.75, 1.6, 1.35] },            // canto de hoja algo más claro y cálido (acento cálido controlado)
  lomo: { curvatura: 0.55 },                       // oscurece los lados del cilindro: refuerza el redondeo y lo separa de las tapas
};
export const FUNDA_REFLEJO = { tam: 64, base: 0.02, brillo: 0.045, ancho: 0.11 };       // alfa total ≤ 0,065 sobre la carta
export const EXPOSICION = 1.15;
export const LUCES = {
  hemi: { cielo: 0xa9b9d6, suelo: 0x262a31, intensidad: 0.7 },                  // ambiente más bajo: deja que las caras laterales caigan y se lea el volumen
  principal: { color: 0xfff1e0, intensidad: 3.3, pos: [-0.6, 0.62, 0.5] },      // lateral-izquierda y más rasante: revela relieve y cantos
  relleno: { color: 0x9fb4dc, intensidad: 0.5, pos: [0.8, 0.3, 0.35] },         // lado contrario, tenue
  contorno: { color: 0x8aa8ff, intensidad: 1.9, pos: [0.3, 0.5, -0.85] },       // por detrás: separa el álbum del fondo; frío y discreto
};
// Niveles: se comparte todo el código; cambian solo estos números.
export const NIVELES = {
  baja: { luces: ['hemi', 'principal'], relieve: 0, mapaRugosidad: false, reflejoFunda: false, fisico: false, sombra: true, anisotropia: 1 },
  media: { luces: ['hemi', 'principal', 'relleno', 'contorno'], relieve: 128, mapaRugosidad: true, reflejoFunda: true, fisico: false, sombra: true, anisotropia: 2 },
  alta: { luces: ['hemi', 'principal', 'relleno', 'contorno'], relieve: 256, mapaRugosidad: true, reflejoFunda: true, fisico: true, sombra: true, anisotropia: 4 },       // fisico: MeshPhysicalMaterial con «sheen» de tejido en tapas y lomo
};
export const SOMBRA = { fraccion: 0.84, opacidad: 0.6, desplazamiento: [0.004, -0.004], y: -0.0002, tam: 96 };
export const ESCALA_UV = 0.036;          // metros de álbum por repetición de la textura (grano fino)

// ------------------------------------------------------------------ elección de calidad (sin detectar por nombre de dispositivo)
export const NOMBRES_CALIDAD = ['baja', 'media', 'alta', 'legado'];
/** `legado` reproduce EXACTAMENTE el aspecto de la 3.7.1c: sirve de línea base para medir el rendimiento antes/después con la misma compilación. */
export function elegirCalidad({ parametro = null, tactil = false, nucleos = 0, memoriaGb = 0 } = {}) {
  const p = (parametro || '').toLowerCase();
  const alias = { bajo: 'baja', medio: 'media', alto: 'alta', antes: 'legado' };
  const n = alias[p] || p;
  if (NOMBRES_CALIDAD.includes(n)) return { nivel: n, origen: 'parámetro' };
  if (tactil) {                                  // móvil/tablet: conservador. Safari no expone deviceMemory (0 = desconocido): se decide por núcleos.
    const potente = nucleos >= 6 && (memoriaGb === 0 || memoriaGb >= 4);
    return { nivel: potente ? 'media' : 'baja', origen: 'automático (táctil)' };
  }
  return { nivel: nucleos >= 8 ? 'alta' : 'media', origen: 'automático (escritorio)' };
}

// ------------------------------------------------------------------ procedural: relieve fino tipo cuero técnico (mosaico sin costuras)
function hash(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function ruidoPeriodico(x, y, periodo, semilla) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const m = (i) => ((i % periodo) + periodo) % periodo;
  const a = hash(m(x0), m(y0), semilla), b = hash(m(x0 + 1), m(y0), semilla), c = hash(m(x0), m(y0 + 1), semilla), d = hash(m(x0 + 1), m(y0 + 1), semilla);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** Altura en [0,1] de una celda (tam×tam, periódica): grano de cuero + trama fina de tejido. */
export function alturaRelieve(tam, semilla = 7) {
  const h = new Float32Array(tam * tam), paso = tam / 16;
  for (let j = 0; j < tam; j++) for (let i = 0; i < tam; i++) {
    const g1 = ruidoPeriodico(i * 6 / tam, j * 6 / tam, 6, semilla), g2 = ruidoPeriodico(i * 24 / tam, j * 24 / tam, 24, semilla + 1), g3 = ruidoPeriodico(i * 12 / tam, j * 12 / tam, 12, semilla + 2);
    const trama = 0.5 + 0.25 * Math.sin(2 * Math.PI * i / paso) * Math.sin(2 * Math.PI * j / paso);
    h[j * tam + i] = 0.34 * g1 + 0.26 * g3 + 0.22 * g2 + 0.18 * trama;      // g1/g3: ondulación suave «acolchada»; g2 y la trama: microtextura
  }
  return h;
}
/** Mapa de normales RGBA8 (tam×tam) a partir de la altura. `fuerza` pequeña: el relieve debe leerse con la luz, no como ruido. */
export function generarNormales(tam, fuerza = 2.2, semilla = 7) {
  const h = alturaRelieve(tam, semilla), out = new Uint8Array(tam * tam * 4), m = (i) => (i + tam) % tam;
  for (let j = 0; j < tam; j++) for (let i = 0; i < tam; i++) {
    const dx = (h[j * tam + m(i + 1)] - h[j * tam + m(i - 1)]) * fuerza, dy = (h[m(j + 1) * tam + i] - h[m(j - 1) * tam + i]) * fuerza;
    const l = Math.hypot(dx, dy, 1), k = (j * tam + i) * 4;
    out[k] = Math.round((-dx / l * 0.5 + 0.5) * 255); out[k + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255); out[k + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); out[k + 3] = 255;
  }
  return out;
}
/** Mapa de rugosidad (canal G, multiplica la rugosidad del material): variaciones discretas entre 0,82 y 1,0. */
export function generarRugosidad(tam, semilla = 11) {
  const h = alturaRelieve(tam, semilla), out = new Uint8Array(tam * tam * 4);
  for (let k = 0; k < tam * tam; k++) { const v = Math.round((0.82 + 0.18 * h[k]) * 255); out[k * 4] = v; out[k * 4 + 1] = v; out[k * 4 + 2] = v; out[k * 4 + 3] = 255; }
  return out;
}

// ------------------------------------------------------------------ procedural: sombra de contacto falsa (rectángulo redondeado difuminado, no un rectángulo negro)
export function generarSombra(tam = SOMBRA.tam, fraccion = SOMBRA.fraccion, opacidad = SOMBRA.opacidad) {
  const out = new Uint8Array(tam * tam * 4), medio = fraccion / 2, radio = 0.07, margen = (1 - fraccion) / 2;
  for (let j = 0; j < tam; j++) for (let i = 0; i < tam; i++) {
    const x = Math.abs((i + 0.5) / tam - 0.5) - (medio - radio), y = Math.abs((j + 0.5) / tam - 0.5) - (medio - radio);
    const d = Math.hypot(Math.max(x, 0), Math.max(y, 0)) + Math.min(Math.max(x, y), 0) - radio;          // distancia con signo al borde del álbum
    let a = 0;
    if (d <= 0) a = opacidad;
    else if (d < margen) { const t = d / margen; a = opacidad * (0.65 * Math.exp(-d / (0.22 * margen)) + 0.35 * (1 - t) * (1 - t)) * (1 - t * t * (3 - 2 * t)); }   // contacto: más oscura junto al borde, cae suave
    out[(j * tam + i) * 4 + 3] = Math.round(Math.min(1, a) * 255);
  }
  return out;
}

// ------------------------------------------------------------------ procedural: reflejo de la funda (RGBA blanco; solo varía el alfa, siempre ≤ 0,065)
/** Alfa de una película protectora: velo mínimo + una franja diagonal suave de reflejo. La ilustración queda visible: el máximo alfa es 0,065. */
export function generarReflejoFunda(tam = FUNDA_REFLEJO.tam, { base, brillo, ancho } = FUNDA_REFLEJO) {
  const out = new Uint8Array(tam * tam * 4);
  for (let j = 0; j < tam; j++) for (let i = 0; i < tam; i++) {
    const u = (i + 0.5) / tam, v = (j + 0.5) / tam, d = (u + 0.55 * v - 0.62) / ancho;        // franja diagonal que cruza la página
    const d2 = (u + 0.55 * v - 1.05) / (ancho * 0.6);                                          // segunda franja, más fina y tenue
    const a = base + brillo * Math.exp(-d * d) + 0.4 * brillo * Math.exp(-d2 * d2), k = (j * tam + i) * 4;
    out[k] = out[k + 1] = out[k + 2] = 255; out[k + 3] = Math.round(a * 255);
  }
  return out;
}

// ------------------------------------------------------------------ colores de vértice por normal: cantos y curvatura sin mallas ni texturas extra
/** `fn(ny)` → multiplicador RGB por vértice (ny = |normal.y|). Devuelve false si la geometría no tiene normales. */
export function colorearPorNormal(geometria, fn) {
  const nor = geometria.attributes.normal;
  if (!nor) return false;
  const c = new Float32Array(nor.count * 3);
  for (let i = 0; i < nor.count; i++) { const m = fn(Math.abs(nor.getY(i))); c[i * 3] = m[0]; c[i * 3 + 1] = m[1]; c[i * 3 + 2] = m[2]; }
  geometria.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return true;
}
const suavizar = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Canto: cara plana (ny ≥ 0,9) = 1; bisel y lateral (ny ≤ 0,6) = `canto`; entre medias, degradado. */
export const cantoPorNormal = (canto) => (ny) => { const t = suavizar(0.6, 0.9, ny); return canto.map((k) => k + (1 - k) * t); };
/** Curvatura: 1 arriba, `k` en los laterales (sombreado falso del redondeo del lomo). */
export const curvaturaPorNormal = (k) => (ny) => { const m = k + (1 - k) * suavizar(0.15, 0.95, ny); return [m, m, m]; };

// ------------------------------------------------------------------ UV planares en memoria (el GLB trae UV = 0 en tapa, lomo y hojas)
/** Proyección por eje dominante de la normal. Solo se usa para el relieve; las cartas (UV propias) no se tocan. */
export function rellenarUV(geometria, escala = ESCALA_UV, escalaV = escala) {
  const pos = geometria.attributes.position, nor = geometria.attributes.normal;
  if (!pos) return false;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = nor ? Math.abs(nor.getX(i)) : 0, ny = nor ? Math.abs(nor.getY(i)) : 1, nz = nor ? Math.abs(nor.getZ(i)) : 0;
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / escala; uv[i * 2 + 1] = v / escalaV;
  }
  geometria.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return true;
}

/** UV de página completa (la funda cubre media hoja: x ∈ [0, ancho], z centrada) para el mapa de reflejo. */
export function uvPagina(geometria, ancho = 0.232, alto = 0.3) {
  const pos = geometria.attributes.position;
  if (!pos) return false;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) / ancho; uv[i * 2 + 1] = pos.getZ(i) / alto + 0.5; }
  geometria.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return true;
}

// ------------------------------------------------------------------ estimación ANALÍTICA de luminancia (no es una medición de GPU)
const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.076, 0.90834, 0.01566], [0.0284, 0.13383, 0.83777]];
const ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];
const aLineal = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const aSrgb = (c) => { c = Math.min(1, Math.max(0, c)); return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
export const hexLineal = (h) => [aLineal(((h >> 16) & 255) / 255), aLineal(((h >> 8) & 255) / 255), aLineal((h & 255) / 255)];
const mat = (M, v) => M.map((f) => f[0] * v[0] + f[1] * v[1] + f[2] * v[2]);
/** Color final aproximado (sRGB 0..1) de una superficie HORIZONTAL con albedo `hex` bajo el equipo de luces `luces` (modelo Lambert de Three r155+, ACES con exposición). */
export function estimarSalida(hex, { luces = LUCES, exposicion = EXPOSICION, activas = ['hemi', 'principal', 'relleno'], aces = true } = {}) {
  const alb = Array.isArray(hex) ? hex : hexLineal(hex), E = [0, 0, 0];      // número sRGB (0xRRGGBB) o array lineal
  const suma = (c, k) => { for (let i = 0; i < 3; i++) E[i] += c[i] * k; };
  if (activas.includes('hemi')) suma(hexLineal(luces.hemi.cielo), luces.hemi.intensidad);        // normal hacia arriba: recibe el cielo
  for (const n of ['principal', 'relleno', 'contorno']) {
    if (!activas.includes(n) || !luces[n]) continue;
    const l = luces[n], ly = l.pos[1] / Math.hypot(...l.pos);
    suma(hexLineal(l.color), l.intensidad * Math.max(0, ly));
  }
  let c = alb.map((a, i) => a * E[i] / Math.PI * exposicion / 0.6);
  if (aces) {
    c = mat(ACES_IN, c).map((v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081));
    c = mat(ACES_OUT, c);
  }
  return c.map(aSrgb);
}
export const luminanciaSrgb = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// ------------------------------------------------------------------ clase Aspecto: aplica todo a la escena y lo libera
// ------------------------------------------------------------------ TEMAS (3.7.3 · dirección «videojuego»): mismos materiales y niveles, distinta paleta/luz/escenario
export const TEMAS = {
  // CLARO (por defecto desde 3.7.4): estudio neutro estilo producto Apple. Grafito + blanco roto, un único acento (azul), suelo gris perla que se funde con el fondo, sin alfombra ni colores saturados.
  claro: {
    paleta: { cubierta: 0x343a43, pagina: 0xf0eee8, lomo: 0x424951, soldadura: 0xa8a49a, funda: 0xffffff, mesa: 0xe6e6ea },
    luces: {
      hemi: { cielo: 0xffffff, suelo: 0xb9b9c1, intensidad: 0.9 },
      principal: { color: 0xfff6ec, intensidad: 2.2, pos: [-0.6, 0.62, 0.5] },
      relleno: { color: 0xe6edff, intensidad: 0.5, pos: [0.8, 0.3, 0.35] },
      contorno: { color: 0xffffff, intensidad: 1.3, pos: [0.3, 0.5, -0.85] },
    },
    cantos: { cubierta: { canto: [1.5, 1.5, 1.5] }, pagina: { canto: [0.9, 0.88, 0.82] }, lomo: { curvatura: 0.62 } },
    exposicion: 1.12, sheen: 0xcfd6e2, aro: 0x0a84ff, sombraOpacidad: 0.32,
    escenario: { suelo: [0xe6e6ea], tablones: false, alfombra: null, ladoSuelo: 3 },
  },
  noche: { paleta: PALETA, luces: LUCES, cantos: CANTOS, exposicion: EXPOSICION, sheen: 0x7f93b8, aro: 0xe8b25a, sombraOpacidad: SOMBRA.opacidad, escenario: null },
  acogedor: {
    paleta: { cubierta: 0x3a7f92, pagina: 0xeadfc8, lomo: 0xb9733f, soldadura: 0xb48a58, funda: 0xffffff, mesa: 0xc9a47c },
    luces: {
      hemi: { cielo: 0xfff0dc, suelo: 0xb98a62, intensidad: 0.85 },
      principal: { color: 0xffe3bd, intensidad: 2.3, pos: [-0.6, 0.62, 0.5] },
      relleno: { color: 0xffc9b0, intensidad: 0.45, pos: [0.8, 0.3, 0.35] },
      contorno: { color: 0xffd7a0, intensidad: 1.4, pos: [0.3, 0.5, -0.85] },
    },
    cantos: { cubierta: { canto: [1.3, 1.3, 1.25] }, pagina: { canto: [0.95, 0.8, 0.55] }, lomo: { curvatura: 0.62 } },      // cantos de hoja dorados
    exposicion: 1.08, sheen: 0xffe6c4, aro: 0xf0701e, sombraOpacidad: 0.4,
    escenario: { suelo: [0xc9a47c], alfombra: { centro: 0xf3e3c8, anillo: 0xe9a39a, borde: 0xd98a82, costura: 0xfff4e0 }, radioAlfombra: 0.42, ladoSuelo: 3 },
  },
};
export const NOMBRES_TEMA = Object.keys(TEMAS);
export const elegirTema = (p) => (TEMAS[(p || '').toLowerCase()] ? (p || '').toLowerCase() : 'claro');

const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
/** Suelo de madera clara: tablones suaves, centro algo más luminoso y alfa que se desvanece hacia el borde (deja ver el fondo desenfocado de la página). RGBA8 sRGB. */
export function generarSuelo(tam = 128, color = 0xc79a6b, tablones = true) {
  const out = new Uint8Array(tam * tam * 4), [r, g, b] = rgb(color);
  for (let j = 0; j < tam; j++) for (let i = 0; i < tam; i++) {
    const u = (i + 0.5) / tam, v = (j + 0.5) / tam, d = Math.hypot(u - 0.5, v - 0.5) * 2;
    const tablon = Math.floor(u * 14), junta = tablones && Math.abs(((u * 14) % 1) - 0.0) < 0.04 ? 0.88 : 1;
    const tono = (tablones ? 0.96 + 0.06 * hash(tablon, 3, 5) : 1) * junta * (1.06 - 0.16 * Math.min(1, d));
    const k = (j * tam + i) * 4;
    out[k] = Math.min(255, r * tono); out[k + 1] = Math.min(255, g * tono); out[k + 2] = Math.min(255, b * tono);
    out[k + 3] = Math.round(255 * (1 - suavizar(0.3, 0.95, d)));
  }
  return out;
}
/** Alfombra redonda de juego: centro crema, anillo rosado, costura discontinua y borde; alfa circular con borde suave. RGBA8 sRGB. */
export function generarAlfombra(tam = 512, p = TEMAS.acogedor.escenario.alfombra) {
  const out = new Uint8Array(tam * tam * 4), C = { c: rgb(p.centro), a: rgb(p.anillo), b: rgb(p.borde), s: rgb(p.costura) };
  for (let j = 0; j < tam; j++) for (let i = 0; i < tam; i++) {
    const x = ((i + 0.5) / tam - 0.5) * 2, y = ((j + 0.5) / tam - 0.5) * 2, r = Math.hypot(x, y), ang = Math.atan2(y, x);
    const px = 1.5 / tam * 2, mezcla = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t), paso = (e) => suavizar(e - px, e + px, r);      // bordes antialias (~1,5 px): sin escalones al ampliar
    let col = mezcla(C.c, C.a, paso(0.64));
    col = mezcla(col, C.b, paso(0.9));
    col = mezcla(col, C.s, Math.max(0, 1 - Math.abs(r - 0.8) / (px * 1.2)) * 0.9);               // costura continua fina
    const luz = 1.04 - 0.1 * r, k = (j * tam + i) * 4;
    out[k] = Math.min(255, col[0] * luz); out[k + 1] = Math.min(255, col[1] * luz); out[k + 2] = Math.min(255, col[2] * luz);
    out[k + 3] = Math.round(255 * (1 - suavizar(0.955, 0.985, r)));
  }
  return out;
}

export class Aspecto {
  constructor({ renderer, scene, nivel = 'media', origen = '', tema = 'noche' }) {
    this.tema = TEMAS[tema] ? tema : 'noche'; this.t = TEMAS[this.tema];
    this.renderer = renderer; this.scene = scene; this.nivel = nivel; this.origen = origen;
    this.config = NIVELES[nivel] || null;                    // null = legado
    this.luces = {}; this.recursos = []; this.mallasPropias = []; this.sombra = null; this.mesa = null; this.materiales = new Map(); this.uvHechas = new WeakSet();
    this._montarLuces();
    this._montarMesa();
    if (this.config && this.config.sombra) this._montarSombra();
    if (this.config) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = this.t.exposicion; }
    else { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; }
  }

  _recurso(r) { this.recursos.push(r); return r; }
  _anadir(o) { this.scene.add(o); this.mallasPropias.push(o); return o; }

  _montarLuces() {
    const L = this.luces;
    if (!this.config) {                                       // legado (3.7.1c)
      L.hemi = new THREE.HemisphereLight(0xbfd2f2, 0x2a2018, 0.9);
      L.principal = new THREE.DirectionalLight(0xffe1c0, 2.4); L.principal.position.set(-0.5, 0.9, 0.5);
      L.relleno = new THREE.DirectionalLight(0x9db8e6, 0.7); L.relleno.position.set(0.7, 0.5, 0.2);
    } else {
      const a = this.config.luces;
      L.hemi = new THREE.HemisphereLight(this.t.luces.hemi.cielo, this.t.luces.hemi.suelo, this.t.luces.hemi.intensidad);
      L.principal = new THREE.DirectionalLight(this.t.luces.principal.color, this.t.luces.principal.intensidad); L.principal.position.set(...this.t.luces.principal.pos);
      if (a.includes('relleno')) { L.relleno = new THREE.DirectionalLight(this.t.luces.relleno.color, this.t.luces.relleno.intensidad); L.relleno.position.set(...this.t.luces.relleno.pos); }
      if (a.includes('contorno')) { L.contorno = new THREE.DirectionalLight(this.t.luces.contorno.color, this.t.luces.contorno.intensidad); L.contorno.position.set(...this.t.luces.contorno.pos); }
    }
    for (const l of Object.values(L)) this._anadir(l);
  }

  _montarMesa() {
    const esc = this.config && this.t.escenario;
    if (esc) { this._montarEscenario(esc); return; }
    const g = this._recurso(new THREE.PlaneGeometry(2, 1.4));
    const m = this._recurso(new THREE.MeshStandardMaterial(this.config ? { color: this.t.paleta.mesa, roughness: MATERIALES.mesa.rugosidad } : { color: 0x2a2e35, roughness: 0.92 }));
    this.mesa = new THREE.Mesh(g, m); this.mesa.rotation.x = -Math.PI / 2; this.mesa.position.y = -0.0005; this.mesa.name = 'Mesa';
    this._anadir(this.mesa);
  }

  /** Escenario de juego: suelo de madera que se desvanece + alfombra redonda (2 planos, 2 texturas, 2 materiales; sin sombras ni postprocesado). */
  _montarEscenario(esc) {
    const plano = (nombre, lado, tex, y, orden) => {
      const t = this._recurso(new THREE.DataTexture(tex.datos, tex.tam, tex.tam, THREE.RGBAFormat));
      t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
      const m = this._recurso(new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, metalness: 0, transparent: true, depthWrite: false }));
      const o = new THREE.Mesh(this._recurso(new THREE.PlaneGeometry(lado, lado)), m);
      o.rotation.x = -Math.PI / 2; o.position.y = y; o.renderOrder = orden; o.name = nombre; this._anadir(o); return o;
    };
    this.mesa = plano('Suelo', esc.ladoSuelo, { datos: generarSuelo(128, esc.suelo[0], esc.tablones !== false), tam: 128 }, -0.0008, -3);
    if (esc.alfombra) this.alfombra = plano('Alfombra', esc.radioAlfombra * 2, { datos: generarAlfombra(512, esc.alfombra), tam: 512 }, -0.0005, -2);
  }

  _montarSombra() {
    const tam = SOMBRA.tam;
    const t = this._recurso(new THREE.DataTexture(generarSombra(tam, SOMBRA.fraccion, this.t.sombraOpacidad), tam, tam, THREE.RGBAFormat));
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
    const g = this._recurso(new THREE.PlaneGeometry(1, 1));
    const m = this._recurso(new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.sombra = new THREE.Mesh(g, m); this.sombra.name = 'SombraContacto';
    this.sombra.rotation.x = -Math.PI / 2; this.sombra.position.y = SOMBRA.y; this.sombra.renderOrder = -1;
    this._anadir(this.sombra);
  }

  /** Material de las cartas. Nuevo: sin iluminación ni tone mapping → colores EXACTOS de la ilustración (gestión de color: la textura es sRGB). Legado: el de siempre. */
  materialCarta(color, rugosidad) {
    return this.config ? new THREE.MeshBasicMaterial({ color, toneMapped: false }) : new THREE.MeshStandardMaterial({ color, roughness: rugosidad, metalness: 0 });
  }

  /** Ajusta los materiales del GLB (por nombre), pinta cantos en los vértices y rellena las UV que faltan. Idempotente. */
  aplicarAlbum(album) {
    if (!this.config || this.aplicado) return;
    this.aplicado = true;
    const cfg = this.config, grupos = { cubierta: [], lomo: [], hoja: [], soldadura: [], funda: [] };
    album.escena.traverse((o) => {
      if (!o.isMesh || !o.material || o.userData?.tipo === 'vista-carta') return;
      if (o.name === 'Lomo') grupos.lomo.push(o);
      else { const g = { Cubierta: 'cubierta', Hoja: 'hoja', Soldadura: 'soldadura', Funda: 'funda' }[o.material.name]; if (g) grupos[g].push(o); }
    });
    const normal = cfg.relieve ? this._textura(generarNormales(cfg.relieve), cfg.relieve) : null;
    const rugo = cfg.mapaRugosidad && cfg.relieve ? this._textura(generarRugosidad(cfg.relieve), cfg.relieve) : null;

    // un material por grupo (nunca por bolsillo); las mallas que lo comparten (p. ej. Tapa y Contratapa) siguen compartiéndolo
    const nuevoMaterial = (grupo, hex, p, relieve) => {
      const viejo = grupos[grupo][0].material;
      let m = viejo;
      if (cfg.fisico && relieve) {                                // alta: tejido técnico con «sheen» (brillo suave en rasante); solo tapas y lomo
        m = this._recurso(new THREE.MeshPhysicalMaterial({ roughness: p.rugosidad, metalness: 0 }));
        m.sheen = 0.55; m.sheenRoughness = 0.55; m.sheenColor.set(this.t.sheen);
      } else if (grupo === 'lomo') m = this._recurso(viejo.clone());
      m.name = { cubierta: 'Cubierta', lomo: 'Lomo', hoja: 'Hoja', soldadura: 'Soldadura' }[grupo];
      m.color.set(hex); m.roughness = p.rugosidad; m.metalness = 0;
      m.vertexColors = grupo === 'cubierta' || grupo === 'lomo' || grupo === 'hoja';          // SOLO los grupos cuyas geometrías reciben color de vértice: sin atributo, Three pinta negro (era el marco negro de los bolsillos)
      if (grupo === 'lomo') { m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 4; }     // la cara superior del lomo (y=0,0435) coincide con la de la tapa cerrada (0,0405+0,003): se empuja atrás para que no haya z-fighting
      if (relieve && normal && p.relieve) { m.normalMap = normal; m.normalScale.set(p.relieve, p.relieve); if (rugo) m.roughnessMap = rugo; }
      m.needsUpdate = true;
      for (const o of grupos[grupo]) o.material = m;
      if (m !== viejo && grupo !== 'lomo') viejo.dispose?.();
      return m;
    };
    if (grupos.cubierta.length) nuevoMaterial('cubierta', this.t.paleta.cubierta, MATERIALES.cubierta, true);
    if (grupos.lomo.length) {
      if (!grupos.cubierta.length) grupos.lomo[0].material = grupos.lomo[0].material.clone?.() || grupos.lomo[0].material;
      nuevoMaterial('lomo', this.t.paleta.lomo, MATERIALES.lomo, true);
    }
    if (grupos.hoja.length) nuevoMaterial('hoja', this.t.paleta.pagina, MATERIALES.pagina, false);
    if (grupos.soldadura.length) nuevoMaterial('soldadura', this.t.paleta.soldadura, MATERIALES.soldadura, false);

    // cantos y curvatura en los vértices (una pasada por geometría; las geometrías están compartidas entre hojas/tapas)
    const pintar = (grupo, fn) => { for (const o of grupos[grupo]) if (!o.geometry.attributes.color) colorearPorNormal(o.geometry, fn); };
    pintar('cubierta', cantoPorNormal(this.t.cantos.cubierta.canto)); pintar('hoja', cantoPorNormal(this.t.cantos.pagina.canto)); pintar('lomo', curvaturaPorNormal(this.t.cantos.lomo.curvatura));

    // funda: película con reflejo en el alfa (media/alta) o velo uniforme (baja). Siempre transparente y sin depthWrite: no bloquea el raycasting (no es un objeto de picking)
    if (grupos.funda.length) {
      const f = grupos.funda[0].material;
      f.color.set(this.t.paleta.funda); f.roughness = MATERIALES.funda.rugosidad; f.metalness = 0; f.transparent = true; f.depthWrite = false;
      if (cfg.reflejoFunda) {
        const t = this._recurso(new THREE.DataTexture(generarReflejoFunda(), FUNDA_REFLEJO.tam, FUNDA_REFLEJO.tam, THREE.RGBAFormat));
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
        f.map = t; f.opacity = MATERIALES.funda.opacidad;
        for (const o of grupos.funda) if (!this.uvHechas.has(o.geometry)) { uvPagina(o.geometry); this.uvHechas.add(o.geometry); }
      } else f.opacity = 0.06;
      f.needsUpdate = true;
    }
    if (normal) {
      for (const o of [...grupos.cubierta, ...grupos.lomo]) if (!this.uvHechas.has(o.geometry)) { rellenarUV(o.geometry); this.uvHechas.add(o.geometry); }
    }
    this.sincronizar(album);
  }

  _textura(datos, tam) {
    const t = this._recurso(new THREE.DataTexture(datos, tam, tam, THREE.RGBAFormat));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = this.config.anisotropia; t.needsUpdate = true;
    return t;
  }

  /** Coloca y dimensiona la sombra de contacto según el estado actual del álbum (cerrado, abierto o todo girado). */
  sincronizar(album) {
    const s = this.sombra;
    if (!s) return;
    const partes = ['Contratapa', 'Tapa_Malla', 'Lomo'].map((n) => album.cajaMalla(n)).filter(Boolean).map(aabbMundo);
    if (!partes.length) return;
    const x0 = Math.min(...partes.map((p) => p.x[0])), x1 = Math.max(...partes.map((p) => p.x[1]));
    const z0 = Math.min(...partes.map((p) => p.z[0])), z1 = Math.max(...partes.map((p) => p.z[1]));
    const f = SOMBRA.fraccion;
    s.scale.set((x1 - x0) / f, (z1 - z0) / f, 1);
    s.position.x = (x0 + x1) / 2 + SOMBRA.desplazamiento[0]; s.position.z = (z0 + z1) / 2 + SOMBRA.desplazamiento[1];
    this.ultimaSombra = { ancho: x1 - x0, fondo: z1 - z0, x: s.position.x };
  }

  resumen() {
    return { nivel: this.nivel, origen: this.origen, luces: Object.keys(this.luces), relieve: this.config ? this.config.relieve : 0, mapaRugosidad: !!(this.config && this.config.mapaRugosidad),
      tema: this.tema, escenario: !!this.alfombra, sombraContacto: !!this.sombra, exposicion: this.renderer.toneMappingExposure, recursosPropios: this.recursos.length };
  }

  liberar() {
    for (const o of this.mallasPropias) this.scene.remove(o);
    for (const r of this.recursos) r.dispose?.();
    this.mallasPropias = []; this.recursos = []; this.luces = {}; this.sombra = null; this.mesa = null; this.alfombra = null;
  }
}
