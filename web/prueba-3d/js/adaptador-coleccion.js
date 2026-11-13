// Adaptador entre la colección REAL (catálogo + IndexedDB de la app) y el álbum 3D. Módulo PURO: no importa Three.js ni toca el DOM.
// No es un segundo sistema de colección: reutiliza tal cual
//   - distribuir()        (web/js/album/distribucion.js)  → qué carta va en cada página/bolsillo (orden Pokédex, Victini, Entrenadores, huecos)
//   - ModeloColeccion     (web/js/album/modelo.js)        → lectura/escritura sobre Almacen (IndexedDB 'coleccion-teselia', almacén 'copias')
//   - validarCatalogo, sumarCopias, estaConseguida (web/js/coleccion.js) → reglas (0..999, nunca negativo)
// y solo añade la traducción  página/posición del catálogo  ⇄  nodo 3D ("Hoja_i_F|D_Bolsillo_k").
import { distribuir, POR_PAGINA } from '../../js/album/distribucion.js';
import { validarCatalogo, MAX_COPIAS } from '../../js/coleccion.js';

/**
 * Cada hoja del álbum 3D tiene dos caras con 9 bolsillos. Páginas del catálogo en orden de lectura de un libro:
 *   página 1 = hoja 1 frente, 2 = hoja 1 dorso, 3 = hoja 2 frente, ... (hoja = ceil(p/2); impar → F, par → D).
 * Con el álbum abierto tras girar `vueltas` elementos (0 = cerrado, 1 = tapa abierta, 2 = hoja 1 girada, ...),
 * se ven la página 2(v-1) a la izquierda (dorso de la hoja v-1) y la 2v-1 a la derecha (frente de la hoja v).
 */
export const ubicacionPagina = (pagina) => ({ hoja: Math.ceil(pagina / 2), cara: pagina % 2 === 1 ? 'F' : 'D' });

/** Nombre del nodo 3D de un bolsillo. `hoja` es 1-based (como los elementos de logica.js); los nodos del GLB son Hoja_(hoja-1). */
export const nombreBolsillo = (pagina, posicion) => {
  const { hoja, cara } = ubicacionPagina(pagina);
  return `Hoja_${hoja - 1}_${cara}_Bolsillo_${posicion - 1}`;
};

/** Páginas visibles para un número de vueltas (null = no hay página en ese lado). */
export function paginasVisibles(vueltas, totalPaginas) {
  const izq = vueltas >= 2 ? 2 * (vueltas - 1) : null;
  const der = vueltas >= 1 ? 2 * vueltas - 1 : null;
  return { izquierda: izq !== null && izq <= totalPaginas ? izq : null, derecha: der !== null && der <= totalPaginas ? der : null };
}

/** Elementos (tapa + hojas) que necesita el GLB para `paginas` páginas, y vueltas máximas. */
export const hojasNecesarias = (paginas) => Math.ceil(paginas / 2);

/** Tipo de cambio visual que provoca una variación de cantidad (la animación depende SOLO de esto). */
export function clasificarTransicion(antes, despues) {
  if (antes === despues) return 'nada';
  if (antes === 0 && despues >= 1) return 'insertar';
  if (antes >= 1 && despues === 0) return 'extraer';
  return 'cantidad';          // 1→2, 2→1, 3→5...: la carta no se duplica ni desaparece; solo cambia el contador
}

/** Construye el mapa fijo catálogo ⇄ álbum 3D. Lanza si el catálogo no es válido. */
export function crearMapa(catalogoObj, opciones = {}) {
  const v = validarCatalogo(catalogoObj);
  if (!v.ok) throw new Error('Catálogo no válido: ' + v.errores.join('; '));
  const d = distribuir(v.cartas, opciones);
  const porNombre = new Map(), porId = new Map(), cartaPorId = new Map(v.cartas.map((c) => [c.id, c]));
  for (const p of d.paginas) {
    p.bolsillos.forEach((carta, i) => {
      const nombre = nombreBolsillo(p.numero, i + 1);
      porNombre.set(nombre, { pagina: p.numero, posicion: i + 1, carta });
      if (carta) porId.set(carta.id, { pagina: p.numero, posicion: i + 1, nombre });
    });
  }
  return { cartas: v.cartas, paginas: d.paginas, totalPaginas: d.paginas.length, huecos: d.huecos, porNombre, porId, cartaPorId, hojas: hojasNecesarias(d.paginas.length) };
}

