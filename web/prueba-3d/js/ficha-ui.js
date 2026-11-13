// Ficha de carta (DOM): panel inferior en móvil y tarjeta lateral en escritorio. Solo muestra datos y avisa de los botones; no guarda nada.
export const SALIDA_MS = 220;
export class FichaUI {
  constructor(el, { manifiesto = null, rutaBase = 'assets/cartas/', alCerrar, alAnadir, alRetirar }) {
    this.el = el; this.manifiesto = manifiesto; this.rutaBase = rutaBase;
    el.cerrar.onclick = () => alCerrar();
    el.anadir.onclick = () => alAnadir();
    el.retirar.onclick = () => alRetirar();
    el.fondo.onclick = () => alCerrar();
    this.datos = null;
  }

  /** Imagen: copia local grande → copia local mini → marcador HTML. Nunca se piden imágenes a servidores externos. */
  _imagen(d) {
    const caja = this.el.imagen, e = this.manifiesto && this.manifiesto.cartas && this.manifiesto.cartas[d.id];
    caja.replaceChildren();
    caja.dataset.estado = 'marcador';
    const marcador = () => {
      caja.replaceChildren();
      const m = document.createElement('div'); m.className = 'ficha-sin-imagen';
      const n = document.createElement('strong'); n.textContent = d.nombre;
      const x = document.createElement('span'); x.textContent = `${d.nombreExpansion || d.expansion} · Nº ${d.numero}`;
      const e2 = document.createElement('em'); e2.textContent = 'Sin imagen';
      m.append(n, x, e2); caja.append(m); caja.dataset.estado = 'marcador';
    };
    if (!e) return marcador();
    const img = new Image(); img.alt = `${d.nombre}, ${d.nombreExpansion || d.expansion} ${d.numero}`; img.decoding = 'async';
    const cadena = [e.grande, e.mini].filter(Boolean); let i = 0;
    img.onerror = () => { i++; if (i < cadena.length) img.src = this.rutaBase + cadena[i]; else marcador(); };
    img.onload = () => { caja.dataset.estado = 'imagen'; };
    img.src = this.rutaBase + cadena[0];
    caja.append(img);
  }

  abrir(d) {
    this.datos = d;
    this._imagen(d);
    this.actualizar(d);
    this.el.error.textContent = '';
    this._cancelarSalida();
    this.el.raiz.hidden = false; this.el.fondo.hidden = false;
    document.body.classList.add('ficha-abierta');
    this.el.anadir.focus({ preventScroll: true });
  }

  actualizar(d) {
    this.datos = d;
    this.el.nombre.textContent = d.nombre;
    this.el.expansion.textContent = d.nombreExpansion || d.expansion;
    this.el.numero.textContent = `Nº ${d.numero}${d.rareza ? ' · ' + d.rareza : ''} · pág. ${d.pagina}, bolsillo ${d.posicion}`;
    this.el.cantidad.textContent = String(d.cantidad);
    this.el.estadoTxt.textContent = d.cantidad > 0 ? (d.cantidad === 1 ? 'En tu álbum' : `En tu álbum · ${d.cantidad} copias`) : 'Pendiente';
    this.el.raiz.dataset.estado = d.cantidad > 0 ? 'conseguida' : 'pendiente';
    this.el.retirar.disabled = d.cantidad <= 0;
    this.el.anadir.disabled = d.cantidad >= 999;
  }

  error(msg) { this.el.error.textContent = msg; }
  guardando(b) { this.el.raiz.classList.toggle('guardando', b); }

  /** ¿Hay una animación CSS en la ficha? (con "reducir movimiento" o sin estilos no la hay y se oculta al instante). */
  _animada() {
    try { return typeof getComputedStyle === 'function' && !!this.el.raiz.isConnected && getComputedStyle(this.el.raiz).animationName !== 'none'; } catch { return false; }
  }

  _cancelarSalida() {
    if (this._salida) { clearTimeout(this._salida); this._salida = null; }
    this.el.raiz.classList.remove('saliendo'); this.el.fondo.classList.remove('saliendo');
  }

  /** 3.7.5: la ficha sale con una animación corta (SALIDA_MS) y solo entonces se oculta. El estado lógico (ficha-abierta, datos) cambia ya. */
  cerrar() {
    document.body.classList.remove('ficha-abierta');
    this.datos = null;
    this._cancelarSalida();
    if (this.el.raiz.hidden || !this._animada()) { this.el.raiz.hidden = true; this.el.fondo.hidden = true; return; }
    this.el.raiz.classList.add('saliendo'); this.el.fondo.classList.add('saliendo');
    this._salida = setTimeout(() => { this._salida = null; this.el.raiz.hidden = true; this.el.fondo.hidden = true; this.el.raiz.classList.remove('saliendo'); this.el.fondo.classList.remove('saliendo'); }, SALIDA_MS);
  }
}
