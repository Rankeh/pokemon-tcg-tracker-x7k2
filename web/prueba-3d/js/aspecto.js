// Fase 3.7.2a — Aspecto: iluminación de estudio, materiales de grafito, sombra de contacto falsa y niveles de calidad.
// Todo es PROCEDURAL (sin imágenes externas) y sin sombras dinámicas, postprocesado ni bloom. No toca el GLB en disco: los materiales se ajustan en memoria
// al cargarlo (por NOMBRE de material: Cubierta, Hoja, Soldadura, Funda) y las UV (que el GLB trae a cero) se rellenan en memoria para poder aplicar relieve.
// Las funciones puras (parámetros, ruido, estimación de luminancia, elección de calidad) se prueban en Node; el dibujo real solo puede verlo un navegador.
import * as THREE from 'three';
import { aabbMundo } from './encuadre.js';

// ------------------------------------------------------------------ parámetros artísticos (un solo sitio)
export const PALETA = {
  cubierta: 0x344052,      // grafito azulado: más claro que la mesa, sin llegar al gris lavado
  pagina: 0x40444d,        // grafito neutro, algo distinto de la cubierta
  lomo: 0x384562,          // mismo grafito que la cubierta, un punto más azul y más claro
  soldadura: 0x555b69,     // costuras y bordes de funda: algo más claras para que se lean sin gritar
  funda: 0xe3ebff,
  mesa: 0x22262d,
};
export const MATERIALES = {
  cubierta: { rugosidad: 0.78, relieve: 0.42 },
  pagina: { rugosidad: 0.62, relieve: 0.0 },       // satinado suave
  lomo: { rugosidad: 0.58, relieve: 0.3 },         // algo más liso que las tapas: la luz de contorno le dibuja el redondeo
  soldadura: { rugosidad: 0.55 },
  funda: { rugosidad: 0.5, opacidad: 0.06 },       // MUY transparente y mate: no produce reflejos sobre la ilustración
  mesa: { rugosidad: 0.95 },
};
export const EXPOSICION = 1.15;
export const LUCES = {
  hemi: { cielo: 0xa9b9d6, suelo: 0x2c3038, intensidad: 0.9 },
  principal: { color: 0xfff1e0, intensidad: 2.7, pos: [-0.55, 0.85, 0.5] },     // lateral-izquierda, alta y algo frontal
  relleno: { color: 0x9fb4dc, intensidad: 0.55, pos: [0.8, 0.3, 0.35] },        // lado contrario, tenue
  contorno: { color: 0x8aa8ff, intensidad: 1.5, pos: [0.25, 0.45, -0.85] },     // por detrás: separa el álbum del fondo; frío y discreto
};
// Niveles: se comparte todo el código; cambian solo estos números.
export const NIVELES = {
  baja: { luces: ['hemi', 'principal'], relieve: 0, mapaRugosidad: false, sombra: true, anisotropia: 1 },
  media: { luces: ['hemi', 'principal', 'relleno', 'contorno'], relieve: 128, mapaRugosidad: false, sombra: true, anisotropia: 2 },
  alta: { luces: ['hemi', 'principal', 'relleno', 'contorno'], relieve: 256, mapaRugosidad: true, sombra: true, anisotropia: 4 },
};
export const SOMBRA = { fraccion: 0.84, opacidad: 0.6, desplazamiento: [0.004, -0.004], y: -0.0002, tam: 96 };
export const ESCALA_UV = 0.024;          // metros de álbum por repetición de la textura (grano fino)

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
    const g1 = ruidoPeriodico(i * 8 / tam, j * 8 / tam, 8, semilla), g2 = ruidoPeriodico(i * 24 / tam, j * 24 / tam, 24, semilla + 1);
    const trama = 0.5 + 0.25 * Math.sin(2 * Math.PI * i / paso) * Math.sin(2 * Math.PI * j / paso);
    h[j * tam + i] = 0.5 * g1 + 0.28 * g2 + 0.22 * trama;
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

