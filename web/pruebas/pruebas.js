// Pruebas de la Fase 2. Funcionan en Node (lógica) y en el navegador (lógica + IndexedDB + imagen).
import { sumarCopias, esCantidadValida, estaConseguida, validarCatalogo, progreso, huerfanas, MAX_COPIAS } from "../js/coleccion.js";
import { crearCopia, validarCopia, prepararImportacion, FORMATO } from "../js/copias.js";
import { Almacen } from "../js/almacen.js";
import { crearImagenCarta } from "../js/imagen.js";

const pruebas = [];
const prueba = (nombre, fn, { soloNavegador = false } = {}) => pruebas.push({ nombre, fn, soloNavegador });
const igual = (real, esperado, msg = "") => {
  if (JSON.stringify(real) !== JSON.stringify(esperado)) {
    throw new Error(`${msg} esperado ${JSON.stringify(esperado)} y salió ${JSON.stringify(real)}`);
  }
};
const cierto = (cond, msg) => { if (!cond) throw new Error(msg); };

const cartas158 = Array.from({ length: 158 }, (_, i) => ({
  id: i >= 153 ? `svp-${208 + i - 153}` : `sv10.5${i % 2 ? "w" : "b"}-${String(i).padStart(3, "0")}`,
  categoriaColeccion: i < 139 ? "ir" : i < 151 ? "sir" : i < 153 ? "partidario" : "promo",
  expansion: i >= 153 ? "svp" : i % 2 ? "sv10.5w" : "sv10.5b",
  nombre: "X" + i, numero: String(i),
  imagen: "", estadoImagen: "sin-imagen",
}));

// ---------- lógica pura ----------
prueba("la cantidad nunca baja de 0", () => {
  igual(sumarCopias(0, -1), 0);
  igual(sumarCopias(1, -5), 0);
  igual(sumarCopias(2, -1), 1);
});
prueba("la cantidad nunca supera el tope", () => igual(sumarCopias(MAX_COPIAS, +1), MAX_COPIAS));
prueba("cantidades no válidas se tratan como 0 al sumar", () => igual(sumarCopias(-3, 1), 1));
prueba("solo son válidos los enteros de 0 al tope", () => {
  for (const malo of [-1, 1.5, "2", null, undefined, NaN, Infinity, MAX_COPIAS + 1]) cierto(!esCantidadValida(malo), String(malo));
  for (const bueno of [0, 1, 999]) cierto(esCantidadValida(bueno), String(bueno));
});
prueba("conseguida con 1 o más copias; 3 copias siguen siendo 1 objetivo", () => {
  cierto(!estaConseguida(0) && estaConseguida(1) && estaConseguida(3), "estado");
  const p = progreso(cartas158, new Map([[cartas158[0].id, 3]]));
  igual([p.total, p.conseguidas, p.pendientes], [158, 1, 157]);
});
prueba("progreso sobre las 158 cartas, promos incluidas, con porcentaje", () => {
  const mapa = new Map(cartas158.slice(0, 79).map((c) => [c.id, 1]));
  const p = progreso(cartas158, mapa);
  igual([p.conseguidas, p.porcentaje], [79, 50]);
  igual(p.porCategoria.promo, { total: 5, conseguidas: 0 });
  const conPromos = progreso(cartas158, new Map(cartas158.slice(153).map((c) => [c.id, 1])));
  igual(conPromos.porCategoria.promo, { total: 5, conseguidas: 5 }, "las promos sin imagen cuentan");
  igual(conPromos.conseguidas, 5);
});
prueba("validarCatalogo detecta ids repetidos o ausentes", () => {
  cierto(validarCatalogo({ cartas: cartas158 }).ok, "158 cartas deberían ser válidas");
  cierto(!validarCatalogo({ cartas: [{ id: "a" }, { id: "a" }] }).ok, "repetido");
  cierto(!validarCatalogo({ cartas: [{ nombre: "x" }] }).ok, "sin id");
  cierto(!validarCatalogo({}).ok, "sin cartas");
});
prueba("actualizar el catálogo no borra cantidades (las huérfanas se conservan y no cuentan)", () => {
  const mapa = new Map([["sv10.5b-000", 2], ["carta-que-desaparece", 4]]);
  const nuevoCatalogo = cartas158.filter((c) => c.id !== "sv10.5b-000").concat({ id: "svp-999", expansion: "svp", categoriaColeccion: "promo" });
  igual(huerfanas(nuevoCatalogo, mapa).sort(), ["carta-que-desaparece", "sv10.5b-000"]);
  igual(progreso(nuevoCatalogo, mapa).conseguidas, 0, "las huérfanas no cuentan para el progreso");
  igual(mapa.get("carta-que-desaparece"), 4, "la cantidad sigue en el mapa");
});

