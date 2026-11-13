// Controlador de la ficha y de las operaciones de colección (sin Three.js ni DOM: recibe la vista y la ficha como interfaces).
// Orden obligatorio: validar → guardar (adaptador/IndexedDB) → SOLO si se confirma, actualizar ficha y 3D. Si falla, no se muestra una cantidad falsa.
export class Controlador {
  constructor({ adaptador, estado, vista, ficha, ahora = () => Date.now(), enfriamientoMs = 250 }) {
    this.adaptador = adaptador; this.estado = estado; this.vista = vista; this.ficha = ficha;
    this.ahora = ahora; this.enfriamiento = enfriamientoMs;
    this.seleccion = null;           // {nombre, id}
    this.ultimoCierre = -Infinity;
    this.pendientes = 0;
  }

  get fichaAbierta() { return this.seleccion !== null; }

  /** Intenta abrir la ficha del bolsillo `nombre`. Devuelve true si se abrió. */
  seleccionar(nombre) {
    if (this.seleccion) return false;                                  // ya hay una ficha abierta
    if (this.estado.animando || this.vista.animandoTurno?.()) return false;   // nunca durante un giro de hoja
    if (this.ahora() - this.ultimoCierre < this.enfriamiento) return false;    // evita el segundo toque accidental tras cerrar
    if (!this.adaptador.puedeEditar(nombre)) return false;             // huecos y nodos desconocidos
    const datos = this.adaptador.fichaDe(nombre);
    this.seleccion = { nombre, id: datos.id };
    this.ficha.abrir(datos);
    return true;
  }

  /** Añade (+1) o retira (-1) una copia de la carta abierta. Cada llamada se encadena en la cola del adaptador: los toques rápidos no se pisan. */
  async cambiar(delta) {
    const sel = this.seleccion;
    if (!sel) return null;
    this.pendientes++;
    this.ficha.guardando?.(true);
    try {
      const res = await this.adaptador.cambiar(sel.id, delta);
      this.vista.aplicarTransicion(sel.id, res);                      // la carta aparece/desaparece solo tras confirmar el guardado
      if (this.seleccion && this.seleccion.id === sel.id) this.ficha.actualizar(this.adaptador.fichaDe(sel.nombre));
      return res;
    } catch (e) {
      this.ficha.error?.('No se pudo guardar el cambio: ' + (e && e.message || e));
      if (this.seleccion && this.seleccion.id === sel.id) this.ficha.actualizar(this.adaptador.fichaDe(sel.nombre));   // muestra lo que REALMENTE hay guardado
      return null;
    } finally {
      this.pendientes--;
      if (this.pendientes === 0) this.ficha.guardando?.(false);
    }
  }

  anadir() { return this.cambiar(+1); }
  retirar() { return this.cambiar(-1); }

  cerrar() {
    if (!this.seleccion) return;
    this.seleccion = null; this.ultimoCierre = this.ahora();
    this.ficha.cerrar();
  }
}
