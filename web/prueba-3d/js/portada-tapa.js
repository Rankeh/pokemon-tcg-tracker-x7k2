// 3.8 · Diseño impreso de la tapa: lámina «Llama Blanca / Fulgor Negro» sobre el panel de la portada y el título en la banda junto al lomo.
// Se dibuja con Canvas 2D en tiempo de ejecución (sin imágenes nuevas en el repo): mitad marfil con brillo de fuego (sv10.5w, White Flare) y mitad
// negra con rayos (sv10.5b, Black Bolt), separadas por una costura diagonal; Reshiram ex y Zekrom ex (Rara Ilustración Especial de cada
// expansión) se toman de las copias locales del álbum. Si esas imágenes no están, el diseño se dibuja igual sin ellas.

export const PORTADA = {
  margen: 0.004,               // m de panel que quedan a la vista alrededor de la lámina (se sigue viendo el canto y la costura del panel)
  margenBanda: 0.003,
  emision: 0.22,               // fracción del dibujo que se emite (no depende de la luz): mantiene negros profundos y colores vivos
  radio: 0.045,                // radio de las esquinas de la lámina, en fracción del ancho
  costura: [0.66, 0.34],       // x (fracción del ancho) de la costura arriba y abajo
  cartas: { blanca: 'sv10.5w-166', negra: 'sv10.5b-166' },     // Reshiram ex · Zekrom ex
};

const C = {
  marfil: '#f3ede2', marfilSombra: '#e6dccb', tinta: '#2a1d14', brasa: '#b0441a', llama: '#ff7a2f', llamaClara: '#ffb36b',
  noche: '#0c0f15', nocheClara: '#18202e', luz: '#eef3ff', rayo: '#4fc3ff', rayoClaro: '#b4e8ff', laton: '#d3b47f',
};
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** PURO · x de la costura a la altura y (0..1), en fracción del ancho. */
export const xCostura = (y, [a, b] = PORTADA.costura) => a + (b - a) * y;

/** PURO · tamaño del lienzo (px) para una lámina de `ancho` × `alto` metros con `lado` px de ancho. */
export const tamLienzo = (ancho, alto, lado) => ({ w: lado, h: Math.round(lado * alto / ancho) });

/** Carga las dos ilustraciones (mismo origen que la página, así la textura no queda «contaminada» para WebGL). Nunca rechaza. */
export function cargarCartas(base = new URL('../assets/cartas/grande/', import.meta.url)) {
  const una = (id) => new Promise((resolver) => {
    if (typeof Image === 'undefined') { resolver(null); return; }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolver(img);
    img.onerror = () => resolver(null);
    img.src = new URL(id + '.webp', base).href;
  });
  return Promise.all([una(PORTADA.cartas.blanca), una(PORTADA.cartas.negra)]).then(([blanca, negra]) => ({ blanca, negra }));
}

function rectRedondo(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function zonaNegra(ctx, W, H) {
  ctx.beginPath();
  ctx.moveTo(xCostura(0) * W, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(xCostura(1) * W, H); ctx.closePath();
}

/** Rayo quebrado reproducible (semilla fija): la portada sale igual en cada carga. */
function rayo(ctx, x0, y0, x1, y1, pasos, amplitud, semilla) {
  let s = semilla;
  const azar = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  ctx.beginPath(); ctx.moveTo(x0, y0);
  for (let i = 1; i < pasos; i++) { const t = i / pasos; ctx.lineTo(x0 + (x1 - x0) * t + azar() * amplitud, y0 + (y1 - y0) * t + azar() * amplitud * 0.3); }
  ctx.lineTo(x1, y1);
}

function carta(ctx, img, cx, cy, w, giro, sombra) {
  const h = w * (img ? img.naturalHeight / img.naturalWidth : 825 / 600), r = w * 0.045;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(giro);
  ctx.shadowColor = sombra; ctx.shadowBlur = w * 0.12; ctx.shadowOffsetY = w * 0.05;
  rectRedondo(ctx, -w / 2, -h / 2, w, h, r); ctx.fillStyle = '#000'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip(); ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(giro);
  rectRedondo(ctx, -w / 2, -h / 2, w, h, r); ctx.lineWidth = w * 0.008; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
  ctx.restore();
}

function textoEspaciado(ctx, texto, x, y, espacio, alinear = 'left') {
  const anchos = [...texto].map((c) => ctx.measureText(c).width);
  const total = anchos.reduce((a, b) => a + b, 0) + espacio * (texto.length - 1);
  let cx = alinear === 'right' ? x - total : alinear === 'center' ? x - total / 2 : x;
  ctx.textAlign = 'left';
  [...texto].forEach((c, i) => { ctx.fillText(c, cx, y); cx += anchos[i] + espacio; });
}

/** Sello circular blanco/negro (las dos expansiones unidas). */
function sello(ctx, cx, cy, r) {
  ctx.save();
  ctx.shadowColor = 'rgba(79,195,255,.55)'; ctx.shadowBlur = r * 0.6;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fillStyle = C.noche; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, -Math.PI / 2, Math.PI / 2, true); ctx.arc(cx, cy + r * 0.45, r * 0.45, Math.PI / 2, -Math.PI / 2, false);
  ctx.arc(cx, cy - r * 0.45, r * 0.45, Math.PI / 2, -Math.PI / 2, true); ctx.closePath(); ctx.fillStyle = C.marfil; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.45, r * 0.13, 0, 2 * Math.PI); ctx.fillStyle = C.noche; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.45, r * 0.13, 0, 2 * Math.PI); ctx.fillStyle = C.marfil; ctx.fill();
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, C.llama); g.addColorStop(0.5, C.laton); g.addColorStop(1, C.rayo);
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.95, 0, 2 * Math.PI); ctx.lineWidth = r * 0.07; ctx.strokeStyle = g; ctx.stroke();
  ctx.restore();
}

