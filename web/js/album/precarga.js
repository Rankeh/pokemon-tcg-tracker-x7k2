// Utilidades para que una animación no empiece con la imagen a medio decodificar.

/** Espera a que las imágenes de `elemento` estén listas (máximo `limiteMs`, nunca falla). */
export async function esperarImagenes(elemento, limiteMs = 700) {
  const imagenes = [...elemento.querySelectorAll("img")];
  if (imagenes.length === 0) return;
  const listas = Promise.all(imagenes.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())));
  await Promise.race([listas, new Promise((r) => setTimeout(r, limiteMs))]);
}

const yaPedidas = new Set();

/**
 * Pide en segundo plano las miniaturas de unas cartas para que, cuando se gire a esa página,
 * el navegador ya las tenga en caché y la hoja no tenga que esperar a la red.
 * Usa la misma URL que `crearImagenCarta` con calidad "low". Nunca falla ni bloquea.
 */
export function precargarCartas(cartas) {
  for (const carta of cartas) {
    if (!carta?.imagen || carta.estadoImagen === "sin-imagen") continue;
    const url = carta.imagen.replace(/\/high\.webp$/, "/low.webp");
    if (yaPedidas.has(url)) continue;
    yaPedidas.add(url);
    const img = new Image();
    img.decoding = "async";
    img.src = url; // si la miniatura no existe, no pasa nada: la hoja ya sabe reintentar con la original
  }
}
