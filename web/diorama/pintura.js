// Estilo «diorama pintado»: texturas hechas con pinceladas (Canvas 2D), compartidas por la estantería y el álbum.
// Nada de fotos ni imágenes externas: colores planos y saturados, toques de pincel suaves y degradados de luz, como una ilustración a gouache.
// Determinista (semilla fija): la escena sale igual en cada carga.

/** Paleta común de toda la app (UI y 3D beben de aquí y de diorama.css). */
export const PALETA = {
  cielo: ['#4fb0ec', '#7cc6f2', '#b9e3fa', '#e3f4fd'],
  nube: '#ffffff',
  hierba: ['#7cc65e', '#5fae4c', '#4c9a43', '#9fd873', '#6dbb57'],
  hierbaSombra: '#3f8a3f',
  arena: ['#f2d79f', '#e8c588', '#f7e4b8'],
  tierra: ['#b8703f', '#a35f35', '#c9844c', '#8f4f2c'],
  tierraHonda: '#7a4226',
  agua: ['#5cc0ea', '#3a9ad6', '#2b7fc2', '#8fd6f2'],
  algas: ['#3fa07a', '#2f8a6a', '#5bb88a'],
  madera: ['#b97a40', '#a86a35', '#c98a4f', '#94592c'],
  maderaOscura: ['#8f5a31', '#7a4b28', '#a06838'],
  copa: ['#5fb055', '#4a9a48', '#7cc666', '#3d8840', '#9bd57a'],
  tronco: ['#8a5a36', '#74482a'],
  papel: '#fbf6ea',
  tinta: '#3b2a1a',
};

