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
    for (const bolsillos of colocar(lista, porPagina)) {             // 3.34: con los V-UNIÓN en bloque 2×2
      const numero = paginas.length + 1;
      bolsillos.forEach((c, k) => { if (c) posiciones.set(c.id, { pagina: numero, posicion: k + 1 }); else huecos++; });
      paginas.push({ numero, seccion, bolsillos });
    }
  }
  return { paginas, posiciones, huecos, sinPokedex };
}

// ------------------------------------------------------------------ 3.34 · mosaicos (cartas V-UNIÓN)
// Un Pokémon V-UNIÓN son 4 cartas que juntas forman una sola imagen 2×2: la de número menor arriba a la izquierda, luego arriba a la derecha,
// abajo a la izquierda y abajo a la derecha (comprobado con Mewtwo V-UNIÓN, SWSH159–162). En el álbum van en un bloque 2×2 de la misma página.
const ES_UNION = /V-UNI[OÓ]N/i;
const LADO = 3;                                                     // páginas de 3×3

/** Grupos de 4 piezas de un mismo V-UNIÓN (mismo nombre y expansión), cada uno en orden de mosaico. Map id de la 1.ª pieza → [4 cartas]. */
export function mosaicos(cartas) {
  const g = new Map();
  for (const c of cartas) {
    if (!ES_UNION.test(c.nombre || "")) continue;
    const k = c.expansion + "|" + c.nombre;
    g.set(k, [...(g.get(k) || []), c]);
  }
  const res = new Map();
  for (const l of g.values()) {
    if (l.length !== 4) continue;                                   // incompleto: se coloca como cartas sueltas
    const orden = [...l].sort((a, b) => (parseInt(String(a.numero).replace(/\D/g, ""), 10) || 0) - (parseInt(String(b.numero).replace(/\D/g, ""), 10) || 0) || a.id.localeCompare(b.id));
    res.set(orden[0].id, orden);
  }
  return res;
}

/** Bolsillo de arriba a la izquierda donde cabe un bloque 2×2 libre en una página (0..8), o -1. */
const huecoBloque = (pag) => [0, 1, 3, 4].find((s) => [s, s + 1, s + LADO, s + LADO + 1].every((k) => pag[k] === null)) ?? -1;

/**
 * Coloca una lista ya ordenada en páginas de `porPagina` bolsillos, con los V-UNIÓN en bloque 2×2. Las demás cartas ocupan el primer
 * bolsillo libre (en orden de lectura), así que los huecos que deja un bloque se rellenan con las siguientes: no quedan huecos en medio.
 * Si con los bloques hicieran falta más páginas que sin ellos, se colocan como cartas sueltas (el modelo 3D tiene las hojas justas).
 */
function colocar(lista, porPagina) {
  const piezas = porPagina === LADO * LADO ? mosaicos(lista) : new Map();
  const enMosaico = new Set([...piezas.values()].flat().map((c) => c.id));
  const intentar = (conMosaicos) => {
    const paginas = [];
    const nueva = () => { const p = Array(porPagina).fill(null); paginas.push(p); return p; };
    const libre = () => { for (const p of paginas) { const k = p.indexOf(null); if (k >= 0) return [p, k]; } const p = nueva(); return [p, 0]; };
    for (const c of lista) {
      if (conMosaicos && enMosaico.has(c.id)) {
        const bloque = piezas.get(c.id);
        if (!bloque) continue;                                      // pieza 2.ª–4.ª: ya colocada con la 1.ª
        // la página donde iría la siguiente carta suelta, o una nueva si ahí no cabe el bloque
        let [p] = libre(), s = huecoBloque(p);
        if (s < 0) { p = nueva(); s = 0; }
        [s, s + 1, s + LADO, s + LADO + 1].forEach((k, i) => { p[k] = bloque[i]; });
        continue;
      }
      const [p, k] = libre(); p[k] = c;
    }
    return paginas;
  };
  let paginas = intentar(true);
  if (paginas.length > Math.ceil(lista.length / porPagina)) paginas = intentar(false);
  return paginas;
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
