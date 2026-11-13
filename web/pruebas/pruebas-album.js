// Pruebas de la Etapa 3.1 (álbum). Archivo aparte: no toca las de la Fase 2.
import { distribuir, ordenarCartas, ordenarPorPokedex, numeroPokedex, esEntrenador, POR_PAGINA, DEX_AL_FINAL } from "../js/album/distribucion.js";
import { ModeloColeccion } from "../js/album/modelo.js";
import { Almacen } from "../js/almacen.js";
import { siguiente, anterior, destino, sentidoEntre, leerPagina, urlConPagina, ADELANTE, ATRAS } from "../js/album/navegacion.js";
import { clasificarGesto } from "../js/album/gestos.js";

const pruebas = [];
const prueba = (nombre, fn, { soloNavegador = false } = {}) => pruebas.push({ nombre, fn, soloNavegador });
const igual = (real, esperado, msg = "") => {
  if (JSON.stringify(real) !== JSON.stringify(esperado)) throw new Error(`${msg} esperado ${JSON.stringify(esperado)} y salió ${JSON.stringify(real)}`);
};
const cierto = (c, m) => { if (!c) throw new Error(m); };

// 76 FN + 77 LW + 5 promos = 158 (mismas proporciones que el catálogo real)
const cartas = [
  ...Array.from({ length: 76 }, (_, i) => ({ id: `sv10.5b-${100 + i}`, expansion: "sv10.5b", numero: String(100 + i) })),
  ...Array.from({ length: 77 }, (_, i) => ({ id: `sv10.5w-${100 + i}`, expansion: "sv10.5w", numero: String(100 + i) })),
  ...[208, 209, 210, 211, 212].map((n) => ({ id: `svp-${n}`, expansion: "svp", numero: String(n) })),
];
const barajadas = [...cartas].sort((a, b) => (a.id < b.id ? 1 : -1));

prueba("modo secciones (antiguo): 19 páginas y 13 huecos (FN 9/5, LW 9/4, promos 1/4)", () => {
  const d = distribuir(cartas, { modo: "secciones" });
  igual([d.paginas.length, d.huecos], [19, 13]);
  const huecosDe = (s) => d.paginas.filter((p) => p.seccion.id === s).reduce((n, p) => n + p.bolsillos.filter((b) => !b).length, 0);
  igual([huecosDe("fn"), huecosDe("lw"), huecosDe("promo")], [5, 4, 4]);
});
prueba("continuo: 18 páginas y 4 huecos", () => {
  const d = distribuir(cartas, { modo: "continuo" });
  igual([d.paginas.length, d.huecos], [18, 4]);
});
prueba("la última página (promos) tiene 5 cartas + 4 huecos y todas las páginas 9 bolsillos", () => {
  const d = distribuir(cartas, { modo: "secciones" });
  const u = d.paginas[18];
  igual([u.bolsillos.filter(Boolean).length, u.bolsillos.filter((b) => !b).length], [5, 4]);
  cierto(d.paginas.every((p) => p.bolsillos.length === POR_PAGINA), "9 por página");
});
prueba("determinista: el orden de entrada no cambia las posiciones", () => {
  igual([...distribuir(cartas, { modo: "secciones" }).posiciones], [...distribuir(barajadas, { modo: "secciones" }).posiciones]);
});
prueba("cada carta aparece una sola vez y ninguna se pierde", () => {
  const ids = distribuir(cartas, { modo: "secciones" }).paginas.flatMap((p) => p.bolsillos.filter(Boolean).map((c) => c.id));
  igual(ids.length, 158); igual(new Set(ids).size, 158);
});
prueba("orden numérico (no alfabético) dentro de la sección", () => {
  const o = ordenarCartas([{ id: "a-100", expansion: "svp", numero: "100" }, { id: "a-20", expansion: "svp", numero: "20" }]);
  igual(o.map((c) => c.id), ["a-20", "a-100"]);
});
prueba("la distribución no depende de las copias (solo del catálogo)", () => {
  igual(distribuir(cartas, { modo: "secciones" }).posiciones.get("svp-208"), { pagina: 19, posicion: 1 });
});

