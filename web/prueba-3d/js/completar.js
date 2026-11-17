// 3.13–3.14 · Acciones en bloque del álbum abierto (menú «⋯»):
//  · «Añadir todas las cartas»: marca con 1 copia las que faltan (las que ya tienes no cambian). Almacen.importar(…, 'combinar').
//  · «Eliminar todas las cartas»: deja a 0 las cartas DEL ÁLBUM; el resto de la colección no se toca. Almacen.importar(…, 'reemplazar')
//    con la colección actual menos las cartas del álbum. Las copias se guardan por carta: si una carta está también en otro álbum,
//    desaparece de los dos (la confirmación lo dice, con el nombre del otro álbum).
// Las dos guardan antes una foto de la colección: «Deshacer» vuelve exactamente a como estaba (cantidades incluidas). El deshacer solo se
// ofrece hasta el siguiente cambio a mano o hasta releer la colección (volver a la foto pisaría esos cambios).

/** PURO · ids del catálogo con 0 copias. `cantidadDe(id)` → número de copias guardadas. */
export const cartasPendientes = (cartas, cantidadDe) => cartas.filter((c) => !(cantidadDe(c.id) > 0)).map((c) => c.id);

/** PURO · ids del catálogo con 1 o más copias. */
export const cartasConseguidas = (cartas, cantidadDe) => cartas.filter((c) => cantidadDe(c.id) > 0).map((c) => c.id);

/** PURO · copias a «combinar» para completar: 1 de cada pendiente (combinar se queda con la cantidad mayor: lo que ya tienes no baja). */
export const copiasParaCompletar = (ids) => new Map(ids.map((id) => [id, 1]));

/** PURO · colección completa SIN las cartas del álbum (para «reemplazar»): todo lo demás queda con su cantidad exacta. */
export function copiasSinAlbum(coleccion, idsAlbum) {
  const fuera = new Set(idsAlbum);
  return new Map([...coleccion].filter(([id, n]) => !fuera.has(id) && n > 0));
}

/** PURO · de las cartas a quitar, las que también están en OTROS álbumes: [{ album, ids }]. `otros` = [{ nombre, ids: Set|array }]. */
export function compartidasCon(ids, otros) {
  return otros.map((o) => { const s = new Set(o.ids); return { album: o.nombre, ids: ids.filter((id) => s.has(id)) }; }).filter((x) => x.ids.length);
}

const cartasTxt = (n) => (n === 1 ? '1 carta' : `${n} cartas`);

/** PURO · texto de confirmación de «añadir todas». */
export function textoConfirmacion(nombreAlbum, pendientes, total) {
  if (pendientes === 0) return `Ya tienes todas las cartas de ${nombreAlbum}.`;
  const cuales = pendientes === total ? `las ${cartasTxt(pendientes)} del álbum` : (pendientes === 1 ? `la carta que te falta de ${total}` : `las ${cartasTxt(pendientes)} que te faltan de ${total}`);
  return `Se marcarán como conseguidas (1 copia) ${cuales}. Las que ya tienes no cambian. Podrás deshacerlo desde este menú hasta tu próximo cambio.`;
}

/** PURO · texto de confirmación de «eliminar todas». `copias` = suma de copias que se quitan; `compartidas` = compartidasCon(...). */
export function textoEliminar(nombreAlbum, conseguidas, copias, compartidas = []) {
  if (conseguidas === 0) return `No tienes ninguna carta de ${nombreAlbum}.`;
  let t = `Se quitarán las ${cartasTxt(conseguidas)} que tienes de ${nombreAlbum}` + (copias > conseguidas ? ` (${copias} copias en total)` : '') + ', que quedarán como pendientes. El resto de tu colección no cambia.';
  for (const c of compartidas) t += ` Atención: ${c.ids.length === 1 ? '1 de ellas está' : c.ids.length + ' de ellas están'} también en «${c.album}» y desaparecerá${c.ids.length === 1 ? '' : 'n'} de allí.`;
  return t + ' Podrás deshacerlo desde este menú hasta tu próximo cambio.';
}

