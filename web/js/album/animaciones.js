// Animaciones del álbum con la Web Animations API (solo transform y opacity: van por la GPU).
//
// Idea clave para que la carta "entre" en la funda: cada bolsillo tiene la carta en DOS copias sincronizadas.
//   - "dentro": vive bajo la capa de plástico y el bolsillo la recorta (overflow:hidden) = la parte ya metida.
//   - "fuera": vive sobre el plástico, en un recuadro situado justo ENCIMA de la boca de la funda,
//              que recorta lo que queda por debajo = la parte que aún asoma.
// Las dos se desplazan a la vez, así la carta parece atravesar la boca y quedar bajo el plástico.
import { esperarImagenes } from "./precarga.js";

const SUAVE_SALIDA = "cubic-bezier(.2,.8,.2,1)";
const SUAVE_ENTRADA = "cubic-bezier(.5,0,.75,0)";
const SUAVE = "cubic-bezier(.45,.05,.25,1)";

export const ajustes = { reducirMovimiento: false };

export function movimientoReducido() {
  const sistema = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return sistema || ajustes.reducirMovimiento;
}

const correr = (elemento, frames, opciones) => elemento.animate(frames, { fill: "both", ...opciones }).finished;

function crearVuelo(bolsillo, cara, hojaBolsillos) {
  const m = bolsillo.medidas();
  const vuelo = bolsillo.doc.createElement("div");
  vuelo.className = "vuelo";
  Object.assign(vuelo.style, {
    left: `${m.x + m.mx}px`, top: `${m.y + m.my}px`, width: `${m.anchoCarta}px`, height: `${m.altoCarta}px`,
  });
  vuelo.append(cara);
  const sombra = bolsillo.doc.createElement("div");
  sombra.className = "vuelo-sombra";
  sombra.style.cssText = vuelo.style.cssText;
  hojaBolsillos.append(sombra, vuelo);

  const hoja = hojaBolsillos;
  const dx = hoja.offsetWidth / 2 - (m.x + m.mx + m.anchoCarta / 2);
  const dy = hoja.offsetHeight * 0.58 - (m.y + m.my + m.altoCarta / 2);
  const sobreBoca = -(m.altoCarta + m.my); // la carta entera justo encima de la boca de la funda
  return {
    m, vuelo, sombra,
    cerca: `translate3d(${dx}px, ${dy}px, 240px) rotateX(-22deg) scale(1.45)`,
    suspendida: `translate3d(0, ${sobreBoca}px, 46px) rotateX(-9deg) scale(1.02)`,
    alineada: `translate3d(0, ${sobreBoca}px, 10px) rotateX(0deg) scale(1)`,
    sombraCerca: `translate3d(${dx}px, ${dy + 40}px, 0) scale(1.3)`,
    sombraSuspendida: `translate3d(0, ${sobreBoca + 18}px, 0) scale(1.01)`,
    sombraAlineada: `translate3d(0, ${sobreBoca + 4}px, 0) scale(1)`,
    recorrido: m.altoCarta + m.my,
  };
}

/**
 * La carta llega desde el espectador, se coloca sobre su bolsillo y se desliza dentro de la funda.
 * Debe llamarse DESPUÉS de que IndexedDB haya confirmado el guardado. Al terminar deja el bolsillo "conseguida".
 */
