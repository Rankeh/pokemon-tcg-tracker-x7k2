// Lógica PURA del álbum 3D (sin Three.js, sin DOM): estado de páginas, poses de giro, visibilidad, texturas necesarias y métricas.
// Se prueba con Node (pruebas/logica.test.mjs). album3d.js solo aplica estas poses a los nodos de Three.js.
//
// "Elementos" que giran: 0 = tapa, 1..n = hojas (n = n_hojas). progreso[i] va de 0 (pila derecha) a 1 (pila izquierda).

export const PI = Math.PI;

export const suave = (t) => t * t * (3 - 2 * t);                      // easing: sale y llega con velocidad 0
export const lerp = (a, b, t) => a + (b - a) * t;
export const limitar = (x, a, b) => Math.min(b, Math.max(a, x));

export function crearGeometria(p) {
  const n = p.n_hojas, gt = p.grosor_tapa, paso = p.paso, y0 = p.y_base;
  return {
    n,
    elementos: n + 1,
    ancho: p.ancho_tapa,
    elevacion: 0.03,                                                   // cuánto sube una hoja a mitad de giro para no cortar las pilas
    yDerecha: (i) => (i === 0 ? y0 + gt + n * paso + gt / 2 : y0 + gt + (n - i) * paso + paso / 2),
    yIzquierda: (i) => (i === 0 ? y0 + gt / 2 : y0 + gt + (i - 1) * paso + paso / 2),
  };
}

/** Pose de un elemento con progreso p (0..1): altura y ángulo alrededor del eje del lomo (rotation.z). */
export function pose(geo, i, p) {
  const e = suave(limitar(p, 0, 1));
  return { y: lerp(geo.yDerecha(i), geo.yIzquierda(i), e) + geo.elevacion * Math.sin(PI * limitar(p, 0, 1)), rotZ: PI * e };
}

/** Desplazamiento en x del conjunto: cerrado (tapa a la derecha) se corre media tapa a la izquierda; al terminar, a la derecha. */
export function centradoX(geo, progreso) {
  return -geo.ancho / 2 * (1 - progreso[0]) + geo.ancho / 2 * progreso[geo.n];
}

export class EstadoAlbum {
  constructor(geo, duracion = 0.9) {
    this.geo = geo;
    this.duracion = duracion;
    this.progreso = new Array(geo.elementos).fill(0);
    this.cola = [];            // pasos pendientes: {i, a} (a = 1 gira a la izquierda, 0 vuelve a la derecha)
    this.actual = null;        // {i, desde, hasta, t}
    this.objetivo = 0;         // elementos girados cuando termine la cola
  }

  /** Elementos girados y asentados (en orden). */
  get vueltas() {
    let v = 0;
    while (v < this.geo.elementos && this.progreso[v] >= 1) v++;
    return v;
  }

  get animando() { return this.actual !== null || this.cola.length > 0; }

  puedeAvanzar() { return this.objetivo < this.geo.elementos; }
  puedeRetroceder() { return this.objetivo > 0; }

  avanzar() {
    if (!this.puedeAvanzar()) return false;
    this.cola.push({ i: this.objetivo, a: 1 });
    this.objetivo++;
    return true;
  }

  retroceder() {
    if (!this.puedeRetroceder()) return false;
    this.objetivo--;
    this.cola.push({ i: this.objetivo, a: 0 });
    return true;
  }

  /** Salta sin animar (para pruebas y para "reducir movimiento"). */
  irA(vueltas) {
    this.cola = []; this.actual = null;
    for (let i = 0; i < this.geo.elementos; i++) this.progreso[i] = i < vueltas ? 1 : 0;
    this.objetivo = limitar(vueltas, 0, this.geo.elementos);
  }