prueba("modelo: estado derivado de IndexedDB, sin cantidades duplicadas", async () => {
  const nombre = `album-${Date.now()}`;
  const a = await Almacen.abrir(nombre);
  try {
    const m = new ModeloColeccion(a, cartas);
    await m.cargar();
    igual(m.estado("svp-208"), "pendiente");
    igual(await m.cambiar("svp-208", 1), { antes: 0, despues: 1 });
    igual(m.estado("svp-208"), "conseguida");
    igual(await m.cambiar("svp-208", 1), { antes: 1, despues: 2 });
    igual(m.progreso().conseguidas, 1, "2 copias = 1 objetivo");
    await m.cambiar("svp-208", -1); await m.cambiar("svp-208", -1);
    igual(m.estado("svp-208"), "pendiente");
    igual(await m.cambiar("svp-208", -1), { antes: 0, despues: 0 }, "nunca negativo");
    await m.cambiar("svp-209", 1);
    const b = await Almacen.abrir(nombre); // "recarga de página"
    const otro = new ModeloColeccion(b, cartas);
    await otro.cargar(); b.cerrar();
    igual(otro.estado("svp-209"), "conseguida", "persiste");
  } finally { a.cerrar(); indexedDB.deleteDatabase(nombre); }
}, { soloNavegador: true });
prueba("modelo: si el guardado falla, el modelo no cambia", async () => {
  const nombre = `album-${Date.now()}-f`;
  const a = await Almacen.abrir(nombre);
  try {
    const m = new ModeloColeccion(a, cartas); await m.cargar();
    let fallo = false; try { await m.cambiar("", 1); } catch { fallo = true; }
    cierto(fallo, "debe fallar"); igual(m.progreso().conseguidas, 0);
  } finally { a.cerrar(); indexedDB.deleteDatabase(nombre); }
}, { soloNavegador: true });


// ---------- Orden por Pokédex con el catálogo REAL (Etapa 3.1.1) ----------
async function catalogoReal() {
  const url = new URL("../../datos/catalogo/coleccion-teselia.json", import.meta.url);
  if (typeof document === "undefined") {
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(url, "utf8")).cartas;
  }
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`HTTP ${r.status} cargando el catálogo`);
  return (await r.json()).cartas;
}
const real = await catalogoReal();
const orden = ordenarPorPokedex(real).ordenadas;
const pokemon = orden.filter((c) => !esEntrenador(c));

