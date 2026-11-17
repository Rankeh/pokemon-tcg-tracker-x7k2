// Lomo y tapas del álbum Teselia tal como se ve en la estantería (Canvas 2D).
// Lomo: mitad marfil (Llama Blanca) arriba y mitad negra (Fulgor Negro) abajo, separadas por un rayo dorado; nervios, filetes y costuras en
// latón/oro, sello de Teselia y títulos en vertical. Se generan tres capas a la vez: color, altura (→ relieve) y metal/rugosidad,
// para que el oro brille y el cuero no. La tapa delantera reproduce la portada del álbum 3D (misma lámina de portada-tapa.js).
import { LIBRO } from './disposicion.js';
import { dibujarPortada, dibujarBanda } from '../../prueba-3d/js/portada-tapa.js';

const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const COLORES = { marfil: '#ece3d2', marfilSombra: '#d6c9b1', noche: '#12151c', oro: '#caa25c', oroClaro: '#f0d9a2', tinta: '#2a1d14', tejido: '#40597a' };
// metal/rugosidad: G = rugosidad, B = metal (convención de Three para roughnessMap/metalnessMap)
const MR = { cuero: 'rgb(0,150,0)', oro: 'rgb(0,72,255)', costura: 'rgb(0,190,0)' };

const lienzo = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/** PURO · tamaño del lienzo del lomo para `ancho` px (misma proporción que el lomo real). */
export const tamLomo = (ancho = 160) => ({ w: ancho, h: Math.round(ancho * LIBRO.alto / LIBRO.grueso) });

/** Ejecuta `fn(ctx, estilo)` en las tres capas; `estilo` = { color, alto, mr } (cualquiera puede omitirse). */
function capas(L, fn, estilo) {
  for (const k of ['color', 'alto', 'mr']) if (estilo[k] != null) { const ctx = L[k]; ctx.save(); fn(ctx, estilo[k]); ctx.restore(); }
}

function rayoCentral(ctx, w, y0, y1) {
  ctx.beginPath();
  ctx.moveTo(0, y0 + (y1 - y0) * 0.25); ctx.lineTo(w * 0.55, y0 + (y1 - y0) * 0.1); ctx.lineTo(w * 0.42, y0 + (y1 - y0) * 0.48);
  ctx.lineTo(w, y0 + (y1 - y0) * 0.38); ctx.lineTo(w, y0 + (y1 - y0) * 0.7); ctx.lineTo(w * 0.45, y0 + (y1 - y0) * 0.9);
  ctx.lineTo(w * 0.58, y0 + (y1 - y0) * 0.52); ctx.lineTo(0, y0 + (y1 - y0) * 0.62); ctx.closePath();
}

/** Texto en vertical centrado en (cx, cy). Si no cabe en `largo` px, reduce el cuerpo hasta que quepa. */
function textoVertical(ctx, texto, cx, cy, tam, espacio, fuente, largo = Infinity) {
  ctx.translate(cx, cy); ctx.rotate(Math.PI / 2);                 // se lee de arriba abajo (con el libro tumbado con la portada hacia arriba, queda derecho)
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const letras = [...texto];
  let anchos, total;
  for (let i = 0; i < 12; i++) {
    ctx.font = `${tam}px ${fuente}`;
    anchos = letras.map((c) => ctx.measureText(c).width);
    total = anchos.reduce((a, b) => a + b, 0) + espacio * (letras.length - 1);
    if (total <= largo) break;
    const f = largo / total; tam *= f; espacio *= f;
  }
  let x = -total / 2;
  letras.forEach((c, i) => { ctx.fillText(c, x, 0); x += anchos[i] + espacio; });
}

function sello(ctx, cx, cy, r, claro, oscuro) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fillStyle = oscuro; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.88, -Math.PI / 2, Math.PI / 2, true); ctx.arc(cx, cy + r * 0.44, r * 0.44, Math.PI / 2, -Math.PI / 2, false);
  ctx.arc(cx, cy - r * 0.44, r * 0.44, Math.PI / 2, -Math.PI / 2, true); ctx.closePath(); ctx.fillStyle = claro; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.44, r * 0.12, 0, 2 * Math.PI); ctx.fillStyle = oscuro; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.44, r * 0.12, 0, 2 * Math.PI); ctx.fillStyle = claro; ctx.fill();
}

