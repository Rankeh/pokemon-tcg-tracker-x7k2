// Registro de álbumes de la biblioteca (Fase 1: lista fija en código, solo lectura).
// En las fases 3–4 esta lista vendrá de IndexedDB; la estantería solo depende de listarAlbumes(), así que no habrá que rehacerla.
// La Fase 1 NO abre IndexedDB: no lee ni escribe nada de la colección.

/** Diseños de lomo disponibles (el dibujo de cada uno está en lomo-*.js). */
export const DISENOS_LOMO = ['teselia', 'liso'];
/** Materiales de lomo disponibles. */
export const MATERIALES_LOMO = ['cuero', 'tela'];

/** @typedef {{ id: string, nombre: string, subtitulo: string, descripcion: string, expansiones: string[], ruta: string,
 *              lomo: { diseno: string, material: string, color: string }, orden: number }} Album */

/** @type {Album[]} */
const ALBUMES = [
  {
    id: 'teselia',
    nombre: 'Teselia',
    subtitulo: 'Llama Blanca · Fulgor Negro',
    descripcion: 'Álbum de las expansiones Llama Blanca (sv10.5w) y Fulgor Negro (sv10.5b), con sus promociones.',
    expansiones: ['sv10.5w', 'sv10.5b', 'svp'],
    ruta: 'web/prueba-3d/index.html',              // ruta existente del álbum 3D: no se cambia para no romper enlaces
    lomo: { diseno: 'teselia', material: 'cuero', color: '#11141b' },
    orden: 0,
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
