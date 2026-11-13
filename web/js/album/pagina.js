// Una página del álbum: rejilla 3x3 de bolsillos dentro de la hoja.
import { Bolsillo } from "./bolsillo.js";

export class Pagina {
  constructor(contenedor, paginaDatos, doc = document) {
    this.datos = paginaDatos;
    this.bolsillos = paginaDatos.bolsillos.map((carta, i) => new Bolsillo(carta, i + 1, doc));
    this.porId = new Map(this.bolsillos.filter((b) => b.carta).map((b) => [b.carta.id, b]));
    contenedor.replaceChildren(...this.bolsillos.map((b) => b.elemento));
  }

  /** Pone cada bolsillo según lo guardado (sin animar). */
  sincronizar(modelo) {
    for (const b of this.bolsillos) {
      if (!b.carta) continue;
      const n = modelo.cantidad(b.carta.id);
      b.fijarEstado(n >= 1 ? "conseguida" : "pendiente", n);
    }
  }
}
