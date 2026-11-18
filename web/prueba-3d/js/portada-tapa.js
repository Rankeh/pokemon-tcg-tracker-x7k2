// 3.11 · Diseño impreso de la tapa, dirección EDITORIAL (la misma que la biblioteca): portada negra como la carátula de una edición de
// coleccionista. Arriba, una línea de datos en versalitas; en el centro, las dos cartas estrella (Reshiram ex de Llama Blanca y Zekrom ex de
// Fulgor Negro) como «foto» de portada; abajo, el título en grotesca fina, las expansiones en rojo y el sello de la app (web/editorial/marca.js).
// La banda junto al lomo repite el sello y el título en vertical. Se dibuja con Canvas 2D; sin las ilustraciones locales se dibuja igual.
import { dibujarMarca } from '../../editorial/marca.js';

export const PORTADA = {
  margen: 0.004,               // m de panel que quedan a la vista alrededor de la lámina
  margenBanda: 0.003,
  emision: 0.22,               // fracción del dibujo que se emite (no depende de la luz): negros profundos y colores vivos
  radio: 0.03,                 // radio de las esquinas de la lámina, en fracción del ancho
  cartas: { blanca: 'sv10.5w-166', negra: 'sv10.5b-166' },     // Reshiram ex · Zekrom ex (Teselia, por defecto)
};

/** Textos de la portada de Teselia (por defecto). Cada álbum trae los suyos en su registro (web/estanteria/js/albumes.js). */
export const DISENO_TESELIA = { titulo: 'Teselia', subtitulo: 'Llama Blanca · Fulgor Negro', arribaIzq: 'Pokémon TCG', arribaDer: 'Escarlata y Púrpura',
  pie: 'SV10.5W · SV10.5B · 158 cartas', banda: 'Teselia', bandaCodigo: 'SV10.5', cartas: ['sv10.5w-166', 'sv10.5b-166'] };

export const TINTA = { negro: '#111111', papel: '#f2f2f2', suave: 'rgba(242,242,242,.58)', tenue: 'rgba(242,242,242,.3)', rojo: '#e5432f' };
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "Segoe UI", Inter, Roboto, system-ui, sans-serif';

/** PURO · tamaño del lienzo (px) para una lámina de `ancho` × `alto` metros con `lado` px de ancho. */
export const tamLienzo = (ancho, alto, lado) => ({ w: lado, h: Math.round(lado * alto / ancho) });

/** Carga las dos ilustraciones de la portada (mismo origen que la página: la textura no queda «contaminada» para WebGL). Nunca rechaza.
 *  `ids` = [izquierda, derecha]; devuelve { blanca, negra } (izquierda/derecha; los nombres vienen de Teselia). */
export function cargarCartas(base = new URL('../assets/cartas/grande/', import.meta.url), ids = DISENO_TESELIA.cartas) {
  const una = (id) => new Promise((resolver) => {
    if (typeof Image === 'undefined') { resolver(null); return; }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolver(img);
    img.onerror = () => resolver(null);
    img.src = new URL(id + '.webp', base).href;
  });
  return Promise.all([una(ids[0]), una(ids[1])]).then(([blanca, negra]) => ({ blanca, negra }));
}

function rectRedondo(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Texto en versalitas con espaciado (las letras se colocan una a una). Si se pasa `max` y no cabe, se reduce el cuerpo hasta que quepa. */
export function versalitas(ctx, texto, x, y, cuerpo, espacio, alinear = 'left', peso = 600, max = Infinity) {
  const letras = [...texto.toUpperCase()];
  const medir = () => { ctx.font = `${peso} ${cuerpo}px ${SANS}`; const a = letras.map((c) => ctx.measureText(c).width); return [a, a.reduce((s, v) => s + v, 0) + espacio * (letras.length - 1)]; };
  let [anchos, total] = medir();
  if (total > max) { const f = max / total; cuerpo *= f; espacio *= f; [anchos, total] = medir(); }
  ctx.textBaseline = 'alphabetic';
  let cx = alinear === 'right' ? x - total : alinear === 'center' ? x - total / 2 : x;
  ctx.textAlign = 'left';
  letras.forEach((c, i) => { ctx.fillText(c, cx, y); cx += anchos[i] + espacio; });
  return total;
}

/** Grano de impresión: puntos muy tenues, deterministas. */
function grano(ctx, W, H, n, alfa = 0.05) {
  let s = 7;
  const azar = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) { ctx.fillStyle = azar() < 0.5 ? `rgba(255,255,255,${alfa})` : `rgba(0,0,0,${alfa * 1.6})`; ctx.fillRect(azar() * W, azar() * H, 1.4, 1.4); }
}

/** Sello de la colección: el símbolo de la app (web/editorial/marca.js). */
export function sello(ctx, x, y, lado) { dibujarMarca(ctx, x, y, lado); }