/** URL de la textura de una carta: miniatura TCGdex (low.webp, ~245 px: suficiente para 256×358) o null si no hay imagen. */
export function urlTextura(carta, calidad = 'low') {
  if (!carta || !carta.imagen || carta.estadoImagen === 'sin-imagen') return null;
  return calidad === 'low' ? carta.imagen.replace(/\/high\.webp$/, '/low.webp') : carta.imagen;
}

/**
 * Orden de carga de texturas: primero las de las páginas visibles, luego las vecinas (por cercanía), nunca las 158 a la vez.
 * `vueltas` = estado actual; `radio` = cuántos estados vecinos incluir.
 */
export function cartasPrioritarias(mapa, vueltas, radio = 1) {
  const orden = [], vistos = new Set();
  for (let d = 0; d <= radio; d++) {
    for (const v of d === 0 ? [vueltas] : [vueltas - d, vueltas + d]) {
      const { izquierda, derecha } = paginasVisibles(v, mapa.totalPaginas);
      for (const p of [izquierda, derecha]) {
        if (!p || vistos.has(p)) continue;
        vistos.add(p);
        for (const c of mapa.paginas[p - 1].bolsillos) if (c) orden.push({ carta: c, pagina: p, prioridad: d });
      }
    }
  }
  return orden;
}

/**
 * Operaciones de colección para el álbum 3D. `modelo` es un ModeloColeccion (o cualquier objeto con cargar(), cantidad(id), cambiar(id, delta)).
 * Regla de oro heredada de la app: primero se guarda; SOLO si el guardado se confirma se devuelve la transición para animar.
 */
export class AdaptadorColeccion {
  constructor(mapa, modelo) {
    this.mapa = mapa;
    this.modelo = modelo;
    this._cola = Promise.resolve();      // las operaciones se encadenan: dos toques rápidos nunca se pisan
    this._oyentes = new Set();
  }

  alCambiar(fn) { this._oyentes.add(fn); return () => this._oyentes.delete(fn); }

  async cargar() { await this.modelo.cargar(); }

  cantidad(id) { return this.modelo.cantidad(id); }

  /** {pagina, posicion, carta} del nodo, o null si el nombre no es un bolsillo del álbum. carta === null → hueco final. */
  bolsillo(nombre) { return this.mapa.porNombre.get(nombre) ?? null; }

  /** Un hueco (sin carta) o un nodo desconocido no se pueden editar. */
  puedeEditar(nombre) { return Boolean(this.bolsillo(nombre)?.carta); }

  /** Datos que necesita la ficha al tocar un bolsillo. null si no hay carta asignada. */
  fichaDe(nombre) {
    const b = this.bolsillo(nombre);
    if (!b || !b.carta) return null;
    const c = b.carta;
    return { id: c.id, nombre: c.nombre, nombreExpansion: c.nombreExpansion, expansion: c.expansion, numero: c.numero, rareza: c.rareza,
             pagina: b.pagina, posicion: b.posicion, cantidad: this.cantidad(c.id), url: urlTextura(c, 'high'), urlMiniatura: urlTextura(c, 'low') };
  }

  /** Cambia la cantidad de UNA carta del catálogo. Rechaza ids que no existan (no hay cartas arbitrarias). */
  cambiar(id, delta) {
    const op = this._cola.then(async () => {
      if (!this.mapa.cartaPorId.has(id)) throw new RangeError('La carta ' + JSON.stringify(id) + ' no está en el catálogo');
      if (!Number.isInteger(delta) || Math.abs(delta) !== 1) throw new RangeError('Solo se añade o retira una copia cada vez');
      const antes = this.modelo.cantidad(id);
      if ((delta < 0 && antes === 0) || (delta > 0 && antes >= MAX_COPIAS)) return { id, antes, despues: antes, transicion: 'nada' };   // nada que guardar
      const r = await this.modelo.cambiar(id, delta);              // ModeloColeccion → Almacen.sumar (transacción atómica) → relee
      const res = { id, antes: r.antes, despues: r.despues, transicion: clasificarTransicion(r.antes, r.despues) };
      for (const fn of this._oyentes) fn(res);
      return res;
    });
    this._cola = op.catch(() => {});                                // un fallo no bloquea la cola
    return op;
  }

  anadir(id) { return this.cambiar(id, +1); }
  retirar(id) { return this.cambiar(id, -1); }
}