// ------------------------------------------------------------------ UV planares en memoria (el GLB trae UV = 0 en tapa, lomo y hojas)
/** Proyección por eje dominante de la normal. Solo se usa para el relieve; las cartas (UV propias) no se tocan. */
export function rellenarUV(geometria, escala = ESCALA_UV) {
  const pos = geometria.attributes.position, nor = geometria.attributes.normal;
  if (!pos) return false;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = nor ? Math.abs(nor.getX(i)) : 0, ny = nor ? Math.abs(nor.getY(i)) : 1, nz = nor ? Math.abs(nor.getZ(i)) : 0;
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / escala; uv[i * 2 + 1] = v / escala;
  }
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
export class Aspecto {
  constructor({ renderer, scene, nivel = 'media', origen = '' }) {
    this.renderer = renderer; this.scene = scene; this.nivel = nivel; this.origen = origen;
    this.config = NIVELES[nivel] || null;                    // null = legado
    this.luces = {}; this.recursos = []; this.mallasPropias = []; this.sombra = null; this.mesa = null; this.materiales = new Map(); this.uvHechas = new WeakSet();
    this._montarLuces();
    this._montarMesa();
    if (this.config && this.config.sombra) this._montarSombra();
    if (this.config) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = EXPOSICION; }
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
      L.hemi = new THREE.HemisphereLight(LUCES.hemi.cielo, LUCES.hemi.suelo, LUCES.hemi.intensidad);
      L.principal = new THREE.DirectionalLight(LUCES.principal.color, LUCES.principal.intensidad); L.principal.position.set(...LUCES.principal.pos);
      if (a.includes('relleno')) { L.relleno = new THREE.DirectionalLight(LUCES.relleno.color, LUCES.relleno.intensidad); L.relleno.position.set(...LUCES.relleno.pos); }
      if (a.includes('contorno')) { L.contorno = new THREE.DirectionalLight(LUCES.contorno.color, LUCES.contorno.intensidad); L.contorno.position.set(...LUCES.contorno.pos); }
    }
    for (const l of Object.values(L)) this._anadir(l);
  }

  _montarMesa() {
    const g = this._recurso(new THREE.PlaneGeometry(2, 1.4));
    const m = this._recurso(new THREE.MeshStandardMaterial(this.config ? { color: PALETA.mesa, roughness: MATERIALES.mesa.rugosidad } : { color: 0x2a2e35, roughness: 0.92 }));
    this.mesa = new THREE.Mesh(g, m); this.mesa.rotation.x = -Math.PI / 2; this.mesa.position.y = -0.0005; this.mesa.name = 'Mesa';
    this._anadir(this.mesa);
  }

  _montarSombra() {
    const tam = SOMBRA.tam;
    const t = this._recurso(new THREE.DataTexture(generarSombra(tam), tam, tam, THREE.RGBAFormat));
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

  /** Ajusta los materiales del GLB (por nombre) y rellena las UV que faltan. Idempotente. */
  aplicarAlbum(album) {
    if (!this.config || this.aplicado) return;
    this.aplicado = true;
    const porNombre = new Map(), lomo = [];
    album.escena.traverse((o) => {
      if (!o.isMesh || !o.material || o.userData?.tipo === 'vista-carta') return;
      if (o.name === 'Lomo') lomo.push(o); else porNombre.set(o.material.name, o.material);
    });
    const cfg = this.config;
    const normal = cfg.relieve ? this._textura(generarNormales(cfg.relieve), cfg.relieve) : null;
    const rugo = cfg.mapaRugosidad ? this._textura(generarRugosidad(cfg.relieve), cfg.relieve) : null;
    const dar = (mat, hex, p, conRelieve) => {
      mat.color.set(hex); mat.roughness = p.rugosidad; mat.metalness = 0;
      if (conRelieve && normal && p.relieve) { mat.normalMap = normal; mat.normalScale.set(p.relieve, p.relieve); if (rugo) mat.roughnessMap = rugo; mat.needsUpdate = true; }
      this.materiales.set(mat, true);
    };
    const cub = porNombre.get('Cubierta'), hoja = porNombre.get('Hoja'), sol = porNombre.get('Soldadura'), fun = porNombre.get('Funda');
    if (cub) dar(cub, PALETA.cubierta, MATERIALES.cubierta, true);
    if (hoja) dar(hoja, PALETA.pagina, MATERIALES.pagina, false);
    if (sol) dar(sol, PALETA.soldadura, MATERIALES.soldadura, false);
    if (fun) { fun.color.set(PALETA.funda); fun.roughness = MATERIALES.funda.rugosidad; fun.opacity = MATERIALES.funda.opacidad; fun.transparent = true; fun.depthWrite = false; this.materiales.set(fun, true); }
    if (cub && lomo.length) {                                 // el lomo comparte la geometría de «Cubierta» pero necesita su propio material (más liso y algo más claro)
      const ml = this._recurso(cub.clone()); ml.name = 'Lomo';
      dar(ml, PALETA.lomo, MATERIALES.lomo, true);
      for (const o of lomo) o.material = ml;
    }
    if (normal) {
      album.escena.traverse((o) => {
        if (!o.isMesh || o.userData?.tipo === 'vista-carta' || !o.material || !o.material.normalMap) return;
        if (!this.uvHechas.has(o.geometry)) { rellenarUV(o.geometry); this.uvHechas.add(o.geometry); }
      });
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
      sombraContacto: !!this.sombra, exposicion: this.renderer.toneMappingExposure, recursosPropios: this.recursos.length };
  }

  liberar() {
    for (const o of this.mallasPropias) this.scene.remove(o);
    for (const r of this.recursos) r.dispose?.();
    this.mallasPropias = []; this.recursos = []; this.luces = {}; this.sombra = null; this.mesa = null;
  }
}
