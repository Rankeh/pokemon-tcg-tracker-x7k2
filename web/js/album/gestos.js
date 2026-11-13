// Gestos táctiles: deslizar a la izquierda = avanzar, a la derecha = retroceder.
import { ADELANTE, ATRAS } from "./navegacion.js";

export const UMBRAL_PX = 48;      // recorrido horizontal mínimo
export const RATIO_HORIZONTAL = 1.6; // |dx| debe superar |dy| por este factor (no confundir con scroll vertical)
export const DURACION_MAX_MS = 900;

/** Clasifica un gesto (puro, para probarlo): "adelante" | "atras" | null. */
export function clasificarGesto({ dx, dy, dt }) {
  if (dt > DURACION_MAX_MS) return null;
  if (Math.abs(dx) < UMBRAL_PX) return null;
  if (Math.abs(dx) < Math.abs(dy) * RATIO_HORIZONTAL) return null;
  return dx < 0 ? ADELANTE : ATRAS;
}

/**
 * Instala el gesto sobre `elemento`. Solo toque/lápiz (el ratón usa botones y teclado).
 * Tras un deslizamiento válido se anula el clic siguiente, para que no abra la ficha de una carta.
 */
export function instalarGestos(elemento, { alGesto }) {
  let inicio = null;
  let anularClic = false;

  elemento.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || !e.isPrimary) return;
    inicio = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  });
  const terminar = (e, cancelado) => {
    if (!inicio || e.pointerId !== inicio.id) return;
    const g = { dx: e.clientX - inicio.x, dy: e.clientY - inicio.y, dt: performance.now() - inicio.t };
    inicio = null;
    if (cancelado) return;
    const sentido = clasificarGesto(g);
    if (sentido) {
      anularClic = true;
      setTimeout(() => { anularClic = false; }, 400);
      alGesto(sentido);
    }
  };
  elemento.addEventListener("pointerup", (e) => terminar(e, false));
  elemento.addEventListener("pointercancel", (e) => terminar(e, true));
  // En captura: se ejecuta antes que el clic de los bolsillos
  elemento.addEventListener("click", (e) => {
    if (anularClic) { e.stopPropagation(); e.preventDefault(); anularClic = false; }
  }, true);
}
