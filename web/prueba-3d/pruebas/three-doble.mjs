// DOBLE MÍNIMO de Three.js: solo lo que usa album3d.js. NO valida el comportamiento real de Three.js; valida que nuestro código
// encuentra los nodos del GLB real, aplica poses, cambia materiales y comparte geometría.
export const SRGBColorSpace = 'srgb';
export class Object3D {
  constructor() { this.name = ''; this.children = []; this.parent = null; this.userData = {}; this.visible = true;
    this.position = { x: 0, y: 0, z: 0 }; this.rotation = { x: 0, y: 0, z: 0 }; }
  add(o) { o.parent = this; this.children.push(o); return this; }
  remove(o) { this.children = this.children.filter((c) => c !== o); o.parent = null; }
  traverse(f) { f(this); this.children.forEach((c) => c.traverse(f)); }
}
export class Mesh extends Object3D { constructor(g, m) { super(); this.isMesh = true; this.geometry = g; this.material = m; } }
export class MeshStandardMaterial {
  constructor(o = {}) { this.map = null; this.disposed = false; this.color = { v: o.color, set(c) { this.v = c; } }; }
  dispose() { this.disposed = true; }
}
export class TextureLoader { load(url, ok) { setTimeout(() => ok({ url, isTexture: true }), 0); } }
