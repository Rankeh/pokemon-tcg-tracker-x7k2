// Three.js SIMULADO para ejecutar main.js en Chromium real (DOM, CSS, IndexedDB y eventos reales; SIN WebGL): amplía three-doble.mjs con lo que main.js necesita.
// Sirve para comprobar el cableado (cámara, interfaz, gestos, ficha, persistencia), no el dibujo.
import { Object3D, Mesh, MeshStandardMaterial, MeshBasicMaterial, Texture, CanvasTexture, DataTexture, TextureLoader, SRGBColorSpace, Vector2, PlaneGeometry, Float32BufferAttribute, HemisphereLight, DirectionalLight, ACESFilmicToneMapping, DoubleSide, RGBAFormat, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, ClampToEdgeWrapping } from './three-doble.mjs';
import { rayoNDC } from '../js/encuadre.js';
export { Object3D, Mesh, MeshStandardMaterial, MeshBasicMaterial, Texture, CanvasTexture, DataTexture, TextureLoader, SRGBColorSpace, Vector2, PlaneGeometry, Float32BufferAttribute, HemisphereLight, DirectionalLight, ACESFilmicToneMapping, DoubleSide, RGBAFormat, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, ClampToEdgeWrapping };
export class Scene extends Object3D {}
export class Group extends Object3D {}
export class BufferGeometry { constructor() { this.attributes = {}; this.index = null; } setAttribute(n, a) { this.attributes[n] = a; } setIndex(i) { this.index = { count: i.length }; } dispose() {} }
export class PerspectiveCamera extends Object3D {
  constructor(fov, aspect, near, far) { super(); Object.assign(this, { fov, aspect, near, far }); this.mira = [0, 0, 0]; this.position.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; }; }
  lookAt(x, y, z) { this.mira = [x, y, z]; }
  updateProjectionMatrix() {}
}
export class Raycaster {
  constructor() { this.ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 } }; }
  setFromCamera(v, cam) {                                       // mismo cálculo que Three.js, con la cámara registrada por lookAt()
    const p = cam.position, t = cam.mira, d = [p.x - t[0], p.y - t[1], p.z - t[2]], r = Math.hypot(...d);
    const el = Math.asin(d[1] / r), az = Math.atan2(d[0], d[2]);
    const q = rayoNDC(v.x, v.y, [p.x, p.y, p.z], cam.fov, cam.aspect, az, el);
    this.ray.origin = { x: q.origen[0], y: q.origen[1], z: q.origen[2] }; this.ray.direction = { x: q.direccion[0], y: q.direccion[1], z: q.direccion[2] };
  }
}
export class WebGLRenderer {
  constructor({ canvas }) { this.canvas = canvas; this.pr = 1; this.toneMapping = 0; this.capabilities = { getMaxAnisotropy: () => 4 }; this.info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } }; this.dibujos = 0; }
  setPixelRatio(v) { this.pr = v; } getPixelRatio() { return this.pr; } setSize() {}
  getContext() { return { getExtension: () => null, getParameter: () => 'stub', VERSION: 1, MAX_TEXTURE_SIZE: 2 }; }
  render(escena, cam) { this.dibujos++; this.ultima = { pos: { ...cam.position }, mira: [...cam.mira], aspect: cam.aspect, near: cam.near, far: cam.far }; }
}
