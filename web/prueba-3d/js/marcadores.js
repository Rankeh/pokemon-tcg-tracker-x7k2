// Marcadores visuales dibujados en un canvas (sin imágenes externas): carta SIN IMAGEN y etiqueta de carta PENDIENTE.
// `lienzo` es cualquier objeto con getContext('2d') (canvas real en el navegador; doble en las pruebas).
const COL_NOCHE = { fondo: '#1c2638', borde: '#7f93b8', texto: '#ece6da', suave: '#9aa3b2', acento: '#e8b25a' };
const COL_ACOGEDOR = { fondo: '#efe2c6', borde: '#b3a07c', texto: '#4e3b28', suave: '#8a775d', acento: '#d8622a' };
const PEND_NOCHE = { placa: '#18213a', borde: '#5a6d90', nombre: '#c3cde2', suave: '#8c9ab6' };
const PEND_ACOGEDOR = { placa: '#dccfb3', borde: '#a8956f', nombre: '#4e3b28', suave: '#7d6a50' };     // placa hundida beis: más oscura que la hoja crema, texto marrón legible
let COL = COL_NOCHE, PEND = PEND_NOCHE;
/** Tema de los marcadores dibujados en canvas (se llama una vez al arrancar, antes de crear texturas). */
export function fijarTemaMarcadores(tema) { COL = tema === 'acogedor' ? COL_ACOGEDOR : COL_NOCHE; PEND = tema === 'acogedor' ? PEND_ACOGEDOR : PEND_NOCHE; }

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
