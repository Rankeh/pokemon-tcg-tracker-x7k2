// Álbum 3D con Three.js: carga el GLB, localiza los nodos por nombre y aplica las poses de logica.js.
// El GLB solo trae la estructura (tapa, 9 hojas, 162 bolsillos vacíos y 2 plantillas de carta); el contenido de cada bolsillo lo pone VistaBolsillos
// a partir de la colección real. Nada del modelo se reconstruye al cambiar una cantidad.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { crearGeometria, EstadoAlbum, pose, centradoX, suave, limitar } from './logica.js';

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
    // 3.7.1c: el CUERPO de cada elemento (Tapa_Malla, Hoja_n_Losa) se dibuja SIEMPRE: son 10 mallas sencillas y dan continuidad a las pilas y a la tapa
    // izquierda. Solo el DETALLE (fundas, soldaduras, 9 bolsillos por cara) se oculta fuera de la ventana de `EstadoAlbum.visibles()`.
    this.detalle = this.elemento.map((el) => el.children.filter((h) => h.name !== 'Tapa_Malla' && !/_Losa$/.test(h.name)));
    // Geometría de carta compartida (una por cara) tomada de las plantillas del GLB; las plantillas se retiran de la escena.
    this.geomCarta = { F: this.nodo.get('Plantilla_Carta_F').geometry, D: this.nodo.get('Plantilla_Carta_D').geometry };
    const plantillas = this.nodo.get('Plantillas');
    plantillas.parent.remove(plantillas);
    this.lomo = this.nodo.get('Lomo');
    if (!this.lomo.geometry.boundingBox) this.lomo.geometry.computeBoundingBox();
    this.alturaLomoBase = this.lomo.geometry.boundingBox.max.y - this.lomo.geometry.boundingBox.min.y;
    this.aplicar();
  }

  /** Aplica el estado lógico: pose de cada elemento, centrado y visibilidad del detalle (el cuerpo y las tapas nunca se ocultan). */
  aplicar() {
    const { geo, estado } = this;
    for (let i = 0; i < geo.elementos; i++) {
      const p = pose(geo, i, estado.progreso[i]), n = this.elemento[i];
      n.position.y = p.y;
      n.rotation.z = p.rotZ;
    }
    this.raiz.position.x = centradoX(geo, estado.progreso);
    this.ajustarLomo();
    const vis = estado.visibles();
    for (let i = 0; i < geo.elementos; i++) {
      this.elemento[i].visible = true;
      const ver = vis.has(i);
      for (const h of this.detalle[i]) h.visible = ver;
    }
  }

  /** 3.7.9 · Grosor del lomo = grosor real de las pilas (como la encuadernación de un libro): cerrado abarca todo el álbum; al abrir se aplana
   *  hasta la pila más alta. Continuo (cada hoja aporta su `suave(progreso)`), así no hay saltos al girar. Solo escala el lomo en y. */
  ajustarLomo() {
    const { geo, estado, params } = this;
    const gt = params.grosor_tapa, paso = params.paso;
    let izq = 0, der = 0;
    for (let i = 1; i < geo.elementos; i++) { const e = suave(limitar(estado.progreso[i], 0, 1)); izq += e; der += 1 - e; }
    const e0 = suave(limitar(estado.progreso[0], 0, 1));
    const alto = Math.max(gt + der * paso + (1 - e0) * gt, gt + izq * paso, 2 * gt * 0.6);
    this.lomo.scale.y = Math.min(1, Math.max(0.12, alto / this.alturaLomoBase));
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

  /** Caja local (min/max de la geometría) + matriz del mundo ACTUAL de una malla con nombre: base del encuadre calculado con las transformaciones reales. */
  cajaMalla(nombre) {
    const n = this.nodo.get(nombre);
    if (!n || !n.geometry) return null;
    const g = n.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    n.updateWorldMatrix(true, false);
    const b = g.boundingBox;
    return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z], matriz: n.matrixWorld.elements };
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
