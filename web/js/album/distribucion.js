// Distribución de cartas en páginas: función PURA y determinista (sin DOM ni IndexedDB).
// Conseguir o retirar una carta no interviene aquí: las posiciones dependen solo del catálogo.

export const POR_PAGINA = 9;

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

/**
 * Reparte las cartas en páginas de 9 bolsillos (3x3). Los huecos sobrantes son `null`.
 *  - modo "secciones": cada sección empieza en página nueva (la más ordenada).
 *  - modo "continuo": todas seguidas, solo la última página tiene huecos.
 * Devuelve { paginas: [{ numero, seccion, bolsillos: [carta|null ×9] }], posiciones: Map id -> {pagina, posicion}, huecos }
 */
export function distribuir(cartas, { modo = "secciones", porPagina = POR_PAGINA } = {}) {
  const ordenadas = ordenarCartas(cartas);
  const grupos = modo === "continuo"
    ? [{ seccion: { id: "todo", nombre: "Colección" }, cartas: ordenadas }]
    : agrupar(ordenadas);

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
  return { paginas, posiciones, huecos };
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
