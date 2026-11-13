// Ficha de una carta: panel inferior en móvil, ventana centrada en ordenador. No guarda nada: avisa con callbacks.
import { crearImagenCarta } from "../imagen.js";
import { movimientoReducido } from "./animaciones.js";

export class Ficha {
  /**
   * alAnadir(carta) / alRetirar(carta): devuelven una Promise; la ficha se bloquea mientras tanto.
   */
  constructor(raiz, { alAnadir, alRetirar, alCerrar }, doc = document) {
    this.doc = doc;
    this.raiz = raiz;
    this.callbacks = { alAnadir, alRetirar, alCerrar };
    this.carta = null;
    this.abierta = false;
    this.ocupada = false;
    this.cantidad = 0;
    raiz.innerHTML = `
      <div class="ficha-velo" data-cerrar></div>
      <section class="ficha-panel" role="dialog" aria-modal="true" aria-labelledby="ficha-titulo" tabindex="-1">
        <button type="button" class="ficha-cerrar" data-cerrar aria-label="Cerrar ficha">×</button>
        <div class="ficha-imagen"></div>
        <div class="ficha-datos">
          <p class="ficha-estado" id="ficha-estado"></p>
          <h2 id="ficha-titulo"></h2>
          <dl class="ficha-lista"></dl>
          <p class="ficha-cantidad" aria-live="polite"></p>
          <p class="ficha-error" role="alert" hidden></p>
          <div class="ficha-botones">
            <button type="button" class="boton boton-principal" data-accion="anadir"></button>
            <button type="button" class="boton" data-accion="retirar">Retirar copia</button>
          </div>
        </div>
      </section>`;
    this.panel = raiz.querySelector(".ficha-panel");
    raiz.addEventListener("click", (e) => {
      if (e.target.closest("[data-cerrar]")) this.cerrar();
      const accion = e.target.closest("[data-accion]")?.dataset.accion;
      if (accion) this.pulsar(accion);
    });
    this.panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.cerrar();
      if (e.key === "Tab") this.atraparFoco(e);
    });
  }

  abrir(carta, cantidad, estadoTexto) {
    this.carta = carta;
    this.cantidad = cantidad;
    const p = this.panel;
    const imagen = p.querySelector(".ficha-imagen");
    imagen.replaceChildren(crearImagenCarta(carta, this.doc, { mostrarId: true, estado: "Imagen pendiente de incorporar" }));
    p.querySelector("#ficha-titulo").textContent = carta.nombre;
    const filas = [
      ["Expansión", carta.nombreExpansion ?? carta.expansion],
      ["Número", carta.numero],
      ["Rareza", carta.rareza || "—"],
      ["Identificador TCGdex", carta.id],
    ];
    if (carta.ilustrador) filas.push(["Ilustrador", carta.ilustrador]);
    if (carta.producto) filas.push(["Procedencia", carta.producto]);
    const lista = p.querySelector(".ficha-lista");
    lista.replaceChildren();
    for (const [k, v] of filas) {
      const dt = this.doc.createElement("dt"); dt.textContent = k;
      const dd = this.doc.createElement("dd"); dd.textContent = v;
      lista.append(dt, dd);
    }
    this.ocultarError();
    this.actualizar(cantidad);
    this.elementoAnterior = this.doc.activeElement;
    this.raiz.hidden = false;
    this.abierta = true;
    this.raiz.dataset.abierta = "true";
    if (!movimientoReducido()) {
      this.panel.animate([{ transform: "translateY(24px) scale(.97)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
      this.raiz.querySelector(".ficha-velo").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
    }
    this.panel.focus();
  }

  actualizar(cantidad) {
    this.cantidad = cantidad;
    const p = this.panel;
    const conseguida = cantidad >= 1;
    const estado = p.querySelector("#ficha-estado");
    estado.textContent = conseguida ? "✓ Conseguida" : "Pendiente";
    estado.dataset.estado = conseguida ? "conseguida" : "pendiente";
    p.querySelector(".ficha-cantidad").textContent = `Copias: ${cantidad}`;
    p.querySelector('[data-accion="anadir"]').textContent = conseguida ? "Añadir otra copia" : "Añadir a mi colección";
    this.refrescarBotones();
  }

  refrescarBotones() {
    const anadir = this.panel.querySelector('[data-accion="anadir"]');
    const retirar = this.panel.querySelector('[data-accion="retirar"]');
    anadir.disabled = this.ocupada;
    retirar.disabled = this.ocupada || this.cantidad === 0;
  }

  async pulsar(accion) {
    if (this.ocupada || !this.carta) return; // evita pulsaciones dobles mientras se guarda
    this.ocupada = true;
    this.refrescarBotones();
    this.ocultarError();
    try {
      await (accion === "anadir" ? this.callbacks.alAnadir(this.carta) : this.callbacks.alRetirar(this.carta));
    } finally {
      this.ocupada = false;
      this.refrescarBotones();
    }
  }

  mostrarError(texto) {
    const e = this.panel.querySelector(".ficha-error");
    e.textContent = texto;
    e.hidden = false;
  }

  ocultarError() {
    this.panel.querySelector(".ficha-error").hidden = true;
  }

  /** Cierra la ficha. `inmediato` evita la animación; `forzar` permite cerrarla aunque haya un guardado en curso (lo usa el propio guardado al terminar). */
  async cerrar({ inmediato = false, forzar = false } = {}) {
    if (!this.abierta) return;
    if (this.ocupada && !forzar) return;
    this.abierta = false;
    if (!inmediato && !movimientoReducido()) {
      await Promise.all([
        this.panel.animate([{ transform: "none", opacity: 1 }, { transform: "translateY(18px) scale(.98)", opacity: 0 }], { duration: 160, easing: "ease-in", fill: "forwards" }).finished,
        this.raiz.querySelector(".ficha-velo").animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" }).finished,
      ]);
    }
    this.raiz.hidden = true;
    this.panel.getAnimations().forEach((a) => a.cancel());
    this.raiz.querySelector(".ficha-velo").getAnimations().forEach((a) => a.cancel());
    delete this.raiz.dataset.abierta;
    this.callbacks.alCerrar?.(this.carta);
    this.elementoAnterior?.focus?.({ preventScroll: true });
  }

  atraparFoco(e) {
    const f = [...this.panel.querySelectorAll("button:not([disabled])")];
    if (f.length === 0) return;
    const primero = f[0], ultimo = f[f.length - 1];
    if (e.shiftKey && this.doc.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && this.doc.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  }
}
