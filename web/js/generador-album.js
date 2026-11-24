// 3.37 · Crea en el navegador el catálogo de un álbum nuevo desde TCGdex (api.tcgdex.net), con las mismas reglas que
// herramientas/catalogo-ilustrador/generar.py: solo cartas físicas (sin TCG Pocket), nombres e imágenes en español si existen,
// categoría por rareza, variantes (con el reverse que TCGdex no registra en Sol y Luna), arte completo y precios de Cardmarket.
// Tipos de álbum:  { tipo: 'expansion', expansion }  ·  { tipo: 'ilustrador', ilustrador }  ·  { tipo: 'pokemon', pokemon, expansion? }
//                  · 3.40: { tipo: 'lista', ids, origen }  (cartas elegidas a mano; `origen` = la definición de la que se partió, si la hay)

import { FUNCION_LIMITLESS } from "./supabase-url.js";
import { plano } from "./texto.js";
export { plano };

export const API = "https://api.tcgdex.net/v2/";
export const MAX_CARTAS = 360;                         // 20 hojas: el modelo 3D más grande (web/prueba-3d/modelo/album-20h.glb)
const EN_PARALELO = 6;

const CATEGORIAS = {
  "common": "comun", "uncommon": "infrecuente", "rare": "rara", "rare holo": "rara", "holo rare": "rara",
  "illustration rare": "ir", "special illustration rare": "sir", "promo": "promo",
};
export const categoria = (rarezaEn) => CATEGORIAS[String(rarezaEn || "").trim().toLowerCase()] ?? "otra";
// rareza en castellano para la ficha (TCGdex la da en inglés en los detalles; las que no están aquí se dejan como vienen)
const RAREZAS = {
  "common": "Común", "uncommon": "Infrecuente", "rare": "Rara", "rare holo": "Rara Holo", "holo rare": "Rara Holo", "double rare": "Doble Rara",
  "ultra rare": "Ultra Rara", "illustration rare": "Rara Ilustración", "special illustration rare": "Rara Ilustración Especial",
  "hyper rare": "Hiper Rara", "shiny rare": "Rara Variocolor", "shiny ultra rare": "Ultra Rara Variocolor", "ace spec rare": "AS TÁCTICO",
  "promo": "Promo", "rare holo v": "Rara Holo V", "rare holo vmax": "Rara Holo VMAX", "rare holo vstar": "Rara Holo V-ASTRO", "amazing rare": "Rara Asombrosa",
  "radiant rare": "Rara Radiante", "secret rare": "Rara Secreta", "rare ultra": "Ultra Rara", "rare secret": "Rara Secreta", "rare rainbow": "Rara Arcoíris",
};
const rarezaEs = (r) => (/^none$/i.test(String(r || "").trim()) ? null : RAREZAS[String(r || "").trim().toLowerCase()] || r || null);   // «None»: sin rareza

const SELLOS = { "30th-anniversary": "sello 30.º aniversario" };
const NOMBRES = { normal: "Normal", holo: "Holo", reverse: "Reverse holo", firstEdition: "1.ª edición", wPromo: "Sello W" };
const SOL_Y_LUNA = /^sm\d+$/;                           // sm1..sm12: comunes, infrecuentes y raras salían también en reverse

/** PURO · variantes de la carta (variants_detailed; si falta, variants) + el reverse de Sol y Luna. */
export function variantes(en, cat) {
  const lista = [], vistos = new Set();
  for (const v of en.variants_detailed || []) {
    const t = v.type;
    if (!t || vistos.has(t)) continue;
    vistos.add(t);
    const e = { id: t, nombre: NOMBRES[t] || t };
    const sellos = (v.stamp || []).map((x) => SELLOS[x] || x);
    if (sellos.length) { e.nombre += " · " + sellos.join(", "); e.sello = v.stamp; }
    lista.push(e);
  }
  if (!lista.length) for (const [t, si] of Object.entries(en.variants || {})) if (si) lista.push({ id: t, nombre: NOMBRES[t] || t });
  if (SOL_Y_LUNA.test(en.set?.id || "") && ["comun", "infrecuente", "rara"].includes(cat) && !lista.some((x) => x.id === "reverse"))
    lista.push({ id: "reverse", nombre: "Reverse holo", deducida: true });
  const orden = { normal: 0, reverse: 1, holo: 2 };
  return lista.sort((a, b) => (orden[a.id] ?? 9) - (orden[b.id] ?? 9));
}

