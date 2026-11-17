// Portada: muestra el progreso real de cada expansión leyendo la misma IndexedDB que el álbum (solo lectura).
import { Almacen } from "./almacen.js";
import { progreso } from "./coleccion.js";

const URL_CATALOGO = new URL("../../datos/catalogo/coleccion-teselia.json", import.meta.url);

function pintar(expansion, { conseguidas, total }) {
  const bloque = document.querySelector(`.progreso[data-expansion="${expansion}"]`);
  if (!bloque) return;
  bloque.querySelector('[data-campo="conseguidas"]').textContent = conseguidas;
  bloque.querySelector('[data-campo="total"]').textContent = total;
  const barra = bloque.querySelector(".progreso__barra");
  barra.setAttribute("aria-valuemax", total);
  barra.setAttribute("aria-valuenow", conseguidas);
  requestAnimationFrame(() => {
    barra.firstElementChild.style.width = `${total ? (conseguidas / total) * 100 : 0}%`;
  });
}

async function iniciar() {
  let cartas;
  try {
    const r = await fetch(URL_CATALOGO);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    cartas = (await r.json()).cartas;
  } catch (e) {
    console.warn("Portada: no se pudo leer el catálogo", e);
    return;
  }

  let mapa = new Map();
  try {
    const almacen = await Almacen.abrir();
    mapa = await almacen.leerTodas();
    almacen.cerrar();
  } catch (e) {
    console.warn("Portada: sin acceso a IndexedDB, se muestra la colección vacía", e);
  }

  const p = progreso(cartas, mapa);
  for (const exp of ["sv10.5w", "sv10.5b"]) {
    pintar(exp, p.porExpansion[exp] ?? { conseguidas: 0, total: 0 });
  }
  const pct = document.querySelector('[data-total-general] [data-campo="porcentaje"]');
  if (pct) pct.textContent = p.porcentaje.toLocaleString("es-ES");
}

iniciar();
