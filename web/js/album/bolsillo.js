// Un bolsillo del álbum (vista). Construye su DOM por capas y cambia de estado; no sabe de IndexedDB.
import { crearImagenCarta } from "../imagen.js";

/** Margen entre la carta y el borde de la funda (fracción del ancho / alto del bolsillo). */
export const MARGEN_X = 0.023;
export const MARGEN_Y = 0.0165;

function el(doc, etiqueta, clase, texto) {
  const e = doc.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

export class Bolsillo {
  /** carta === null => hueco sin asignar (decorativo, no cuenta como pendiente). */
  constructor(carta, posicion, doc = document) {
    this.doc = doc;
    this.carta = carta;
    this.posicion = posicion;
    this.estado = carta ? "pendiente" : "libre";

    const raiz = el(doc, "div", "bolsillo");
    raiz.style.setProperty("--mx", `${MARGEN_X * 100}%`);
    raiz.style.setProperty("--my", `${MARGEN_Y * 100}%`);
    raiz.dataset.estado = this.estado;
    this.elemento = raiz;

    this.fondo = el(doc, "span", "bolsillo-fondo");
    this.interior = el(doc, "span", "bolsillo-interior");
    this.plastico = el(doc, "span", "bolsillo-plastico");
    raiz.append(this.fondo, this.interior, this.plastico);

    if (!carta) {
      raiz.setAttribute("aria-hidden", "true");
      this.interior.append(el(doc, "span", "bolsillo-libre-marca"));
      return;
    }

    raiz.dataset.id = carta.id;
    raiz.setAttribute("role", "button");
    raiz.tabIndex = 0;

    this.etiqueta = el(doc, "span", "bolsillo-etiqueta");
    this.etiqueta.append(el(doc, "strong", "", carta.nombre), el(doc, "span", "", `${carta.numero}`));
    this.cantidad = el(doc, "span", "bolsillo-cantidad");
    this.exterior = el(doc, "span", "bolsillo-exterior");
    raiz.append(this.etiqueta, this.cantidad, this.exterior);
    this.fijarEstado("pendiente", 0);
  }

  get tieneImagen() {
    return Boolean(this.carta?.imagen) && this.carta.estadoImagen !== "sin-imagen";
  }

  /** Cara de la carta (foto o sustituto elegante). Se crea nueva cada vez: así las copias de la animación no comparten estado. */
  crearCara(calidad = "low") {
    const cara = el(this.doc, "span", "carta");
    cara.append(crearImagenCarta(this.carta, this.doc, { calidad, mostrarId: true, estado: "Conseguida · imagen pendiente" }));
    return cara;
  }

  /** Muestra el bolsillo en su estado final ("pendiente" o "conseguida") sin animar nada. */
  fijarEstado(estado, cantidad) {
    if (!this.carta) return;
    this.estado = estado;
    this.elemento.dataset.estado = estado;
    this.exterior.replaceChildren();
    if (estado === "conseguida") {
      this.interior.replaceChildren(this.crearCara());
    } else if (this.tieneImagen) {
      // Referencia discreta: la imagen muy atenuada y en gris, para saber qué carta falta.
      const fantasma = el(this.doc, "span", "fantasma");
      fantasma.append(crearImagenCarta(this.carta, this.doc, { calidad: "low" }));
      this.interior.replaceChildren(fantasma);
    } else {
      this.interior.replaceChildren(el(this.doc, "span", "fantasma fantasma-vacio"));
    }
    this.actualizarCantidad(cantidad);
    this.elemento.setAttribute("aria-label", this.descripcion(cantidad));
  }

  actualizarCantidad(n) {
    if (!this.carta) return;
    this.cantidad.textContent = n >= 2 ? `×${n}` : "";
    this.cantidad.hidden = n < 2;
    this.elemento.setAttribute("aria-label", this.descripcion(n));
  }

  descripcion(n) {
    const c = this.carta;
    return `${c.nombre}, número ${c.numero}, ${c.nombreExpansion ?? c.expansion}. ` +
      (n >= 1 ? `Conseguida, ${n} ${n === 1 ? "copia" : "copias"}.` : "Pendiente.");
  }

  /** Medidas en píxeles (sin transformaciones) para sincronizar las animaciones. */
  medidas() {
    const e = this.elemento;
    const mx = e.offsetWidth * MARGEN_X;
    const my = e.offsetHeight * MARGEN_Y;
    return {
      x: e.offsetLeft, y: e.offsetTop,
      mx, my,
      anchoCarta: e.offsetWidth - 2 * mx,
      altoCarta: e.offsetHeight - 2 * my,
    };
  }
}
