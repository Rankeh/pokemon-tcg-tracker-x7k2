// 3.43 · «Usar mi imagen»: convierte una foto, captura o imagen pegada en la imagen de una carta (JPEG reducido, ~60 KB), lista para
// guardarse en el dispositivo y en la cuenta. No recorta: conserva la proporción (las cartas ya son verticales) y como mucho 500×700.
export const MAX = { ancho: 500, alto: 700 };
export const CALIDAD = 0.85;

/** PURO · tamaño final conservando la proporción, sin agrandar nunca. */
export function tamanoFinal(w, h, max = MAX) {
  const k = Math.min(1, max.ancho / w, max.alto / h);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Blob o File de imagen → data URL JPEG reducido. Lanza si no es una imagen que el navegador sepa abrir. */
export async function prepararImagen(archivo) {
  if (!archivo || !/^image\//.test(archivo.type || "")) throw new Error("Eso no es una imagen.");
  if (archivo.size > 25 * 1048576) throw new Error("La imagen es demasiado grande (más de 25 MB).");
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error("No se pudo abrir la imagen.")); i.src = url; });
    const { w, h } = tamanoFinal(img.naturalWidth, img.naturalHeight);
    const lienzo = Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = lienzo.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);                 // sin transparencias (JPEG)
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    return lienzo.toDataURL("image/jpeg", CALIDAD);
  } finally { URL.revokeObjectURL(url); }
}

/** La primera imagen de un evento «pegar» (Ctrl+V / Cmd+V), o null. */
export function imagenPegada(evento) {
  for (const it of evento.clipboardData?.items || []) if (it.kind === "file" && /^image\//.test(it.type)) return it.getAsFile();
  return null;
}
