// 3.37 · Crea en el navegador el catálogo de un álbum nuevo desde TCGdex (api.tcgdex.net), con las mismas reglas que
// herramientas/catalogo-ilustrador/generar.py: solo cartas físicas (sin TCG Pocket), nombres e imágenes en español si existen,
// categoría por rareza, variantes (con el reverse que TCGdex no registra en Sol y Luna), arte completo y precios de Cardmarket.
// Tres tipos de álbum:  { tipo: 'expansion', expansion }  ·  { tipo: 'ilustrador', ilustrador }  ·  { tipo: 'pokemon', pokemon, expansion? }

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
const rarezaEs = (r) => RAREZAS[String(r || "").trim().toLowerCase()] || r || null;

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

/** Expansiones de TCGdex para elegir (sin las de TCG Pocket), de la más reciente a la más antigua. [{ id, nombre, cartas }] */
export async function listarExpansiones({ senal } = {}) {
  const [es, pocket] = await Promise.all([pedir("es/sets", { senal }), pedir("en/series/tcgp", { senal }).catch(() => null)]);
  const fuera = new Set((pocket?.sets || []).map((s) => s.id));
  return (es || []).filter((s) => !fuera.has(s.id)).map((s) => ({ id: s.id, nombre: s.name, cartas: s.cardCount?.total ?? s.cardCount?.official ?? null })).reverse();
}
/** Ilustradores de TCGdex (para sugerir mientras se escribe). */
export async function listarIlustradores({ senal } = {}) { return (await pedir("en/illustrators", { senal })) || []; }

/** Ids de cartas que entran en el álbum (antes de mirar sus detalles). */
async function idsDe(def, senal) {
  if (def.tipo === "expansion") {
    const s = await pedir("en/sets/" + q(def.expansion), { senal }) || await pedir("es/sets/" + q(def.expansion), { senal });
    if (!s) throw new Error("No existe la expansión " + def.expansion);
    return s.cards.map((c) => c.id);
  }
  if (def.tipo === "ilustrador") return ((await pedir("en/cards?illustrator=" + q("eq:" + def.ilustrador), { senal })) || []).map((c) => c.id);
  if (def.tipo === "pokemon") {        // el nombre puede estar en castellano o en inglés
    const [en, es] = await Promise.all(["en", "es"].map((l) => pedir(l + "/cards?name=" + q("eq:" + def.pokemon), { senal })));
    const ids = [...new Set([...(en || []), ...(es || [])].map((c) => c.id))];
    return def.expansion ? ids.filter((id) => id.startsWith(def.expansion + "-")) : ids;
  }
  throw new Error("Tipo de álbum desconocido");
}

/**
 * Genera el catálogo: { catalogo: { generado, fuente, totales, cartas }, precios: { fecha, fuente, unidad, cartas } }.
 * `progreso(hechas, total)` para la barra; `senal` (AbortSignal) para cancelar. Lanza si no hay cartas o hay demasiadas.
 */
export async function generarCatalogo(def, { progreso = () => {}, senal } = {}) {
  const ids = await idsDe(def, senal);
  if (!ids.length) throw new Error("TCGdex no tiene cartas para eso. Revisa el nombre (exacto, como en las cartas).");
  if (ids.length > MAX_CARTAS * 1.3) throw new Error(`Son ${ids.length} cartas: el máximo de un álbum es ${MAX_CARTAS}. Prueba con algo más concreto.`);
  const sets = new Map();                                       // id → { serie, en, es } (una petición por expansión, no por carta)
  const datosSet = (id) => {
    if (!sets.has(id)) sets.set(id, Promise.all([pedir("en/sets/" + q(id), { senal }), pedir("es/sets/" + q(id), { senal }).catch(() => null)])
      .then(([en, es]) => ({ serie: en?.serie?.id || "", nombreEs: es?.name || null, nombreEn: en?.name || id,
        cartasEs: new Map((es?.cards || []).map((c) => [c.id, c])) })));
    return sets.get(id);
  };
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
    cartas.push({
      id, categoriaColeccion: cat, nombre: es?.name || en.name, numero: en.localId, expansion: en.set.id,
      nombreExpansion: s.nombreEs || en.set.name, serie: s.serie, rareza: rarezaEs(en.rarity), ilustrador: en.illustrator || null,
      imagen: imagen ? imagen + "/high.webp" : null, dexId: en.dexId || null,
      estadoImagen: imagen ? (idioma === "es" ? "espanol-verificada" : "otro-idioma") : "sin-imagen", idiomaImagen: imagen ? idioma : null,
      imagenCarga: Boolean(imagen), origenImagen: imagen ? "TCGdex (campo image)" : null,
      variantes: variantes(en, cat), arteCompleto: arteCompleto(en, cat),
    });
    const p = precio(en);
    if (p) precios[id] = p;
  };
  const cola = [...ids];
  await Promise.all(Array.from({ length: Math.min(EN_PARALELO, cola.length) }, async () => { while (cola.length) await una(cola.shift()); }));
  if (!cartas.length) throw new Error("Ninguna de esas cartas es física (todas son de TCG Pocket).");
  if (cartas.length > MAX_CARTAS) throw new Error(`Son ${cartas.length} cartas: el máximo de un álbum es ${MAX_CARTAS}. Prueba con algo más concreto.`);
  cartas.sort((a, b) => a.id.localeCompare(b.id, "es", { numeric: true }));
  const hoy = new Date().toISOString().slice(0, 10);
  return {
    catalogo: { generado: hoy, fuente: "TCGdex (datos MIT), creado en la app", definicion: def,
      totales: { total: cartas.length, imagenEspanol: cartas.filter((c) => c.idiomaImagen === "es").length, sinImagen: cartas.filter((c) => !c.imagenCarga).length, excluidas: fuera },
      cartas },
    precios: { fecha: hoy, fuente: "Cardmarket vía TCGdex (api.tcgdex.net)", unidad: "EUR", nota: "Precio del mercado europeo; Cardmarket no separa por idioma de la carta.", cartas: precios },
  };
}

/** PURO · las 2 cartas de la portada: las más vistosas (SIR, IR…) y, entre ellas, las más caras; siempre con imagen. */
export function cartasPortada(cartas, precios = {}) {
  const peso = { sir: 4, ir: 3, promo: 1, rara: 1 };
  return [...cartas].filter((c) => c.imagen)
    .sort((a, b) => (peso[b.categoriaColeccion] || 0) - (peso[a.categoriaColeccion] || 0) || (precios[b.id]?.tendencia || 0) - (precios[a.id]?.tendencia || 0) || a.id.localeCompare(b.id))
    .slice(0, 2).map((c) => c.imagen);
}