/** Lomo Teselia. Devuelve { color, alto, mr } (lienzos w×h). */
export function dibujarLomoTeselia(ancho = 160) {
  const { w, h } = tamLomo(ancho);
  const C = { color: lienzo(w, h), alto: lienzo(w, h), mr: lienzo(w, h) };
  const L = { color: C.color.getContext('2d'), alto: C.alto.getContext('2d'), mr: C.mr.getContext('2d') };
  const yMedio0 = h * 0.47, yMedio1 = h * 0.55;

  // --- cuero base: marfil arriba, noche abajo
  L.color.fillStyle = COLORES.marfil; L.color.fillRect(0, 0, w, h);
  L.color.fillStyle = COLORES.noche; L.color.fillRect(0, yMedio0 + (yMedio1 - yMedio0) * 0.5, w, h);
  L.alto.fillStyle = '#6a6a6a'; L.alto.fillRect(0, 0, w, h);
  L.mr.fillStyle = MR.cuero; L.mr.fillRect(0, 0, w, h);
  // grano del cuero (solo relieve) y variación de tono
  for (let i = 0; i < w * h / 90; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 0.6 + Math.random() * 1.4;
    L.alto.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},.18)`; L.alto.beginPath(); L.alto.arc(x, y, r, 0, 2 * Math.PI); L.alto.fill();
  }
  // --- separación: rayo dorado en relieve
  capas(L, (ctx, s) => { rayoCentral(ctx, w, yMedio0, yMedio1); ctx.fillStyle = s; ctx.fill(); }, { color: COLORES.oro, alto: '#e0e0e0', mr: MR.oro });
  L.color.save(); rayoCentral(L.color, w, yMedio0, yMedio1); L.color.clip();
  const g = L.color.createLinearGradient(0, yMedio0, w, yMedio1); g.addColorStop(0, COLORES.oroClaro); g.addColorStop(0.5, COLORES.oro); g.addColorStop(1, '#9b7434');
  L.color.fillStyle = g; L.color.fillRect(0, yMedio0, w, yMedio1 - yMedio0); L.color.restore();

  // --- nervios (bandas en relieve) arriba y abajo, con filetes dorados
  for (const y of [h * 0.045, h * 0.955]) {
    capas(L, (ctx, s) => { ctx.fillStyle = s; ctx.fillRect(0, y - h * 0.012, w, h * 0.024); }, { color: y < h / 2 ? COLORES.marfilSombra : '#1d222c', alto: '#ffffff', mr: MR.cuero });
    for (const d of [-h * 0.017, h * 0.017]) capas(L, (ctx, s) => { ctx.fillStyle = s; ctx.fillRect(0, y + d - 1.5, w, 3); }, { color: COLORES.oro, alto: '#c8c8c8', mr: MR.oro });
  }
  // filetes que enmarcan los títulos
  for (const y of [h * 0.085, h * 0.215, h * 0.785, h * 0.915]) capas(L, (ctx, s) => { ctx.fillStyle = s; ctx.fillRect(w * 0.14, y - 1, w * 0.72, 2); }, { color: COLORES.oro, alto: '#bdbdbd', mr: MR.oro });

  // --- costuras discretas a lo largo de los dos cantos
  for (const x of [w * 0.07, w * 0.93]) {
    for (let y = h * 0.07; y < h * 0.93; y += 9) {
      const enNoche = y > (yMedio0 + yMedio1) / 2;
      capas(L, (ctx, s) => { ctx.fillStyle = s; ctx.fillRect(x - 1, y, 2, 5); }, { color: enNoche ? '#a88a55' : '#8c6f4c', alto: '#4a4a4a', mr: MR.costura });
    }
  }

  // --- sello de Teselia (arriba) con aro dorado
  const ry = h * 0.15, rr = w * 0.27;
  capas(L, (ctx, s) => { ctx.beginPath(); ctx.arc(w / 2, ry, rr * 1.12, 0, 2 * Math.PI); ctx.fillStyle = s; ctx.fill(); }, { color: COLORES.oro, alto: '#d8d8d8', mr: MR.oro });
  sello(L.color, w / 2, ry, rr, COLORES.marfil, COLORES.noche);
  L.alto.beginPath(); L.alto.arc(w / 2, ry, rr, 0, 2 * Math.PI); L.alto.fillStyle = '#b0b0b0'; L.alto.fill();
  L.mr.beginPath(); L.mr.arc(w / 2, ry, rr, 0, 2 * Math.PI); L.mr.fillStyle = 'rgb(0,110,0)'; L.mr.fill();

  // --- títulos en vertical (oro estampado: color + relieve hundido + metal)
  // cada título ocupa su mitad, entre el filete y el rayo, con aire a los lados
  const tam = w * 0.3, esp = w * 0.05;
  capas(L, (ctx, s) => { ctx.fillStyle = s; textoVertical(ctx, 'LLAMA BLANCA', w / 2, (h * 0.235 + yMedio0) / 2, tam, esp, SERIF, (yMedio0 - h * 0.235) * 0.9); }, { color: COLORES.tinta, alto: '#3c3c3c', mr: MR.cuero });
  capas(L, (ctx, s) => { ctx.fillStyle = s; textoVertical(ctx, 'FULGOR NEGRO', w / 2, (yMedio1 + h * 0.765) / 2, tam, esp, SERIF, (h * 0.765 - yMedio1) * 0.9); }, { color: COLORES.oroClaro, alto: '#3c3c3c', mr: MR.oro });

  // --- pie: nombre de la colección y códigos
  capas(L, (ctx, s) => {
    ctx.fillStyle = s; ctx.font = `600 ${w * 0.15}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TESELIA', w / 2, h * 0.85);
  }, { color: COLORES.oro, alto: '#4a4a4a', mr: MR.oro });
  capas(L, (ctx, s) => {
    ctx.fillStyle = s; ctx.font = `${w * 0.1}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('sv10.5', w / 2, h * 0.885);
  }, { color: 'rgba(202,162,92,.8)', mr: MR.oro });

  // --- curvatura del lomo redondeado: los cantos se oscurecen un poco (solo color)
  const v = L.color.createLinearGradient(0, 0, w, 0);
  v.addColorStop(0, 'rgba(0,0,0,.35)'); v.addColorStop(0.18, 'rgba(0,0,0,0)'); v.addColorStop(0.82, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.35)');
  L.color.fillStyle = v; L.color.fillRect(0, 0, w, h);
  return C;
}

/** Tapa delantera (cara +x del libro de pie): tejido azul del álbum con la banda y la lámina de portada en sus sitios reales.
 *  u = 0 junto al lomo; la parte de arriba del lienzo es la parte de arriba del libro. `cartas` = { blanca, negra } (opcional). */
export function dibujarTapa(cartas = {}, ancho = 512) {
  const W = ancho, H = Math.round(ancho * LIBRO.alto / LIBRO.fondo), c = lienzo(W, H), ctx = c.getContext('2d');
  const px = (m) => (m / LIBRO.fondo) * W, py = (m) => (m / LIBRO.alto) * H;
  ctx.fillStyle = COLORES.tejido; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.08;
  for (let i = -H; i < W; i += 3) { ctx.strokeStyle = i % 6 ? '#000' : '#fff'; ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // medidas del GLB (en metros, desde el lomo): banda x 12–46 mm, panel x 55–244 mm, ambos ±141 mm en alto; lomo de 10 mm
  const sub = (x0, x1, m, fn) => {
    const x = px(0.01 + x0 + m), y = py(0.161 - 0.141 + m), w = px(x1 - x0 - 2 * m), h = py(0.282 - 2 * m);
    const s = lienzo(Math.round(w), Math.round(h)); fn(s.getContext('2d'), s.width, s.height); ctx.drawImage(s, x, y, w, h);
  };
  sub(0.012, 0.046, 0.003, (k, w, h) => dibujarBanda(k, w, h));
  sub(0.055, 0.244, 0.004, (k, w, h) => dibujarPortada(k, w, h, cartas));
  return c;
}

/** Cantos de las hojas (arriba, abajo y delante): papel crema con líneas de hoja y las tapas azules en los bordes. u a lo ancho del grosor. */
export function dibujarCantos(w = 64, h = 256) {
  const c = lienzo(w, h), ctx = c.getContext('2d'), t = (0.003 / LIBRO.grueso) * w;
  ctx.fillStyle = '#efe8da'; ctx.fillRect(0, 0, w, h);
  for (let x = t + 2; x < w - t - 1; x += 2.2) { ctx.fillStyle = `rgba(120,100,80,${0.12 + 0.1 * Math.random()})`; ctx.fillRect(x, 0, 1, h); }
  ctx.fillStyle = COLORES.tejido; ctx.fillRect(0, 0, t, h); ctx.fillRect(w - t, 0, t, h);
  return c;
}

/** Lomo «Nuevo álbum»: hueco disponible con contorno dorado discontinuo, «+» en un círculo y el texto en vertical. Fondo transparente. */
export function dibujarLomoNuevo(ancho = 160) {
  const { w, h } = tamLomo(ancho), c = lienzo(w, h), ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(232,201,140,.85)'; ctx.lineWidth = w * 0.03; ctx.setLineDash([w * 0.12, w * 0.08]);
  ctx.beginPath(); ctx.roundRect(w * 0.08, w * 0.08, w * 0.84, h - w * 0.16, w * 0.16); ctx.stroke();
  ctx.setLineDash([]);
  const cy = h * 0.2, r = w * 0.27;
  ctx.fillStyle = 'rgba(232,201,140,.14)'; ctx.beginPath(); ctx.arc(w / 2, cy, r, 0, 2 * Math.PI); ctx.fill();
  ctx.lineWidth = w * 0.035; ctx.strokeStyle = 'rgba(240,217,162,.95)'; ctx.stroke();
  ctx.lineWidth = w * 0.05; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(w / 2 - r * 0.5, cy); ctx.lineTo(w / 2 + r * 0.5, cy); ctx.moveTo(w / 2, cy - r * 0.5); ctx.lineTo(w / 2, cy + r * 0.5); ctx.stroke();
  ctx.save(); ctx.fillStyle = 'rgba(240,217,162,.92)';
  textoVertical(ctx, 'NUEVO ÁLBUM', w / 2, h * 0.6, w * 0.25, w * 0.06, SANS, h * 0.55);
  ctx.restore();
  return c;
}
