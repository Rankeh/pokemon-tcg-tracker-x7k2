// Marcadores visuales dibujados en un canvas (sin imágenes externas): carta SIN IMAGEN y etiqueta de carta PENDIENTE.
// `lienzo` es cualquier objeto con getContext('2d') (canvas real en el navegador; doble en las pruebas).
// Colores del tema editorial: carta sin imagen sobre grafito y placa «pendiente» hundida en la hoja grafito, texto claro.
const COL = { fondo: '#1f1f1f', borde: '#3a3a3a', texto: '#f2f2f2', suave: '#9a9a9a', acento: '#e5432f' };
const PEND = { placa: '#242424', borde: '#3d3d3d', nombre: '#e8e8e8', suave: '#8a8a8a' };
/** Se conserva por compatibilidad: hay un solo tema, así que no hace nada. */
export function fijarTemaMarcadores() {}

function ajustarTexto(ctx, texto, maxAncho) {
  let t = String(texto ?? '');
  while (t.length > 3 && ctx.measureText(t).width > maxAncho) t = t.slice(0, -2);
  return t === String(texto ?? '') ? t : t.trimEnd() + '…';
}

/** Marcador de carta sin imagen: nombre, expansión y número (+ id), en el estilo del álbum. */
export function dibujarMarcador(lienzo, w, h, carta) {
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = COL.fondo; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = COL.borde; ctx.lineWidth = Math.max(2, w * 0.02); ctx.strokeRect(w * 0.04, w * 0.04, w * 0.92, h - w * 0.08);
  ctx.textAlign = 'center'; ctx.fillStyle = COL.acento; ctx.font = `600 ${Math.round(w * 0.075)}px system-ui, sans-serif`;
  ctx.fillText('SIN IMAGEN', w / 2, h * 0.16);
  ctx.fillStyle = COL.texto; ctx.font = `700 ${Math.round(w * 0.12)}px system-ui, sans-serif`;
  ctx.fillText(ajustarTexto(ctx, carta.nombre, w * 0.84), w / 2, h * 0.46);
  ctx.fillStyle = COL.suave; ctx.font = `500 ${Math.round(w * 0.082)}px system-ui, sans-serif`;
  ctx.fillText(ajustarTexto(ctx, carta.nombreExpansion || carta.expansion, w * 0.84), w / 2, h * 0.58);
  ctx.fillText('Nº ' + carta.numero, w / 2, h * 0.67);
  ctx.font = `500 ${Math.round(w * 0.06)}px ui-monospace, monospace`;
  ctx.fillText(carta.id, w / 2, h * 0.9);
}

/** Etiqueta de carta PENDIENTE (aún no la tienes): placa oscura con el nombre y el número, para ubicarla en el bolsillo. */
export function dibujarEtiquetaPendiente(lienzo, w, h, carta) {
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = PEND.placa; ctx.fillRect(0, 0, w, h);                       // placa hundida: más oscura que la hoja pero con detalle legible
  ctx.strokeStyle = PEND.borde; ctx.lineWidth = Math.max(2, w * 0.025); ctx.setLineDash?.([w * 0.06, w * 0.05]);
  ctx.strokeRect(w * 0.06, w * 0.06, w * 0.88, h - w * 0.12); ctx.setLineDash?.([]);
  ctx.textAlign = 'center'; ctx.fillStyle = PEND.nombre; ctx.font = `700 ${Math.round(w * 0.13)}px system-ui, sans-serif`;
  ctx.fillText(ajustarTexto(ctx, carta.nombre, w * 0.84), w / 2, h * 0.5);
  ctx.fillStyle = PEND.suave; ctx.font = `500 ${Math.round(w * 0.1)}px system-ui, sans-serif`;
  ctx.fillText('Nº ' + carta.numero, w / 2, h * 0.62);
  ctx.fillText('pendiente', w / 2, h * 0.72);
}
