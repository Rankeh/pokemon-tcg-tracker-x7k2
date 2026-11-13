// Álbum 3D con Three.js: carga el GLB, localiza los nodos por nombre y aplica las poses de logica.js.
// El GLB solo trae la estructura (tapa, 9 hojas, 162 bolsillos vacíos y 2 plantillas de carta); el contenido de cada bolsillo lo pone VistaBolsillos
// a partir de la colección real. Nada del modelo se reconstruye al cambiar una cantidad.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { crearGeometria, EstadoAlbum, pose, centradoX } from './logica.js';

export async function cargarAlbum(url, { renderer, onTiempo = () => {} }) {
  const t0 = performance.now();
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('No se pudo cargar ' + url + ' (' + resp.status + ')');
  const buf = await resp.arrayBuffer();
  const tDescarga = performance.now() - t0;
  const t1 = performance.now();
  const gltf = await new Promise((ok, mal) => new GLTFLoader().parse(buf, '', ok, mal));
  const tProceso = performance.now() - t1;
  onTiempo({ descargaMs: tDescarga, procesoMs: tProceso, bytes: buf.byteLength });
  return new Album3D(gltf.scene, { renderer, bytes: buf.byteLength, tDescarga, tProceso });
}

class Album3D {
  constructor(escena, { renderer, bytes, tDescarga, tProceso }) {
    this.escena = escena;
    this.renderer = renderer;
    this.carga = { bytes, descargaMs: tDescarga, procesoMs: tProceso };
    this.nodo = new Map();
    escena.traverse((o) => this.nodo.set(o.name, o));
    this.raiz = this.nodo.get('Album');
    this.params = this.raiz.userData;
    this.geo = crearGeometria(this.params);
    this.estado = new EstadoAlbum(this.geo);
    this.elemento = [this.nodo.get('Tapa')];
    for (let i = 0; i < this.geo.n; i++) this.elemento.push(this.nodo.get('Hoja_' + i));
    this.onCambio = () => {};
    // Geometría de carta compartida (una por cara) tomada de las plantillas del GLB; las plantillas se retiran de la escena.
    this.geomCarta = { F: this.nodo.get('Plantilla_Carta_F').geometry, D: this.nodo.get('Plantilla_Carta_D').geometry };
    const plantillas = this.nodo.get('Plantillas');
    plantillas.parent.remove(plantillas);
    this.aplicar();
  }

  /** Aplica el estado lógico: pose de cada elemento, centrado y visibilidad (las hojas enterradas no se dibujan). */
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

  /** Matriz del mundo (16 números, column-major) de un nodo: para el picking. */
  matrizMundo(nombre) {
    const n = this.nodo.get(nombre);
    if (!n) return null;
    n.updateWorldMatrix(true, false);
    return n.matrixWorld.elements;
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
}