prueba("Pokédex: el catálogo trae 158 cartas y todas las Pokémon tienen dexId", () => {
  igual(real.length, 158);
  igual(ordenarPorPokedex(real).sinPokedex, [], "Pokémon sin dexId");
  igual(distribuir(real).sinPokedex, []);
});
prueba("Pokédex: Snivy (#495) es la primera carta", () => {
  igual([orden[0].nombre, numeroPokedex(orden[0])], ["Snivy", 495]);
});
prueba("Pokédex: los Pokémon siguen el orden ascendente, salvo Victini", () => {
  const sinVictini = pokemon.filter((c) => numeroPokedex(c) !== DEX_AL_FINAL).map(numeroPokedex);
  igual(sinVictini, [...sinVictini].sort((a, b) => a - b));
  igual([sinVictini[0], sinVictini.at(-1)], [495, 649]);
});
prueba("Pokédex: las distintas ilustraciones de una especie quedan agrupadas (catálogo real + ejemplo con repetidas)", () => {
  // Hoy el catálogo real tiene 156 especies distintas; se añaden repetidas inventadas para probar la regla de verdad.
  const extra = [
    { id: "t-1", expansion: "sv10.5w", numero: "200", categoriaColeccion: "sir", dexId: [700], nombre: "Especie700 SIR" },
    { id: "t-2", expansion: "svp", numero: "300", categoriaColeccion: "promo", dexId: [700], nombre: "Especie700 promo" },
    { id: "t-3", expansion: "sv10.5b", numero: "005", categoriaColeccion: "ir", dexId: [700], nombre: "Especie700 IR FN" },
    { id: "t-4", expansion: "sv10.5b", numero: "009", categoriaColeccion: "ir", dexId: [494], nombre: "Victini extra" },
  ];
  const lista = ordenarPorPokedex([...real, ...extra]).ordenadas.filter((c) => !esEntrenador(c));
  const vistos = new Set(); let previo = null;
  for (const c of lista) {
    const d = numeroPokedex(c);
    if (d !== previo) { cierto(!vistos.has(d), `la especie #${d} aparece en dos tramos`); vistos.add(d); previo = d; }
  }
  const especie700 = lista.filter((c) => numeroPokedex(c) === 700).map((c) => c.id);
  igual(especie700.slice(0, 3).sort(), ["t-1", "t-2", "t-3"], "las 3 de #700 juntas");
  igual(especie700.slice(0, 3), ["t-3", "t-1", "t-2"], "FN antes que LW antes que promo");
  igual(lista.slice(-2).map((c) => c.id).sort(), ["svp-208", "t-4"], "todas las de Victini al final");
});
prueba("Pokédex: Victini (#494) es la última carta Pokémon, tras el resto", () => {
  const v = pokemon.at(-1);
  igual([v.id, numeroPokedex(v)], ["svp-208", 494]);
  igual(pokemon.filter((c) => numeroPokedex(c) === 494).length, 1);
});
prueba("Pokédex: los Entrenadores/Partidarios van al final, después de todos los Pokémon", () => {
  igual(orden.slice(-2).map((c) => c.id).sort(), ["sv10.5b-170", "sv10.5w-171"]);
  igual(orden.filter(esEntrenador).length, 2);
  cierto(orden.slice(0, 156).every((c) => !esEntrenador(c)), "un Pokémon quedó después de un Partidario");
});
prueba("Pokédex: las promos Pokémon están con su especie (salvo Victini)", () => {
  const pos = (id) => orden.findIndex((c) => c.id === id);
  const vecinos = (id) => orden.filter((c) => numeroPokedex(c) === numeroPokedex(orden[pos(id)]));
  for (const id of ["svp-209", "svp-210", "svp-211", "svp-212"]) {
    const grupo = vecinos(id).map((c) => c.id);
    const i = pos(id);
    cierto(grupo.every((g) => Math.abs(pos(g) - i) < grupo.length), `${id} separada de su especie`);
  }
  cierto(orden.filter((c) => c.categoriaColeccion === "promo").length === 5, "5 promos");
});
prueba("Pokédex: dentro de una especie, por expansión, rareza y número de carta", () => {
  const rango = { "sv10.5b": 0, "sv10.5w": 1, svp: 2 }, cat = { ir: 0, sir: 1, promo: 2 };
  const por = new Map();
  for (const c of pokemon) por.set(numeroPokedex(c), [...(por.get(numeroPokedex(c)) ?? []), c]);
  for (const [dex, lista] of por) {
    const claves = lista.map((c) => [rango[c.expansion], cat[c.categoriaColeccion], parseInt(c.numero, 10)]);
    const esperadas = [...claves].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    igual(claves, esperadas, `especie #${dex}`);
  }
});
prueba("Pokédex: 158 cartas, sin duplicados ni pérdidas, en 18 páginas con 4 huecos al final", () => {
  const d = distribuir(real);
  const ids = d.paginas.flatMap((p) => p.bolsillos.filter(Boolean).map((c) => c.id));
  igual([ids.length, new Set(ids).size], [158, 158]);
  igual(new Set(ids), new Set(real.map((c) => c.id)));
  igual([d.paginas.length, d.huecos], [18, 4]);
  igual(d.paginas.at(-1).bolsillos.map((b) => b === null), [false, false, false, false, false, true, true, true, true]);
});
prueba("Pokédex: el orden no depende del orden de entrada ni se toca el id de ninguna carta", () => {
  const al_reves = [...real].reverse();
  igual([...distribuir(real).posiciones], [...distribuir(al_reves).posiciones]);
  igual(real.map((c) => c.id).sort(), orden.map((c) => c.id).sort());
});
prueba("Pokédex: el criterio es dexId y no el número de carta (datos inventados)", () => {
  const a = { id: "x-001", expansion: "sv10.5b", numero: "001", categoriaColeccion: "ir", dexId: [600] };
  const b = { id: "x-999", expansion: "sv10.5b", numero: "999", categoriaColeccion: "ir", dexId: [500] };
  igual(ordenarPorPokedex([a, b]).ordenadas.map((c) => c.id), ["x-999", "x-001"]);
  const sin = { id: "x-500", expansion: "sv10.5b", numero: "500", categoriaColeccion: "ir" };
  igual(ordenarPorPokedex([sin, a]).sinPokedex, ["x-500"], "sin dexId se avisa, no se inventa");
});
prueba("Pokédex: cambiar el orden no cambia las cantidades, que van por id (IndexedDB)", async () => {
  const nombre = `album-orden-${Date.now()}`;
  const a = await Almacen.abrir(nombre);
  try {
    const m = new ModeloColeccion(a, real);
    await m.cargar();
    await m.cambiar("sv10.5b-087", 2); await m.cambiar("svp-208", 1); await m.cambiar("sv10.5w-171", 3);
    const antes = distribuir(real, { modo: "secciones" }).posiciones;
    const despues = distribuir(real, { modo: "pokedex" }).posiciones;
    cierto(JSON.stringify([...antes]) !== JSON.stringify([...despues]), "los dos órdenes deberían diferir");
    const b = await Almacen.abrir(nombre);
    const otro = new ModeloColeccion(b, real); await otro.cargar(); b.cerrar();
    igual([otro.cantidad("sv10.5b-087"), otro.cantidad("svp-208"), otro.cantidad("sv10.5w-171"), otro.cantidad("sv10.5b-088")], [2, 1, 3, 0]);
    igual(otro.progreso().conseguidas, 3);
    const p = distribuir(real).paginas.find((pg) => pg.bolsillos.some((c) => c?.id === "sv10.5b-087"));
    igual(p.numero, 1, "Snivy en la página 1 con 2 copias o con 0");
    igual(distribuir(real).posiciones, despues, "las posiciones no dependen de las cantidades");
  } finally { a.cerrar(); indexedDB.deleteDatabase(nombre); }
}, { soloNavegador: true });