// ---------- copias de seguridad ----------
prueba("exportar solo incluye cartas con copias y es válida al reimportarla", () => {
  const copia = crearCopia(new Map([["svp-208", 2], ["a-1", 0], ["b-2", 1]]), { generado: "x", cartas: 158 });
  igual(copia.formato, FORMATO);
  igual(copia.copias, { "b-2": 1, "svp-208": 2 });
  const v = validarCopia(JSON.parse(JSON.stringify(copia)), new Set(["svp-208", "b-2"]));
  cierto(v.ok, v.errores.join());
  igual([...v.copias], [["b-2", 1], ["svp-208", 2]]);
});
prueba("la validación rechaza estructuras, versiones y cantidades incorrectas", () => {
  const base = { formato: FORMATO, version: 1, copias: { a: 1 } };
  cierto(validarCopia(base).ok, "la base es válida");
  const malas = [
    ["no objeto", "hola"], ["array", []], ["null", null],
    ["otro formato", { ...base, formato: "otra-app" }],
    ["sin versión", { formato: FORMATO, copias: {} }],
    ["versión 0", { ...base, version: 0 }],
    ["versión futura", { ...base, version: 99 }],
    ["sin copias", { formato: FORMATO, version: 1 }],
    ["copias array", { ...base, copias: [1] }],
    ["negativa", { ...base, copias: { a: -1 } }],
    ["decimal", { ...base, copias: { a: 1.5 } }],
    ["texto", { ...base, copias: { a: "2" } }],
    ["demasiado grande", { ...base, copias: { a: 100000 } }],
    ["id vacío", { ...base, copias: { "": 1 } }],
  ];
  for (const [nombre, obj] of malas) cierto(!validarCopia(obj).ok, "debería rechazar: " + nombre);
});
prueba("ids desconocidos no son error: se avisan y se conservan", () => {
  const v = validarCopia({ formato: FORMATO, version: 1, copias: { viejo: 2, "svp-208": 1 } }, new Set(["svp-208"]));
  cierto(v.ok, "ok");
  igual(v.desconocidas, ["viejo"]);
  cierto(v.copias.has("viejo"), "se conserva");
  cierto(v.avisos.length === 1, "un aviso");
});
prueba("preparar la importación no cambia nada y resume los cambios", () => {
  const actual = new Map([["a", 1], ["b", 3], ["c", 2], ["d", 5]]);
  const texto = JSON.stringify({ formato: FORMATO, version: 1, copias: { a: 1, b: 4, c: 1, e: 2 } });
  const plan = prepararImportacion(texto, actual);
  cierto(plan.ok, plan.errores.join());
  igual(plan.resumen, { nuevas: 1, aumentan: 1, disminuyen: 1, iguales: 1, soloEnActual: 1 });
  igual([...actual], [["a", 1], ["b", 3], ["c", 2], ["d", 5]], "el mapa actual no se toca");
  cierto(!prepararImportacion("{no es json", actual).ok, "JSON roto");
});

