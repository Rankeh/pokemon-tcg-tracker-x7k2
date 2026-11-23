// 3.32 · App instalable (PWA): registra el service worker (sw.js, en la raíz) y, en el iPhone con Safari, explica cómo instalarla.
// En las pruebas automáticas (navigator.webdriver) no se registra, salvo con ?sw=1: un service worker taparía los dobles de Three.js.

import { adminGuardado } from "./admin.js";

const RAIZ = new URL("../../", import.meta.url);

/** ¿Se está usando como app instalada (pantalla de inicio)? */
export const enModoApp = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

/** iPhone o iPad con Safari (u otro navegador de iOS), todavía sin instalar. Los iPad modernos se presentan como Mac con pantalla táctil. */
export function puedeInstalarseEnIos(nav = navigator) {
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  return ios && !enModoApp();
}

export async function registrarApp() {
  if (!("serviceWorker" in navigator)) return null;
  if (navigator.webdriver && !new URLSearchParams(location.search).has("sw")) return null;
  try {
    const reg = await navigator.serviceWorker.register(new URL("sw.js", RAIZ), { scope: RAIZ.pathname });
    const avisar = () => { if (navigator.onLine !== false) (reg.active || reg.waiting || reg.installing)?.postMessage({ tipo: "revisar", completa: adminGuardado() }); };
    // al abrirse con conexión, el service worker revisa si falta algo por guardar (un álbum nuevo, miniaturas…)
    if (reg.active) avisar(); else navigator.serviceWorker.ready.then(avisar);
    return reg;
  } catch (e) {
    console.warn("No se pudo preparar el uso sin conexión:", e);
    return null;
  }
}

const CLAVE_CONSEJO = "app.consejoInstalar";
/** En el iPhone (sin instalar) y solo hasta que se cierre: cómo añadir la app a la pantalla de inicio. */
export function mostrarConsejoInstalar(donde = document.body) {
  try { if (!puedeInstalarseEnIos() || localStorage.getItem(CLAVE_CONSEJO)) return null; } catch { return null; }
  const caja = document.createElement("aside");
  caja.className = "consejo-app"; caja.setAttribute("role", "note");
  caja.innerHTML = `<p><strong>Instálala en tu iPhone.</strong> Pulsa <span class="consejo-icono" aria-label="Compartir">`
    + `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5v9M4.8 4.6 8 1.5l3.2 3.1" fill="none" stroke="currentColor" stroke-width="1.4"/>`
    + `<path d="M5 7H3.5v7.5h9V7H11" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></span> Compartir y luego `
    + `<em>Añadir a pantalla de inicio</em>. Se abre a pantalla completa y funciona sin conexión.</p>`
    + `<p class="consejo-nota">La app guarda sus datos aparte de Safari: entra con tu cuenta para traer tu colección.</p>`
    + `<button type="button" class="e-caja" aria-label="Cerrar este consejo">Entendido</button>`;
  caja.querySelector("button").addEventListener("click", () => { try { localStorage.setItem(CLAVE_CONSEJO, "1"); } catch { /* nada */ } caja.remove(); });
  donde.append(caja);
  return caja;
}
