// Cámara orbital PURA (sin Three.js): giro ligero limitado + transiciones suaves. Devuelve posición y objetivo; main.js las aplica.
import { limitar, lerp, suave } from './logica.js';

const GRAD = Math.PI / 180;

export class OrbitaLigera {
  constructor(o = {}) {
    this.limites = { az: [-14 * GRAD, 14 * GRAD], el: [38 * GRAD, 78 * GRAD], radio: [0.30, 0.95], ...o.limites };
    this.az = 0; this.el = 62 * GRAD; this.radio = 0.62;
    this.objetivo = [0, 0.01, 0];
    this.vel = { az: 0, el: 0 };
    this.tween = null;
  }

  arrastrar(dxPx, dyPx, anchoPx) {
    if (this.tween) return;
    const k = 2.2 / Math.max(anchoPx, 1);               // un arrastre de ancho completo ≈ 2,2 rad antes de limitar
    this.az = limitar(this.az - dxPx * k, ...this.limites.az);
    this.el = limitar(this.el + dyPx * k, ...this.limites.el);
  }

  zoom(factor) { this.radio = limitar(this.radio * factor, ...this.limites.radio); }

  /** Transición suave a un nuevo estado (az, el, radio, objetivo). Se salta los límites de arrastre mientras dura. */
  llevarA(dest, duracion = 0.6) {
    this.tween = { t: 0, dur: Math.max(duracion, 1e-3), de: this.estado(), a: { ...this.estado(), ...dest } };
  }

  estado() { return { az: this.az, el: this.el, radio: this.radio, objetivo: [...this.objetivo] }; }

  actualizar(dt) {
    if (!this.tween) return false;
    const tw = this.tween;
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    const e = suave(tw.t);
    this.az = lerp(tw.de.az, tw.a.az, e); this.el = lerp(tw.de.el, tw.a.el, e); this.radio = lerp(tw.de.radio, tw.a.radio, e);
    this.objetivo = tw.de.objetivo.map((v, i) => lerp(v, tw.a.objetivo[i], e));
    if (tw.t >= 1) this.tween = null;
    return true;
  }

  /** Posición de la cámara: el álbum está en el plano XZ, la cámara mira desde +z y arriba. */
  posicion() {
    const [tx, ty, tz] = this.objetivo, c = Math.cos(this.el);
    return [tx + this.radio * c * Math.sin(this.az), ty + this.radio * Math.sin(this.el), tz + this.radio * c * Math.cos(this.az)];
  }
}

/**
 * Distancia a la que hay que poner la cámara para que el álbum abierto quepa en pantalla (ancho y alto), sea cual sea la proporción.
 * (Antes se dividía además por cos(elevación): en un móvil vertical daba 3,6 m y el álbum quedaba más allá del plano far=3 → no se dibujaba.)
 */
export function distanciaEncuadre({ fovGrados, aspect, ancho = 0.58, profundidad = 0.34, elevacion = 62 * GRAD, margen = 1.08 }) {
  const tv = Math.tan(fovGrados * GRAD / 2), th = tv * aspect;
  const alto = profundidad * Math.sin(elevacion) + 0.04;
  return Math.max(ancho / 2 / th, alto / 2 / tv) * margen;
}

/** Planos de recorte derivados de la distancia (nunca fijos): el álbum siempre queda entre near y far, también al alejar con el zoom. */
export function planosRecorte(radio, radioMax) {
  return { near: Math.max(0.02, Math.min(radio, 0.5) * 0.03), far: Math.max(5, radioMax * 3) };
}
