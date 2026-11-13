// Modelo de la colección para el álbum. NO guarda cantidades por su cuenta:
// IndexedDB (Almacen, de la Fase 2) es la única fuente de verdad y aquí solo hay una copia de lectura
// que se vuelve a leer de la base de datos después de cada cambio.
import { estaConseguida, progreso } from "../coleccion.js";

export class ModeloColeccion {
  constructor(almacen, cartas) {
    this.almacen = almacen;
    this.cartas = cartas;
    this.cantidades = new Map();
  }

  async cargar() {
    this.cantidades = await this.almacen.leerTodas();
  }

  cantidad(id) {
    return this.cantidades.get(id) ?? 0;
  }

  estado(id) {
    return estaConseguida(this.cantidad(id)) ? "conseguida" : "pendiente";
  }

  /**
   * Suma o resta copias. Solo cuando IndexedDB confirma el guardado se actualiza la copia de lectura.
   * Si el guardado falla se propaga el error y el modelo NO cambia.
   */
  async cambiar(id, delta) {
    const antes = await this.almacen.cantidad(id);
    const despues = await this.almacen.sumar(id, delta);
    await this.cargar();
    return { antes, despues };
  }

  progreso() {
    return progreso(this.cartas, this.cantidades);
  }
}
