// Utilidades de textura de la estantería (Canvas 2D): sombra de contacto y relieve → mapa de normales.
// (Las texturas pintadas del tema diorama están en web/diorama/pintura.js.)

const lienzo = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

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