/** Generador pseudoaleatorio con semilla (mulberry32). */
export function azar(semilla = 1) {
  let a = semilla >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const lienzo = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/**
 * Pinceladas: `n` toques alargados (elipses redondeadas) con colores de `paleta`, dentro del rectángulo `zona`.
 * `largo`/`grosor` en px, `angulo` en radianes (± `desvio`), `alfa` [mín, máx].
 */
export function pinceladas(ctx, zona, paleta, { n = 200, largo = 18, grosor = 6, angulo = 0, desvio = 0.25, alfa = [0.25, 0.6], semilla = 1 } = {}) {
  const r = azar(semilla);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = zona.x + r() * zona.w, y = zona.y + r() * zona.h, l = largo * (0.6 + r() * 0.8), g = grosor * (0.6 + r() * 0.7);
    ctx.globalAlpha = alfa[0] + r() * (alfa[1] - alfa[0]);
    ctx.fillStyle = paleta[Math.floor(r() * paleta.length)];
    ctx.translate(x, y); ctx.rotate(angulo + (r() - 0.5) * 2 * desvio);
    ctx.beginPath(); ctx.ellipse(0, 0, l / 2, g / 2, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.restore();
}

/** Superficie pintada de un color base con pinceladas encima (para madera, hierba, tierra…). */
export function superficie(w, h, base, paleta, opciones = {}) {
  const c = lienzo(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  pinceladas(ctx, { x: -20, y: -20, w: w + 40, h: h + 40 }, paleta, opciones);
  return c;
}

/** Hierba vista desde arriba: base verde, toques cortos en todas direcciones y algunos brillos. */
export function texturaHierba(tam = 256, semilla = 3) {
  const c = superficie(tam, tam, PALETA.hierba[0], PALETA.hierba, { n: tam * 3, largo: tam * 0.07, grosor: tam * 0.025, desvio: Math.PI, alfa: [0.3, 0.7], semilla });
  pinceladas(c.getContext('2d'), { x: 0, y: 0, w: tam, h: tam }, ['#b7e48a', '#d4f0a0'], { n: tam / 3, largo: tam * 0.04, grosor: tam * 0.012, desvio: Math.PI, alfa: [0.4, 0.8], semilla: semilla + 9 });
  return c;
}

/**
 * Corte del terreno (cara lateral de la isla): borde de arena arriba, capas de tierra con toques horizontales y fondo más oscuro.
 * `arriba` = fracción de la altura que ocupa el canto de hierba/arena.
 */
export function texturaCorteTierra(w = 512, h = 256, semilla = 5, arriba = 0.16) {
  const c = lienzo(w, h), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, PALETA.tierra[2]); g.addColorStop(0.55, PALETA.tierra[0]); g.addColorStop(1, PALETA.tierraHonda);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  pinceladas(ctx, { x: -20, y: h * arriba, w: w + 40, h: h * (1 - arriba) }, PALETA.tierra, { n: w * 1.2, largo: w * 0.06, grosor: h * 0.03, desvio: 0.12, alfa: [0.25, 0.55], semilla });
  // piedrecitas
  const r = azar(semilla + 3);
  for (let i = 0; i < w / 18; i++) {
    ctx.globalAlpha = 0.5; ctx.fillStyle = r() < 0.5 ? '#d9a473' : '#7d4a2c';
    ctx.beginPath(); ctx.ellipse(r() * w, h * (arriba + 0.1 + r() * 0.8), 2 + r() * 5, 1.5 + r() * 3, 0, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // canto superior: hierba que asoma y franja de arena
  ctx.fillStyle = PALETA.hierba[1]; ctx.fillRect(0, 0, w, h * arriba * 0.55);
  pinceladas(ctx, { x: 0, y: 0, w, h: h * arriba * 0.55 }, PALETA.hierba, { n: w / 2, largo: h * 0.05, grosor: h * 0.015, angulo: Math.PI / 2, desvio: 0.4, semilla: semilla + 1 });
  ctx.fillStyle = PALETA.arena[0]; ctx.fillRect(0, h * arriba * 0.55, w, h * arriba * 0.45);
  pinceladas(ctx, { x: 0, y: h * arriba * 0.55, w, h: h * arriba * 0.45 }, PALETA.arena, { n: w / 2, largo: w * 0.04, grosor: h * 0.012, desvio: 0.1, semilla: semilla + 2 });
  // flecos de hierba que cuelgan sobre la arena
  for (let x = 0; x < w; x += 3 + r() * 6) {
    ctx.fillStyle = PALETA.hierba[Math.floor(r() * 3)];
    ctx.beginPath(); ctx.moveTo(x, h * arriba * 0.5); ctx.lineTo(x + 3, h * arriba * (0.62 + r() * 0.25)); ctx.lineTo(x + 6, h * arriba * 0.5); ctx.fill();
  }
  return c;
}

/** Corte del agua: degradado azul, vetas de luz y algas al fondo. Pensada para un material algo transparente. */
export function texturaCorteAgua(w = 512, h = 256, semilla = 7) {
  const c = lienzo(w, h), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#6fcaf0'); g.addColorStop(0.1, '#3aa3e0'); g.addColorStop(0.55, '#2181c9'); g.addColorStop(1, '#155f9e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  pinceladas(ctx, { x: 0, y: h * 0.1, w, h: h * 0.7 }, ['#a6e2f7', '#ffffff', '#6ccaf0'], { n: w / 3, largo: w * 0.08, grosor: h * 0.012, desvio: 0.08, alfa: [0.12, 0.35], semilla });
  const r = azar(semilla + 1);
  for (let i = 0; i < w / 14; i++) {                                     // algas
    const x = r() * w, alto = h * (0.15 + r() * 0.35);
    ctx.strokeStyle = PALETA.algas[Math.floor(r() * 3)]; ctx.lineWidth = 3 + r() * 4; ctx.lineCap = 'round'; ctx.globalAlpha = 0.75;
    ctx.beginPath(); ctx.moveTo(x, h); ctx.quadraticCurveTo(x + (r() - 0.5) * 30, h - alto * 0.5, x + (r() - 0.5) * 20, h - alto); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(0, 0, w, Math.max(2, h * 0.015));          // línea de la superficie
  return c;
}

/** Superficie del agua vista desde arriba: azul con reflejos claros. */
export function texturaSuperficieAgua(tam = 256, semilla = 11) {
  const c = superficie(tam, tam, PALETA.agua[0], ['#8fd6f2', '#4aa9df', '#b8ecfb'], { n: tam * 1.5, largo: tam * 0.12, grosor: tam * 0.015, desvio: 0.15, alfa: [0.2, 0.5], semilla });
  pinceladas(c.getContext('2d'), { x: 0, y: 0, w: tam, h: tam }, ['#ffffff'], { n: tam / 6, largo: tam * 0.06, grosor: tam * 0.008, desvio: 0.1, alfa: [0.35, 0.7], semilla: semilla + 2 });
  return c;
}

/** Copa de árbol: arriba más clara (le da el sol), abajo en sombra; toques redondeados. Se aplica a esferas achatadas. */
export function texturaCopa(tam = 256, semilla = 13) {
  const c = lienzo(tam, tam), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, tam);
  g.addColorStop(0, '#a6dc7e'); g.addColorStop(0.45, PALETA.copa[0]); g.addColorStop(1, PALETA.copa[3]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, tam, tam);
  pinceladas(ctx, { x: 0, y: 0, w: tam, h: tam * 0.6 }, ['#9bd57a', '#b9e58f', '#7cc666'], { n: tam * 1.2, largo: tam * 0.08, grosor: tam * 0.05, desvio: Math.PI, alfa: [0.3, 0.6], semilla });
  pinceladas(ctx, { x: 0, y: tam * 0.4, w: tam, h: tam * 0.6 }, ['#3d8840', '#4a9a48', '#2f7238'], { n: tam, largo: tam * 0.08, grosor: tam * 0.05, desvio: Math.PI, alfa: [0.3, 0.6], semilla: semilla + 1 });
  return c;
}

/** Madera de juguete (miel) con veta pintada a lo largo. */
export function texturaMadera(w = 512, h = 512, semilla = 17, oscura = false) {
  const p = oscura ? PALETA.maderaOscura : PALETA.madera;
  const c = superficie(w, h, p[0], p, { n: w * 1.4, largo: w * 0.18, grosor: h * 0.012, desvio: 0.03, alfa: [0.25, 0.55], semilla });
  pinceladas(c.getContext('2d'), { x: 0, y: 0, w, h }, oscura ? ['#5f3a1f'] : ['#9c6234', '#8f5a2f'], { n: w / 4, largo: w * 0.25, grosor: h * 0.004, desvio: 0.02, alfa: [0.25, 0.45], semilla: semilla + 1 });
  return c;
}

/**
 * Fondo en arco (como un diorama recortado): cielo pintado con nubes, colinas y árboles lejanos. Fuera del arco, transparente.
 * `suelo` = fracción de abajo que queda tapada por la isla (ahí se pintan las copas lejanas).
 */
export function texturaFondoArco(w = 1024, h = 1024, semilla = 21, suelo = 0.18) {
  const c = lienzo(w, h), ctx = c.getContext('2d'), r = azar(semilla), radio = w / 2;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, radio); ctx.arc(w / 2, radio, radio, Math.PI, 0); ctx.lineTo(w, h); ctx.closePath(); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, PALETA.cielo[0]); g.addColorStop(0.45, PALETA.cielo[1]); g.addColorStop(0.75, PALETA.cielo[2]); g.addColorStop(1, PALETA.cielo[3]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  pinceladas(ctx, { x: 0, y: 0, w, h: h * 0.7 }, ['#5fb8ee', '#8ccdf4', '#3fa6e6'], { n: 240, largo: w * 0.12, grosor: h * 0.02, desvio: 0.15, alfa: [0.15, 0.35], semilla });
  // nubes: grupos de bolas blancas con la base algo azulada
  for (let i = 0; i < 6; i++) {
    const cx = r() * w, cy = h * (0.12 + r() * 0.4), s = w * (0.05 + r() * 0.06);
    for (let k = 0; k < 7; k++) {
      ctx.globalAlpha = 0.85; ctx.fillStyle = k < 2 ? '#dff1fc' : '#ffffff';
      ctx.beginPath(); ctx.ellipse(cx + (r() - 0.5) * s * 3, cy + (r() - 0.6) * s * 0.8, s * (0.6 + r() * 0.6), s * (0.45 + r() * 0.4), 0, 0, 2 * Math.PI); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // colinas lejanas (azul verdoso, perspectiva atmosférica) y copas de árboles más cerca
  const colinas = (y0, color, amp, n) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, h);
    for (let i = 0; i <= n; i++) { const x = (i / n) * w; ctx.lineTo(x, y0 - Math.abs(Math.sin(i * 1.7 + semilla)) * amp - r() * amp * 0.3); }
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  };
  colinas(h * (1 - suelo - 0.16), '#9fd0c9', h * 0.05, 12);
  colinas(h * (1 - suelo - 0.1), '#7cbf9a', h * 0.05, 16);
  for (let i = 0; i < 26; i++) {                                         // copas redondas, pintadas
    const x = (i / 25) * w + (r() - 0.5) * 30, y = h * (1 - suelo - 0.04) - r() * h * 0.08, s = w * (0.04 + r() * 0.04);
    ctx.fillStyle = ['#4f9f57', '#5fae5c', '#3f8a4b'][i % 3];
    ctx.beginPath(); ctx.ellipse(x, y, s, s * 1.15, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = 'rgba(170,225,140,.55)'; ctx.beginPath(); ctx.ellipse(x - s * 0.3, y - s * 0.4, s * 0.45, s * 0.35, -0.5, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.fillStyle = '#4c9a4e'; ctx.fillRect(0, h * (1 - suelo - 0.02), w, h);
  ctx.restore();
  return c;
}
