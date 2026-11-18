// Símbolo de la app (3.21): cuadrado rojo editorial con dos cartas en abanico (una en contorno, la de delante blanca con su ventana de
// ilustración). Diseño propio, sin elementos de marcas registradas. Una sola definición para el SVG (cabecera, favicon) y el Canvas
// (sello del lomo y de la portada), en un lienzo de 100 × 100.
export const ROJO = '#e5432f';
const TRAS = { x: 24, y: 20, w: 36, h: 50, r: 4.5, giro: -14, cx: 42, cy: 45 };
const FRENTE = { x: 38, y: 29, w: 36, h: 50, r: 4.5, giro: 9, cx: 56, cy: 54 };
const VENTANA = { x: 42.5, y: 34, w: 27, h: 21, r: 2 };

/** SVG del símbolo (100 × 100). `fondo = false` lo devuelve sin el cuadrado rojo (cartas en rojo, para fondos claros). */
export function svgMarca({ fondo = true } = {}) {
  const tinta = fondo ? '#ffffff' : ROJO, hueco = fondo ? ROJO : '#ffffff';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">${fondo ? `<rect width="100" height="100" fill="${ROJO}"/>` : ''}`
    + `<rect x="${TRAS.x}" y="${TRAS.y}" width="${TRAS.w}" height="${TRAS.h}" rx="${TRAS.r}" fill="none" stroke="${tinta}" stroke-width="5" opacity=".62" transform="rotate(${TRAS.giro} ${TRAS.cx} ${TRAS.cy})"/>`
    + `<g transform="rotate(${FRENTE.giro} ${FRENTE.cx} ${FRENTE.cy})"><rect x="${FRENTE.x}" y="${FRENTE.y}" width="${FRENTE.w}" height="${FRENTE.h}" rx="${FRENTE.r}" fill="${tinta}"/>`
    + `<rect x="${VENTANA.x}" y="${VENTANA.y}" width="${VENTANA.w}" height="${VENTANA.h}" rx="${VENTANA.r}" fill="${hueco}"/></g></svg>`;
}

function rect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Dibuja el símbolo en un Canvas 2D, en el cuadrado (x, y, lado). */
export function dibujarMarca(ctx, x, y, lado) {
  const k = lado / 100;
  ctx.save();
  ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = ROJO; ctx.fillRect(0, 0, 100, 100);
  ctx.save(); ctx.translate(TRAS.cx, TRAS.cy); ctx.rotate(TRAS.giro * Math.PI / 180); ctx.translate(-TRAS.cx, -TRAS.cy);
  rect(ctx, TRAS.x, TRAS.y, TRAS.w, TRAS.h, TRAS.r); ctx.globalAlpha = 0.62; ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
  ctx.translate(FRENTE.cx, FRENTE.cy); ctx.rotate(FRENTE.giro * Math.PI / 180); ctx.translate(-FRENTE.cx, -FRENTE.cy);
  rect(ctx, FRENTE.x, FRENTE.y, FRENTE.w, FRENTE.h, FRENTE.r); ctx.fillStyle = '#fff'; ctx.fill();
  rect(ctx, VENTANA.x, VENTANA.y, VENTANA.w, VENTANA.h, VENTANA.r); ctx.fillStyle = ROJO; ctx.fill();
  ctx.restore();
}