/** PURO · precio Cardmarket (EUR) de la carta y de cada variante, como en precios-*.json. null si no hay. */
export function precio(en) {
  const cm = en.pricing?.cardmarket || {}, sinNulos = (o) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== null && x !== undefined));
  const p = sinNulos({ tendencia: cm.trend ?? cm["trend-holo"], bajo: cm.low ?? cm["low-holo"], medio30: cm.avg30 ?? cm["avg30-holo"], actualizado: cm.updated });
  const pv = {};
  for (const v of en.variants_detailed || []) {
    const c = v.pricing?.cardmarket || {}, t = c.trend ?? c["trend-holo"], b = c.low ?? c["low-holo"];
    if (v.type && (t != null || b != null)) pv[v.type] = sinNulos({ tendencia: t, bajo: b });
  }
  if (Object.keys(pv).length) p.variantes = pv;
  return p.tendencia != null || p.bajo != null || p.variantes ? p : null;
}

const arteCompleto = (en, cat) => cat === "ir" || cat === "sir" || /^(GG|TG)\d/.test(en.localId || "");

/** Petición a TCGdex con reintentos (404 = no existe → null). */
async function pedir(ruta, { senal, intentos = 3 } = {}) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(API + ruta, { signal: senal });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("TCGdex respondió " + r.status);
      return await r.json();
    } catch (e) {
      if (senal?.aborted || i >= intentos - 1) throw e;
      await new Promise((ok) => setTimeout(ok, 600 * (i + 1) ** 2));
    }
  }
}
const q = encodeURIComponent;
/** Lo que no cambia durante la sesión (expansiones, series) se pide una sola vez: se guarda la promesa; si falla, se olvida. */
const unaVez = new Map();
const recordar = (clave, pedirlo) => {
  if (!unaVez.has(clave)) unaVez.set(clave, pedirlo().catch((e) => { unaVez.delete(clave); throw e; }));
  return unaVez.get(clave);
};
/** Expansiones de una era (serie de TCGdex), como Set de ids. */
const setsDeEra = (era) => recordar("serie:" + era, () => pedir("en/series/" + q(era)).then((s) => new Set((s?.sets || []).map((x) => x.id))));
/** Las expansiones de TCG Pocket (digital): nunca entran en un álbum. Sin conexión con esa lista, ninguna se descarta. */
const setsPocket = () => setsDeEra("tcgp").catch(() => new Set());
const esPocket = (c, pocket) => /\/tcgp\//.test(c.image || "") || pocket.has(expansionDe(c.id));
/** Una expansión en un idioma (con su lista de cartas). null si no existe. */
const pedirSet = (lengua, id) => recordar(`set:${lengua}:${id}`, () => pedir(`${lengua}/sets/` + q(id)));
/** Carta breve de una búsqueda o lista de TCGdex → la forma que usa el selector de cartas. */
const breve = (c) => ({ id: c.id, nombre: c.name, numero: c.localId, expansion: expansionDe(c.id), imagen: c.image ? c.image + "/low.webp" : null });
/** PURO · ¿la carta `nombre` es del Pokémon `pokemon`? Por palabra completa, sin tildes ni mayúsculas (3.42). */
export function esDelPokemon(nombre, pokemon) {
  const p = plano(pokemon).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return p !== "" && new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`).test(plano(nombre));
}

/** Expansiones de TCGdex para elegir (sin las de TCG Pocket), de la más reciente a la más antigua. [{ id, nombre, cartas }] */
export async function listarExpansiones({ senal } = {}) {
  const [es, fuera] = await Promise.all([pedir("es/sets", { senal }), setsPocket()]);
  return (es || []).filter((s) => !fuera.has(s.id)).map((s) => ({ id: s.id, nombre: s.name, cartas: s.cardCount?.total ?? s.cardCount?.official ?? null })).reverse();
}
/** Ilustradores de TCGdex (para sugerir mientras se escribe). */
export async function listarIlustradores({ senal } = {}) { return (await pedir("en/illustrators", { senal })) || []; }

/** Cartas que entran en el álbum según su definición, en versión breve (id, name, localId, image), antes de mirar sus detalles. */
async function brevesDe(def, senal) {
  if (def.tipo === "lista") return [...new Set(def.ids || [])].map((id) => ({ id }));
  if (def.tipo === "expansion") {
    const s = await pedirSet("en", def.expansion) || await pedirSet("es", def.expansion);
    if (!s) throw new Error("No existe la expansión " + def.expansion);
    return s.cards;
  }
  if (def.tipo === "ilustrador") return (await pedir("en/cards?illustrator=" + q("eq:" + def.ilustrador), { senal })) || [];
  if (def.tipo === "pokemon") {        // el nombre puede estar en castellano o en inglés
    // 3.41 · da igual mayúsculas o tildes (TCGdex busca «contiene» sin distinguirlas).
    // 3.42 · todas las variantes del Pokémon: ex, EX, V, VMAX, VSTAR, GX, de Alola/Galar, del Team Rocket, δ…; por palabra completa
    // («mew» trae Mew ex y Mew VMAX, pero no Mewtwo)
    const [en, es] = await Promise.all(["en", "es"].map((l) => pedir(l + "/cards?name=" + q(def.pokemon), { senal })));
    const vistas = new Map();
    for (const c of [...(es || []), ...(en || [])]) if (!vistas.has(c.id) && esDelPokemon(c.name, def.pokemon)) vistas.set(c.id, c);
    const todas = [...vistas.values()];
    return def.expansion ? todas.filter((c) => c.id.startsWith(def.expansion + "-")) : todas;
  }
  throw new Error("Tipo de álbum desconocido");
}
async function idsDe(def, senal) { return (await brevesDe(def, senal)).map((c) => c.id); }

/** 3.44 · Cartas que hoy entrarían en un álbum con esa definición (expansión, ilustrador o Pokémon), sin TCG Pocket.
 *  Para «Novedades» al editar un álbum de cartas elegidas a mano. [{ id, nombre, numero, expansion, imagen }] */
export async function candidatasDe(def, { senal } = {}) {
  if (!def || def.tipo === "lista") return [];
  const [breves, pocket] = await Promise.all([brevesDe(def, senal), setsPocket()]);
  return breves.filter((c) => !esPocket(c, pocket)).map(breve);
}

/** Datos de una expansión para el catálogo (una vez por sesión, no una por carta). */
const datosSet = (id) => recordar("datos:" + id, async () => {
  const [en, es] = await Promise.all([pedirSet("en", id), pedirSet("es", id).catch(() => null)]);
  return { serie: en?.serie?.id || "", nombreEs: es?.name || null, nombreEn: en?.name || id, codigo: en?.abbreviation?.official || en?.tcgOnline || "",
    cartasEs: new Map((es?.cards || []).map((c) => [c.id, c])) };
});

/**
 * Genera el catálogo: { catalogo: { generado, fuente, totales, cartas }, precios: { fecha, fuente, unidad, cartas } }.
 * `progreso(hechas, total)` para la barra; `senal` (AbortSignal) para cancelar. Lanza si no hay cartas o hay demasiadas.
 */
export async function generarCatalogo(def, { progreso = () => {}, senal, max = MAX_CARTAS } = {}) {   // max: más en el paso de elegir cartas
  const ids = await idsDe(def, senal);
  if (!ids.length) throw new Error(def.tipo === "lista" ? "El álbum no tiene ninguna carta." : "TCGdex no tiene cartas para eso. Revisa el nombre (exacto, como en las cartas).");
  if (ids.length > max * 1.3) throw new Error(`Son ${ids.length} cartas: demasiadas para un álbum (máximo ${MAX_CARTAS}). Prueba con algo más concreto.`);
  const cartas = [], precios = {}, fuera = [];
  let hechas = 0;
  progreso(0, ids.length);
  const una = async (id) => {
    const en = await pedir("en/cards/" + q(id), { senal });
    hechas++; progreso(hechas, ids.length);
    if (!en) { fuera.push({ id, motivo: "no está en TCGdex" }); return; }
    if (def.tipo === "ilustrador" && en.illustrator !== def.ilustrador) { fuera.push({ id, motivo: "otro ilustrador" }); return; }
    if (def.expansion && en.set.id !== def.expansion) { fuera.push({ id, motivo: "otra expansión" }); return; }   // «30th-…» también empieza los ids de «30th-c»
    const s = await datosSet(en.set.id);
    if (s.serie === "tcgp" && def.tipo !== "expansion") { fuera.push({ id, motivo: "TCG Pocket (digital)" }); return; }
    const es = s.cartasEs.get(id), cat = categoria(en.rarity);
    const imagen = es?.image || en.image || null, idioma = es?.image ? "es" : "en";
    // 3.39 · sin imagen en TCGdex: se busca en limitlesstcg (a través del intermediario de Supabase, que le añade CORS para el 3D)
    const alternativa = imagen ? null : await buscarEnLimitless(s.codigo, en.localId, en.set.id, senal);
    cartas.push({
      id, categoriaColeccion: cat, nombre: es?.name || en.name, numero: en.localId, expansion: en.set.id,
      nombreExpansion: s.nombreEs || en.set.name, serie: s.serie, rareza: rarezaEs(en.rarity), ilustrador: en.illustrator || null,
      imagen: imagen ? imagen + "/high.webp" : null, dexId: en.dexId || null,
      estadoImagen: imagen ? (idioma === "es" ? "espanol-verificada" : "otro-idioma") : alternativa ? "limitless" : "sin-imagen",
      idiomaImagen: imagen ? idioma : alternativa ? alternativa.idioma : null,
      imagenCarga: Boolean(imagen || alternativa), origenImagen: imagen ? "TCGdex (campo image)" : alternativa ? "limitlesstcg" : null,
      ...(alternativa ? { imagenAlternativa: alternativa.url } : {}),
      variantes: variantes(en, cat), arteCompleto: arteCompleto(en, cat),
      // 3.45 · para los filtros del selector de cartas
      rarezaEn: en.rarity || null, clase: en.category || null, tipos: en.types || [], legal: en.legal || null,
    });
    const p = precio(en);
    if (p) precios[id] = p;
  };
  const cola = [...ids];
  await Promise.all(Array.from({ length: Math.min(EN_PARALELO, cola.length) }, async () => { while (cola.length) await una(cola.shift()); }));
  if (!cartas.length) throw new Error(def.tipo === "lista" ? "Ninguna de esas cartas está en TCGdex." : "Ninguna de esas cartas es física (todas son de TCG Pocket).");
  if (cartas.length > max) throw new Error(`Son ${cartas.length} cartas: demasiadas para un álbum (máximo ${MAX_CARTAS}). Prueba con algo más concreto.`);
  return armarCatalogo(def, cartas, precios, fuera);
}

/** PURO · catálogo y precios con el formato de datos/catalogo/ a partir de cartas ya preparadas (3.40: también las elegidas a mano). */
export function armarCatalogo(def, cartas, precios = {}, fuera = []) {
  cartas = [...cartas].sort((a, b) => a.id.localeCompare(b.id, "es", { numeric: true }));
  const hoy = new Date().toISOString().slice(0, 10);
  return {
    catalogo: { generado: hoy, fuente: "TCGdex (datos MIT), creado en la app", definicion: def,
      totales: { total: cartas.length, imagenEspanol: cartas.filter((c) => c.idiomaImagen === "es").length, sinImagen: cartas.filter((c) => !c.imagenCarga).length, excluidas: fuera },
      cartas },
    precios: { fecha: hoy, fuente: "Cardmarket vía TCGdex (api.tcgdex.net)", unidad: "EUR", nota: "Precio del mercado europeo; Cardmarket no separa por idioma de la carta.",
      cartas: Object.fromEntries(Object.entries(precios).filter(([id]) => cartas.some((c) => c.id === id))) },
  };
}

// 3.44 · Filtros del buscador de cartas. Cada opción → valores en inglés de TCGdex (varios = se juntan los resultados).
export const FILTROS = {
  rareza: [
    ["comun", "Común", ["Common"]], ["infrecuente", "Infrecuente", ["Uncommon"]], ["rara", "Rara", ["Rare"]],
    ["holo", "Rara Holo", ["Rare Holo", "Holo Rare"]], ["v", "Holo V · VMAX · V-ASTRO", ["Holo Rare V", "Holo Rare VMAX", "Holo Rare VSTAR"]],
    ["doble", "Doble Rara", ["Double rare"]], ["ultra", "Ultra Rara", ["Ultra Rare"]], ["ir", "Rara Ilustración", ["Illustration rare"]],
    ["sir", "Rara Ilustración Especial", ["Special illustration rare"]], ["hiper", "Hiper Rara", ["Hyper rare", "Mega Hyper Rare"]],
    ["secreta", "Rara Secreta", ["Secret Rare"]], ["as", "AS TÁCTICO", ["ACE SPEC Rare"]], ["radiante", "Rara Radiante", ["Radiant Rare"]],
    ["asombrosa", "Rara Asombrosa", ["Amazing Rare"]], ["legado", "LV.X · PRIME · LEYENDA", ["Rare Holo LV.X", "Rare PRIME", "LEGEND"]],
    ["arte-entrenador", "Entrenador arte completo", ["Full Art Trainer"]], ["clasica", "Colección Clásica", ["Classic Collection"]],
    ["promo", "Promo", ["Promo"]],
  ],
  tipo: [
    ["Grass", "Planta"], ["Fire", "Fuego"], ["Water", "Agua"], ["Lightning", "Rayo"], ["Psychic", "Psíquico"], ["Fighting", "Lucha"],
    ["Darkness", "Oscuridad"], ["Metal", "Metálico"], ["Fairy", "Hada"], ["Dragon", "Dragón"], ["Colorless", "Incoloro"],
    ["@Trainer", "Entrenador"], ["@Energy", "Energía"],
  ],
  formato: [["estandar", "Estándar"], ["expandido", "Expandido"], ["legacy", "Legacy (fuera de formato)"]],
  era: [
    ["me", "Megaevolución"], ["sv", "Escarlata y Púrpura"], ["swsh", "Espada y Escudo"], ["sm", "Sol y Luna"], ["xy", "XY"], ["bw", "Negro y Blanco"],
    ["col", "Call of Legends"], ["hgss", "HeartGold SoulSilver"], ["pl", "Platino"], ["dp", "Diamante y Perla"], ["pop", "POP"], ["ex", "EX"],
    ["ecard", "e-Card"], ["lc", "Legendary Collection"], ["neo", "Neo"], ["gym", "Gym"], ["base", "Base"], ["tk", "Kits de entrenador"],
    ["mc", "McDonald's"], ["misc", "Otras"],
  ],
};
/** PURO · ¿hay algún filtro puesto? */
export const hayFiltros = (f = {}) => Boolean(f.rareza || f.tipo || f.formato || f.expansion || f.era || f.shiny || f.primeraEdicion);
/** PURO · expansión de una carta por su id («swsh4.5sv-SV086» → «swsh4.5sv»). */
export const expansionDe = (id) => id.slice(0, id.lastIndexOf("-"));

/** PURO · parámetros de la búsqueda en TCGdex (inglés) para los filtros: una lista de consultas (una por cada valor de rareza). */
export function consultas(texto, f = {}) {
  const base = [];
  if (texto) base.push("name=" + q(texto));
  if (f.tipo) base.push(f.tipo.startsWith("@") ? "category=" + q("eq:" + f.tipo.slice(1)) : "types=" + q("eq:" + f.tipo));
  if (f.formato === "estandar") base.push("legal.standard=true");
  else if (f.formato === "expandido") base.push("legal.expanded=true");
  else if (f.formato === "legacy") base.push("legal.expanded=false");
  if (f.primeraEdicion) base.push("variants.firstEdition=true");
  if (f.expansion) base.push("id=" + q(f.expansion + "-"));
  let rarezas = [null];
  if (f.shiny) rarezas = ["shiny"];                                              // Shiny rare, Shiny Ultra Rare, Shiny rare V/VMAX
  else if (f.rareza) rarezas = (FILTROS.rareza.find(([k]) => k === f.rareza)?.[2] || []).map((r) => "eq:" + r);
  return rarezas.map((r) => [...base, ...(r ? ["rarity=" + q(r)] : [])].join("&"));
}
/** PURO · ¿cumple los filtros una carta con todos sus datos (de en/cards/<id>)? Para las que solo salen al buscar en castellano. */
export function cumple(d, f = {}, setsEra = null) {
  if (!d) return false;
  const r = String(d.rarity || "");
  if (f.shiny && !/shiny/i.test(r)) return false;
  if (!f.shiny && f.rareza && !(FILTROS.rareza.find(([k]) => k === f.rareza)?.[2] || []).includes(r)) return false;
  if (f.tipo && (f.tipo.startsWith("@") ? d.category !== f.tipo.slice(1) : !(d.types || []).includes(f.tipo))) return false;
  if (f.formato === "estandar" && !d.legal?.standard) return false;
  if (f.formato === "expandido" && !d.legal?.expanded) return false;
  if (f.formato === "legacy" && d.legal?.expanded !== false) return false;
  if (f.primeraEdicion && !d.variants?.firstEdition) return false;
  if (f.expansion && d.set?.id !== f.expansion) return false;
  if (setsEra && !setsEra.has(d.set?.id)) return false;
  return true;
}
/** PURO · 3.45 · ¿cumple los filtros una carta del catálogo (las del álbum, en el selector)? null si faltan sus datos (catálogos anteriores a 3.45). */
export function cumpleCarta(c, f = {}) {
  if (!hayFiltros(f)) return true;
  if (c.rarezaEn === undefined) return null;
  return cumple({ rarity: c.rarezaEn, category: c.clase, types: c.tipos, legal: c.legal || {},
    variants: { firstEdition: (c.variantes || []).some((v) => v.id === "firstEdition") }, set: { id: c.expansion } }, { ...f, era: "" })
    && (!f.era || c.serie === f.era);
}

/** 3.40 · Busca cartas por nombre en TCGdex (contiene; castellano o inglés) para añadirlas a mano. Sin TCG Pocket. [{ id, nombre, numero, imagen }]
 *  3.44 · con `filtros` (rareza, tipo, formato, expansión, era, shiny, 1.ª edición); con filtros el nombre puede quedar vacío. */
export async function buscarCartas(texto, { senal, max = 60, filtros = {} } = {}) {
  const t = String(texto || "").trim(), conFiltros = hayFiltros(filtros);
  if (t.length < 2 && !(conFiltros && !t)) return [];
  // todo lo que no depende de otra cosa, a la vez: lista de Pocket, era, búsqueda por nombre y búsquedas con filtros
  const porNombre = t ? Promise.all([pedir("es/cards?name=" + q(t), { senal }), pedir("en/cards?name=" + q(t), { senal })]) : Promise.resolve([[], []]);
  const filtradas = conFiltros ? Promise.all(consultas(t, filtros).map((c) => pedir("en/cards?" + c, { senal }))) : null;
  const [pocket, setsEra] = await Promise.all([setsPocket(), filtros.era ? setsDeEra(filtros.era) : null]);
  let listas;
  if (!conFiltros) listas = await porNombre;
  else {
    listas = [(await filtradas).flat().filter(Boolean)];
    if (t) {                                // nombres solo en castellano («Meowth de Galar»): se miran sus datos, como mucho 24
      const [es, en] = await porNombre;
      const enIngles = new Set((en || []).map((c) => c.id));
      const soloEs = (es || []).filter((c) => !enIngles.has(c.id)).slice(0, 24);
      const datos = await Promise.all(soloEs.map((c) => pedir("en/cards/" + q(c.id), { senal }).catch(() => null)));
      listas.push(soloEs.filter((c, i) => cumple(datos[i], filtros, setsEra)));
    }
  }
  const vistos = new Map();
  for (const c of listas.flat().filter(Boolean)) {
    const exp = expansionDe(c.id);
    if (vistos.has(c.id) || esPocket(c, pocket)) continue;
    if (filtros.expansion && exp !== filtros.expansion) continue;
    if (setsEra && !setsEra.has(exp)) continue;
    vistos.set(c.id, breve(c));
  }
  return [...vistos.values()].slice(0, max);
}

/** 3.39 · Imagen de la carta en limitlesstcg: { url, idioma } o null. Nunca lanza (sin imagen se ve el marcador, como siempre).
 *  3.41 · también cartas antiguas: la que enseña la página de limitlesstcg o pokemontcg.io (su fuente para esas cartas). El código de la
 *  expansión es opcional: si falta, el intermediario se lo pregunta a TCGdex. */
export async function buscarEnLimitless(codigo, numero, expansion, senal) {
  if (!numero || !expansion) return null;
  try {
    const r = await fetch(`${FUNCION_LIMITLESS}?buscar=1&num=${q(numero)}&id=${q(expansion)}${codigo ? "&set=" + q(codigo) : ""}`, { signal: senal });
    const d = r.ok ? await r.json() : null;
    if (d?.ruta) return { url: `${FUNCION_LIMITLESS}?ruta=${q(d.ruta)}`, idioma: /_ES_LG\.png$/.test(d.ruta) ? "es" : "en" };
    if (d?.pio) return { url: `${FUNCION_LIMITLESS}?pio=${q(d.pio)}`, idioma: "en" };
    return null;
  } catch { return null; }
}
/** URL de la imagen grande de la carta: la de TCGdex o, si no tiene, la de limitlesstcg. */
export const imagenDe = (c) => c.imagen || c.imagenAlternativa || null;

/** PURO · las 2 cartas de la portada: las más vistosas (SIR, IR…) y, entre ellas, las más caras; siempre con imagen. */
export function cartasPortada(cartas, precios = {}) {
  const peso = { sir: 4, ir: 3, promo: 1, rara: 1 };
  return [...cartas].filter((c) => imagenDe(c))
    .sort((a, b) => (peso[b.categoriaColeccion] || 0) - (peso[a.categoriaColeccion] || 0) || (precios[b.id]?.tendencia || 0) - (precios[a.id]?.tendencia || 0) || a.id.localeCompare(b.id))
    .slice(0, 2).map((c) => imagenDe(c));
}
