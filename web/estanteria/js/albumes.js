// Registro de álbumes de la biblioteca (lista fija en código, solo lectura). Lo usan la biblioteca y el visor 3D (?album=<id>).
// En las fases 3–4 esta lista vendrá de IndexedDB; la estantería solo depende de listarAlbumes(), así que no habrá que rehacerla.
// La Fase 1 NO abre IndexedDB: no lee ni escribe nada de la colección.

/** Diseños de lomo disponibles: «editorial» (negro, sello, título vertical; el dibujo está en lomo-teselia.js) y «liso». */
export const DISENOS_LOMO = ['editorial', 'teselia', 'liso'];
/** Materiales de lomo disponibles. */
export const MATERIALES_LOMO = ['cuero', 'tela'];

/**
 * @typedef {{ titulo: string, subtitulo: string, arribaIzq: string, arribaDer: string, pie: string, banda: string, bandaCodigo: string,
 *             cartas: string[] }} Portada   — textos de la portada impresa y las dos cartas que hacen de «foto»
 * @typedef {{ diseno: string, material: string, color: string, titulo: string, subtitulo: string, codigo: string, cifra: string,
 *             marca: 'teselia' | 'paleta' }} Lomo
 * @typedef {{ id: string, nombre: string, subtitulo: string, descripcion: string, expansiones: string[], meta: string, ruta: string,
 *             serie: string, nombreSerie: string, cartas: number, catalogo: string, precios: string, portada: Portada, lomo: Lomo,
 *             orden: number }} Album
 * Rutas de catálogo/precios relativas a la raíz del repositorio. Los datos de la colección (copias por id de carta) son los mismos para todos
 * los álbumes: una carta que está en dos álbumes (p. ej. Audino de Fulgor Negro) cuenta como la misma carta en los dos.
 */

/** @type {Album[]} */
const ALBUMES = [
  {
    id: 'teselia',
    nombre: 'Teselia',
    subtitulo: 'Llama Blanca · Fulgor Negro',
    descripcion: 'Álbum de las expansiones Llama Blanca (sv10.5w) y Fulgor Negro (sv10.5b), con sus promociones.',
    expansiones: ['sv10.5w', 'sv10.5b', 'svp'],
    meta: 'SV10.5W · SV10.5B · 158 cartas',
    serie: 'sv',
    nombreSerie: 'Escarlata y Púrpura',
    cartas: 158,                                    // tamaño del catálogo
    catalogo: 'datos/catalogo/coleccion-teselia.json',
    precios: 'datos/catalogo/precios-teselia.json',
    ruta: 'web/prueba-3d/index.html',              // ruta existente del álbum 3D: no se cambia para no romper enlaces
    portada: { titulo: 'Teselia', subtitulo: 'Llama Blanca · Fulgor Negro', arribaIzq: 'Pokémon TCG', arribaDer: 'Escarlata y Púrpura',
      pie: 'SV10.5W · SV10.5B · 158 cartas', banda: 'Teselia', bandaCodigo: 'SV10.5', cartas: ['sv10.5w-166', 'sv10.5b-166'] },
    lomo: { diseno: 'editorial', material: 'cuero', color: '#11141b', titulo: 'TESELIA', subtitulo: 'LLAMA BLANCA · FULGOR NEGRO',
      codigo: 'SV10.5', cifra: '158', marca: 'teselia' },
    orden: 0,
  },
  {
    id: 'asako-ito',
    nombre: 'Asako Ito',
    subtitulo: 'Colección de artista',
    descripcion: 'Todas las cartas físicas ilustradas por Asako Ito según TCGdex (de Sol y Luna a Megaevolución), sin las de TCG Pocket.',
    expansiones: [],
    meta: 'Ilustradora · 37 cartas · 2017–2026',
    serie: 'artistas',
    nombreSerie: 'Artistas',
    cartas: 37,
    catalogo: 'datos/catalogo/coleccion-asako-ito.json',
    precios: 'datos/catalogo/precios-asako-ito.json',
    ruta: 'web/prueba-3d/index.html?album=asako-ito',
    portada: { titulo: 'Asako Ito', subtitulo: 'Colección de artista', arribaIzq: 'Pokémon TCG', arribaDer: 'Ilustradora',
      pie: 'Sol y Luna – Megaevolución · 37 cartas', banda: 'Asako Ito', bandaCodigo: 'ARTISTA', cartas: ['sv10.5b-151', '30th-027'] },
    lomo: { diseno: 'editorial', material: 'cuero', color: '#11141b', titulo: 'ASAKO ITO', subtitulo: 'COLECCIÓN DE ARTISTA',
      codigo: 'ARTISTA', cifra: '37', marca: 'paleta' },
    orden: 1,
  },
];

/** PURO · Comprueba que un álbum tiene lo mínimo para colocarse en la estantería. Devuelve la lista de problemas (vacía = válido). */
export function validarAlbum(a) {
  const p = [];
  if (!a || typeof a !== 'object') return ['no es un objeto'];
  if (typeof a.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(a.id)) p.push('id inválido');
  if (typeof a.nombre !== 'string' || !a.nombre.trim()) p.push('falta el nombre');
  if (typeof a.ruta !== 'string' || /^[a-z]+:|^\/\//i.test(a.ruta)) p.push('ruta inválida (debe ser relativa)');
  if (!a.lomo || !DISENOS_LOMO.includes(a.lomo.diseno)) p.push('diseño de lomo desconocido');
  if (!a.lomo || !MATERIALES_LOMO.includes(a.lomo.material)) p.push('material de lomo desconocido');
  return p;
}

/** PURO · Ordena por `orden` (y luego por id), descarta los inválidos y los ids repetidos (se queda con el primero). */
export function normalizarAlbumes(lista) {
  const vistos = new Set();
  return [...lista]
    .filter((a) => validarAlbum(a).length === 0)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.id.localeCompare(b.id))
    .filter((a) => (vistos.has(a.id) ? false : (vistos.add(a.id), true)));
}

/** Álbumes de la biblioteca, ya validados y ordenados. Asíncrona a propósito: en la Fase 4 leerá de IndexedDB sin cambiar a quien la llama. */
export async function listarAlbumes() {
  return normalizarAlbumes(ALBUMES).map((a) => structuredClone(a));
}

/** Álbum por id (síncrono, para el visor 3D, que lo necesita antes de montar la escena). Si el id no existe, el primero (Teselia). */
export function albumPorId(id) {
  const lista = normalizarAlbumes(ALBUMES);
  return structuredClone(lista.find((a) => a.id === id) || lista[0]);
}
