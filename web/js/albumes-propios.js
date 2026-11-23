// 3.37 · Álbumes creados en la app: se guardan en el dispositivo (IndexedDB, almacén `meta`, ver almacen.js) y, con cuenta, en Supabase.
// Aquí se convierten en entradas de la biblioteca con el mismo formato que los álbumes fijos de estanteria/js/albumes.js (portada, lomo…),
// y se juntan con ellos. Quitar un álbum NUNCA toca las cartas marcadas: solo su definición.
import { listarAlbumes, albumPorId, normalizarAlbumes } from "../estanteria/js/albumes.js";
import { generarCatalogo, cartasPortada } from "./generador-album.js";

export const SERIE_PROPIOS = { id: "propios", nombre: "Mis álbumes" };
export const esPropio = (id) => typeof id === "string" && id.startsWith("mio-");
const TIPOS = {
  expansion: { arriba: "Expansión", sub: "Expansión", colores: ["#e5432f", "#f2f2f2", "#8a8a8a"] },
  ilustrador: { arriba: "Ilustrador", sub: "Colección de artista", colores: ["#ffd23f", "#e5432f", "#3d8bff"] },
  pokemon: { arriba: "Pokémon", sub: "Colección de Pokémon", colores: ["#ffd23f", "#e5432f", "#f2f2f2"] },
};

/** PURO · «AKIRA EGAWA» → «Akira Egawa» (los nombres en mayúsculas de TCGdex); el resto, tal cual. */
export const nombreBonito = (t) => (t && t === t.toUpperCase() && /[A-Z]/.test(t) ? t.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase()) : t);

/** PURO · id nuevo: «mio-» + texto del nombre + 4 caracteres al azar (dos álbumes con el mismo nombre no chocan). */
export function idNuevo(nombre, azar = Math.random) {
  const base = String(nombre || "album").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "album";
  return `mio-${base}-${Math.floor(azar() * 36 ** 4).toString(36).padStart(4, "0")}`;
}

/** PURO · nombre que se propone para el álbum (se puede cambiar al crearlo). */
export function nombrePropuesto(def, cartas = []) {
  if (def.tipo === "expansion") return cartas[0]?.nombreExpansion || def.expansion;
  if (def.tipo === "ilustrador") return nombreBonito(def.ilustrador);
  const masComun = Object.entries(cartas.reduce((m, c) => ((m[c.nombre] = (m[c.nombre] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1])[0]?.[0];
  return masComun || def.pokemon;
}

/** PURO · entrada de la biblioteca (mismo formato que estanteria/js/albumes.js) para un álbum creado en la app. */
export function registroDe(id, def, nombre, catalogo, precios, orden = 100) {
  const t = TIPOS[def.tipo], cartas = catalogo.cartas;
  const codigo = def.tipo === "expansion" ? String(def.expansion).toUpperCase() : def.tipo === "ilustrador" ? "ARTISTA" : "POKÉMON";
  const sub = def.tipo === "pokemon" && def.expansion ? cartas[0]?.nombreExpansion || t.sub : t.sub;
  return {
    id, nombre, subtitulo: sub, propio: true, definicion: def,
    descripcion: `Álbum creado en la app desde TCGdex: ${def.tipo === "expansion" ? "la expansión " + nombre : def.tipo === "ilustrador" ? "todas las cartas físicas de " + def.ilustrador : "todas las cartas de " + def.pokemon + (def.expansion ? " en " + sub : "")}.`,
    expansiones: def.expansion ? [def.expansion] : [],
    meta: `${t.arriba} · {n} cartas`,
    serie: SERIE_PROPIOS.id, nombreSerie: SERIE_PROPIOS.nombre,
    cartas: cartas.length, catalogo: null, precios: null,
    ruta: "web/prueba-3d/index.html?album=" + id,
    portada: { titulo: nombre, subtitulo: sub, arribaIzq: "Pokémon TCG", arribaDer: t.arriba, pie: "Creado en la app · {n} cartas", banda: nombre,
      bandaCodigo: codigo, cartas: cartasPortada(cartas, precios.cartas) },
    lomo: { diseno: "editorial", material: "cuero", color: "#11141b", titulo: nombre.toUpperCase(), subtitulo: sub.toUpperCase(), codigo, cifra: "{n}",
      marca: "paleta", colores: t.colores },
    orden,
  };
}

/** Genera el catálogo desde TCGdex y guarda el álbum. Devuelve su entrada de la biblioteca. */
export async function crearAlbumPropio(almacen, def, { nombre = null, progreso, senal } = {}) {
  const { catalogo, precios } = await generarCatalogo(def, { progreso, senal });
  const final = (nombre && nombre.trim()) || nombrePropuesto(def, catalogo.cartas);
  const id = idNuevo(final), orden = 100 + (await almacen.albumesPropios()).length;
  const registro = registroDe(id, def, final, catalogo, precios, orden);
  await almacen.guardarAlbumPropio({ id, registro, datos: { catalogo, precios } });
  return registro;
}

/** Vuelve a pedir a TCGdex el catálogo (cartas nuevas, precios) conservando nombre, portada elegida y orden. */
export async function actualizarAlbumPropio(almacen, id, { senal } = {}) {
  const a = await almacen.albumPropio(id);
  if (!a) return null;
  const { catalogo, precios } = await generarCatalogo(a.registro.definicion, { senal });
  const registro = { ...registroDe(id, a.registro.definicion, a.registro.nombre, catalogo, precios, a.registro.orden) };
  await almacen.guardarAlbumPropio({ id, registro, datos: { catalogo, precios }, creado: a.creado });
  return registro;
}

/** Biblioteca: los álbumes de la web (solo si `fijos`: el administrador, 3.38) y los creados en la app. Cada uno con `cartas` = nº real. */
export async function listarTodos(almacen, { fijos: conFijos = true } = {}) {
  const fijos = conFijos ? await listarAlbumes() : [];
  let propios = [];
  try { propios = almacen ? (await almacen.albumesPropios()).map((a) => ({ ...a.registro, cartas: a.datos.catalogo.cartas.length })) : []; }
  catch (e) { console.warn("No se pudieron leer los álbumes creados en la app:", e); }
  return [...fijos, ...normalizarAlbumes(propios)];
}

/** Álbum para el visor: { album, catalogo, precios } (fijo: de la web; propio: del dispositivo), o null si un álbum propio no está aquí. */
export async function cargarAlbum(id, almacen, base = "../../") {
  if (esPropio(id)) {
    const a = almacen && await almacen.albumPropio(id);
    return a ? { album: a.registro, catalogo: a.datos.catalogo, precios: a.datos.precios, propio: a } : null;
  }
  const album = albumPorId(id);
  const catalogo = await (await fetch(base + album.catalogo)).json();
  let precios = null;
  try { const r = await fetch(base + album.precios, { cache: "no-cache" }); if (r.ok) precios = await r.json(); } catch { /* sin precios */ }
  return { album, catalogo, precios };
}
