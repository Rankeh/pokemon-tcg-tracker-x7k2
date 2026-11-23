// 3.37 · Ventana «Nuevo álbum» de la biblioteca: elegir expansión, ilustrador o Pokémon, ponerle nombre y crearlo con las cartas de TCGdex.
// La lógica de los datos está en web/js/generador-album.js y web/js/albumes-propios.js; aquí solo la interfaz.
import { listarExpansiones, listarIlustradores } from '../../js/generador-album.js';
import { crearAlbumPropio } from '../../js/albumes-propios.js';

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

export function montarCreador({ almacen, alCrear }) {
  const d = $('d-nuevo'), estado = $('n-estado'), barra = $('n-progreso'), crear = $('n-crear');
  let tipo = 'expansion', expansiones = null, ilustradores = null, control = null;
  const eleccion = { expansion: null, ilustrador: null, pokExp: null };
  const decir = (t, error = false) => { estado.textContent = t; estado.dataset.tipo = error ? 'error' : ''; };

  /** Buscador: input + lista de opciones (botones). `opciones()` da la lista completa; `alElegir(x)` guarda la elección. */
  function buscador(input, ul, { opciones, texto, detalle = () => '', alElegir, minimo = 0, vacio = null }) {
    const pintar = () => {
      const todas = opciones();
      if (!todas) { ul.replaceChildren(); return; }
      if (input.value.trim().length < minimo) { ul.replaceChildren(); return; }
      const encontradas = filtrar(todas, input.value, texto);
      const items = (vacio && !input.value.trim() ? [vacio, ...encontradas] : encontradas).map((x) => {
        const li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', 'false');
        const n = document.createElement('span'); n.textContent = x === vacio ? vacio.nombre : texto(x);
        const s = document.createElement('small'); s.textContent = x === vacio ? '' : detalle(x);
        b.append(n, s);
        b.onclick = () => { alElegir(x === vacio ? null : x); input.value = x === vacio ? '' : texto(x); ul.replaceChildren(); decir(''); };
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
  const pintarPokExp = buscador($('n-pok-exp'), $('n-pok-exp-lista'), { opciones: () => expansiones, texto: textoExp, detalle: detalleExp,
    alElegir: (x) => { eleccion.pokExp = x; }, minimo: 1 });

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
  const ocupado = (si) => { for (const el of d.querySelectorAll('input, [data-tipo], #n-crear')) el.disabled = si; barra.hidden = !si; $('n-cancelar').textContent = si ? 'Detener' : 'Cancelar'; };

  crear.onclick = async () => {
    const def = definicion();
    if (typeof def === 'string') { decir(def, true); return; }
    if (navigator.onLine === false) { decir('Sin conexión: para crear un álbum hace falta internet.', true); return; }
    control = new AbortController(); ocupado(true); barra.value = 0; decir('Buscando las cartas en TCGdex…');
    try {
      const reg = await crearAlbumPropio(almacen, def, { nombre: $('n-nombre').value, senal: control.signal,
        progreso: (h, t) => { barra.max = t || 1; barra.value = h; decir(`Preparando las cartas: ${h} de ${t}…`); } });
      ocupado(false); control = null; d.close();
      alCrear(reg);
    } catch (e) {
      ocupado(false);
      decir(control?.signal.aborted ? 'Creación detenida: no se ha guardado nada.' : e.message, !control?.signal.aborted);
      control = null;
    }
  };
  $('n-cancelar').onclick = () => { if (control) control.abort(); else d.close(); };
  d.addEventListener('cancel', (e) => { if (control) { e.preventDefault(); control.abort(); } });   // Esc durante la creación: la detiene

  return {
    abrir() {
      if (!almacen) { alert('Este navegador no deja guardar datos (¿modo privado?): no se pueden crear álbumes.'); return; }
      $('f-nuevo').reset(); Object.assign(eleccion, { expansion: null, ilustrador: null, pokExp: null });
      for (const ul of d.querySelectorAll('.n-lista')) ul.replaceChildren();
      cambiarTipo('expansion'); d.showModal(); cargarExpansiones();
    },
  };
}
