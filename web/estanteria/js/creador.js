// 3.37 · Ventana «Nuevo álbum» de la biblioteca: elegir expansión, ilustrador o Pokémon, ponerle nombre y crearlo con las cartas de TCGdex.
// 3.40 · Paso 2: elegir las cartas (quitar las que no quieras y añadir cualquier otra buscándola por nombre). El mismo paso sirve para
// «Editar cartas» de un álbum ya creado. Las cartas que tengas marcadas nunca se tocan: quitar una del álbum no la quita de tu colección.
// La lógica de los datos está en web/js/generador-album.js y web/js/albumes-propios.js; aquí solo la interfaz.
import { listarExpansiones, listarIlustradores, generarCatalogo, armarCatalogo, buscarCartas, buscarEnLimitless, imagenDe, MAX_CARTAS } from '../../js/generador-album.js';
import { crearAlbumPropio, editarCartasAlbum, nombrePropuesto } from '../../js/albumes-propios.js';
import { ordenarPorPokedex } from '../../js/album/distribucion.js';
import { conCors, conRespaldo } from '../../js/supabase-url.js';

const $ = (id) => document.getElementById(id);
/** PURO · texto para buscar: sin tildes ni mayúsculas. */
export const plano = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
/** PURO · coincidencias para el buscador: primero las que empiezan por lo escrito, luego las que lo contienen. Como mucho `max`. */
export function filtrar(lista, texto, clave = (x) => x, max = 40) {
  const t = plano(texto);
  if (!t) return lista.slice(0, max);
  const empieza = [], contiene = [];
  for (const x of lista) { const k = plano(clave(x)); if (k.startsWith(t)) empieza.push(x); else if (k.includes(t)) contiene.push(x); }
  return [...empieza, ...contiene].slice(0, max);
}
/** PURO · miniatura de una carta para la rejilla: la pequeña de TCGdex o la de limitlesstcg / pokemontcg.io (la ligera). */
export const miniatura = (c) => { const u = imagenDe(c); return u ? conCors(u.replace(/\/high\.webp$/, '/low.webp').replace(/_hires\.png$/, '.png')) : null; };

