// Distribución de cartas en páginas: función PURA y determinista (sin DOM ni IndexedDB).
// Conseguir o retirar una carta no interviene aquí: las posiciones dependen solo del catálogo.

export const POR_PAGINA = 9;

/** Excepción intencionada del orden Pokédex: Victini (#494) va al final de las cartas Pokémon. */
export const DEX_AL_FINAL = 494;
const RANGO_CATEGORIA = { ir: 0, sir: 1, promo: 2 };

/** Orden de las secciones del álbum. Lo que no encaje en ninguna va al final, en "otras". */
export const SECCIONES = [
  { id: "fn", expansion: "sv10.5b", nombre: "Fulgor Negro" },
  { id: "lw", expansion: "sv10.5w", nombre: "Llama Blanca" },
  { id: "promo", expansion: "svp", nombre: "Promociones" },
];

const seccionDe = (carta) =>
  SECCIONES.find((s) => s.expansion === carta.expansion) ?? { id: "otras", expansion: carta.expansion, nombre: "Otras" };

/** Orden estable: sección, número de colección (numérico) e id como desempate. */
export function ordenarCartas(cartas) {
  const rango = (c) => {
    const i = SECCIONES.findIndex((s) => s.expansion === c.expansion);
    return i === -1 ? SECCIONES.length : i;
  };
  return [...cartas].sort((a, b) =>
    rango(a) - rango(b) ||
    (parseInt(a.numero, 10) || 0) - (parseInt(b.numero, 10) || 0) ||
    a.id.localeCompare(b.id));
}

/** Número de Pokédex Nacional tal y como lo da TCGdex (campo dexId, lista); null si no hay. Nunca se deduce del número de carta. */
export const numeroPokedex = (carta) => (Array.isArray(carta.dexId) && Number.isInteger(carta.dexId[0]) ? carta.dexId[0] : null);
export const esEntrenador = (carta) => carta.categoriaColeccion === "partidario";

function rangoExpansion(carta) {
  const i = SECCIONES.findIndex((s) => s.expansion === carta.expansion);
  return i === -1 ? SECCIONES.length : i;
}

/**
 * Orden por Pokédex (puro y determinista):
 *  1) Pokémon por número de Pokédex ascendente (todas las cartas de una especie juntas),
 *  2) Victini (DEX_AL_FINAL) tras el resto de Pokémon,
 *  3) Entrenadores/Partidarios,
 *  4) (aviso) Pokémon sin dexId: no debería haberlos; se colocan al final y se devuelven en `sinPokedex`.
 * Dentro de una especie: expansión (FN, LW, promo), categoría (IR, SIR, promo), número de carta e id.
 */
export function ordenarPorPokedex(cartas) {
  const sinPokedex = [];
  const clave = (c) => {
    if (esEntrenador(c)) return [2, 0];
    const dex = numeroPokedex(c);
    if (dex === null) { sinPokedex.push(c.id); return [3, 0]; }
    return dex === DEX_AL_FINAL ? [1, dex] : [0, dex];
  };
  const desempate = (a, b) =>
    rangoExpansion(a) - rangoExpansion(b) ||
    (RANGO_CATEGORIA[a.categoriaColeccion] ?? 9) - (RANGO_CATEGORIA[b.categoriaColeccion] ?? 9) ||
    (parseInt(a.numero, 10) || 0) - (parseInt(b.numero, 10) || 0) ||
    a.id.localeCompare(b.id);
  const ordenadas = [...cartas].sort((a, b) => {
    const [ga, da] = clave(a), [gb, db] = clave(b);
    return ga - gb || da - db || desempate(a, b);
  });
  return { ordenadas, sinPokedex: [...new Set(sinPokedex)].sort() };
}

/**
 * Reparte las cartas en páginas de 9 bolsillos (3x3). Los huecos sobrantes son `null`.
 *  - modo "pokedex" (por defecto): orden de ordenarPorPokedex, todo seguido; solo la última página tiene huecos.
 *  - modo "secciones": cada sección empieza en página nueva (la más ordenada).
 *  - modo "continuo": todas seguidas, solo la última página tiene huecos.
 * Devuelve { paginas: [{ numero, seccion, bolsillos: [carta|null ×9] }], posiciones: Map id -> {pagina, posicion}, huecos }
 */
export function distribuir(cartas, { modo = "pokedex", porPagina = POR_PAGINA } = {}) {
  let sinPokedex = [];
  let grupos;
  if (modo === "pokedex") {
    const r = ordenarPorPokedex(cartas);
    sinPokedex = r.sinPokedex;
    grupos = [{ seccion: { id: "pokedex", nombre: "Pokédex" }, cartas: r.ordenadas }];
  } else if (modo === "continuo") {
    grupos = [{ seccion: { id: "todo", nombre: "Colección" }, cartas: ordenarCartas(cartas) }];
  } else {
    grupos = agrupar(ordenarCartas(cartas));
  }

  const paginas = [];
  const posiciones = new Map();
  let huecos = 0;
  for (const { seccion, cartas: lista } of grupos) {
    for (let i = 0; i < lista.length; i += porPagina) {
      const trozo = lista.slice(i, i + porPagina);
      const bolsillos = Array.from({ length: porPagina }, (_, k) => trozo[k] ?? null);
      huecos += porPagina - trozo.length;
      const numero = paginas.length + 1;
      trozo.forEach((c, k) => posiciones.set(c.id, { pagina: numero, posicion: k + 1 }));
      paginas.push({ numero, seccion, bolsillos });
    }
  }
  return { paginas, posiciones, huecos, sinPokedex };
}

function agrupar(ordenadas) {
  const grupos = [];
  for (const c of ordenadas) {
    const seccion = seccionDe(c);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.seccion.id === seccion.id) ultimo.cartas.push(c);
    else grupos.push({ seccion, cartas: [c] });
  }
  return grupos;
}
