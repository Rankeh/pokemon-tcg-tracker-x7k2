// Pruebas de la Etapa 3.1 (álbum). Archivo aparte: no toca las de la Fase 2.
import { distribuir, ordenarCartas, POR_PAGINA } from "../js/album/distribucion.js";
import { ModeloColeccion } from "../js/album/modelo.js";
import { Almacen } from "../js/almacen.js";

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

prueba("secciones: 19 páginas y 13 huecos (FN 9/5, LW 9/4, promos 1/4)", () => {
  const d = distribuir(cartas);
  igual([d.paginas.length, d.huecos], [19, 13]);
  const huecosDe = (s) => d.paginas.filter((p) => p.seccion.id === s).reduce((n, p) => n + p.bolsillos.filter((b) => !b).length, 0);
  igual([huecosDe("fn"), huecosDe("lw"), huecosDe("promo")], [5, 4, 4]);
});
prueba("continuo: 18 páginas y 4 huecos", () => {
  const d = distribuir(cartas, { modo: "continuo" });
  igual([d.paginas.length, d.huecos], [18, 4]);
});
prueba("la última página (promos) tiene 5 cartas + 4 huecos y todas las páginas 9 bolsillos", () => {
  const d = distribuir(cartas);
  const u = d.paginas[18];
  igual([u.bolsillos.filter(Boolean).length, u.bolsillos.filter((b) => !b).length], [5, 4]);
  cierto(d.paginas.every((p) => p.bolsillos.length === POR_PAGINA), "9 por página");
});
prueba("determinista: el orden de entrada no cambia las posiciones", () => {
  igual([...distribuir(cartas).posiciones], [...distribuir(barajadas).posiciones]);
});
prueba("cada carta aparece una sola vez y ninguna se pierde", () => {
  const ids = distribuir(cartas).paginas.flatMap((p) => p.bolsillos.filter(Boolean).map((c) => c.id));
  igual(ids.length, 158); igual(new Set(ids).size, 158);
});
prueba("orden numérico (no alfabético) dentro de la sección", () => {
  const o = ordenarCartas([{ id: "a-100", expansion: "svp", numero: "100" }, { id: "a-20", expansion: "svp", numero: "20" }]);
  igual(o.map((c) => c.id), ["a-20", "a-100"]);
});
prueba("la distribución no depende de las copias (solo del catálogo)", () => {
  igual(distribuir(cartas).posiciones.get("svp-208"), { pagina: 19, posicion: 1 });
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
