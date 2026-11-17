// Lomo y tapas del álbum Teselia tal como se ven en la biblioteca (Canvas 2D), dirección editorial: negro mate, sello rojo «TCG», título en
// grotesca fina. Se generan tres capas a la vez (color, altura → relieve, metal/rugosidad). La tapa delantera reproduce la del álbum 3D
// (misma portada y banda de portada-tapa.js sobre la misma tela negra).
import { LIBRO } from './disposicion.js';
import { dibujarPortada, dibujarBanda } from '../../prueba-3d/js/portada-tapa.js';

const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "Segoe UI", Inter, Roboto, system-ui, sans-serif';
const ROJO = '#e5432f';                                   // acento editorial (el mismo de la interfaz)
export const COLORES = { tejido: '#161616', papel: '#f2f2f2' };     // tela negra de las tapas (la del álbum en el tema editorial)
// metal/rugosidad: G = rugosidad, B = metal (convención de Three para roughnessMap/metalnessMap)

const lienzo = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/** PURO · tamaño del lienzo del lomo para `ancho` px (misma proporción que el lomo real). */
export const tamLomo = (ancho = 160) => ({ w: ancho, h: Math.round(ancho * LIBRO.alto / LIBRO.grueso) });

/** Ejecuta `fn(ctx, estilo)` en las tres capas; `estilo` = { color, alto, mr } (cualquiera puede omitirse). */
function capas(L, fn, estilo) {
  for (const k of ['color', 'alto', 'mr']) if (estilo[k] != null) { const ctx = L[k]; ctx.save(); fn(ctx, estilo[k]); ctx.restore(); }
}

/** Texto en vertical centrado en (cx, cy). Si no cabe en `largo` px, reduce el cuerpo hasta que quepa. */
function textoVertical(ctx, texto, cx, cy, tam, espacio, fuente, largo = Infinity) {
  ctx.translate(cx, cy); ctx.rotate(Math.PI / 2);                 // se lee de arriba abajo (con el libro tumbado con la portada hacia arriba, queda derecho)
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const letras = [...texto];
  let anchos, total;
  for (let i = 0; i < 12; i++) {
    ctx.font = /^\d/.test(fuente) ? `${fuente.split(' ')[0]} ${tam}px ${fuente.slice(fuente.indexOf(' ') + 1)}` : `${tam}px ${fuente}`;
    anchos = letras.map((c) => ctx.measureText(c).width);
    total = anchos.reduce((a, b) => a + b, 0) + espacio * (letras.length - 1);
    if (total <= largo) break;
    const f = largo / total; tam *= f; espacio *= f;
  }
  let x = -total / 2;
  letras.forEach((c, i) => { ctx.fillText(c, x, 0); x += anchos[i] + espacio; });
}

/** Lomo Teselia, dirección editorial (como el lomo de una edición de coleccionista): negro mate con grano, sello rojo «TCG» arriba,
 *  título en vertical en grotesca fina, subtítulo rojo en paralelo y, abajo, la marca marfil/negro de Teselia y los datos.
 *  Devuelve { color, alto, mr } (lienzos w×h): el relieve hunde un poco el título y el sello; nada es metálico. */
/** Datos del lomo de Teselia (por defecto). Cada álbum trae los suyos en el registro (albumes.js → lomo). */
export const LOMO_TESELIA = { titulo: 'TESELIA', subtitulo: 'LLAMA BLANCA · FULGOR NEGRO', codigo: 'SV10.5', cifra: '158', marca: 'teselia' };

