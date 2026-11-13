// Álbum 3D con Three.js: carga el GLB, localiza los nodos por nombre y les aplica las poses de logica.js.
// No reconstruye el modelo nunca: cambiar imagen = cambiar material.map; rellenar/vaciar bolsillo = añadir/quitar un hijo con geometría compartida.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { crearGeometria, EstadoAlbum, pose, centradoX, analizarNombre, memoriaTexturaBytes } from './logica.js';

export const TAM_TEXTURA = { w: 256, h: 358 };

export async function cargarAlbum(url, { renderer, urlCarta, onTiempo = () => {} }) {
  const t0 = performance.now();
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('No se pudo cargar ' + url + ' (' + resp.status + ')');
  const buf = await resp.arrayBuffer();
  const tDescarga = performance.now() - t0;
  const t1 = performance.now();
  const gltf = await new Promise((ok, mal) => new GLTFLoader().parse(buf, '', ok, mal));
  const tProceso = performance.now() - t1;
  onTiempo({ descargaMs: tDescarga, procesoMs: tProceso, bytes: buf.byteLength });
  return new Album3D(gltf.scene, { renderer, urlCarta, bytes: buf.byteLength, tDescarga, tProceso });
}

class Album3D {
  constructor(escena, { renderer, urlCarta, bytes, tDescarga, tProceso }) {
    this.escena = escena;
    this.renderer = renderer;
    this.urlCarta = urlCarta;                  // (n) => URL de la imagen n de prueba
    this.carga = { bytes, descargaMs: tDescarga, procesoMs: tProceso };
    this.nodo = new Map();
    escena.traverse((o) => this.nodo.set(o.name, o));
    this.raiz = this.nodo.get('Album');
    const ex = this.raiz.userData;
    this.params = ex;
    this.geo = crearGeometria(ex);
    this.estado = new EstadoAlbum(this.geo);
    this.elemento = [this.nodo.get('Tapa')];
    for (let i = 0; i < this.geo.n; i++) this.elemento.push(this.nodo.get('Hoja_' + i));
    this.texturas = new Map();                 // url -> {promesa, textura}
    this.anisotropia = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    this.geomCarta = { F: null, D: null };
    this.materialesPropios = [];
    this.cartaDe = new Map();                  // nombre de carta -> mesh
    this.onCambio = () => {};
    this._prepararCartas();
    this.aplicar();
  }

  _prepararCartas() {
    this.escena.traverse((o) => {
      if (o.isMesh && o.userData.tipo === 'carta') {
        const info = analizarNombre(o.name);
        this.geomCarta[info.cara] ||= o.geometry;
        this._equipar(o);
      }
    });
  }