/** Dibuja la lámina completa en `ctx` (W × H px). `cartas` = { blanca, negra } (Image o null). */
export function dibujarPortada(ctx, W, H, cartas = {}) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  rectRedondo(ctx, 0, 0, W, H, W * PORTADA.radio); ctx.clip();

  // --- mitad Llama Blanca: marfil con brillo de fuego y brasas
  ctx.fillStyle = C.marfil; ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W * 0.28, H * 0.5, 0, W * 0.28, H * 0.5, W * 0.62);
  g.addColorStop(0, 'rgba(255,122,47,.42)'); g.addColorStop(0.55, 'rgba(255,179,107,.16)'); g.addColorStop(1, 'rgba(255,179,107,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(176,68,26,.12)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const hash = (n) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
  for (let i = 0; i < 30; i++) {                         // brasas: posiciones fijas (hash), solo en la mitad marfil y fuera de los títulos
    const yf = 0.28 + hash(i + 0.5) * 0.66, x = hash(i * 3.7 + 1.3) * (xCostura(yf) - 0.06) * W, y = yf * H, r = W * (0.003 + hash(i * 7.1) * 0.007);
    const b = ctx.createRadialGradient(x, y, 0, x, y, r * 3); b.addColorStop(0, 'rgba(255,179,107,.95)'); b.addColorStop(0.35, 'rgba(255,122,47,.6)'); b.addColorStop(1, 'rgba(255,122,47,0)');
    ctx.fillStyle = b; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, 2 * Math.PI); ctx.fill();
  }

  // --- mitad Fulgor Negro: noche con brillo eléctrico y rayos
  ctx.save();
  zonaNegra(ctx, W, H); ctx.clip();
  ctx.fillStyle = C.noche; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W * 0.72, H * 0.5, 0, W * 0.72, H * 0.5, W * 0.6);
  g.addColorStop(0, 'rgba(79,195,255,.38)'); g.addColorStop(0.5, 'rgba(60,110,255,.12)'); g.addColorStop(1, 'rgba(60,110,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.lineJoin = 'miter'; ctx.lineCap = 'round';
  for (const [x0, y0, x1, y1, a, s, grosor] of [[0.93, 0.13, 0.8, 0.42, 0.08, 7, 0.006], [0.99, 0.22, 0.9, 0.6, 0.06, 19, 0.004], [0.72, 0.06, 0.66, 0.3, 0.05, 31, 0.003]]) {
    rayo(ctx, x0 * W, y0 * H, x1 * W, y1 * H, 9, a * W, s);
    ctx.shadowColor = C.rayo; ctx.shadowBlur = W * 0.03; ctx.lineWidth = W * grosor * 2.2; ctx.strokeStyle = 'rgba(79,195,255,.45)'; ctx.stroke();
    ctx.shadowBlur = W * 0.012; ctx.lineWidth = W * grosor; ctx.strokeStyle = C.rayoClaro; ctx.stroke();
  }
  ctx.shadowColor = 'transparent';
  ctx.restore();

  // --- costura: línea de luz de fuego a electricidad
  g = ctx.createLinearGradient(xCostura(0) * W, 0, xCostura(1) * W, H);
  g.addColorStop(0, C.rayo); g.addColorStop(0.5, C.laton); g.addColorStop(1, C.llama);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(xCostura(0) * W, 0); ctx.lineTo(xCostura(1) * W, H);
  ctx.shadowColor = 'rgba(211,180,127,.9)'; ctx.shadowBlur = W * 0.02; ctx.lineWidth = W * 0.006; ctx.strokeStyle = g; ctx.stroke();
  ctx.restore();

  // --- las dos cartas estrella, cruzando la costura
  const anchoCarta = W * 0.43;
  if (cartas.blanca) carta(ctx, cartas.blanca, W * 0.31, H * 0.47, anchoCarta, -0.12, 'rgba(176,68,26,.55)');
  if (cartas.negra) carta(ctx, cartas.negra, W * 0.69, H * 0.555, anchoCarta, 0.12, 'rgba(0,0,0,.75)');

  // --- títulos
  ctx.textBaseline = 'alphabetic';
  const t = W * 0.125;
  ctx.font = `${t}px ${SERIF}`;
  g = ctx.createLinearGradient(0, H * 0.06, 0, H * 0.2); g.addColorStop(0, C.tinta); g.addColorStop(1, C.brasa);
  ctx.fillStyle = g; ctx.textAlign = 'left';
  ctx.fillText('Llama', W * 0.075, H * 0.035 + t); ctx.fillText('Blanca', W * 0.075, H * 0.035 + t * 1.88);
  ctx.font = `600 ${W * 0.026}px ${SANS}`; ctx.fillStyle = C.llama;
  textoEspaciado(ctx, 'WHITE FLARE', W * 0.08, H * 0.035 + t * 1.88 + W * 0.065, W * 0.012);

  ctx.font = `${t}px ${SERIF}`;
  g = ctx.createLinearGradient(0, H * 0.8, 0, H * 0.95); g.addColorStop(0, '#ffffff'); g.addColorStop(1, C.rayo);
  ctx.fillStyle = g; ctx.textAlign = 'right';
  const baseN = H - W * 0.075 - W * 0.065;
  ctx.fillText('Fulgor', W * 0.925, baseN - t * 0.88); ctx.fillText('Negro', W * 0.925, baseN);
  ctx.font = `600 ${W * 0.026}px ${SANS}`; ctx.fillStyle = C.rayo;
  textoEspaciado(ctx, 'BLACK BOLT', W * 0.92, baseN + W * 0.065, W * 0.012, 'right');

  // --- esquinas libres: sello (arriba, lado negro) y código de colección (abajo, lado marfil)
  sello(ctx, W * 0.86, H * 0.075, W * 0.055);
  ctx.font = `600 ${W * 0.02}px ${SANS}`; ctx.fillStyle = 'rgba(238,243,255,.75)';
  textoEspaciado(ctx, 'TESELIA', W * 0.86, H * 0.075 + W * 0.095, W * 0.008, 'center');
  ctx.font = `600 ${W * 0.021}px ${SANS}`; ctx.fillStyle = 'rgba(42,29,20,.6)';
  textoEspaciado(ctx, 'sv10.5w · sv10.5b', W * 0.075, H - W * 0.075, W * 0.004);

  ctx.restore();

  // --- acabado laminado: brillo diagonal muy suave y filo claro
  ctx.save();
  rectRedondo(ctx, 0, 0, W, H, W * PORTADA.radio); ctx.clip();
  g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0.18, 'rgba(255,255,255,0)'); g.addColorStop(0.3, 'rgba(255,255,255,.07)'); g.addColorStop(0.42, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  rectRedondo(ctx, 0, 0, W, H, W * PORTADA.radio); ctx.lineWidth = W * 0.006; ctx.strokeStyle = 'rgba(211,180,127,.7)'; ctx.stroke();
  ctx.restore();
}