export async function insertarCarta(bolsillo, hojaBolsillos, cantidad) {
  if (movimientoReducido()) {
    bolsillo.fijarEstado("conseguida", cantidad);
    return;
  }
  bolsillo.elemento.dataset.estado = "entrando";
  const v = crearVuelo(bolsillo, bolsillo.crearCara(), hojaBolsillos);
  const dentro = bolsillo.crearCara();
  const fuera = bolsillo.crearCara();
  fuera.style.height = `${v.m.altoCarta}px`;
  dentro.style.visibility = "hidden";
  bolsillo.interior.append(dentro);
  bolsillo.exterior.replaceChildren(fuera);
  fuera.style.visibility = "hidden";
  await esperarImagenes(bolsillo.elemento);
  await esperarImagenes(v.vuelo);

  try {
    // 1) Llega desde el espectador hasta quedar suspendida sobre la boca de la funda.
    await Promise.all([
      correr(v.vuelo, [{ transform: v.cerca, opacity: 0 }, { transform: v.cerca, opacity: 1, offset: 0.12 }, { transform: v.suspendida, opacity: 1 }],
        { duration: 420, easing: SUAVE_SALIDA }),
      correr(v.sombra, [{ transform: v.sombraCerca, opacity: 0 }, { transform: v.sombraSuspendida, opacity: 0.35 }],
        { duration: 420, easing: SUAVE_SALIDA }),
    ]);
    // 2) Se baja hasta el plano de la hoja y se alinea con la funda.
    await Promise.all([
      correr(v.vuelo, [{ transform: v.suspendida }, { transform: v.alineada }], { duration: 160, easing: SUAVE }),
      correr(v.sombra, [{ transform: v.sombraSuspendida, opacity: 0.35 }, { transform: v.sombraAlineada, opacity: 0.55 }], { duration: 160, easing: SUAVE }),
    ]);
    // 3) Relevo: la carta "voladora" se sustituye por las dos mitades (fuera/dentro) en la misma posición.
    dentro.style.visibility = "visible";
    fuera.style.visibility = "visible";
    v.vuelo.remove();
    v.sombra.remove();
    // 4) Se desliza al interior: la parte de abajo queda bajo el plástico, la de arriba asoma hasta desaparecer.
    await Promise.all([
      correr(dentro, [{ transform: `translateY(${-v.recorrido}px)` }, { transform: "translateY(0)" }], { duration: 360, easing: SUAVE }),
      correr(fuera, [{ transform: "translateY(0)" }, { transform: `translateY(${v.recorrido}px)` }], { duration: 360, easing: SUAVE }),
    ]);
  } finally {
    v.vuelo.remove();
    v.sombra.remove();
    bolsillo.fijarEstado("conseguida", cantidad);
  }
  await destello(bolsillo);
}

/** Retirar la última copia: sale de la funda (al revés que al entrar) y se aleja hacia el espectador. */
export async function extraerCarta(bolsillo, hojaBolsillos) {
  if (movimientoReducido()) {
    bolsillo.fijarEstado("pendiente", 0);
    return;
  }
  const v = crearVuelo(bolsillo, bolsillo.crearCara(), hojaBolsillos);
  v.vuelo.style.visibility = "hidden";
  v.sombra.style.opacity = "0";
  const dentro = bolsillo.interior.querySelector(".carta") ?? bolsillo.crearCara();
  const fuera = bolsillo.crearCara();
  fuera.style.height = `${v.m.altoCarta}px`;
  bolsillo.elemento.dataset.estado = "saliendo";
  if (!dentro.parentNode) bolsillo.interior.append(dentro);
  bolsillo.exterior.replaceChildren(fuera);
  await esperarImagenes(v.vuelo);

  try {
    await Promise.all([
      correr(dentro, [{ transform: "translateY(0)" }, { transform: `translateY(${-v.recorrido}px)` }], { duration: 320, easing: SUAVE_ENTRADA }),
      correr(fuera, [{ transform: `translateY(${v.recorrido}px)` }, { transform: "translateY(0)" }], { duration: 320, easing: SUAVE_ENTRADA }),
    ]);
    dentro.remove();
    fuera.remove();
    v.vuelo.style.visibility = "visible";
    await Promise.all([
      correr(v.vuelo, [{ transform: v.alineada, opacity: 1 }, { transform: v.suspendida, opacity: 1, offset: 0.3 }, { transform: v.cerca, opacity: 0 }],
        { duration: 420, easing: SUAVE_SALIDA }),
      correr(v.sombra, [{ transform: v.sombraAlineada, opacity: 0.55 }, { transform: v.sombraCerca, opacity: 0 }],
        { duration: 420, easing: SUAVE_SALIDA }),
    ]);
  } finally {
    v.vuelo.remove();
    v.sombra.remove();
    bolsillo.fijarEstado("pendiente", 0);
  }
}

/** Brillo breve que cruza el plástico cuando la carta queda colocada. */
async function destello(bolsillo) {
  const brillo = bolsillo.doc.createElement("span");
  brillo.className = "bolsillo-destello";
  bolsillo.elemento.append(brillo);
  try {
    await correr(brillo, [{ transform: "translateX(-120%)", opacity: 0 }, { opacity: 0.9, offset: 0.35 }, { transform: "translateX(120%)", opacity: 0 }],
      { duration: 520, easing: SUAVE });
  } finally {
    brillo.remove();
  }
}

/** Pequeño pulso del contador cuando ya había copias y solo cambia la cantidad. */
export function pulsoCantidad(bolsillo) {
  if (movimientoReducido() || !bolsillo.cantidad) return;
  bolsillo.cantidad.animate([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 260, easing: SUAVE });
}
