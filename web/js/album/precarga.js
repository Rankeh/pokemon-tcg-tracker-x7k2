// Utilidades para que una animación no empiece con la imagen a medio decodificar.

/** Espera a que las imágenes de `elemento` estén listas (máximo `limiteMs`, nunca falla). */
export async function esperarImagenes(elemento, limiteMs = 700) {
  const imagenes = [...elemento.querySelectorAll("img")];
  if (imagenes.length === 0) return;
  const listas = Promise.all(imagenes.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())));
  await Promise.race([listas, new Promise((r) => setTimeout(r, limiteMs))]);
}