  /** Cada carta tiene su propio material para poder cambiar su imagen sin tocar las demás. */
  _equipar(mesh) {
    const m = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.55, metalness: 0 });
    mesh.material = m;
    mesh.userData.material = m;
    this.materialesPropios.push(m);
    this.cartaDe.set(mesh.name, mesh);
  }

  // ---------------------------------------------------------------- texturas
  _textura(url) {
    let e = this.texturas.get(url);
    if (!e) {
      e = { textura: null, promesa: null };
      e.promesa = new Promise((ok, mal) => {
        new THREE.TextureLoader().load(url, (t) => {
          t.flipY = false;                                  // las UV de glTF tienen el origen arriba a la izquierda
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = this.anisotropia;
          e.textura = t; ok(t);
        }, undefined, mal);
      });
      this.texturas.set(url, e);
    }
    return e.promesa;
  }

  async setCartaImagen(nombreCarta, url) {
    const mesh = this.cartaDe.get(nombreCarta);
    if (!mesh) return false;
    mesh.userData.url = url;
    const t = await this._textura(url);
    if (mesh.userData.url !== url) return false;            // llegó otra petición después
    mesh.userData.material.map = t;
    mesh.userData.material.color.set(0xffffff);
    mesh.userData.material.needsUpdate = true;
    this.onCambio();                                       // avisa a main.js: hay que volver a dibujar
    return true;
  }

  /** Pone la imagen real de las cartas de las caras que se ven (o se van a ver). Perezoso: no carga las enterradas. */
  cargarVisibles() {
    for (const { hoja, cara } of this.estado.carasNecesarias(1)) {
      const nodoCara = this.nodo.get('Hoja_' + (hoja - 1) + '_' + cara);
      if (!nodoCara) continue;
      for (const b of nodoCara.children) {
        if (b.userData.tipo !== 'bolsillo') continue;
        for (const c of b.children) {
          if (c.isMesh && !c.userData.url) this.setCartaImagen(c.name, this.urlCarta(c.userData.imagen));
        }
      }
    }
  }

  // ---------------------------------------------------------------- bolsillos
  bolsillo(hoja, cara, k) { return this.nodo.get('Hoja_' + (hoja - 1) + '_' + cara + '_Bolsillo_' + k); }

  cartaEn(bolsilloNodo) { return bolsilloNodo.children.find((c) => c.isMesh && c.userData.tipo === 'carta') || null; }

  ponerCarta(bolsilloNodo, imagen) {
    const info = analizarNombre(bolsilloNodo.name);
    if (this.cartaEn(bolsilloNodo)) return this.cartaEn(bolsilloNodo);
    const nombre = bolsilloNodo.name.replace('_Bolsillo_', '_Carta_');
    const mesh = new THREE.Mesh(this.geomCarta[info.cara], null);   // geometría COMPARTIDA, no se duplica
    mesh.name = nombre;
    mesh.userData = { tipo: 'carta', imagen };
    this._equipar(mesh);
    bolsilloNodo.add(mesh);
    this.setCartaImagen(nombre, this.urlCarta(imagen));
    return mesh;
  }

  quitarCarta(bolsilloNodo) {
    const c = this.cartaEn(bolsilloNodo);
    if (!c) return false;
    bolsilloNodo.remove(c);
    this.cartaDe.delete(c.name);
    c.userData.material.dispose();                            // libera el material; la textura sigue en caché para reutilizarla
    return true;
  }

  vaciosVisibles() {
    const res = [];
    for (const { hoja, cara } of this.estado.tocables()) {
      for (let k = 0; k < 9; k++) { const b = this.bolsillo(hoja, cara, k); if (b && !this.cartaEn(b)) res.push(b); }
    }
    return res;
  }

  /** Mallas de carta con las que se puede interactuar ahora (solo las dos hojas superiores). */
  cartasTocables() {
    const res = [];
    for (const { hoja, cara } of this.estado.tocables()) {
      const nodoCara = this.nodo.get('Hoja_' + (hoja - 1) + '_' + cara);
      for (const b of nodoCara.children) if (b.userData.tipo === 'bolsillo') { const c = this.cartaEn(b); if (c) res.push(c); }
    }
    return res;
  }

  // ---------------------------------------------------------------- animación
  /** Aplica el estado lógico a los nodos: pose de cada elemento, centrado y visibilidad. */
  aplicar() {
    const { geo, estado } = this;
    for (let i = 0; i < geo.elementos; i++) {
      const p = pose(geo, i, estado.progreso[i]), n = this.elemento[i];
      n.position.y = p.y;
      n.rotation.z = p.rotZ;
    }
    this.raiz.position.x = centradoX(geo, estado.progreso);
    const vis = estado.visibles();
    for (let i = 0; i < geo.elementos; i++) this.elemento[i].visible = vis.has(i);
  }

  actualizar(dt) {
    const mov = this.estado.actualizar(dt);
    if (mov) this.aplicar();
    return mov;
  }

  // ---------------------------------------------------------------- métricas reales (contadas, no inventadas)
  contarEscena({ soloVisibles }) {
    let tris = 0, mallas = 0;
    this.escena.traverse((o) => {
      if (!o.isMesh) return;
      if (soloVisibles) { for (let p = o; p; p = p.parent) if (!p.visible) return; }
      const g = o.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      mallas++;
    });
    return { triangulos: tris, mallas };
  }

  memoriaTexturasEstimada() {
    const n = [...this.texturas.values()].filter((e) => e.textura).length;
    return { texturas: n, bytes: n * memoriaTexturaBytes(TAM_TEXTURA.w, TAM_TEXTURA.h) };
  }
}