function carta(ctx, img, cx, cy, w, giro) {
  const h = w * (img.naturalHeight / img.naturalWidth), r = w * 0.045;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(giro);
  ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = w * 0.14; ctx.shadowOffsetY = w * 0.06;
  rectRedondo(ctx, -w / 2, -h / 2, w, h, r); ctx.fillStyle = '#000'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip(); ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Portada editorial completa en `ctx` (W × H px). `cartas` = { blanca, negra } (Image o null); `d` = textos del álbum. */
export function dibujarPortada(ctx, W, H, cartas = {}, d = DISENO_TESELIA) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  rectRedondo(ctx, 0, 0, W, H, W * PORTADA.radio); ctx.clip();
  ctx.fillStyle = TINTA.negro; ctx.fillRect(0, 0, W, H);
  // foco de luz detrás de las cartas (la «foto» de portada)
  const g = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, W * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const m = W * 0.075;
  // --- línea de datos arriba
  ctx.fillStyle = TINTA.suave; versalitas(ctx, d.arribaIzq, m, H * 0.06, W * 0.026, W * 0.008);
  ctx.fillStyle = TINTA.rojo; versalitas(ctx, d.arribaDer, W - m, H * 0.06, W * 0.026, W * 0.008, 'right');
  ctx.fillStyle = TINTA.tenue; ctx.fillRect(m, H * 0.075, W - 2 * m, Math.max(1, W * 0.002));

  // --- las dos cartas estrella (sin imágenes: dos planos marfil/negro)
  const ancho = W * 0.44;
  if (cartas.blanca || cartas.negra) {
    if (cartas.blanca) carta(ctx, cartas.blanca, W * 0.37, H * 0.39, ancho, -0.07);
    if (cartas.negra) carta(ctx, cartas.negra, W * 0.63, H * 0.43, ancho, 0.07);
  } else {
    const h = ancho * 825 / 600;
    ctx.fillStyle = '#e9e4da'; ctx.fillRect(W * 0.15, H * 0.39 - h / 2, ancho, h);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(W * 0.41, H * 0.43 - h / 2, ancho, h);
  }

  // --- bloque de título abajo
  const yT = H * 0.84;
  ctx.fillStyle = TINTA.rojo; ctx.fillRect(m, yT - W * 0.2, W * 0.08, Math.max(2, W * 0.006));
  ctx.fillStyle = TINTA.papel; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  let cuerpo = W * 0.16; ctx.font = `300 ${cuerpo}px ${SANS}`;
  const anchoTitulo = ctx.measureText(d.titulo).width, max = W - 2 * m - W * 0.02;
  if (anchoTitulo > max) { cuerpo *= max / anchoTitulo; ctx.font = `300 ${cuerpo}px ${SANS}`; }       // títulos largos: se reduce el cuerpo, nunca se corta
  ctx.fillText(d.titulo, m - W * 0.008, yT);
  ctx.fillStyle = TINTA.rojo; versalitas(ctx, d.subtitulo, m, yT + W * 0.06, W * 0.03, W * 0.009, 'left', 600, W - 2 * m);
  ctx.fillStyle = TINTA.tenue; ctx.fillRect(m, H * 0.915, W - 2 * m, Math.max(1, W * 0.002));
  ctx.fillStyle = TINTA.suave; versalitas(ctx, d.pie, m, H * 0.955, W * 0.024, W * 0.007, 'left', 600, W - 2 * m - W * 0.11);   // nunca pisa el sello
  sello(ctx, W - m - W * 0.075, H * 0.925, W * 0.075);

  grano(ctx, W, H, Math.round(W * H / 60));
  ctx.restore();
}

/** Banda junto al lomo: negra, sello rojo arriba y «TESELIA» en vertical (se lee de abajo arriba). */
export function dibujarBanda(ctx, W, H, d = DISENO_TESELIA) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  rectRedondo(ctx, 0, 0, W, H, W * 0.12); ctx.clip();
  ctx.fillStyle = TINTA.negro; ctx.fillRect(0, 0, W, H);
  sello(ctx, W * 0.1, W * 0.1, W * 0.8);
  ctx.translate(W / 2, H * 0.56); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = TINTA.papel; versalitas(ctx, d.banda, 0, W * 0.12, Math.min(W * 0.34, (H * 0.62) / Math.max(1, d.banda.length * 1.05)), W * 0.12, 'center', 300);
  ctx.restore();
  ctx.save(); ctx.fillStyle = TINTA.rojo; ctx.translate(W / 2, H * 0.9); ctx.rotate(-Math.PI / 2);
  versalitas(ctx, d.bandaCodigo, 0, W * 0.08, W * 0.2, W * 0.06, 'center'); ctx.restore();
  grano(ctx, W, H, Math.round(W * H / 60));
}
