// Texturas generadas por código (Canvas 2D) para la estantería: madera de nogal, fondo de cada hueco con luz cálida horneada,
// sombra de contacto y utilidades (relieve → mapa de normales). Sin imágenes externas: funciona igual en GitHub Pages y sin conexión.

export const NOGAL = { base: [74, 44, 26], oscuro: [38, 22, 13], claro: [112, 72, 44] };

const lienzo = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const mezclar = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function hash2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Ruido de valor 2D periódico (periodo en celdas), suave. */
function ruido(x, y, periodo, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, m = (i) => ((i % periodo) + periodo) % periodo;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(m(x0), m(y0), s), b = hash2(m(x0 + 1), m(y0), s), c = hash2(m(x0), m(y0 + 1), s), d = hash2(m(x0 + 1), m(y0 + 1), s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Nogal oscuro con veta horizontal (mosaico sin costuras). Devuelve { color, alto } (dos lienzos tam×tam). */
export function generarMadera(tam = 512, semilla = 3) {
  const color = lienzo(tam, tam), alto = lienzo(tam, tam);
  const ic = color.getContext('2d').createImageData(tam, tam), ia = alto.getContext('2d').createImageData(tam, tam);
  for (let j = 0; j < tam; j++) for (let i = 0; i < tam; i++) {
    const u = i / tam, v = j / tam;
    const desvio = 2.2 * ruido(u * 3, v * 6, 3, semilla) + 0.6 * ruido(u * 12, v * 24, 12, semilla + 1);   // la veta ondula a lo largo
    const veta = 0.5 + 0.5 * Math.sin((v * 22 + desvio) * Math.PI * 2);
    const fina = ruido(u * 64, v * 256, 64, semilla + 2);                                                   // fibras finas
    const poro = hash2(i, j, semilla + 9) > 0.985 ? 0.55 : 1;
    const t = Math.pow(veta, 2.4) * 0.7 + fina * 0.3;
    const c = mezclar(mezclar(NOGAL.oscuro, NOGAL.base, 0.55 + 0.45 * fina), NOGAL.claro, t * 0.55).map((x) => x * poro);
    const k = (j * tam + i) * 4;
    ic.data[k] = c[0]; ic.data[k + 1] = c[1]; ic.data[k + 2] = c[2]; ic.data[k + 3] = 255;
    const h = 255 * (0.55 * veta + 0.45 * fina) * poro;
    ia.data[k] = ia.data[k + 1] = ia.data[k + 2] = h; ia.data[k + 3] = 255;
  }
  color.getContext('2d').putImageData(ic, 0, 0); alto.getContext('2d').putImageData(ia, 0, 0);
  return { color, alto };
}

/** Fondo de un hueco: tablas verticales oscuras, luz cálida que baja desde la tira LED y oclusión en esquinas y base (luz horneada, sin coste). */
export function generarFondoHueco(w = 512, h = 384) {
  const c = lienzo(w, h), ctx = c.getContext('2d');
  const madera = generarMadera(256, 11).color;
  ctx.save(); ctx.translate(w, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(madera, 0, 0, h, w); ctx.restore();   // veta vertical
  ctx.fillStyle = 'rgba(10,6,3,.42)'; ctx.fillRect(0, 0, w, h);
  for (let x = w / 6; x < w; x += w / 6) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - 1, 0, 2, h); }    // juntas entre tablas
  let g = ctx.createLinearGradient(0, 0, 0, h);                    // luz cálida que cae desde arriba
  g.addColorStop(0, 'rgba(255,196,128,.55)'); g.addColorStop(0.35, 'rgba(255,170,100,.16)'); g.addColorStop(1, 'rgba(255,170,100,0)');
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  g = ctx.createLinearGradient(0, 0, w, 0);                        // oclusión en los laterales
  g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(0.1, 'rgba(0,0,0,0)'); g.addColorStop(0.9, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  g = ctx.createLinearGradient(0, h, 0, h * 0.8);                  // y en la base
  g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  return c;
}

/** Sombra de contacto: rectángulo redondeado muy difuminado (alfa en blanco sobre transparente; se tiñe en el material). */
export function generarSombra(tam = 128) {
  const c = lienzo(tam, tam), ctx = c.getContext('2d');
  ctx.filter = `blur(${tam * 0.09}px)`;
  ctx.fillStyle = '#fff';
  const m = tam * 0.22;
  ctx.beginPath(); ctx.roundRect(m, m, tam - 2 * m, tam - 2 * m, tam * 0.08); ctx.fill();
  ctx.filter = 'none';
  return c;
}

/** Lienzo de alturas (gris) → lienzo de normales tangentes (convención OpenGL de Three, con flipY). */
export function normalDesdeAltura(alto, fuerza = 2) {
  const w = alto.width, h = alto.height, src = alto.getContext('2d').getImageData(0, 0, w, h).data;
  const out = lienzo(w, h), octx = out.getContext('2d'), img = octx.createImageData(w, h), d = img.data;
  const H = (i, j) => src[(((j + h) % h) * w + ((i + w) % w)) * 4] / 255;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (H(i + 1, j) - H(i - 1, j)) * fuerza, dy = (H(i, j + 1) - H(i, j - 1)) * fuerza;    // j crece hacia abajo en el lienzo
    const l = Math.hypot(dx, dy, 1), k = (j * w + i) * 4;
    d[k] = (-dx / l * 0.5 + 0.5) * 255; d[k + 1] = (dy / l * 0.5 + 0.5) * 255; d[k + 2] = (1 / l * 0.5 + 0.5) * 255; d[k + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/** Placa de latón con texto grabado (remate superior del mueble). */
export function generarPlaca(texto, w = 512, h = 96) {
  const c = lienzo(w, h), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#e9cf96'); g.addColorStop(0.45, '#c39a55'); g.addColorStop(1, '#8a6431');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(2, 2, w - 4, h - 4, h * 0.18); ctx.fill();
  ctx.strokeStyle = 'rgba(70,45,15,.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(h * 0.12, h * 0.12, w - h * 0.24, h - h * 0.24, h * 0.1); ctx.stroke();
  ctx.font = `600 ${h * 0.4}px "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const letras = [...texto].join('  ');
  ctx.fillStyle = 'rgba(255,240,205,.55)'; ctx.fillText(letras, w / 2, h / 2 + 1.5);      // bisel claro bajo el grabado
  ctx.fillStyle = 'rgba(62,38,12,.9)'; ctx.fillText(letras, w / 2, h / 2);
  for (const x of [h * 0.3, w - h * 0.3]) {                                                // tornillos
    ctx.beginPath(); ctx.arc(x, h / 2, h * 0.07, 0, 2 * Math.PI); ctx.fillStyle = '#7a5528'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - h * 0.05, h / 2); ctx.lineTo(x + h * 0.05, h / 2); ctx.strokeStyle = '#e6c78a'; ctx.lineWidth = 2; ctx.stroke();
  }
  return c;
}

/** Suelo: degradado radial oscuro que se funde con el fondo (alfa). */
export function generarSuelo(tam = 256) {
  const c = lienzo(tam, tam), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(tam / 2, tam / 2, 0, tam / 2, tam / 2, tam / 2);
  g.addColorStop(0, 'rgba(46,30,20,1)'); g.addColorStop(0.6, 'rgba(30,20,14,.85)'); g.addColorStop(1, 'rgba(20,13,9,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, tam, tam);
  return c;
}