export function montarCreador({ almacen, alCrear, alEditar = alCrear }) {
  const d = $('d-nuevo'), estado = $('n-estado'), barra = $('n-progreso'), crear = $('n-crear');
  let tipo = 'expansion', expansiones = null, ilustradores = null, control = null, paso = 1, editando = null, origen = null;
  const eleccion = { expansion: null, ilustrador: null, pokExp: null };
  // paso 2: todas las cartas conocidas (id → { carta, precio }) y las elegidas
  let conocidas = new Map(), elegidas = new Set(), orden = [], idsOrigen = new Set();
  const decir = (t, error = false) => { estado.textContent = t; estado.dataset.tipo = error ? 'error' : ''; };

  /** Buscador: input + lista de opciones (botones). `opciones()` da la lista completa; `alElegir(x)` guarda la elección. */
  function buscador(input, ul, { opciones, texto, detalle = () => '', alElegir, minimo = 0 }) {
    const pintar = () => {
      const todas = opciones();
      if (!todas || input.value.trim().length < minimo) { ul.replaceChildren(); return; }
      const items = filtrar(todas, input.value, texto).map((x) => {
        const li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', 'false');
        const n = document.createElement('span'); n.textContent = texto(x);
        const s = document.createElement('small'); s.textContent = detalle(x);
        b.append(n, s);
        b.onclick = () => { alElegir(x); input.value = texto(x); ul.replaceChildren(); decir(''); };
        li.append(b); return li;
      });
      ul.replaceChildren(...items);
      if (!items.length) decir('No hay coincidencias.');
    };
    input.addEventListener('input', () => { alElegir(null); pintar(); });
    input.addEventListener('focus', pintar);
    return pintar;
  }
  const textoExp = (s) => s.nombre, detalleExp = (s) => `${s.cartas ?? '?'} cartas · ${s.id}`;
  const pintarExp = buscador($('n-exp'), $('n-exp-lista'), { opciones: () => expansiones, texto: textoExp, detalle: detalleExp, alElegir: (x) => { eleccion.expansion = x; } });
  const pintarIlu = buscador($('n-ilu'), $('n-ilu-lista'), { opciones: () => ilustradores, texto: (x) => x, alElegir: (x) => { eleccion.ilustrador = x; }, minimo: 2 });
  buscador($('n-pok-exp'), $('n-pok-exp-lista'), { opciones: () => expansiones, texto: textoExp, detalle: detalleExp, alElegir: (x) => { eleccion.pokExp = x; }, minimo: 1 });

  function cambiarTipo(t) {
    tipo = t;
    for (const b of d.querySelectorAll('[data-tipo]')) b.setAttribute('aria-pressed', String(b.dataset.tipo === t));
    for (const p of d.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== t;
    decir('');
    if (t === 'ilustrador') cargarIlustradores();
  }
  for (const b of d.querySelectorAll('[data-tipo]')) b.onclick = () => cambiarTipo(b.dataset.tipo);

  async function cargarExpansiones() {
    if (expansiones) return;
    decir('Cargando expansiones de TCGdex…');
    try { expansiones = await listarExpansiones(); decir(''); pintarExp(); } catch { decir('No se pudo conectar con TCGdex. Para crear un álbum hace falta conexión.', true); }
  }
  async function cargarIlustradores() {
    if (ilustradores) return;
    try { ilustradores = await listarIlustradores(); pintarIlu(); } catch { decir('No se pudo cargar la lista de ilustradores de TCGdex.', true); }
  }

  /** Definición del álbum a partir de lo elegido, o un texto con lo que falta. */
  function definicion() {
    if (tipo === 'expansion') return eleccion.expansion ? { tipo, expansion: eleccion.expansion.id } : 'Elige una expansión de la lista.';
    if (tipo === 'ilustrador') return eleccion.ilustrador ? { tipo, ilustrador: eleccion.ilustrador } : 'Elige un ilustrador de la lista.';
    const p = $('n-pok').value.trim();
    if (!p) return 'Escribe el nombre del Pokémon.';
    return eleccion.pokExp ? { tipo, pokemon: p, expansion: eleccion.pokExp.id } : { tipo, pokemon: p };
  }
  const ocupado = (si) => {
    for (const el of d.querySelectorAll('input, [data-tipo], #n-crear, #n-atras, #n-todas, #n-ninguna, .n-rejilla button')) el.disabled = si;
    barra.hidden = !si; $('n-cancelar').textContent = si ? 'Detener' : 'Cancelar';
  };

  // ---------------------------------------------------------------- paso 2: rejilla de cartas
  function irAPaso(n) {
    paso = n;
    $('n-paso1').hidden = n !== 1; $('n-paso2').hidden = n !== 2;
    $('n-atras').hidden = n !== 2 || Boolean(editando);
    crear.textContent = n === 1 ? 'Elegir cartas →' : editando ? 'Guardar cartas' : 'Crear álbum';
    $('n-titulo').textContent = editando ? 'Editar cartas' : 'Nuevo álbum';
    decir('');
  }
  function contar() {
    const n = elegidas.size;
    $('n-cuenta').textContent = `${n} de ${conocidas.size} elegidas` + (n > MAX_CARTAS ? ` · máximo ${MAX_CARTAS}` : '');
    crear.disabled = paso === 2 && (n === 0 || n > MAX_CARTAS);
  }
  function tarjeta(c, { pulsada, alPulsar, estado: est }) {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.title = `${c.nombre} · ${c.nombreExpansion || c.expansion || ''} ${c.numero || ''}`.trim();
    if (pulsada !== undefined) b.setAttribute('aria-pressed', String(pulsada));
    if (est) b.dataset.estado = est;
    const url = c.miniatura || miniatura(c);
    // sin imagen (o si falla): un hueco con forma de carta, con su nombre y número, como el marcador del álbum
    const hueco = () => { const h = document.createElement('div'); h.className = 'n-img n-sin'; h.textContent = `${c.nombre} · ${c.numero || ''}`; return h; };
    let img;
    if (url) {
      const intentos = conRespaldo(url);                               // 3.41: si TCGdex falla por su CORS duplicado, por el intermediario
      img = new Image(); img.crossOrigin = 'anonymous'; img.loading = 'lazy'; img.decoding = 'async'; img.alt = ''; img.className = 'n-img'; img.src = intentos[0];
      img.onerror = () => { const otra = intentos[intentos.indexOf(img.src) + 1]; if (otra) img.src = otra; else img.replaceWith(hueco()); };
    }
    else img = hueco();
    const n = document.createElement('span'); n.textContent = c.nombre;
    b.append(img, n); b.onclick = () => alPulsar(b);
    li.append(b); return li;
  }
  function pintarRejilla() {
    $('n-rejilla').replaceChildren(...orden.map((id) => tarjeta(conocidas.get(id).carta, {
      pulsada: elegidas.has(id),
      alPulsar: (b) => { if (elegidas.has(id)) elegidas.delete(id); else elegidas.add(id); b.setAttribute('aria-pressed', String(elegidas.has(id))); contar(); },
    })));
    contar();
  }
  /** Prepara el paso 2 con las cartas de un catálogo (todas elegidas). */
  function cargarCartas(catalogo, precios, ids = null) {
    conocidas = new Map(catalogo.cartas.map((c) => [c.id, { carta: c, precio: precios?.cartas?.[c.id] }]));
    orden = ordenarPorPokedex(catalogo.cartas).ordenadas.map((c) => c.id);
    elegidas = new Set(ids || orden); idsOrigen = new Set(elegidas);
    $('n-buscar').value = ''; $('n-resultados').replaceChildren();
    pintarRejilla();
  }

  // buscar y añadir cualquier otra carta
  let busqueda = 0;
  $('n-buscar').addEventListener('input', () => {
    const texto = $('n-buscar').value, mia = ++busqueda;
    clearTimeout($('n-buscar')._t);
    $('n-buscar')._t = setTimeout(async () => {
      if (texto.trim().length < 2) { $('n-resultados').replaceChildren(); return; }
      let res;
      try { res = await buscarCartas(texto); } catch { if (mia === busqueda) decir('No se pudo buscar en TCGdex.', true); return; }
      if (mia !== busqueda) return;                                   // ya se escribió otra cosa
      decir(res.length ? '' : 'Ninguna carta con ese nombre.');
      const filas = res.map((r) => [r, tarjeta({ ...r, miniatura: conCors(r.imagen) }, {
        estado: elegidas.has(r.id) ? 'anadida' : '',
        alPulsar: (b) => anadir(r, b),
      })]);
      $('n-resultados').replaceChildren(...filas.map(([, li]) => li));
      // 3.41 · las que TCGdex no tiene en imagen: se pide la de limitlesstcg (o pokemontcg.io, para las antiguas), de 3 en 3
      const sinImagen = filas.filter(([r]) => !r.imagen);
      const siguiente = async () => {
        for (let f = sinImagen.shift(); f && mia === busqueda; f = sinImagen.shift()) {
          const [r, li] = f, alt = await buscarEnLimitless('', r.numero, r.expansion);
          if (!alt || mia !== busqueda) continue;
          r.imagen = miniatura({ imagenAlternativa: alt.url });
          const hueco = li.querySelector('.n-sin');
          if (hueco) { const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async'; img.alt = ''; img.className = 'n-img'; img.src = r.imagen; hueco.replaceWith(img); }
        }
      };
      for (let i = 0; i < 3; i++) siguiente();
    }, 300);
  });
  async function anadir(r, b) {
    if (elegidas.has(r.id)) return;
    if (!conocidas.has(r.id)) {                                         // sus datos completos (rareza, variantes, precio…)
      b.disabled = true; decir(`Añadiendo ${r.nombre}…`);
      try {
        const { catalogo, precios } = await generarCatalogo({ tipo: 'lista', ids: [r.id] });
        const c = catalogo.cartas[0];
        if (!c) throw new Error('sin datos');
        conocidas.set(c.id, { carta: c, precio: precios.cartas[c.id] });
        orden = ordenarPorPokedex([...conocidas.values()].map((x) => x.carta)).ordenadas.map((x) => x.id);
      } catch (e) { b.disabled = false; decir('No se pudo añadir: ' + (e.message || e), true); return; }
    }
    elegidas.add(r.id); b.dataset.estado = 'anadida'; b.disabled = false;
    decir(`${r.nombre} añadida al álbum.`);
    pintarRejilla();
  }
  $('n-todas').onclick = () => { elegidas = new Set(orden); pintarRejilla(); };
  $('n-ninguna').onclick = () => { elegidas = new Set(); pintarRejilla(); };
  $('n-atras').onclick = () => irAPaso(1);

  /** El catálogo final con las cartas elegidas. Si son justo las de la definición, se guarda la definición (recibe cartas nuevas cada semana);
   *  si se ha quitado o añadido alguna, queda como selección propia ({ tipo: 'lista', ids, origen }). */
  function catalogoElegido() {
    const ids = orden.filter((id) => elegidas.has(id));
    const igual = origen && ids.length === idsOrigen.size && ids.every((id) => idsOrigen.has(id));   // sin quitar ni añadir nada
    const def = igual ? origen : { tipo: 'lista', ids, origen: origen?.tipo === 'lista' ? origen.origen : origen };
    const precios = Object.fromEntries(ids.filter((id) => conocidas.get(id).precio).map((id) => [id, conocidas.get(id).precio]));
    return { def, ...armarCatalogo(def, ids.map((id) => conocidas.get(id).carta), precios) };
  }

  crear.onclick = async () => {
    if (paso === 1) {                                                   // buscar las cartas y pasar a elegirlas
      const def = definicion();
      if (typeof def === 'string') { decir(def, true); return; }
      if (navigator.onLine === false) { decir('Sin conexión: para crear un álbum hace falta internet.', true); return; }
      control = new AbortController(); ocupado(true); barra.value = 0; decir('Buscando las cartas en TCGdex…');
      try {
        const { catalogo, precios } = await generarCatalogo(def, { senal: control.signal, max: 600,   // se pueden quitar en el paso 2 (máx. 360 al guardar)
          progreso: (h, t) => { barra.max = t || 1; barra.value = h; decir(`Preparando las cartas: ${h} de ${t}…`); } });
        origen = def; ocupado(false); control = null;
        if (!$('n-nombre').value.trim()) $('n-nombre').placeholder = nombrePropuesto(def, catalogo.cartas);
        cargarCartas(catalogo, precios); irAPaso(2);
      } catch (e) {
        ocupado(false);
        decir(control?.signal.aborted ? 'Búsqueda detenida: no se ha guardado nada.' : e.message, !control?.signal.aborted);
        control = null;
      }
      return;
    }
    const { def, catalogo, precios } = catalogoElegido();
    ocupado(true); barra.hidden = true;
    try {
      const nombre = $('n-nombre').value.trim();
      const reg = editando ? await editarCartasAlbum(almacen, editando, { catalogo, precios, nombre })
        : await crearAlbumPropio(almacen, def, { nombre, listo: { catalogo, precios } });
      ocupado(false); d.close();
      (editando ? alEditar : alCrear)(reg);
    } catch (e) { ocupado(false); decir(e.message || String(e), true); }
  };
  $('n-cancelar').onclick = () => { if (control) control.abort(); else d.close(); };
  d.addEventListener('cancel', (e) => { if (control) { e.preventDefault(); control.abort(); } });   // Esc durante la búsqueda: la detiene

  return {
    abrir() {
      if (!almacen) { alert('Este navegador no deja guardar datos (¿modo privado?): no se pueden crear álbumes.'); return; }
      editando = null; origen = null;
      $('f-nuevo').reset(); $('n-nombre').placeholder = 'Se pone solo'; Object.assign(eleccion, { expansion: null, ilustrador: null, pokExp: null });
      for (const ul of d.querySelectorAll('.n-lista, .n-rejilla')) ul.replaceChildren();
      cambiarTipo('expansion'); irAPaso(1); d.showModal(); cargarExpansiones();
    },
    /** 3.40 · «Editar cartas» de un álbum creado en la app. */
    async editar(id) {
      const a = almacen && await almacen.albumPropio(id);
      if (!a) return;
      editando = id; origen = a.registro.definicion;
      $('f-nuevo').reset(); $('n-nombre').value = a.registro.nombre;
      cargarCartas(a.datos.catalogo, a.datos.precios); irAPaso(2); d.showModal();
    },
  };
}