// ---------- IndexedDB (solo navegador) ----------
let contador = 0;
const nombreBd = () => `prueba-${Date.now()}-${contador++}`;
async function conBd(fn) {
  const nombre = nombreBd();
  const a = await Almacen.abrir(nombre);
  try { await fn(a, nombre); } finally { a.cerrar(); indexedDB.deleteDatabase(nombre); }
}
prueba("IndexedDB: empieza en 0, suma y resta sin bajar de 0", () => conBd(async (a) => {
  igual(await a.cantidad("svp-208"), 0);
  igual(await a.sumar("svp-208", 1), 1);
  igual(await a.sumar("svp-208", 1), 2);
  igual(await a.sumar("svp-208", -1), 1);
  igual(await a.sumar("svp-208", -1), 0);
  igual(await a.sumar("svp-208", -1), 0);
  igual([...(await a.leerTodas())], [], "a 0 no queda fila");
}), { soloNavegador: true });
prueba("IndexedDB: pulsaciones simultáneas no se pisan", () => conBd(async (a) => {
  await Promise.all(Array.from({ length: 20 }, () => a.sumar("x", 1)));
  igual(await a.cantidad("x"), 20);
}), { soloNavegador: true });
prueba("IndexedDB: los datos persisten al cerrar y volver a abrir la base", async () => {
  const nombre = nombreBd();
  const a = await Almacen.abrir(nombre);
  await a.sumar("svp-208", 3); await a.sumar("sv10.5b-001", 1);
  a.cerrar();
  const b = await Almacen.abrir(nombre);
  igual([...(await b.leerTodas())].sort(), [["sv10.5b-001", 1], ["svp-208", 3]]);
  b.cerrar(); indexedDB.deleteDatabase(nombre);
}, { soloNavegador: true });
prueba("IndexedDB: rechaza cantidades y ids no válidos", () => conBd(async (a) => {
  for (const f of [() => a.fijar("x", -1), () => a.fijar("x", 2.5), () => a.sumar("", 1), () => a.sumar("x", 1.5)]) {
    let fallo = false; try { await f(); } catch { fallo = true; }
    cierto(fallo, "debería fallar");
  }
  igual([...(await a.leerTodas())], []);
}), { soloNavegador: true });
prueba("IndexedDB: importar reemplazando, combinando y deshaciendo", () => conBd(async (a) => {
  await a.sumar("a", 2); await a.sumar("b", 1);
  await a.importar(new Map([["a", 1], ["c", 5]]), "combinar");
  igual([...(await a.leerTodas())].sort(), [["a", 2], ["b", 1], ["c", 5]], "combinar = máximo");
  await a.importar(new Map([["z", 7]]), "reemplazar");
  igual([...(await a.leerTodas())], [["z", 7]], "reemplazar");
  cierto(await a.deshacerImportacion(), "debe poder deshacer");
  igual([...(await a.leerTodas())].sort(), [["a", 2], ["b", 1], ["c", 5]], "vuelve a lo de antes de reemplazar");
  igual(await a.deshacerImportacion(), false, "ya no queda nada que deshacer");
}), { soloNavegador: true });
prueba("IndexedDB: una importación inválida no cambia nada", () => conBd(async (a) => {
  await a.sumar("a", 2);
  let fallo = false; try { await a.importar(new Map([["b", -4]]), "reemplazar"); } catch { fallo = true; }
  cierto(fallo, "debe rechazarlo");
  igual([...(await a.leerTodas())], [["a", 2]]);
}), { soloNavegador: true });
prueba("IndexedDB: actualizar el catálogo no toca las cantidades guardadas", () => conBd(async (a) => {
  await a.sumar("svp-208", 2);
  const catalogoNuevo = cartas158.filter((c) => c.id !== "svp-208");
  const mapa = await a.leerTodas();
  igual(huerfanas(catalogoNuevo, mapa), ["svp-208"]);
  igual(await a.cantidad("svp-208"), 2, "la cantidad sigue guardada");
}), { soloNavegador: true });

// ---------- imagen con sustituto (solo navegador) ----------
prueba("imagen: sin imagen muestra el sustituto y ningún <img> roto", () => {
  const caja = crearImagenCarta({ id: "svp-208", nombre: "Victini", numero: "208", expansion: "svp", imagen: "", estadoImagen: "sin-imagen" });
  igual(caja.dataset.imagen, "sin-imagen");
  igual(caja.querySelectorAll("img").length, 0);
  cierto(caja.querySelector(".carta-sustituto").textContent.includes("Victini"), "texto del sustituto");
}, { soloNavegador: true });
prueba("imagen: si la URL falla se elimina el <img> y queda el sustituto", async () => {
  const caja = crearImagenCarta({ id: "x", nombre: "N", numero: "1", expansion: "e", imagen: "http://localhost:1/no-existe.webp", estadoImagen: "espanol-verificada" });
  document.body.append(caja); // las imágenes solo se cargan si están en la página
  await new Promise((r) => setTimeout(r, 1500));
  igual(caja.dataset.imagen, "fallida");
  igual(caja.querySelectorAll("img").length, 0);
  cierto(!caja.querySelector(".carta-sustituto").hidden, "el sustituto sigue visible");
  caja.remove();
}, { soloNavegador: true });
prueba("imagen: si carga bien se muestra la foto y se oculta el sustituto", async () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const caja = crearImagenCarta({ id: "x", nombre: "N", numero: "1", expansion: "e", imagen: png, estadoImagen: "espanol-verificada" });
  document.body.append(caja);
  await new Promise((r) => setTimeout(r, 300));
  igual(caja.dataset.imagen, "cargada");
  cierto(caja.querySelector(".carta-sustituto").hidden, "sustituto oculto");
  cierto(!caja.querySelector("img").classList.contains("foto-oculta"), "foto visible");
}, { soloNavegador: true });

export async function ejecutar(log) {
  const enNavegador = typeof indexedDB !== "undefined" && typeof document !== "undefined";
  let ok = 0, fallos = 0, saltadas = 0;
  for (const p of pruebas) {
    if (p.soloNavegador && !enNavegador) { saltadas++; log("SALTADA", p.nombre); continue; }
    try { await p.fn(); ok++; log("OK", p.nombre); }
    catch (e) { fallos++; log("FALLO", `${p.nombre} → ${e.message}`); }
  }
  log("RESUMEN", `${ok} correctas, ${fallos} fallos, ${saltadas} saltadas`);
  return fallos === 0;
}
