// Imagen de una carta con sustituto visual: nunca se muestra un enlace roto ni un icono de imagen rota.

/** ¿Merece la pena intentar cargar la imagen? (el catálogo ya dice si la URL se comprobó) */
export function tieneImagenUsable(carta) {
  return Boolean(carta.imagen) && carta.estadoImagen !== "sin-imagen";
}

/**
 * Devuelve un <div class="carta-imagen"> que SIEMPRE muestra algo:
 *  - el sustituto (nombre, número y "Sin imagen") mientras carga o si no hay imagen;
 *  - la foto real solo cuando el navegador la ha cargado bien (evento load).
 * Si la carga falla (error) la foto se elimina y se queda el sustituto.
 *
 * opciones (todas opcionales, la Fase 2 no las usa):
 *  - calidad: "low" pide la miniatura de TCGdex (…/low.webp) y, si no existe, reintenta con la original.
 *  - estado: texto del estado que se muestra en el sustituto (por defecto "Sin imagen").
 *  - mostrarId: añade el identificador TCGdex al sustituto.
 */
export function crearImagenCarta(carta, documento = document, opciones = {}) {
  const caja = documento.createElement("div");
  caja.className = "carta-imagen";

  const sustituto = documento.createElement("div");
  sustituto.className = "carta-sustituto";
  sustituto.setAttribute("role", "img");
  sustituto.setAttribute("aria-label", `${carta.nombre} ${carta.numero}: sin imagen disponible`);
  const nombre = documento.createElement("strong");
  nombre.textContent = carta.nombre ?? "";
  const numero = documento.createElement("span");
  numero.textContent = `${carta.numero ?? ""} · ${carta.expansion ?? ""}`;
  const aviso = documento.createElement("em");
  aviso.textContent = opciones.estado ?? "Sin imagen";
  sustituto.append(nombre, numero);
  if (opciones.mostrarId) {
    const id = documento.createElement("small");
    id.textContent = carta.id ?? "";
    sustituto.append(id);
  }
  sustituto.append(aviso);
  caja.append(sustituto);

  if (tieneImagenUsable(carta)) {
    const foto = documento.createElement("img");
    foto.alt = `${carta.nombre} ${carta.numero}`;
    foto.loading = "lazy";
    foto.decoding = "async";
    // Transparente hasta que cargue: así nunca se ve el icono de imagen rota. Importante: NO usar
    // `hidden`/display:none, porque el navegador no descarga las imágenes perezosas que no se ven.
    foto.className = "foto-oculta";
    foto.addEventListener("load", () => {
      foto.classList.remove("foto-oculta");
      sustituto.hidden = true;
      caja.dataset.imagen = "cargada";
    });
    const urlInicial = opciones.calidad === "low" ? carta.imagen.replace(/\/high\.webp$/, "/low.webp") : carta.imagen;
    foto.addEventListener("error", () => {
      if (foto.src !== carta.imagen && urlInicial !== carta.imagen && !foto.dataset.reintento) {
        foto.dataset.reintento = "1"; // la miniatura no existe: se prueba con la imagen original
        foto.src = carta.imagen;
        return;
      }
      foto.remove();
      caja.dataset.imagen = "fallida";
    });
    foto.src = urlInicial;
    caja.append(foto);
    caja.dataset.imagen = "cargando";
  } else {
    caja.dataset.imagen = "sin-imagen";
  }
  return caja;
}
