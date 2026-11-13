// DOBLE MÍNIMO de Three.js: solo lo que usan nuestros módulos. NO valida el comportamiento real de Three.js (render, shaders, texturas en GPU);
// valida NUESTRA lógica: que se encuentran los nodos del GLB real, que se aplican poses y matrices coherentes, que se crean y liberan materiales/texturas
// y que el recuento de usos de la caché no tiene fugas.
export const SRGBColorSpace = 'srgb';
export const stats = { materiales: 0, materialesLiberados: 0, texturasCreadas: 0, texturasLiberadas: 0 };

const identidad = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a, b) => { const r = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let f = 0; f < 4; f++) for (let k = 0; k < 4; k++) r[c * 4 + f] += a[k * 4 + f] * b[c * 4 + k]; return r; };

export class Object3D {
  constructor() {
    this.name = ''; this.children = []; this.parent = null; this.userData = {}; this.visible = true;
    const v = { x: 0, y: 0, z: 0 };
    this.position = { ...v, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.rotation = { ...v };
    this.scale = { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.matrixWorld = { elements: identidad() };
  }
  add(o) { o.parent = this; this.children.push(o); return this; }
  remove(o) { this.children = this.children.filter((c) => c !== o); o.parent = null; }
  traverse(f) { f(this); this.children.slice().forEach((c) => c.traverse(f)); }
  /** Matriz local T·Rz·S (las hojas solo giran alrededor de Z) multiplicada por las de los padres. */
  updateWorldMatrix(arriba) {
    if (arriba && this.parent) this.parent.updateWorldMatrix(true, false);
    const c = Math.cos(this.rotation.z), s = Math.sin(this.rotation.z);
    const L = [c * this.scale.x, s * this.scale.x, 0, 0, -s * this.scale.y, c * this.scale.y, 0, 0, 0, 0, this.scale.z, 0, this.position.x, this.position.y, this.position.z, 1];
    this.matrixWorld.elements = this.parent ? mul(this.parent.matrixWorld.elements, L) : L;
  }
}
export class Mesh extends Object3D { constructor(g, m) { super(); this.isMesh = true; this.geometry = g; this.material = m; } }
export class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } }
export class MeshStandardMaterial {
  constructor(o = {}) {
    this.map = o.map ?? null; this.normalMap = null; this.roughnessMap = null; this.disposed = false; this.opts = o; this.name = ''; this.opacity = 1; this.transparent = !!o.transparent; this.depthWrite = o.depthWrite ?? true;
    this.roughness = o.roughness ?? 1; this.metalness = o.metalness ?? 0; this.normalScale = new Vector2(1, 1); this.needsUpdate = false;
    this.color = { v: o.color, set(c) { this.v = c; } }; stats.materiales++;
  }
  clone() { const m = new MeshStandardMaterial(this.opts); Object.assign(m, { name: this.name, opacity: this.opacity, transparent: this.transparent, depthWrite: this.depthWrite, roughness: this.roughness, metalness: this.metalness, normalMap: this.normalMap, roughnessMap: this.roughnessMap }); m.color.v = this.color.v; m.normalScale = new Vector2(this.normalScale.x, this.normalScale.y); return m; }
  dispose() { if (!this.disposed) { this.disposed = true; stats.materialesLiberados++; } }
}
export class MeshPhysicalMaterial extends MeshStandardMaterial { constructor(o = {}) { super(o); this.sheen = 0; this.sheenRoughness = 1; this.sheenColor = { v: 0, set(c) { this.v = c; } }; } }
export class MeshBasicMaterial {
  constructor(o = {}) { this.map = null; this.disposed = false; this.opts = o; this.toneMapped = o.toneMapped ?? true; this.transparent = !!o.transparent; this.color = { v: o.color, set(c) { this.v = c; } }; if (o.map) this.map = o.map; stats.materiales++; }
  dispose() { if (!this.disposed) { this.disposed = true; stats.materialesLiberados++; } }
}
export class PlaneGeometry { constructor(w, h) { this.w = w; this.h = h; this.disposed = false; } dispose() { this.disposed = true; } }
export class Float32BufferAttribute { constructor(a, n) { this.array = a; this.itemSize = n; this.count = a.length / n; } }
export class BufferGeometry { constructor() { this.attributes = {}; this.index = null; this.disposed = false; } setAttribute(n, a) { this.attributes[n] = a; return this; } setIndex(i) { this.index = { count: i.length }; return this; } dispose() { this.disposed = true; } }
class Luz extends Object3D { constructor(...a) { super(); this.args = a; this.color = {}; } }
export class HemisphereLight extends Luz {}
export class DirectionalLight extends Luz {}
export const ACESFilmicToneMapping = 4, DoubleSide = 2, RGBAFormat = 1023, LinearFilter = 1006, LinearMipmapLinearFilter = 1008, RepeatWrapping = 1000, ClampToEdgeWrapping = 1001;
export class Texture { constructor(tag) { this.tag = tag; this.disposed = false; stats.texturasCreadas++; } dispose() { if (!this.disposed) { this.disposed = true; stats.texturasLiberadas++; } } }
export class DataTexture extends Texture { constructor(datos, w, h) { super('datos'); this.datos = datos; this.ancho = w; this.alto = h; this.isDataTexture = true; } }
export class CanvasTexture extends Texture { constructor(lienzo) { super('canvas'); this.lienzo = lienzo; this.isCanvasTexture = true; } }
export class TextureLoader {
  async loadAsync(url) {
    if (TextureLoader.falla && TextureLoader.falla(url)) throw new Error('no se pudo cargar ' + url);
    const t = new Texture(url); t.url = url; return t;
  }
}
