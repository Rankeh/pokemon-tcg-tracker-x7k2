// Marco de resalte de la carta seleccionada: un aro fino y brillante sobre el bolsillo (geometría compartida, un material, sin luces nuevas).
import * as THREE from 'three';

const MITAD = { x: 0.0335, z: 0.0455 }, BANDA = 0.004, ALTURA = 0.0018;

/** Vértices e índices del aro: 4 esquinas exteriores + 4 interiores en el plano XZ (PURO, se prueba en Node). */
export function datosMarco(mitad = MITAD, banda = BANDA) {
  const o = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const pos = [...o.map(([sx, sz]) => [sx * (mitad.x + banda), 0, sz * (mitad.z + banda)]), ...o.map(([sx, sz]) => [sx * mitad.x, 0, sz * mitad.z])].flat();
  const idx = []; for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; idx.push(i, j, 4 + j, i, 4 + j, 4 + i); }
  return { posiciones: pos, indices: idx };
}

const ESCALA_ENTRADA = 1.22, DURACION_ENTRADA = 0.32;
/** Escala del aro durante la entrada (t 0..1): ease-out-back, llega a 1 con un rebote mínimo. PURO. */
export function escalaEntrada(t) {
  const c1 = 1.2, c3 = c1 + 1, u = Math.min(1, Math.max(0, t)) - 1, e = 1 + c3 * u * u * u + c1 * u * u;   // 0 → 1 (con sobrepaso)
  return ESCALA_ENTRADA + (1 - ESCALA_ENTRADA) * e;
}

export class Resaltado {
  constructor({ reducirMovimiento = () => false, color = 0xe8b25a } = {}) {
    const d = datosMarco();
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute(d.posiciones, 3));
    this.geo.setIndex(d.indices);
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false })   // 3.7.2b: sin tone mapping → el dorado es el mismo con cualquier luz;
    this.malla = new THREE.Mesh(this.geo, this.mat);
    this.malla.renderOrder = 999; this.malla.visible = false;
    this.reducir = reducirMovimiento; this.destino = 0; this.nodo = null; this.t = 1;   // t: progreso de la entrada (escala), 0..1
  }

  mostrar(nodo) {
    this.ocultar(true);
    this.nodo = nodo;
    this.malla.position.set(0, (nodo.userData.cara === 'D' ? -1 : 1) * ALTURA, 0);        // por delante de la funda, según la cara
    nodo.add(this.malla); this.malla.visible = true; this.destino = 0.95;
    this.t = 0; this.malla.scale.set(ESCALA_ENTRADA, ESCALA_ENTRADA, ESCALA_ENTRADA);                       // 3.7.5: entra con un pequeño rebote (solo escala y opacidad)
    if (this.reducir()) { this.mat.opacity = this.destino; this.t = 1; this.malla.scale.set(1, 1, 1); }
  }

  ocultar(ya = false) {
    this.destino = 0;
    if (ya || this.reducir()) this._quitar();
  }

  _quitar() { if (this.nodo) { this.nodo.remove(this.malla); this.nodo = null; } this.malla.visible = false; this.mat.opacity = 0; this.malla.scale.set(1, 1, 1); this.t = 1; }

  /** true mientras aparece o se desvanece (para seguir dibujando). */
  avanzar(dt) {
    let activo = false;
    if (this.t < 1) { this.t = Math.min(1, this.t + dt / DURACION_ENTRADA); { const k = escalaEntrada(this.t); this.malla.scale.set(k, k, k); } activo = true; }
    const dif = this.destino - this.mat.opacity;
    if (Math.abs(dif) < 1e-3) { if (this.destino === 0 && this.nodo) this._quitar(); return activo; }
    this.mat.opacity += Math.sign(dif) * Math.min(Math.abs(dif), dt * 6);
    return true;
  }

  liberar() { this._quitar(); this.geo.dispose(); this.mat.dispose(); }
}