/**
 * Menú «⋯» del álbum (DOM). `acciones` = { nombre, total, soloLectura, cantidadDe(id), cartas: [{id}], completar(ids), vaciar(ids),
 * compartidas(ids): Promise<[{album, ids}]>, deshacer(), avisar(t) }. Devuelve { invalidarDeshacer() } para llamarlo tras un cambio a mano.
 */
export function montarMenu(el, acciones) {
  const { boton, menu, todas, quitar, deshacer, dialogo, titulo, texto, aceptar, cancelar } = el;
  let puedeDeshacer = false, ocupado = false, accion = null;
  const pendientes = () => cartasPendientes(acciones.cartas, acciones.cantidadDe);
  const conseguidas = () => cartasConseguidas(acciones.cartas, acciones.cantidadDe);
  const abrir = (si) => {
    menu.hidden = !si; boton.setAttribute('aria-expanded', String(si));
    if (!si) return;
    const p = pendientes().length, c = conseguidas().length;
    todas.disabled = acciones.soloLectura || p === 0;
    todas.textContent = p === 0 ? 'Ya tienes todas las cartas' : `Añadir todas las cartas (faltan ${p})`;
    quitar.disabled = acciones.soloLectura || c === 0;
    quitar.textContent = c === 0 ? 'No tienes cartas de este álbum' : `Eliminar todas las cartas (tienes ${c})`;
    deshacer.hidden = !puedeDeshacer;
    (todas.disabled ? (quitar.disabled ? boton : quitar) : todas).focus();
  };
  const mostrar = () => { if (dialogo.showModal) dialogo.showModal(); else dialogo.setAttribute('open', ''); cancelar.focus(); };
  boton.addEventListener('click', (e) => { e.stopPropagation(); abrir(menu.hidden); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) abrir(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { abrir(false); boton.focus(); } });

  todas.addEventListener('click', () => {
    abrir(false); accion = 'completar';
    const n = pendientes().length;
    titulo.textContent = 'Añadir todas las cartas';
    texto.textContent = textoConfirmacion(acciones.nombre, n, acciones.total);
    aceptar.textContent = n === 1 ? 'Añadir 1 carta' : `Añadir ${n} cartas`;
    aceptar.classList.remove('peligro'); aceptar.disabled = n === 0;
    mostrar();
  });
  quitar.addEventListener('click', async () => {
    abrir(false); accion = 'vaciar';
    const ids = conseguidas(), copias = ids.reduce((s, id) => s + acciones.cantidadDe(id), 0);
    titulo.textContent = 'Eliminar todas las cartas';
    texto.textContent = textoEliminar(acciones.nombre, ids.length, copias, []);
    aceptar.textContent = ids.length === 1 ? 'Eliminar 1 carta' : `Eliminar ${ids.length} cartas`;
    aceptar.classList.add('peligro'); aceptar.disabled = true;               // hasta saber si alguna está en otro álbum
    mostrar();
    let compartidas = [];
    try { compartidas = await acciones.compartidas(ids); } catch { /* sin datos de otros álbumes: se avisa igual de forma general */ }
    if (accion !== 'vaciar' || !dialogo.open) return;
    texto.textContent = textoEliminar(acciones.nombre, ids.length, copias, compartidas);
    aceptar.disabled = ids.length === 0;
  });
  cancelar.addEventListener('click', () => { accion = null; dialogo.close(); });
  aceptar.addEventListener('click', async () => {
    if (ocupado || !accion) return;
    ocupado = true; aceptar.disabled = true;
    const ids = accion === 'completar' ? pendientes() : conseguidas();
    try {
      await (accion === 'completar' ? acciones.completar(ids) : acciones.vaciar(ids));
      puedeDeshacer = ids.length > 0;
      dialogo.close();
      const n = ids.length === 1 ? '1 carta' : ids.length + ' cartas';
      acciones.avisar(`${n} ${accion === 'completar' ? (ids.length === 1 ? 'añadida' : 'añadidas') : (ids.length === 1 ? 'eliminada' : 'eliminadas')}. Puedes deshacerlo desde ⋯.`);
    } catch (e) {
      dialogo.close();
      acciones.avisar('No se pudo guardar: ' + (e && e.message || e) + '. Tu colección no ha cambiado.');
    } finally { ocupado = false; accion = null; }
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