export function dibujarLomoEditorial(ancho = 160, d = LOMO_TESELIA) {
  const { w, h } = tamLomo(ancho);
  const C = { color: lienzo(w, h), alto: lienzo(w, h), mr: lienzo(w, h) };
  const L = { color: C.color.getContext('2d'), alto: C.alto.getContext('2d'), mr: C.mr.getContext('2d') };
  const g = L.color.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#171717'); g.addColorStop(1, '#0e0e0e');
  L.color.fillStyle = g; L.color.fillRect(0, 0, w, h);
  L.alto.fillStyle = '#808080'; L.alto.fillRect(0, 0, w, h);
  L.mr.fillStyle = 'rgb(0,170,0)'; L.mr.fillRect(0, 0, w, h);                      // mate, sin metal

  // sello rojo arriba (la «editorial» de la colección)
  const lado = w * 0.7, x0 = (w - lado) / 2, y0 = w * 0.18;
  capas(L, (ctx, s) => { ctx.fillStyle = s; ctx.fillRect(x0, y0, lado, lado); }, { color: ROJO, alto: '#9a9a9a', mr: 'rgb(0,120,0)' });
  L.color.fillStyle = '#ffffff'; L.color.font = `800 ${lado * 0.34}px ${SANS}`; L.color.textAlign = 'center'; L.color.textBaseline = 'middle';
  L.color.fillText('TCG', w / 2, y0 + lado * 0.54);
  L.color.fillStyle = 'rgba(242,242,242,.25)'; L.color.fillRect(w * 0.15, y0 + lado + w * 0.22, w * 0.7, Math.max(1, w * 0.012));

  // título y subtítulo en vertical (de arriba abajo, como en los lomos de cine)
  const y1 = y0 + lado + w * 0.4, y2 = h * 0.78;
  capas(L, (ctx, s) => { ctx.fillStyle = s; textoVertical(ctx, d.titulo, w * 0.42, (y1 + y2) / 2, w * 0.4, w * 0.14, `300 ${SANS}`, (y2 - y1) * 0.92); }, { color: '#f2f2f2', alto: '#6a6a6a' });
  L.color.save(); L.color.fillStyle = ROJO;
  textoVertical(L.color, d.subtitulo, w * 0.8, (y1 + y2) / 2, w * 0.12, w * 0.035, `600 ${SANS}`, (y2 - y1) * 0.92);
  L.color.restore();

  // pie: marca marfil/negro de Teselia, código y número de cartas
  const m = w * 0.46, ym = h * 0.83;
  if (d.marca === 'paleta') {                                       // artista: tres tonos de acuarela suave
    (Array.isArray(d.colores) && d.colores.length === 3 ? d.colores : ['#f4c7c3', '#c9e4d6', '#c9d8f2']).forEach((c, i) => { L.color.fillStyle = c; L.color.fillRect((w - m) / 2, ym + (i * m) / 3, m, m / 3 + 0.5); });
  } else {                                                          // Teselia: mitad marfil (Llama Blanca), mitad negra (Fulgor Negro)
    L.color.fillStyle = '#e9e4da'; L.color.fillRect((w - m) / 2, ym, m / 2, m);
    L.color.fillStyle = '#2b2b2b'; L.color.fillRect(w / 2, ym, m / 2, m);
  }
  L.color.strokeStyle = 'rgba(242,242,242,.35)'; L.color.lineWidth = Math.max(1, w * 0.01); L.color.strokeRect((w - m) / 2, ym, m, m);
  L.color.textAlign = 'center'; L.color.textBaseline = 'alphabetic';
  L.color.fillStyle = ROJO; L.color.font = `600 ${Math.min(w * 0.12, (w * 0.86) / Math.max(1, d.codigo.length * 0.68))}px ${SANS}`; L.color.fillText(d.codigo, w / 2, h * 0.925);
  L.color.fillStyle = '#f2f2f2'; L.color.font = `300 ${w * 0.2}px ${SANS}`; L.color.fillText(d.cifra, w / 2, h * 0.968);

  // grano de impresión y cantos algo más oscuros (el lomo redondeado)
  let sem = 11; const azar = () => { sem = (sem * 16807) % 2147483647; return sem / 2147483647; };
  for (let i = 0; i < w * h / 70; i++) { L.color.fillStyle = azar() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.08)'; L.color.fillRect(azar() * w, azar() * h, 1.3, 1.3); }
  const v = L.color.createLinearGradient(0, 0, w, 0);
  v.addColorStop(0, 'rgba(0,0,0,.45)'); v.addColorStop(0.16, 'rgba(0,0,0,0)'); v.addColorStop(0.84, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)');
  L.color.fillStyle = v; L.color.fillRect(0, 0, w, h);
  return C;
}

/** Tapa delantera (cara +x del libro de pie): tejido azul del álbum con la banda y la lámina de portada en sus sitios reales.
 *  u = 0 junto al lomo; la parte de arriba del lienzo es la parte de arriba del libro. `cartas` = { blanca, negra } (opcional). */
export function dibujarTapa(cartas = {}, ancho = 512, diseno = undefined) {
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
  sub(0.012, 0.046, 0.003, (k, w, h) => dibujarBanda(k, w, h, diseno));
  sub(0.055, 0.244, 0.004, (k, w, h) => dibujarPortada(k, w, h, cartas, diseno));
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

/** Lomo «Nuevo álbum» (editorial): negro mate, contorno fino discontinuo, «+» rojo y el texto en vertical. */
export function dibujarLomoNuevo(ancho = 160) {
  const { w, h } = tamLomo(ancho), c = lienzo(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = w * 0.025; ctx.setLineDash([w * 0.1, w * 0.08]);
  ctx.strokeRect(w * 0.12, w * 0.12, w * 0.76, h - w * 0.24);
  ctx.setLineDash([]);
  const cy = h * 0.16, r = w * 0.22;
  ctx.fillStyle = ROJO; ctx.beginPath(); ctx.arc(w / 2, cy, r, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = w * 0.05; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(w / 2 - r * 0.5, cy); ctx.lineTo(w / 2 + r * 0.5, cy); ctx.moveTo(w / 2, cy - r * 0.5); ctx.lineTo(w / 2, cy + r * 0.5); ctx.stroke();
  ctx.save(); ctx.fillStyle = '#f2f2f2';
  textoVertical(ctx, 'NUEVO ÁLBUM', w / 2, h * 0.58, w * 0.24, w * 0.08, SANS, h * 0.6);
  ctx.restore();
  return c;
}

/** Portada del «Nuevo álbum» (se ve cuando queda seleccionado): negro, contorno discontinuo y un «+» grande. u = 0 junto al lomo. */
export function dibujarTapaNueva(ancho = 640) {
  const W = ancho, H = Math.round(ancho * LIBRO.alto / LIBRO.fondo), c = lienzo(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#161616'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0f0f0f'; ctx.fillRect(0, 0, W * 0.06, H);                    // lomo a la izquierda
  ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = W * 0.006; ctx.setLineDash([W * 0.03, W * 0.02]);
  ctx.strokeRect(W * 0.12, W * 0.06, W * 0.82, H - W * 0.12);
  ctx.setLineDash([]);
  const cx = W * 0.53, cy = H * 0.44, r = W * 0.13;
  ctx.strokeStyle = ROJO; ctx.lineWidth = W * 0.018; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
  ctx.fillStyle = '#f2f2f2'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `300 ${W * 0.08}px ${SANS}`; ctx.fillText('Nuevo álbum', cx, H * 0.66);
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = `600 ${W * 0.032}px ${SANS}`;
  const t = 'PRÓXIMAMENTE'; ctx.fillText([...t].join('\u2009'), cx, H * 0.72);
  return c;
}
