// Escena cinematográfica (prueba visual aislada). NO contiene lógica de colección: solo coloca elementos
// de la interfaz dentro de la escena 3D y gestiona el panel de ajustes. Mover un nodo del DOM conserva sus
// listeners, así que los botones siguen conectados a js/album-prototipo.js sin tocarlo.

const escena = document.getElementById("escena");
const hijoDeBody = (selector) => document.querySelector(`body > ${selector}`);

function montar() {
  const mesa = escena.querySelector(".mesa");
  const album = escena.querySelector(".album");
  if (!mesa || !album) return false;
  // Dentro del álbum: comparten su perspectiva 3D (pestañas entre las hojas, ficha prendida con un clip).
  album.append(hijoDeBody(".pestanas"), hijoDeBody(".ficha-clip"));
  // Sobre la mesa: flechas, placa de página y ajustes.
  mesa.append(hijoDeBody(".flecha-izq"), hijoDeBody(".flecha-der"), hijoDeBody(".placa-pagina"), hijoDeBody(".ajustes"));
  return true;
}

if (!montar()) {
  new MutationObserver((_, observador) => { if (montar()) observador.disconnect(); })
    .observe(escena, { childList: true, subtree: true });
}

// Ajustes ocultos: se abren con el botón "⋯" y se cierran con Esc, al tocar fuera o con el mismo botón.
document.addEventListener("click", (e) => {
  const caja = document.querySelector(".ajustes");
  const boton = caja?.querySelector(".ajustes-boton");
  const tarjeta = caja?.querySelector(".ajustes-tarjeta");
  if (!caja) return;
  if (e.target.closest(".ajustes-boton")) { alternar(boton, tarjeta, tarjeta.hidden); return; }
  if (!e.target.closest(".ajustes-tarjeta")) alternar(boton, tarjeta, false);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const caja = document.querySelector(".ajustes");
  if (caja) alternar(caja.querySelector(".ajustes-boton"), caja.querySelector(".ajustes-tarjeta"), false);
});
function alternar(boton, tarjeta, abrir) {
  tarjeta.hidden = !abrir;
  boton.setAttribute("aria-expanded", String(abrir));
}