  /** Avanza el tiempo dt (s). Devuelve true si algo se movió. */
  actualizar(dt) {
    let movido = false;
    let restante = dt;
    while (restante > 0 && (this.actual || this.cola.length)) {
      if (!this.actual) {
        const s = this.cola.shift();
        this.actual = { i: s.i, desde: this.progreso[s.i], hasta: s.a, t: 0 };
      }
      const a = this.actual;
      const falta = (1 - a.t) * this.duracion;
      const usa = Math.min(restante, falta);
      a.t += usa / this.duracion;
      this.progreso[a.i] = lerp(a.desde, a.hasta, a.t);
      restante -= usa;
      movido = true;
      if (a.t >= 1 - 1e-9) { this.progreso[a.i] = a.hasta; this.actual = null; }
    }
    return movido;
  }

  /** Elementos cuyo DETALLE (fundas, bolsillos) hay que dibujar: ventana alrededor de las dos pilas + los que se mueven. El cuerpo y las tapas se dibujan siempre (3.7.1c). */
  visibles() {
    const v = this.vueltas, set = new Set();
    for (let i = 0; i < this.geo.elementos; i++) {
      const p = this.progreso[i];
      if ((p > 0 && p < 1) || (i >= v - 2 && i <= v + 1)) set.add(i);
    }
    return set;
  }

  /** Caras que se ven y por tanto necesitan textura: pila derecha → frontal (F), izquierda → dorsal (D); las que se mueven, ambas. */
  carasNecesarias(holgura = 1) {
    const v = this.vueltas, res = [];
    for (let i = Math.max(1, v - 1 - holgura); i <= Math.min(this.geo.n, v + holgura); i++) {
      const p = this.progreso[i];
      if (p > 0 && p < 1) res.push({ hoja: i, cara: 'F' }, { hoja: i, cara: 'D' });
      else res.push({ hoja: i, cara: p >= 1 ? 'D' : 'F' });
    }
    return res;
  }

  /** Cartas tocables ahora mismo: solo la hoja superior de cada pila y sin animación en curso. */
  tocables() {
    if (this.animando) return [];
    const v = this.vueltas, res = [];
    if (v - 1 >= 1) res.push({ hoja: v - 1, cara: 'D' });          // hoja superior de la pila izquierda (se ve su dorso)
    if (v >= 1 && v <= this.geo.n) res.push({ hoja: v, cara: 'F' }); // hoja superior de la pila derecha (se ve su frente); con v=0 el álbum está cerrado
    return res;
  }
}

/** Identificadores: "Hoja_2_F_Bolsillo_4" -> {hoja:3, cara:'F', k:4} (la hoja i de los nombres es 0-based; aquí, elemento 1-based). */
export function analizarNombre(nombre) {
  const m = /^Hoja_(\d+)_([FD])_(Bolsillo|Carta)_(\d+)$/.exec(nombre);
  return m ? { hoja: +m[1] + 1, cara: m[2], tipo: m[3], k: +m[4] } : null;
}

export const memoriaTexturaBytes = (w, h, mipmaps = true) => Math.round(w * h * 4 * (mipmaps ? 4 / 3 : 1));

/** Medidor de FPS: ignora huecos largos (pausas sin dibujar) para no falsear la media. */
export class MedidorFps {
  constructor(ventana = 120, huecoMaxMs = 250) { this.ventana = ventana; this.huecoMax = huecoMaxMs; this.dts = []; this.total = 0; }
  marca(dtMs) {
    if (dtMs > this.huecoMax || dtMs <= 0) return;
    this.dts.push(dtMs); this.total++;
    if (this.dts.length > this.ventana) this.dts.shift();
  }
  reiniciar() { this.dts = []; this.total = 0; }
  resumen() {
    const d = this.dts;
    if (!d.length) return { fps: 0, fpsMin: 0, p95Ms: 0, muestras: 0 };
    const media = d.reduce((a, b) => a + b, 0) / d.length;
    const ord = [...d].sort((a, b) => a - b);
    return { fps: 1000 / media, fpsMin: 1000 / ord[ord.length - 1], p95Ms: ord[Math.min(ord.length - 1, Math.floor(ord.length * 0.95))], muestras: d.length };
  }
}
