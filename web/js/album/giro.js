// Giro 3D de una hoja alrededor del eje de las anillas (rotateY) con la Web Animations API.
//
//  adelante: la hoja ACTIVA gira 0 → -180° y deja ver la hoja de reposo (ya preparada debajo).
//  atrás:    la hoja de REPOSO (página anterior) parte tumbada a la izquierda (-180°, se ve su reverso neutro)
//            y gira hasta 0° cubriendo la hoja activa.
// La navegación circular no cambia nada aquí: 18 → 1 es un giro "adelante" y 1 → 18 uno "atrás".
//
// Detalles que evitan fallos visuales (probados en Chromium; Safari real sin probar):
//  - La hoja que queda debajo "flota" 16 px más abajo (translateZ) mientras la otra gira. Así sus capas 3D
//    (plástico, etiquetas…) nunca se cuelan por delante de la hoja que gira. Esa separación se anima suavemente
//    y termina en 0 (la pose de reposo), por lo que no hay saltos al empezar ni al acabar.
//  - La cara frontal (con capas 3D) se oculta justo cuando la hoja está de canto (-90°); el reverso neutro es un
//    plano simple con backface-visibility: así nunca se ve una cara al revés.
import { ADELANTE } from "./navegacion.js";

export const DURACION_MS = 700;
const CURVA = "cubic-bezier(.42,.04,.22,1)";
const HUNDIMIENTO = "-16px";

const pose = (grados, flexion) => `rotateY(${grados}deg) skewY(${flexion}deg)`;
// Offsets (en progreso ya suavizado) en que la hoja pasa por -90°, calculados con los fotogramas de abajo.
const OFFSET_CANTO_ADELANTE = 0.32 + 0.36 * ((90 - 52) / (118 - 52));
const OFFSET_CANTO_ATRAS = 0.32 + 0.36 * ((118 - 90) / (118 - 52));

/**
 * Gira la hoja. `escena.reposo` debe contener ya la página de destino (el llamador la monta).
 * Al terminar la hoja de destino queda activa y la otra oculta y vacía. Devuelve cuando todo está limpio.
 */
export async function girar(escena, sentido, { duracion = DURACION_MS } = {}) {
  const antigua = escena.activa;
  const nueva = escena.reposo;
  const adelante = sentido === ADELANTE;
  const mover = adelante ? antigua : nueva;      // la que se ve girar
  const base = adelante ? nueva : antigua;       // la que queda debajo
  const opciones = { duration: duracion, easing: CURVA, fill: "both" };
  const animaciones = [];
  const anim = (elemento, frames) => {
    const a = elemento.animate(frames, opciones);
    animaciones.push(a);
    return a;
  };

  escena.mesa.dataset.giro = sentido;
  escena.mesa.dataset.ultimoGiro = sentido;

  // Las animaciones se crean ANTES de mostrar la hoja: su primer fotograma ya es la pose inicial (sin parpadeo).
  // Flexibilidad del plástico: una ligera cizalla que sube hacia la mitad del giro y vuelve a 0.
  anim(mover.hoja, adelante
    ? [{ transform: pose(0, 0) }, { transform: pose(-52, -1.7), offset: .32 }, { transform: pose(-118, -1.4), offset: .68 }, { transform: pose(-180, 0) }]
    : [{ transform: pose(-180, 0) }, { transform: pose(-118, 1.4), offset: .32 }, { transform: pose(-52, 1.7), offset: .68 }, { transform: pose(0, 0) }]);
  anim(base.hoja, adelante
    ? [{ transform: `translateZ(${HUNDIMIENTO})` }, { transform: "translateZ(0px)" }]
    : [{ transform: "translateZ(0px)" }, { transform: `translateZ(${HUNDIMIENTO})` }]);

  // Cara frontal: visible solo mientras mira al espectador (antes o después del canto, según el sentido).
  const e = adelante ? OFFSET_CANTO_ADELANTE : OFFSET_CANTO_ATRAS;
  anim(mover.frontal, adelante
    ? [{ visibility: "visible" }, { visibility: "visible", offset: e - .002 }, { visibility: "hidden", offset: e }, { visibility: "hidden" }]
    : [{ visibility: "hidden" }, { visibility: "hidden", offset: e - .002 }, { visibility: "visible", offset: e }, { visibility: "visible" }]);

  // Sombras dinámicas: la hoja que gira se oscurece al acercarse al canto; la de debajo recibe o pierde luz.
  if (adelante) {
    anim(mover.velo, [{ opacity: 0 }, { opacity: .5, offset: .5 }, { opacity: .5 }]);
    anim(mover.veloTrasero, [{ opacity: .5 }, { opacity: .5, offset: .5 }, { opacity: 0 }]);
    anim(base.velo, [{ opacity: .6 }, { opacity: .25, offset: .55 }, { opacity: 0 }]);
  } else {
    anim(mover.veloTrasero, [{ opacity: 0 }, { opacity: .5, offset: .5 }, { opacity: .5 }]);
    anim(mover.velo, [{ opacity: .5 }, { opacity: .5, offset: .5 }, { opacity: 0 }]);
    anim(base.velo, [{ opacity: 0 }, { opacity: .25, offset: .45 }, { opacity: .6 }]);
  }

  // Cola del giro: la hoja que queda tumbada junto al lomo se desvanece (en pantalla vertical ya cae fuera de la vista).
  // La opacidad va solo en el reverso (un plano simple): no aplana el 3D de la hoja.
  anim(mover.trasera, adelante
    ? [{ opacity: 1 }, { opacity: 1, offset: .74 }, { opacity: 0 }]
    : [{ opacity: 0 }, { opacity: 1, offset: .26 }, { opacity: 1 }]);

  nueva.hoja.style.visibility = "visible";
  try {
    await Promise.all(animaciones.map((a) => a.finished));
  } finally {
    // Todo en el mismo fotograma: ocultar la vieja, intercambiar y soltar las animaciones.
    antigua.hoja.style.visibility = "hidden";
    antigua.bolsillos.replaceChildren();
    escena.intercambiar();
    nueva.hoja.style.visibility = "";
    antigua.hoja.style.visibility = "";
    for (const a of animaciones) a.cancel();
    delete escena.mesa.dataset.giro;
  }
}
