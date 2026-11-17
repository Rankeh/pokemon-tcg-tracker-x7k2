// 3.13 · «Añadir todas las cartas» del álbum abierto: marca con 1 copia las cartas que faltan (las que ya tienes no cambian).
// Usa Almacen.importar(…, 'combinar'), que guarda antes una foto de la colección: así se puede DESHACER. El deshacer solo se ofrece
// hasta el siguiente cambio a mano (volver a la foto pisaría ese cambio).

/** PURO · ids del catálogo con 0 copias. `cantidadDe(id)` → número de copias guardadas. */
export const cartasPendientes = (cartas, cantidadDe) => cartas.filter((c) => !(cantidadDe(c.id) > 0)).map((c) => c.id);

/** PURO · copias a «combinar» para completar: 1 de cada pendiente (combinar se queda con la cantidad mayor: lo que ya tienes no baja). */
export const copiasParaCompletar = (ids) => new Map(ids.map((id) => [id, 1]));

/** PURO · texto de confirmación. */
export function textoConfirmacion(nombreAlbum, pendientes, total) {
  if (pendientes === 0) return `Ya tienes todas las cartas de ${nombreAlbum}.`;
  const cartas = pendientes === 1 ? '1 carta' : `${pendientes} cartas`;
  const cuales = pendientes === total ? `las ${cartas} del álbum` : (pendientes === 1 ? `la carta que te falta de ${total}` : `las ${cartas} que te faltan de ${total}`);
  return `Se marcarán como conseguidas (1 copia) ${cuales}. Las que ya tienes no cambian. Podrás deshacerlo desde este menú hasta tu próximo cambio.`;
}

/**
 * Menú «⋯» del álbum (DOM). `acciones` = { pendientes(): string[], total: number, nombre, completar(ids): Promise, deshacer(): Promise,
 * soloLectura: boolean, avisar(t) }. Devuelve { invalidarDeshacer() } para llamarlo tras cualquier cambio a mano.
 */
export function montarMenu(el, acciones) {
  const { boton, menu, todas, deshacer, dialogo, texto, aceptar, cancelar } = el;
  let puedeDeshacer = false, ocupado = false;
  const abrir = (si) => {
    menu.hidden = !si; boton.setAttribute('aria-expanded', String(si));
    if (si) {
      const n = acciones.pendientes().length;
      todas.disabled = acciones.soloLectura || n === 0;
      todas.textContent = n === 0 ? 'Ya tienes todas las cartas' : `Añadir todas las cartas (faltan ${n})`;
      deshacer.hidden = !puedeDeshacer;
      (todas.disabled ? boton : todas).focus();
    }
  };
  boton.addEventListener('click', (e) => { e.stopPropagation(); abrir(menu.hidden); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) abrir(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { abrir(false); boton.focus(); } });

  todas.addEventListener('click', () => {
    abrir(false);
    const n = acciones.pendientes().length;
    texto.textContent = textoConfirmacion(acciones.nombre, n, acciones.total);
    aceptar.textContent = n === 1 ? 'Añadir 1 carta' : `Añadir ${n} cartas`;
    aceptar.disabled = n === 0;
    if (dialogo.showModal) dialogo.showModal(); else dialogo.setAttribute('open', '');
    cancelar.focus();
  });
  cancelar.addEventListener('click', () => dialogo.close());
  aceptar.addEventListener('click', async () => {
    if (ocupado) return;
    ocupado = true; aceptar.disabled = true;
    const ids = acciones.pendientes();
    try {
      await acciones.completar(ids);
      puedeDeshacer = ids.length > 0;
      dialogo.close();
      acciones.avisar(`${ids.length === 1 ? '1 carta añadida' : ids.length + ' cartas añadidas'}. Puedes deshacerlo desde ⋯.`);
    } catch (e) {
      dialogo.close();
      acciones.avisar('No se pudo guardar: ' + (e && e.message || e) + '. Tu colección no ha cambiado.');
    } finally { ocupado = false; }
  });
  deshacer.addEventListener('click', async () => {
    abrir(false);
    if (!puedeDeshacer || ocupado) return;
    ocupado = true;
    try { await acciones.deshacer(); puedeDeshacer = false; acciones.avisar('Deshecho: la colección vuelve a como estaba.'); }
    catch (e) { acciones.avisar('No se pudo deshacer: ' + (e && e.message || e)); }
    finally { ocupado = false; }
  });
  return { invalidarDeshacer: () => { puedeDeshacer = false; } };
}