/** Banda junto al lomo: mitad marfil arriba, mitad negra abajo y «ÁLBUM TESELIA» en vertical (se lee de abajo arriba). */
export function dibujarBanda(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  rectRedondo(ctx, 0, 0, W, H, W * 0.25); ctx.clip();
  ctx.fillStyle = C.marfil; ctx.fillRect(0, 0, W, H);
  ctx.beginPath(); ctx.moveTo(0, H * 0.56); ctx.lineTo(W, H * 0.44); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fillStyle = C.noche; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, H * 0.56); ctx.lineTo(W, H * 0.44);
  ctx.lineWidth = W * 0.06; ctx.strokeStyle = C.laton; ctx.stroke();

  ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${W * 0.3}px ${SANS}`;
  // tras girar -90°, +x apunta hacia ARRIBA del lienzo: lo positivo cae en la mitad marfil y lo negativo en la negra
  ctx.fillStyle = C.tinta; textoEspaciado(ctx, 'LLAMA BLANCA', H * 0.09, 0, W * 0.1, 'left');
  ctx.fillStyle = C.luz; textoEspaciado(ctx, 'FULGOR NEGRO', -H * 0.09, 0, W * 0.1, 'right');
  ctx.restore();
  ctx.save();
  rectRedondo(ctx, 0, 0, W, H, W * 0.25); ctx.lineWidth = W * 0.05; ctx.strokeStyle = 'rgba(211,180,127,.7)'; ctx.stroke();
  ctx.restore();
}
