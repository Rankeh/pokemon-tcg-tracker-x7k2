// Vista 3D de los bolsillos: crea/retira las mallas de carta y de «pendiente» SOLO de las páginas necesarias, reutiliza la geometría
// de las plantillas del GLB, pide texturas a la caché y reproduce las animaciones de inserción/extracción. No guarda cantidades: las lee
// del adaptador (IndexedDB) y reacciona a las transiciones que éste confirma.
import * as THREE from 'three';
import { nombreBolsillo } from './adaptador-coleccion.js';

const DESPLAZAMIENTO = 0.055;               // la carta entra/sale por la boca de la funda (borde superior), recorriendo ~60 % de su alto
const DURACION = { insertar: 0.38, extraer: 0.3, cantidad: 0.18 };
const Y_FANTASMA = 0.0003;                  // la placa «pendiente» queda justo sobre la hoja y bajo la carta

const salida = (t) => 1 - Math.pow(1 - t, 3);

export class VistaBolsillos {
  constructor({ album, adaptador, cache, productores, reducirMovimiento = () => false, materialCarta = null }) {
    // `materialCarta(color, rugosidad)`: lo aporta Aspecto (3.7.2a). Por defecto, el material iluminado de siempre.
    this.materialCarta = materialCarta || ((color, rough) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }));
    this.album = album; this.adaptador = adaptador; this.cache = cache; this.prod = productores; this.reducir = reducirMovimiento;
    this.bolsillos = new Map(); this.porId = new Map(); this.paginas = new Set(); this.animaciones = new Set();
    for (const [nombre, b] of adaptador.mapa.porNombre) {
      if (!b.carta) continue;                                   // los 4 huecos finales: sin malla, sin estado
      const nodo = album.nodo.get(nombre);
      if (!nodo) throw new Error('El GLB no tiene el nodo ' + nombre);
      const p = { nombre, carta: b.carta, pagina: b.pagina, nodo, cara: nodo.userData.cara, activo: false, fantasma: null, tarjeta: null, claves: new Map(), anim: null };
      this.bolsillos.set(nombre, p); this.porId.set(b.carta.id, p);
    }
  }

  // ------------------------------------------------------------ páginas activas (carga diferida y liberación)
  /** `necesarias`: Map pagina → prioridad. Monta las que faltan y desmonta (liberando GPU) las que ya no se necesitan. */
  sincronizar(necesarias) {
    for (const p of [...this.paginas]) if (!necesarias.has(p)) this._desmontarPagina(p);
    for (const [p, prio] of necesarias) if (!this.paginas.has(p)) this._montarPagina(p, prio);
  }

  _bolsillosDe(pagina) {
    return this.adaptador.mapa.paginas[pagina - 1].bolsillos.map((c, i) => (c ? this.bolsillos.get(nombreBolsillo(pagina, i + 1)) : null)).filter(Boolean);
  }

  _montarPagina(pagina, prio) {
    this.paginas.add(pagina);
    for (const b of this._bolsillosDe(pagina)) {
      b.activo = true;
      this.adaptador.cantidad(b.carta.id) > 0 ? this._ponerTarjeta(b, prio) : this._ponerFantasma(b, prio);
    }
  }

  _desmontarPagina(pagina) {
    this.paginas.delete(pagina);
    for (const b of this._bolsillosDe(pagina)) {
      this._terminar(b);
      this._quitar(b, 'fantasma'); this._quitar(b, 'tarjeta');
      b.activo = false;
    }
  }

  // ------------------------------------------------------------ mallas
  _malla(b, color, rough) {
    const m = new THREE.Mesh(this.album.geomCarta[b.cara], this.materialCarta(color, rough));
    m.userData = { tipo: 'vista-carta' };
    return m;
  }

  _pedir(b, mesh, clave, productor, prio, alFallar) {
    b.claves.set(mesh, [...(b.claves.get(mesh) || []), clave]);
    this.cache.adquirir(clave, productor, prio).then(({ textura, error }) => {
      const sigue = (b.fantasma === mesh || b.tarjeta === mesh) && b.activo;
      if (!sigue) return;
      if (textura) { mesh.material.map = textura; mesh.material.color.set(0xffffff); mesh.material.needsUpdate = true; this.album.onCambio?.(); }
      else if (alFallar) alFallar();
    });
  }

  _ponerFantasma(b, prio) {
    if (b.fantasma) return;
    const m = this._malla(b, 0x1b2231, 0.9);
    m.position.y = (b.cara === 'F' ? -1 : 1) * Y_FANTASMA;
    b.fantasma = m; b.nodo.add(m);
    this._pedir(b, m, 'etiqueta:' + b.carta.id, this.prod.etiqueta(b.carta), prio);
  }

  _ponerTarjeta(b, prio) {
    if (b.tarjeta) return;
    const m = this._malla(b, 0xd9d4c8, 0.55);
    b.tarjeta = m; b.nodo.add(m);
    // imagen local; si no existe o falla, marcador reconocible (nombre, expansión, número). Nunca se queda sin textura ni lanza error.
    this._pedir(b, m, 'mini:' + b.carta.id, this.prod.mini(b.carta), prio, () => this._pedir(b, m, 'marcador:' + b.carta.id, this.prod.marcador(b.carta), 0));
  }

  _quitar(b, que) {
    const m = b[que];
    if (!m) return;
    b.nodo.remove(m); m.material.dispose();                      // el material es de la carta; la textura la gestiona la caché (recuento)
    for (const k of b.claves.get(m) || []) this.cache.liberar(k);
    b.claves.delete(m); b[que] = null;
  }

  // ------------------------------------------------------------ transiciones confirmadas por IndexedDB
  /** Aplica el resultado de una operación ya guardada. `transicion`: 'insertar' | 'extraer' | 'cantidad' | 'nada'. */
  aplicarTransicion(id, { transicion }) {
    const b = this.porId.get(id);
    if (!b || !b.activo || transicion === 'nada') return;
    this._terminar(b);                                           // si había una animación en curso, se cierra en su estado final ANTES de empezar otra
    if (transicion === 'insertar') {
      this._ponerTarjeta(b, 0);
      this._animar(b, 'insertar');
    } else if (transicion === 'extraer') {
      if (!b.tarjeta) this._ponerFantasma(b, 0); else this._animar(b, 'extraer');
    } else if (transicion === 'cantidad' && b.tarjeta) {
      this._animar(b, 'cantidad');
    }
  }

  _animar(b, tipo) {
    if (this.reducir()) { b.anim = { tipo, t: 1, dur: 1 }; this._terminar(b); return; }      // prefers-reduced-motion: cambio directo
    if (tipo === 'insertar') b.tarjeta.position.z = -DESPLAZAMIENTO;
    b.anim = { tipo, t: 0, dur: DURACION[tipo] };
    this.animaciones.add(b);
    this.album.onCambio?.();
  }

  /** Estado final de la animación (se usa al acabar y también para "saltar" una animación interrumpida). */
  _terminar(b) {
    const a = b.anim;
    if (!a) return;
    b.anim = null; this.animaciones.delete(b);
    if (a.tipo === 'insertar') { if (b.tarjeta) b.tarjeta.position.z = 0; this._quitar(b, 'fantasma'); }
    else if (a.tipo === 'extraer') { this._quitar(b, 'tarjeta'); this._ponerFantasma(b, 0); }
    else if (b.tarjeta) b.tarjeta.scale.set(1, 1, 1);
    this.album.onCambio?.();
  }

  /** Vuelve a leer lo guardado (p. ej. tras editar en la app original en otra pestaña) y corrige lo visible SIN animar. */
  refrescar() {
    for (const b of this.bolsillos.values()) {
      if (!b.activo) continue;
      this._terminar(b);
      if (this.adaptador.cantidad(b.carta.id) > 0) { this._ponerTarjeta(b, 0); this._quitar(b, 'fantasma'); }
      else { this._quitar(b, 'tarjeta'); this._ponerFantasma(b, 0); }
    }
    this.album.onCambio?.();
  }

  get animando() { return this.animaciones.size > 0; }

  /** Avanza las animaciones dt segundos. Devuelve true si algo se movió (para seguir dibujando). */
  avanzar(dt) {
    if (!this.animaciones.size) return false;
    for (const b of [...this.animaciones]) {
      const a = b.anim;
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = salida(a.t);
      if (a.tipo === 'insertar') b.tarjeta.position.z = -DESPLAZAMIENTO * (1 - e);
      else if (a.tipo === 'extraer') b.tarjeta.position.z = -DESPLAZAMIENTO * e;
      else if (b.tarjeta) { const s = 1 + 0.06 * Math.sin(Math.PI * a.t); b.tarjeta.scale.set(s, 1, s); }
      if (a.t >= 1) this._terminar(b);
    }
    return true;
  }

  /** Estado visible de un bolsillo (para pruebas y diagnóstico): 'pendiente' | 'conseguida' | 'inactivo'. */
  estadoVisual(id) {
    const b = this.porId.get(id);
    if (!b || !b.activo) return 'inactivo';
    return b.tarjeta && !(b.anim && b.anim.tipo === 'extraer' && b.anim.t >= 1) ? 'conseguida' : 'pendiente';
  }

  estadisticas() {
    let tarjetas = 0, fantasmas = 0;
    for (const b of this.bolsillos.values()) { if (b.tarjeta) tarjetas++; if (b.fantasma) fantasmas++; }
    return { paginasActivas: this.paginas.size, tarjetas, fantasmas, animando: this.animaciones.size };
  }
}