// ---------- Fase 3.2: navegación circular (lógica pura) ----------
const N = 18;
const recorrer = (inicio, paso, veces) => { const r = [inicio]; for (let i = 0; i < veces; i++) r.push(paso(r.at(-1), N)); return r; };
prueba("Circular 1: página 18 + siguiente = página 1", () => igual(siguiente(18, N), 1));
prueba("Circular 2: página 1 + anterior = página 18", () => igual(anterior(1, N), 18));
prueba("Circular 3: secuencia 16 → 17 → 18 → 1 → 2 → 3", () => igual(recorrer(16, siguiente, 5), [16, 17, 18, 1, 2, 3]));
prueba("Circular 4: secuencia 3 → 2 → 1 → 18 → 17 → 16", () => igual(recorrer(3, anterior, 5), [3, 2, 1, 18, 17, 16]));
prueba("Circular 5: tras 18 avances desde la 1 se vuelve a la 1 (pasando por las 18)", () => {
  const r = recorrer(1, siguiente, 18); igual(r.at(-1), 1); igual(new Set(r).size, 18);
});
prueba("Circular 6: tras 18 retrocesos desde la 1 se vuelve a la 1 (pasando por las 18)", () => {
  const r = recorrer(1, anterior, 18); igual(r.at(-1), 1); igual(new Set(r).size, 18);
});
prueba("Circular: destino() y sentidoEntre() comparten el cálculo (18→1 es adelante, 1→18 es atrás)", () => {
  igual([destino(18, ADELANTE, N), destino(1, ATRAS, N), destino(5, ADELANTE, N), destino(5, ATRAS, N)], [1, 18, 6, 4]);
  igual([sentidoEntre(18, 1, N), sentidoEntre(1, 18, N), sentidoEntre(4, 5, N), sentidoEntre(5, 4, N), sentidoEntre(3, 9, N)], [ADELANTE, ATRAS, ADELANTE, ATRAS, null]);
});
prueba("URL: leerPagina valida y ajusta; urlConPagina conserva el resto de parámetros", () => {
  igual([leerPagina("?pagina=18", N), leerPagina("", N), leerPagina("?pagina=abc", N), leerPagina("?pagina=99", N), leerPagina("?pagina=0", N), leerPagina("?pagina=-4", N), leerPagina("?pagina=3.5", N)], [18, 1, 1, 18, 1, 1, 1]);
  const u = new URL(urlConPagina("http://x/web/album-prototipo.html?bd=prueba-1&pagina=18&z=2#h", 1));
  igual([u.searchParams.get("pagina"), u.searchParams.get("bd"), u.searchParams.get("z"), u.hash], ["1", "prueba-1", "2", "#h"]);
});
prueba("Gestos: izquierda = adelante, derecha = atrás; el scroll vertical, el toque corto y el gesto lento no navegan", () => {
  igual(clasificarGesto({ dx: -120, dy: 10, dt: 200 }), ADELANTE);
  igual(clasificarGesto({ dx: 120, dy: -10, dt: 200 }), ATRAS);
  igual(clasificarGesto({ dx: -120, dy: 140, dt: 200 }), null, "diagonal/vertical");
  igual(clasificarGesto({ dx: -10, dy: 0, dt: 80 }), null, "toque");
  igual(clasificarGesto({ dx: -150, dy: 0, dt: 2000 }), null, "demasiado lento");
});

export async function ejecutar(log) {
  const nav = typeof indexedDB !== "undefined" && typeof document !== "undefined";
  let ok = 0, fallos = 0, saltadas = 0;
  for (const p of pruebas) {
    if (p.soloNavegador && !nav) { saltadas++; log("SALTADA", p.nombre); continue; }
    try { await p.fn(); ok++; log("OK", p.nombre); } catch (e) { fallos++; log("FALLO", `${p.nombre} → ${e.message}`); }
  }
  log("RESUMEN", `${ok} correctas, ${fallos} fallos, ${saltadas} saltadas`);
  return fallos === 0;
}
