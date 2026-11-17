// Ficha de carta (DOM): panel inferior en móvil y tarjeta lateral en escritorio. Solo muestra datos y avisa de los botones; no guarda nada.
import { rutasArte, rutaProxy } from './proxies.js';
import { lineaPrecio, enlaceCardmarket, precioDe, eur } from './precios.js';
import { sinClasificar, tipoBrillo } from '../../js/variantes.js';
export const SALIDA_MS = 220;
export class FichaUI {
  constructor(el, { manifiesto = null, rutaBase = 'assets/cartas/', precios = null, alCerrar, alAnadir, alRetirar, alVariante = null, alClasificar = null, alVisible = null }) {
    this.el = el; this.manifiesto = manifiesto; this.rutaBase = rutaBase; this.precios = precios;
    this.alVariante = alVariante; this.alClasificar = alClasificar; this.alVisible = alVisible;          // 3.16: variantes
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
    // sin copia oficial en el manifiesto: arte real descargado (arte/) → carta proxy propia → marcador
    const cadena = e ? [this.rutaBase + e.grande, this.rutaBase + e.mini].filter(Boolean) : [...rutasArte(d.id), rutaProxy(d.id)].filter(Boolean);
    if (!cadena.length) return marcador();
    const img = new Image(); img.alt = `${d.nombre}, ${d.nombreExpansion || d.expansion} ${d.numero}`; img.decoding = 'async';
    let i = 0;
    img.onerror = () => { i++; if (i < cadena.length) img.src = cadena[i]; else marcador(); };
    img.onload = () => { caja.dataset.estado = 'imagen'; };
    img.src = cadena[0];
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
    if (this.el.precio) this.el.precio.textContent = lineaPrecio(this.precios, d.id);     // 3.7.30: '' si no hay precios descargados (el archivo es opcional)
    if (this.el.cardmarket) {                                                             // 3.7.31: el «mínimo en español» no existe como dato; el enlace abre las ofertas filtradas a español
      const u = enlaceCardmarket(this.precios, d.id);
      this.el.cardmarket.hidden = !u; if (u) this.el.cardmarket.href = u;
    }
    this.el.cantidad.textContent = String(d.cantidad);
    this.el.estadoTxt.textContent = d.cantidad > 0 ? (d.cantidad === 1 ? 'En tu álbum' : `En tu álbum · ${d.cantidad} copias`) : 'Pendiente';
    this.el.raiz.dataset.estado = d.cantidad > 0 ? 'conseguida' : 'pendiente';
    this.el.retirar.disabled = d.cantidad <= 0;
    this.el.anadir.disabled = d.cantidad >= 999;
    this._variantes(d);
  }

  /** 3.16 · Variantes: una fila por variante (−/+ y precio), «se ve en el álbum» y copias sin clasificar. Sin variantes, la ficha de siempre. */
  _variantes(d) {
    const caja = this.el.variantes, conVariantes = Boolean(d.variantes && caja && this.alVariante);
    if (!caja) return;                                             // ficha sin zona de variantes (pruebas antiguas): la de siempre, intacta
    const cantidadClasica = this.el.raiz.querySelector?.('.ficha-cantidad');
    if (cantidadClasica) cantidadClasica.hidden = conVariantes;
    if (this.el.imagen && this.el.imagen.dataset) this.el.imagen.dataset.acabado = (conVariantes && tipoBrillo(d.visible, d.arteCompleto)) || '';
    caja.hidden = !conVariantes;
    if (!conVariantes) { caja.replaceChildren(); return; }
    const r = d.registro, libres = sinClasificar(r), pv = (precioDe(this.precios, d.id) || {}).variantes || {};
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const cab = el('p', 'v-cabecera');
    cab.append(el('span', null, d.cantidad === 1 ? '1 copia' : `${d.cantidad} copias`), el('span', 'v-ver', 'Se ve en el álbum'));
    const filas = d.variantes.map((v) => {
      const n = r.variantes[v.id] || 0, fila = el('div', 'variante'); fila.dataset.variante = v.id; fila.dataset.tiene = n > 0 ? '1' : '0';
      const nombre = el('div', 'v-nombre'); nombre.append(el('span', null, v.nombre));
      if (v.deducida) { const s = el('small', 'v-nota', 'deducida'); s.title = 'TCGdex no registra esta variante; en esta expansión salió en reverse holo'; nombre.append(s); }
      const p = pv[v.id]; if (p && p.tendencia != null) nombre.append(el('small', 'v-precio', '≈ ' + eur(p.tendencia)));
      const menos = el('button', 'v-menos', '−'); menos.type = 'button'; menos.disabled = n === 0; menos.setAttribute('aria-label', `Retirar una ${v.nombre}`);
      const cuenta = el('strong', 'v-n', String(n));
      const mas = el('button', 'v-mas', '+'); mas.type = 'button'; mas.disabled = d.cantidad >= 999; mas.setAttribute('aria-label', `Añadir una ${v.nombre}`);
      const ver = el('input', 'v-radio'); ver.type = 'radio'; ver.name = 'f-visible-' + d.id; ver.checked = d.visible === v.id; ver.disabled = n === 0 || d.variantes.length < 2;
      ver.setAttribute('aria-label', `Mostrar ${v.nombre} en el álbum`);
      menos.onclick = () => this.alVariante(v.id, -1); mas.onclick = () => this.alVariante(v.id, +1);
      ver.onchange = () => ver.checked && this.alVisible && this.alVisible(v.id);
      fila.append(nombre, menos, cuenta, mas, ver);
      return fila;
    });
    const extra = [];
    if (libres > 0) {                                              // copias de antes de las variantes (o de «añadir todas»): se pueden clasificar
      const f = el('div', 'v-libres'); f.append(el('span', null, libres === 1 ? '1 copia sin clasificar · es:' : `${libres} copias sin clasificar · una es:`));
      for (const v of d.variantes) { const b = el('button', 'v-chip', v.nombre); b.type = 'button'; b.onclick = () => this.alClasificar && this.alClasificar(v.id); f.append(b); }
      const quitar = el('button', 'v-chip v-quitar', 'Quitar una'); quitar.type = 'button'; quitar.onclick = () => this.el.retirar.onclick(); f.append(quitar);
      extra.push(f);
    }
    caja.replaceChildren(cab, ...filas, ...extra);
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
