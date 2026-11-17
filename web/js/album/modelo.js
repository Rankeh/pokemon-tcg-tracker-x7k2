// Modelo de la colección para el álbum. NO guarda cantidades por su cuenta:
// IndexedDB (Almacen, de la Fase 2) es la única fuente de verdad y aquí solo hay una copia de lectura
// que se vuelve a leer de la base de datos después de cada cambio.
import { estaConseguida, progreso } from "../coleccion.js";
import { normalizar } from "../variantes.js";

export class ModeloColeccion {
  constructor(almacen, cartas) {
    this.almacen = almacen;
    this.cartas = cartas;
    this.cantidades = new Map();
    this.registros = new Map();                       // 3.16: id -> { cantidad, variantes, mostrar }
  }

  async cargar() {
    if (typeof this.almacen.leerRegistros === "function") {
      this.registros = await this.almacen.leerRegistros();
      this.cantidades = new Map([...this.registros].map(([id, r]) => [id, r.cantidad]));
    } else {                                          // almacenes sin variantes (dobles de prueba antiguos): solo totales
      this.cantidades = await this.almacen.leerTodas();
      this.registros = new Map();
    }
  }

  /** 3.16 · Registro con variantes de una carta (si no hay desglose: todo «sin clasificar»). */
  registro(id) {
    return this.registros.get(id) ?? normalizar({ cantidad: this.cantidad(id) });
  }

  /** 3.16 · Operaciones por variante: guardan en IndexedDB y SOLO entonces se relee (igual que cambiar). */
  async cambiarVariante(id, variante, delta) { const r = await this.almacen.sumarVariante(id, variante, delta); await this.cargar(); return r; }
  async clasificar(id, variante) { const r = await this.almacen.clasificarVariante(id, variante); await this.cargar(); return r; }
  async fijarVisible(id, variante) { const r = await this.almacen.fijarVarianteVisible(id, variante); await this.cargar(); return r; }

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
