// Álbum 3D de la colección REAL (Fase 3.6.2): Three.js + catálogo + IndexedDB (mismos módulos que la app original).
// Regla de oro heredada: primero se guarda en IndexedDB y SOLO si se confirma se actualiza la ficha y el 3D.
import * as THREE from 'three';
import { Almacen } from '../../js/almacen.js';
import { iniciarSincronizacion } from '../../js/sincronizacion.js';
import { ModeloColeccion } from '../../js/album/modelo.js';
import { crearMapa, AdaptadorColeccion } from './adaptador-coleccion.js';
import { cargarAlbum } from './album3d.js';
import { OrbitaLigera } from './camara.js';
import { aabbMundo, dimensiones, puntosVista, puntosGiro, calcularEncuadre, elevacionPara, planos, reservadoDesdeDom, claseVista, COMPOSICION, cajasReales, cajasDimensiones, puntosPagina, puntosConjunto, elegirEncuadreSeleccion } from './encuadre.js';
import { crearGeometria } from './logica.js';
import { Resaltado } from './resaltado.js';
import { Metricas } from './metricas.js';
import { Aspecto, elegirCalidad, elegirTema, elegirAcabado, TEMAS } from './aspecto.js';
import { albumPorId, conCifras } from '../../estanteria/js/albumes.js';
import { montarMenu, copiasParaCompletar, copiasSinAlbum, compartidasCon } from './completar.js';
import { adminGuardado, comprobarAdmin } from '../../js/admin.js';
import { prepararImagen, imagenPegada } from '../../js/imagen-propia.js';
import { esPropio, listarTodos, cargarAlbum as cargarAlbumColeccion, actualizarAlbumPropio } from '../../js/albumes-propios.js';
import { fijarTemaMarcadores } from './marcadores.js';
import { Diagnostico } from './diagnostico.js';
import { CacheTexturas } from './texturas.js';
import { crearProductores, cargarManifiesto } from './texturas3d.js';
import { VistaBolsillos } from './bolsillos3d.js';
import { Controlador } from './controlador.js';
import { FichaUI } from './ficha-ui.js';
import { etiquetaPaginas, paginasNecesarias, irAPagina, vueltasParaPagina, pasoLectura, cartaVecina, cartaDeEntrada, cartaEnLectura, ordenLectura } from './navegacion3d.js';
import { cargarPrecios, valorColeccion, eurEntero } from './precios.js';
import { elegirBolsillo, candidatosTocables, rayoCaja } from './picking.js';

export const FASE = '3.47';                                   // versión visible en consola y en ?debug=1: si tu navegador cachea módulos viejos, aquí se ve
const $ = (id) => document.getElementById(id);
const GRAD = Math.PI / 180;
const params = new URLSearchParams(location.search);
// 3.12 · qué álbum se abre: ?album=<id> del registro de la biblioteca (sin parámetro, Teselia: los enlaces antiguos siguen igual)
// 3.37 · un álbum creado en la app (id «mio-…») está en el dispositivo, no en la web: se lee al arrancar; hasta entonces, un nombre provisional
let albumActual = esPropio(params.get('album')) ? { id: params.get('album'), nombre: '…', portada: undefined } : albumPorId(params.get('album'));
const ponerNombre = () => { document.title = 'Álbum ' + albumActual.nombre; const n = document.getElementById('h1-nombre'); if (n) n.textContent = albumActual.nombre; };
ponerNombre();   // «Álbum » va aparte: en móvil se oculta para que quepa el progreso
const mq = matchMedia('(prefers-reduced-motion: reduce)');
let reducirMovimiento = mq.matches;
mq.addEventListener?.('change', () => { reducirMovimiento = mq.matches; });

// ------------------------------------------------------------------ renderer y escena (sin sombras en tiempo real: ahorra mucho en iPhone)
const canvas = $('lienzo');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, +params.get('pr') || 2));

const scene = new THREE.Scene();
const FOV = 32;
const camara = new THREE.PerspectiveCamera(FOV, 1, 0.02, 5);
// Fase 3.7.2a: luces, mesa, sombra de contacto, materiales y tone mapping los gestiona Aspecto según el nivel de calidad (?calidad=baja|media|alta|legado).
const calidad = elegirCalidad({ parametro: params.get('calidad'), tactil: matchMedia('(pointer: coarse)').matches,
  nucleos: navigator.hardwareConcurrency || 0, memoriaGb: navigator.deviceMemory || 0 });
const tema = elegirTema();                                    // tema único: editorial (la dirección visual de la biblioteca)
document.body.dataset.tema = tema; fijarTemaMarcadores(tema);
const tapa = elegirAcabado(params.get('tapa') || TEMAS[tema].acabado);   // ?tapa=grafito | fieltro | cuero | tejido | acolchado | editorial (por defecto, el del tema)
const aspecto = new Aspecto({ renderer, scene, nivel: calidad.nivel, origen: calidad.origen, tema, tapa, entorno: params.get('ibl') !== '0', emblema: params.get('emblema') !== '0', portada: params.get('portada') !== '0', disenoPortada: albumActual.portada });   // ?portada=0: tapa lisa con el emblema bordado (3.7.25)   // ?ibl=0: sin entorno de estudio, para comparar en el iPhone
// 3.11 · modo claro/oscuro (web/editorial/modo.js): el suelo se funde con el fondo de la página en los dos modos
try { aspecto.aplicarModo(document.documentElement.dataset.modo || 'oscuro'); } catch (e) { console.warn('Modo no aplicado:', e); }   // el modo nunca debe impedir que cargue el álbum
document.addEventListener('modo', (e) => { if (aspecto.aplicarModo(e.detail)) pedirFrame(); });

const orbita = new OrbitaLigera();
let album = null, metricas = null, diag = null, cache = null, vista = null, ctrl = null, adaptador = null, ficha = null;
let sucioHasta = 0, continuo = false, forzarDibujo = false, claveNav = '';
const pedirFrame = (ms = 500) => { sucioHasta = Math.max(sucioHasta, performance.now() + ms); };
const avisar = (t) => { $('aviso').textContent = t || ''; $('aviso').hidden = !t; };
let menuAlbum = null;                                           // 3.13–3.14 · añadir / eliminar todas las cartas (completar.js)
const cambioAMano = () => menuAlbum?.invalidarDeshacer();         // tras un cambio a mano ya no se ofrece deshacer el cambio en bloque

// ------------------------------------------------------------------ cámara cinematográfica (Fase 3.7.1)
// El encuadre NO usa distancias fijas: se calcula con calcularEncuadre() a partir del viewport, la proporción, la elevación, las dimensiones reales
// del modelo, las páginas visibles y el espacio que ocupan la cabecera, la barra inferior y la ficha (medidos en el DOM).
const diagCam = { nivel: '', radio: 0 };       // para depurar y para las pruebas de la página real
let dim = null, tamano = { w: 0, h: 0 }, claveCamara = '', resaltado = null, cursor = null;
let modoVista = null, manual = false, lado = 'der';            // 'doble' | 'pagina' (en vertical, por defecto una página a la vez)
const esVertical = () => camara.aspect < 0.9;
const modoEfectivo = () => modoVista || (esVertical() ? 'pagina' : 'doble');

const mqColumnas = matchMedia('(orientation: landscape) and (max-height: 520px)');     // móvil horizontal: cabecera y controles pasan a columnas laterales (ver CSS)
const rect = (el) => el.getBoundingClientRect();
/**
 * Espacio que ocupa REALMENTE la interfaz (no el que reserva el CSS): se miden los elementos visibles (texto de la cabecera, botones), no sus contenedores
 * con relleno y degradado. `conFicha`: incluir la ficha abierta; `ignorarBarraOculta`: la barra oculta bajo la ficha se cuenta igualmente (para el encuadre de referencia).
 */
function reservado({ conFicha = true } = {}) {
  const lr = rect(canvas), cab = [rect(document.querySelector('h1')), rect($('estado'))];
  const botones = [...$('barra').querySelectorAll('button, select')].filter((e) => e.offsetParent !== null).map(rect);
  const abierta = conFicha && ctrl && ctrl.fichaAbierta, r = abierta ? rect($('ficha')) : null;
  const ficha = r ? { left: r.left - lr.left, top: r.top - lr.top } : null;
  if (mqColumnas.matches) {
    const cabDer = Math.max(...cab.map((c) => c.right)) - lr.left + 10, barIzq = botones.length ? Math.min(...botones.map((c) => c.left)) - lr.left - 6 : lr.width;
    return reservadoDesdeDom({ ancho: lr.width, alto: lr.height, izquierdaPx: cabDer, derechaPx: abierta ? 0 : lr.width - barIzq, ficha });
  }
  const barTop = botones.length ? Math.min(...botones.map((c) => c.top)) - lr.top - 6 : lr.height;
  return reservadoDesdeDom({ ancho: lr.width, alto: lr.height, cabeceraAbajo: Math.max(...cab.map((c) => c.bottom)) - lr.top + 6, barraArriba: barTop, ficha });
}

/** Cajas del álbum en el estado `v`: transformaciones REALES de las mallas si está asentado; dimensiones del modelo mientras una hoja gira. */
function cajasDe(v, real) {
  if (real) { const c = cajasReales(v, dim.n, (n) => album.cajaMalla(n)); if (c) return c; }
  return cajasDimensiones(v, dim, album.geo);
}
const hojaAncho = () => dim.hoja;

/** Encuadre de la SELECCIÓN (ficha abierta): cascada de prioridades — ficha utilizable, carta visible, su página, lomo, franja contigua. */
function encuadreSeleccion() {
  const e = album.estado, aspect = camara.aspect, el = elevacionPara(aspect), nombre = ctrl.seleccion.nombre, l = nombre.includes('_D_') ? 'izq' : 'der';
  const cajas = cajasDe(e.vueltas, true), m = album.matrizMundo(nombre), z = m[14], f = COMPOSICION.filasContexto, h = COMPOSICION.pasoFila;
  const nav = reservado({ conFicha: false }), res = reservado();
  const p = (o) => puntosPagina({ lado: l, cajas, hoja: hojaAncho(), ...o });
  const base = { fovGrados: FOV, aspect, el: el + 8 * GRAD, reservado: res, margen: COMPOSICION.margen };
  const ref = calcularEncuadre({ puntos: p({}), fovGrados: FOV, aspect, el: el + 8 * GRAD, reservado: nav, margen: COMPOSICION.margen });
  return { ...elegirEncuadreSeleccion({ radioRef: ref.radio, base, niveles: [
    { nombre: 'página+lomo+vecina', puntos: p({}) }, { nombre: 'página+lomo', puntos: p({ vecina: false }) }, { nombre: 'página', puntos: p({ vecina: false, lomo: false }) },
    { nombre: 'filas', puntos: p({ vecina: false, lomo: false, filaZ: [z - (f + 0.5) * h, z + (f + 0.5) * h] }) }] }), clave: 'sel' };
}

/** Encuadre deseado para el contexto actual: álbum cerrado / abierto / dos páginas / una página / giro / selección. */
function encuadreDeseado() {
  const e = album.estado, aspect = camara.aspect, el = elevacionPara(aspect);
  if (ctrl.fichaAbierta) return encuadreSeleccion();
  const res = reservado(), modo = modoEfectivo();
  if (e.animando) {
    // Giro: en una página la cámara acompaña a la página protagonista de DESTINO sin alejarse; en dos páginas se abre un poco para que no se recorte el barrido de la hoja.
    if (modo === 'pagina' && e.objetivo > 0 && e.objetivo <= dim.n + 1) {
      ladoValido(); const lDestino = lado;       // `lado` ya es el de destino: lo fija avanzar/retroceder/saltarA al iniciar el giro
      return calcularEncuadre({ puntos: puntosPagina({ lado: lDestino, cajas: cajasDe(e.objetivo, false), hoja: hojaAncho() }), fovGrados: FOV, aspect, el, reservado: res, margen: COMPOSICION.margen,
        centroVisual: cara(cajasDe(e.objetivo, false), lDestino), sesgo: COMPOSICION.sesgoOptico });
    }
    return calcularEncuadre({ puntos: [...puntosVista({ vueltas: e.vueltas, dim }), ...puntosVista({ vueltas: e.objetivo, dim }), ...puntosGiro(dim, 0.03, COMPOSICION.barridoGiro)], fovGrados: FOV, aspect, el, reservado: res, margen: COMPOSICION.margenDoble });
  }
  if (modo === 'pagina' && e.vueltas > 0) {
    const cajas = cajasDe(e.vueltas, true);
    return calcularEncuadre({ puntos: puntosPagina({ lado, cajas, hoja: hojaAncho() }), fovGrados: FOV, aspect, el, reservado: res, margen: COMPOSICION.margen, centroVisual: cara(cajas, lado), sesgo: COMPOSICION.sesgoOptico });
  }
  const cerrado = e.vueltas === 0;
  if (cerrado) {                                                 // 3.7.23: plano héroe (portada + canto + lomo, no un cenital)
    return calcularEncuadre({ puntos: puntosConjunto(cajasDe(e.vueltas, true)), fovGrados: FOV, aspect, az: COMPOSICION.heroe.az * GRAD, el: COMPOSICION.heroe.el * GRAD, reservado: res, margen: COMPOSICION.margen });
  }
  return calcularEncuadre({ puntos: puntosConjunto(cajasDe(e.vueltas, true)), fovGrados: FOV, aspect, el, reservado: res, margen: COMPOSICION.margenDoble });
}
/** Esquinas de la cara de la página protagonista (para centrarla visualmente). */
function cara(cajas, l) { const c = l === 'der' ? cajas.der : cajas.izq; return [[c.x[0], c.y[1], c.z[0]], [c.x[1], c.y[1], c.z[0]], [c.x[0], c.y[1], c.z[1]], [c.x[1], c.y[1], c.z[1]]]; }

/** Aplica el encuadre: con transición suave (por defecto) o de golpe (cambio de tamaño). Fija límites de zoom y planos near/far derivados de la distancia. */
function aplicarCamara(animado, duracion = null) {
  if (!album || !ctrl) return;
  const c = encuadreDeseado();
  const lim = [Math.max(0.12, c.radio * 0.55), c.radio * 1.5];
  orbita.limites.radio = lim;
  const pl = planos(lim[0], lim[1]);       // near según el zoom MÁS cercano permitido, far según el más lejano: el álbum nunca se sale del frustum al hacer zoom
  camara.near = pl.near; camara.far = pl.far; camara.updateProjectionMatrix();
  diagCam.nivel = c.nivel || ''; diagCam.radio = c.radio;
  const dest = { az: c.az, el: c.el, radio: c.radio, objetivo: c.objetivo };
  if (animado && !reducirMovimiento) orbita.llevarA(dest, duracion ?? (ctrl.fichaAbierta ? 0.55 : album.estado.animando ? 0.9 : 0.7));
  else { orbita.tween = null; Object.assign(orbita, { az: dest.az, el: dest.el, radio: dest.radio, objetivo: dest.objetivo }); }
  pedirFrame();
}

/** Huella del contexto de cámara: si cambia, se recalcula el encuadre con transición. */
function huellaCamara() {
  const e = album.estado;
  return ctrl.fichaAbierta ? 'sel:' + ctrl.seleccion.nombre : `v${e.vueltas}>${e.objetivo}:${e.animando ? 'giro' : 'quieto'}:${modoEfectivo()}:${lado}`;
}

function ajustarTamano() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camara.aspect = w / h;
  camara.updateProjectionMatrix();
  // Safari muestra/oculta sus barras con varios eventos seguidos: un cambio PEQUEÑO de tamaño se absorbe con una transición corta (sin saltos);
  // un cambio de proporción grande (girar el móvil) reencuadra de golpe, porque la imagen anterior ya no tiene sentido.
  const antes = tamano.w ? tamano.w / tamano.h : 0, fuerte = !antes || Math.abs(w / h - antes) / antes > 0.25 || w !== tamano.w;
  if (antes && (antes < 0.9) !== (w / h < 0.9)) { modoVista = null; manual = false; }          // al girar el móvil vuelve la vista por defecto de esa orientación (1 página en vertical, 2 en horizontal)
  tamano = { w, h };
  if (album && ctrl) { claveCamara = huellaCamara(); aplicarCamara(!fuerte, 0.3); actualizarUi(); }
  pedirFrame();
}
new ResizeObserver(ajustarTamano).observe(canvas);
// Safari iOS: las barras que aparecen/desaparecen y el giro de pantalla cambian el viewport visual; se reencuadra con un pequeño retardo (iOS tarda en actualizar medidas)
let _t = 0; const reajustar = () => { clearTimeout(_t); _t = setTimeout(ajustarTamano, 120); };
window.visualViewport?.addEventListener('resize', reajustar); addEventListener('orientationchange', reajustar); addEventListener('resize', reajustar);
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (diag) diag.contextoPerdido = true; avisar('El navegador ha perdido el contexto WebGL (en iPhone pasa si se gasta mucha memoria). Espera o recarga la página.'); });
canvas.addEventListener('webglcontextrestored', () => { avisar(''); vista?.refrescar(); pedirFrame(); });

if (params.get('debug') === '1') {
  document.body.classList.add('debug');
  diag = new Diagnostico($('diag'), { renderer, scene, camara, orbita, getAlbum: () => album, getExtra: () => ({ cache, vista, adaptador }) });
  diag.estadoGlb = 'cargando…';
  setInterval(() => diag.pintar(), 500);
  forzarDibujo = true;
}

// ------------------------------------------------------------------ navegación (botones, teclado, salto directo)
const botones = { vista: $('b-vista'), abrir: $('b-abrir'), ant: $('b-ant'), sig: $('b-sig'), salto: $('b-salto'), metricas: $('b-metricas'), medir: $('b-medir'), informe: $('b-informe') };
const puedeNavegar = () => !ctrl.fichaAbierta && !continuo;

/** Páginas que se ven en el estado `v` (1..18); en modo página solo la del lado enfocado. */
function paginasDe(v) { return { izquierda: v >= 2 ? 2 * (v - 1) : null, derecha: v >= 1 && 2 * v - 1 <= adaptador.mapa.totalPaginas ? 2 * v - 1 : null }; }
function ladoValido() {                                         // en la portada la izquierda está vacía; si no hay página en un lado se usa el otro
  const e = album.estado, { izquierda, derecha } = paginasDe(e.objetivo);
  if (!izquierda && derecha) lado = 'der'; else if (!derecha && izquierda) lado = 'izq';
}

function actualizarUi() {
  const e = album.estado, total = adaptador.mapa.totalPaginas, modo = modoEfectivo();
  ladoValido();
  const { izquierda, derecha } = paginasDe(e.objetivo);
  $('estado').textContent = modo === 'pagina' && e.objetivo > 0 && (izquierda || derecha)
    ? `Página ${lado === 'izq' ? izquierda : derecha} de ${total}` : etiquetaPaginas(e.objetivo, total);
  botones.abrir.textContent = e.objetivo === 0 ? 'Abrir' : 'Cerrar';
  botones.abrir.setAttribute('aria-label', e.objetivo === 0 ? 'Abrir álbum' : 'Cerrar álbum');
  botones.vista.textContent = modo === 'pagina' ? '▯▯' : '▯';
  botones.vista.setAttribute('aria-label', modo === 'pagina' ? 'Ver dos páginas' : 'Ver una página');
  const libre = puedeNavegar(), enPagina = modo === 'pagina' && e.objetivo > 0;
  botones.abrir.disabled = !libre; botones.vista.disabled = !libre;
  botones.ant.disabled = !libre || !(e.puedeRetroceder());
  botones.sig.disabled = !libre || !(e.puedeAvanzar() || (enPagina && lado === 'izq' && derecha));
  botones.ant.disabled = botones.ant.disabled && !(libre && enPagina && lado === 'der' && izquierda);
  botones.salto.disabled = !libre;
  const sel = botones.salto;
  const pagSel = (modo === 'pagina' ? (lado === 'izq' ? izquierda : derecha) : derecha) || derecha || izquierda;
  if (pagSel) sel.value = String(pagSel); else sel.selectedIndex = -1;         // cerrado o todo girado: ninguna página marcada (antes quedaba «Página 1» engañosa)
}

let precios = null;
function pintarProgreso() {
  const p = adaptador.modelo.progreso ? adaptador.modelo.progreso() : null;
  let texto = p ? `${p.conseguidas} de ${p.total}` : '';
  if (p && precios) {                                            // 3.7.30: valor de la colección (Σ tendencia Cardmarket × copias); «≈» porque es un precio de mercado
    const v = valorColeccion(precios, adaptador.mapa.cartas.map((c) => c.id), (id) => adaptador.modelo.cantidad(id));
    if (v.valoradas) texto += ` · ≈ ${eurEntero(v.total)}`;
  }
  $('progreso').textContent = texto;
}

/** Mantiene en la GPU solo las texturas de las páginas visibles y las vecinas (carga diferida + liberación). */
function sincronizarTexturas() {
  const e = album.estado;
  vista.sincronizar(paginasNecesarias([e.vueltas, e.objetivo], adaptador.mapa.totalPaginas, 1));
}

/** Giro de hoja. `l` = página protagonista tras el giro: al avanzar es la IZQUIERDA de la nueva doble página (la siguiente par); al retroceder, la DERECHA (la anterior impar). */
function avanzar(l = 'izq') { if (puedeNavegar() && album.estado.avanzar()) { lado = l; ladoValido(); pedirFrame(); sincronizarTexturas(); actualizarUi(); } }
function retroceder(l = 'der') { if (puedeNavegar() && album.estado.retroceder()) { lado = l; ladoValido(); pedirFrame(); sincronizarTexturas(); actualizarUi(); } }
/** Un paso de lectura (siguiente/anterior): la regla está en navegacion3d.js (pasoLectura) y se prueba en Node. */
function paso(direccion) {
  if (!puedeNavegar()) return;
  const e = album.estado, r = pasoLectura({ vueltas: e.objetivo, lado, n: dim.n, total: adaptador.mapa.totalPaginas, direccion, modo: modoEfectivo() });
  if (r.accion === 'lado') { lado = r.lado; actualizarUi(); }
  else if (r.accion === 'girar') direccion > 0 ? avanzar(r.lado) : retroceder(r.lado);
}
const siguiente = () => paso(+1), anterior = () => paso(-1);
function alternarVista() { if (!puedeNavegar()) return; manual = true; modoVista = modoEfectivo() === 'pagina' ? 'doble' : 'pagina'; actualizarUi(); }
function alternarAbrir() {
  if (!puedeNavegar()) return;
  if (album.estado.objetivo === 0) avanzar('der'); else irAPagina0();
}
function irAPagina0() {                                          // 3.7.22: cerrar también se anima (cascada de giros acelerada); antes era un salto seco
  while (album.estado.puedeRetroceder()) album.estado.retroceder();
  sincronizarTexturas(); actualizarUi(); pedirFrame();
}
function saltarA(pagina) {
  if (!puedeNavegar()) return;
  const r = irAPagina(album.estado, pagina, adaptador.mapa.totalPaginas);
  lado = pagina % 2 === 1 ? 'der' : 'izq';
  if (!r.animado) album.aplicar();
  sincronizarTexturas(); actualizarUi(); pedirFrame();
}

botones.abrir.onclick = alternarAbrir; botones.sig.onclick = siguiente; botones.ant.onclick = anterior; botones.vista.onclick = alternarVista;
botones.salto.onchange = () => saltarA(+botones.salto.value);
botones.metricas.onclick = () => { $('panel').hidden = !$('panel').hidden; pedirFrame(); };
botones.medir.onclick = () => medir();
botones.informe.onclick = async () => {
  const txt = JSON.stringify(metricas.instantanea(), null, 1);
  try { await navigator.clipboard.writeText(txt); $('estado').textContent = 'Informe copiado al portapapeles'; }
  catch { $('informe').hidden = false; $('informe').value = txt; $('informe').select(); }
};
addEventListener('keydown', (e) => {
  if (ctrl?.fichaAbierta) {
    if (e.key === 'Escape') { cerrarFicha(); return; }
    // 3.28–3.29 · con la ficha abierta: ← → carta anterior/siguiente (orden de lectura), ↑ ↓ suman/restan una copia, Intro amplía la carta
    if (ficha?.zoom || e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.('select, input, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); moverEnFicha(e.key === 'ArrowRight' ? 'der' : 'izq'); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === '+' || e.key === '-') {
      e.preventDefault(); if (!e.repeat) cantidadConTeclado(e.key === 'ArrowUp' || e.key === '+' ? +1 : -1);   // mantener pulsado no suma sin parar
    } else if (e.key === 'Enter' && !e.target.closest?.('button, a')) { e.preventDefault(); ficha.ampliar(); }   // en un botón elegido con Tab, Intro lo pulsa
    return;
  }
  // 3.19 · Esc por capas: ficha → menú ⋯ → ventana de confirmación → (nada abierto) vuelve a la biblioteca
  if (e.key === 'Escape') {
    if (e.defaultPrevented || document.querySelector('dialog[open]') || !$('menu-album').hidden || e.target.closest?.('select, input, textarea')) return;
    e.preventDefault();
    if (foco.visible) { ocultarFoco(); return; }                   // 3.27: primero quita el cursor de las cartas
    location.href = $('b-biblioteca').href;
    return;
  }
  if (e.target.closest?.('select, input, textarea') || e.altKey || e.ctrlKey || e.metaKey) return;   // el selector de página usa sus propias flechas
  const dir = { ArrowRight: 'der', ArrowLeft: 'izq', ArrowUp: 'arriba', ArrowDown: 'abajo' }[e.key];
  // 3.27 · las flechas mueven el cursor entre cartas (y cruzan de página al llegar al borde); Re Pág / Av Pág y Mayús+← → giran la hoja
  if (e.key === 'PageDown' || (e.shiftKey && dir === 'der')) { e.preventDefault(); siguiente(); }
  else if (e.key === 'PageUp' || (e.shiftKey && dir === 'izq')) { e.preventDefault(); anterior(); }
  else if (dir) { e.preventDefault(); moverFoco(dir); }
  else if ((e.key === 'Enter' || e.key === ' ') && (e.target === document.body || e.target === canvas)) {
    e.preventDefault();
    if (foco.visible && foco.nombre) abrirFicha(foco.nombre, true); else if (album?.estado.objetivo === 0) alternarAbrir();
  }
});

// ------------------------------------------------------------------ 3.27 · cursor del teclado entre cartas
// foco.nombre: la carta del cursor (también la última tocada con el ratón, para seguir desde ahí); foco.visible: el aro del cursor se ve.
// foco.pendiente: se ha girado la hoja (o cambiado de página) al cruzar un borde y se elige la carta de entrada cuando acaba el giro.
const foco = { nombre: null, visible: false, pendiente: null };
/** Cartas a la vista (con carta asignada) y su posición en el mesa: en la vista de una página, solo las de la página enfocada. */
function cartasVisibles() {
  if (!album || album.estado.animando) return [];
  const pagina = modoEfectivo() === 'pagina';
  return candidatosTocables(album.estado, adaptador, (n) => album.matrizMundo(n))
    .filter((c) => !pagina || (c.lado === 1) === (lado === 'der'))
    .map((c) => ({ nombre: c.nombre, x: c.matriz[12], z: c.matriz[14], pag: c.lado === 1 ? 1 : 0 }));   // lado −1 = dorso = página izquierda
}
function mostrarFoco(nombre) {
  foco.nombre = nombre; foco.visible = true; foco.pendiente = null;
  cursor.mostrar(album.nodo.get(nombre)); pedirFrame();
}
function ocultarFoco() { if (foco.visible) { foco.visible = false; cursor.ocultar(); pedirFrame(); } foco.pendiente = null; }
function moverFoco(dir) {
  if (!album || !puedeNavegar() || foco.pendiente) return;
  const vis = cartasVisibles();
  if (!vis.length) {                                              // álbum cerrado o contratapa: las flechas pasan hoja como siempre
    if (album.estado.animando) return;
    if (dir === 'der') { siguiente(); if (album.estado.objetivo > 0) foco.pendiente = { dir: 'der', z: null }; }
    else if (dir === 'izq') { anterior(); if (album.estado.objetivo > 0) foco.pendiente = { dir: 'izq', z: null }; }
    return;
  }
  const actual = foco.nombre && vis.find((c) => c.nombre === foco.nombre);
  if (!actual) { mostrarFoco(cartaDeEntrada(vis, 'der').nombre); return; }   // primera pulsación: aparece el cursor en la primera carta a la vista
  if (!foco.visible) { mostrarFoco(actual.nombre); return; }      // la última carta tocada con el ratón
  const v = cartaVecina(actual, vis, dir);
  if (v) { mostrarFoco(v.nombre); return; }
  if (dir === 'arriba' || dir === 'abajo') return;               // borde superior o inferior: se queda donde está
  const antes = album.estado.objetivo + lado;                     // borde lateral: página siguiente/anterior y se entra por la misma fila
  dir === 'der' ? siguiente() : anterior();
  if (album.estado.objetivo + lado !== antes) { foco.pendiente = { dir, z: actual.z }; cursor.ocultar(); }
}
/** 3.29 · ↑ / ↓ con la ficha abierta: suma o resta una copia, como los botones de la ficha. Con variantes, se suma a la que se ve en el álbum
 *  (o a la única que existe, o a la primera); restar quita como «Quitar una» (primero las sin clasificar). */
function cantidadConTeclado(delta) {
  if (!ctrl.fichaAbierta) return;
  cambioAMano();
  const c = adaptador.mapa.cartaPorId.get(ctrl.seleccion.id), vs = Array.isArray(c?.variantes) ? c.variantes : [];
  if (delta < 0) { if (adaptador.cantidad(ctrl.seleccion.id) > 0) ctrl.retirar(); return; }
  if (!vs.length) { ctrl.anadir(); return; }
  const v = adaptador.acabado(ctrl.seleccion.id) || vs[0].id;
  ctrl.cambiarVariante(v, +1);
}

/** 3.28 · Flechas con la ficha abierta: la ficha pasa a la carta vecina; en el borde lateral se cierra, se gira la hoja y se abre la de entrada. */
function moverEnFicha(dir) {
  if (!album || album.estado.animando || foco.pendiente) return;
  const vis = cartasVisibles(), actual = vis.find((c) => c.nombre === ctrl.seleccion.nombre);
  if (!actual) return;
  foco.visible = true;                                            // al cerrar la ficha, el cursor queda en la última carta vista
  const v = dir === 'der' || dir === 'izq' ? cartaEnLectura(actual, vis, dir === 'der' ? 1 : -1) : cartaVecina(actual, vis, dir);
  if (v) {
    if (ctrl.cambiarA(v.nombre)) { foco.nombre = v.nombre; resaltado.mostrar(album.nodo.get(v.nombre)); actualizarUi(); pedirFrame(); }   // la cámara la reencuadra el bucle (huella «sel:<carta>»)
    return;
  }
  if (dir === 'arriba' || dir === 'abajo') return;
  const antes = album.estado.objetivo + lado;
  ctrl.cerrar(); ctrl.ultimoCierre = -Infinity; resaltado.ocultar(true); cursor.ocultar(true);
  dir === 'der' ? siguiente() : anterior();
  if (album.estado.objetivo + lado !== antes) foco.pendiente = { dir, z: actual.z, ficha: true, lectura: true };
  else abrirFicha(actual.nombre, true);                           // última página: la ficha sigue en la misma carta
  claveCamara = huellaCamara(); aplicarCamara(true); actualizarUi(); pedirFrame();
}

/** En cada frame (barato: como mucho 18 bolsillos): coloca el cursor tras un giro y lo quita si su carta ya no está a la vista. */
function revisarFoco() {
  if (!album || album.estado.animando || (!foco.visible && !foco.pendiente)) return;
  const vis = cartasVisibles();
  if (foco.pendiente) {
    const p = foco.pendiente, o = p.lectura && ordenLectura(vis), c = p.lectura ? (p.dir === 'der' ? o[0] : o[o.length - 1]) : cartaDeEntrada(vis, p.dir, p.z); foco.pendiente = null;
    if (!c) ocultarFoco(); else if (p.ficha) abrirFicha(c.nombre, true); else mostrarFoco(c.nombre);
    return;
  }
  if (!vis.some((c) => c.nombre === foco.nombre)) ocultarFoco();  // se pasó la hoja con los botones, el gesto o el selector
}

// ------------------------------------------------------------------ selección táctil / ratón (rayo → bolsillo → adaptador)
const rayo = new THREE.Raycaster();
const puntero = { activo: false, x0: 0, y0: 0, x: 0, y: 0, arrastre: false, id: null };
const pellizco = { activo: false, id2: null, x2: 0, y2: 0, d: 0 };            // 3.7.21: pellizco con dos dedos = zoom (antes el segundo dedo se ignoraba y en iPhone no había zoom)
canvas.addEventListener('pointerdown', (e) => {
  if (!puntero.activo) {
    canvas.setPointerCapture(e.pointerId);
    Object.assign(puntero, { activo: true, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, arrastre: false });
    return;
  }
  if (!pellizco.activo && e.pointerId !== puntero.id) {         // segundo dedo: empieza el pellizco; ya no es un toque ni un deslizamiento
    canvas.setPointerCapture(e.pointerId);
    Object.assign(pellizco, { activo: true, id2: e.pointerId, x2: e.clientX, y2: e.clientY, d: Math.hypot(e.clientX - puntero.x, e.clientY - puntero.y) });
    puntero.arrastre = true;
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (pellizco.activo && (e.pointerId === puntero.id || e.pointerId === pellizco.id2)) {
    if (e.pointerId === puntero.id) { puntero.x = e.clientX; puntero.y = e.clientY; } else { pellizco.x2 = e.clientX; pellizco.y2 = e.clientY; }
    const d = Math.hypot(pellizco.x2 - puntero.x, pellizco.y2 - puntero.y);
    if (d > 20 && pellizco.d > 20 && !ctrl?.fichaAbierta) { orbita.zoom(pellizco.d / d); pedirFrame(300); }   // separar dedos = acercar (radio menor)
    pellizco.d = d;
    return;
  }
  if (!puntero.activo || e.pointerId !== puntero.id) return;
  if (Math.hypot(e.clientX - puntero.x0, e.clientY - puntero.y0) > 10) puntero.arrastre = true;     // umbral algo mayor en táctil
  if (puntero.arrastre && !ctrl?.fichaAbierta && modoEfectivo() !== 'pagina') { orbita.arrastrar(e.clientX - puntero.x, e.clientY - puntero.y, canvas.clientWidth); pedirFrame(300); }
  puntero.x = e.clientX; puntero.y = e.clientY;
});
const soltar = (e, cancelado) => {
  if (pellizco.activo && (e.pointerId === puntero.id || e.pointerId === pellizco.id2)) {            // al levantar cualquiera de los dos dedos acaba todo el gesto
    pellizco.activo = false; puntero.activo = false;
    return;
  }
  if (!puntero.activo || e.pointerId !== puntero.id) return;
  puntero.activo = false;
  if (cancelado) return;
  if (!puntero.arrastre) tocar(e.clientX, e.clientY);
  else if (modoEfectivo() === 'pagina' && !ctrl?.fichaAbierta) deslizar(e.clientX - puntero.x0, e.clientY - puntero.y0);
};
/** Gesto de lectura en modo página: deslizar a la izquierda = siguiente, a la derecha = anterior (como pasar las hojas de un álbum). */
function deslizar(dx, dy) {
  if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  dx < 0 ? siguiente() : anterior();
}
canvas.addEventListener('pointerup', (e) => soltar(e, false));
canvas.addEventListener('pointercancel', (e) => soltar(e, true));
canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (!ctrl?.fichaAbierta) { orbita.zoom(Math.exp(e.deltaY * 0.001)); pedirFrame(300); } }, { passive: false });

function tocar(cx, cy) {
  if (!album || ctrl.fichaAbierta) return;
  const r = canvas.getBoundingClientRect();
  rayo.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camara);
  const o = [rayo.ray.origin.x, rayo.ray.origin.y, rayo.ray.origin.z], d = [rayo.ray.direction.x, rayo.ray.direction.y, rayo.ray.direction.z];
  if (album.estado.objetivo === 0 && !album.estado.animando) {     // 3.27 · álbum cerrado: tocar la tapa lo abre (en iPhone no hace falta el botón)
    const tapa = album.cajaMalla('Tapa_Malla');
    if (tapa && rayoCaja(o, d, aabbMundo(tapa), 0.01) !== null) alternarAbrir();
    return;
  }
  const golpe = elegirBolsillo(o, d, candidatosTocables(album.estado, adaptador, (n) => album.matrizMundo(n)));
  if (!golpe) return;                                            // toque fuera del álbum, en un hueco o en una hoja enterrada: no pasa nada
  abrirFicha(golpe.nombre, false);
}
/** Abre la ficha de un bolsillo (toque o Intro). Con el teclado, el cursor vuelve a verse al cerrar la ficha. */
function abrirFicha(nombre, conTeclado) {
  if (!ctrl.seleccionar(nombre)) return;
  foco.nombre = nombre; foco.visible = conTeclado; foco.pendiente = null; cursor.ocultar(true);
  resaltado.mostrar(album.nodo.get(nombre));
  claveCamara = huellaCamara(); aplicarCamara(true);              // encuadre de selección: la página entera dentro del espacio que deja la ficha
  actualizarUi(); pedirFrame();
}

function cerrarFicha() {
  if (!ctrl.fichaAbierta) return;
  ctrl.cerrar();
  resaltado.ocultar();
  if (foco.visible && foco.nombre) cursor.mostrar(album.nodo.get(foco.nombre));   // 3.27: se sigue navegando con las flechas desde esa carta
  claveCamara = huellaCamara(); aplicarCamara(true);               // vuelve al encuadre de la navegación (calculado de nuevo, no un valor guardado)
  actualizarUi(); pedirFrame();
}

// ------------------------------------------------------------------ medición automática: recorre el álbum entero
function medir() {
  if (ctrl.fichaAbierta || continuo) return;
  continuo = true; metricas.iniciarBench();
  const n = album.geo.elementos;
  const guion = [...Array(n).fill('sig'), ...Array(n).fill('ant')];
  const paso = () => {
    if (!guion.length) { const r = metricas.terminarBench(); continuo = false; actualizarUi(); $('estado').textContent = `Medición: ${r.fpsMedio} FPS medios, mínimo ${r.fpsMinimo}, ${r.frames} frames en ${r.duracionS} s`; return; }
    if (!album.estado.animando) { guion.shift() === 'sig' ? album.estado.avanzar() : album.estado.retroceder(); sincronizarTexturas(); }
    setTimeout(paso, 120);
  };
  actualizarUi(); paso();
}

// ------------------------------------------------------------------ medición por ESCENAS (3.7.2a): las mismas 6 escenas para comparar `?calidad=legado` con baja/media/alta
// Uso (Chrome o Safari, en el dispositivo real):  .../prueba-3d/?calidad=legado&auto=escenas   y luego   ?calidad=media&auto=escenas ...
// El resultado (JSON) aparece en el cuadro de texto «informe» para copiarlo. Todo es medición real del navegador donde se abre; no se inventa nada.
const esperarMs = (ms) => new Promise((ok) => setTimeout(ok, ms));
const ESCENAS = [
  { id: 'cerrado', vueltas: 0 }, { id: 'pagina-1', vueltas: 1 }, { id: 'paginas-4-5', vueltas: 3 }, { id: 'pagina-18', vueltas: 10 },
  { id: 'carta-seleccionada', vueltas: 3, seleccionar: true }, { id: 'giro-de-hoja', vueltas: 3, giro: true },
];
async function medirEscenas(segundos = 4) {
  if (!album || ctrl.fichaAbierta || continuo) return null;
  const salida = { fecha: new Date().toISOString(), calidad: aspecto.resumen(), pixelRatio: renderer.getPixelRatio(), escenas: [] };
  const antes = performance.now();
  continuo = true;
  for (const e of ESCENAS) {
    album.estado.irA(e.vueltas); album.aplicar(); sincronizarTexturas(); claveCamara = huellaCamara(); aplicarCamara(false); actualizarUi();
    await esperarMs(1500);                                      // deja cargar texturas y acabar el encuadre antes de medir
    if (e.seleccionar) {
      const t = album.estado.tocables().find((x) => x.cara === 'F') || album.estado.tocables()[0];
      const nombre = t && `Hoja_${t.hoja - 1}_${t.cara}_Bolsillo_4`;
      if (nombre && ctrl.seleccionar(nombre)) { resaltado.mostrar(album.nodo.get(nombre)); claveCamara = huellaCamara(); aplicarCamara(true); actualizarUi(); await esperarMs(900); }
    }
    metricas.iniciarBench();
    const t0 = performance.now();
    while (performance.now() - t0 < segundos * 1000) {
      if (e.giro && !album.estado.animando) { (album.estado.vueltas <= 3 ? album.estado.avanzar() : album.estado.retroceder()); sincronizarTexturas(); }
      await esperarMs(100);
    }
    const r = metricas.terminarBench(), i = metricas.instantanea();
    salida.escenas.push({ escena: e.id, ...r, llamadasDibujo: i.ultimoFrame.llamadasDibujo, triangulos: i.ultimoFrame.triangulosDibujados, geometrias: i.memoriaRenderer.geometrias, materiales: i.materiales,
      texturas: i.memoriaRenderer.texturas, texturasMB_estimados: i.texturasEstimadas.megabytes });
    if (e.seleccionar && ctrl.fichaAbierta) cerrarFicha();
  }
  continuo = false;
  salida.duracionTotalS = +((performance.now() - antes) / 1000).toFixed(1);
  salida.carga = { ...album.carga, ...metricas.tiempos };
  $('informe').hidden = false; $('informe').value = JSON.stringify(salida, null, 1); $('estado').textContent = 'Medición por escenas terminada: copia el informe.';
  actualizarUi(); pedirFrame();
  return salida;
}

// ------------------------------------------------------------------ bucle: solo dibuja cuando hay algo que mostrar (ahorra batería en iPhone)
let tPrev = performance.now(), primerFrame = false;
function bucle(ahora) {
  requestAnimationFrame(bucle);
  const dt = Math.min(0.05, (ahora - tPrev) / 1000);
  tPrev = ahora;
  if (!album) return;
  let activo = album.actualizar(dt);
  activo = orbita.actualizar(dt) || activo;
  activo = vista.avanzar(dt) || activo;
  activo = resaltado.avanzar(dt) || activo;
  activo = cursor.avanzar(dt) || activo;
  revisarFoco();
  const clave = album.estado.vueltas + ':' + album.estado.objetivo + ':' + album.estado.animando;
  if (clave !== claveNav) { claveNav = clave; sincronizarTexturas(); actualizarUi(); }
  const hc = huellaCamara();
  if (hc !== claveCamara) { claveCamara = hc; aplicarCamara(true); }      // cambio de estado: cerrado ↔ abierto, giro, página enfocada…
  if (!(activo || continuo || forzarDibujo || ahora < sucioHasta)) { metricas.pausa(); return; }
  aspecto.sincronizar(album);                                              // la sombra de contacto sigue al estado (cerrado/abierto/giro)
  const [x, y, z] = orbita.posicion();
  camara.position.set(x, y, z);
  camara.lookAt(...orbita.objetivo);
  renderer.render(scene, camara);
  metricas.frame(ahora);
  if (!primerFrame) { primerFrame = true; metricas.tiempo('primerFrameMs', ahora); }
}

// ------------------------------------------------------------------ arranque
async function arrancar() {
  const t0 = performance.now();
  // Persistencia: LA MISMA base de datos de la app original ('coleccion-teselia'). ?bd=otro-nombre solo para pruebas con datos ajenos.
  let modelo, soloLectura = false, almacen = null;
  try { almacen = await Almacen.abrir(params.get('bd') || undefined); } catch (e) { almacen = null; }
  // 3.38 · los álbumes de la web solo los abre el administrador (en las pruebas automáticas, también)
  const verFijos = adminGuardado() || (navigator.webdriver && !params.has('visitante')) || await comprobarAdmin();
  if (!esPropio(albumActual.id) && !verFijos) {
    throw new Error('Este álbum es privado. Crea los tuyos desde la biblioteca, con «Nuevo álbum».');
  }
  // 3.37 · el álbum: de la web (catálogo y precios en datos/) o creado en la app (todo en el dispositivo)
  const carga = await cargarAlbumColeccion(albumActual.id, almacen);
  if (!carga) {
    throw new Error('Este álbum se creó en otro dispositivo y todavía no ha llegado a este. Entra con tu cuenta (Cuenta) para traerlo, o vuelve a la biblioteca.');
  }
  albumActual = carga.album; ponerNombre();
  const propio = Boolean(carga.propio), catalogo = carga.catalogo;
  const mapa = crearMapa(catalogo);
  aspecto.disenoPortada = conCifras(albumActual, mapa.cartas.length).portada;     // 3.16: la portada con el nº real de cartas
  try {
    if (!almacen) throw new Error('el navegador no deja guardar datos');
    modelo = new ModeloColeccion(almacen, mapa.cartas);
    await modelo.cargar();
  } catch (e) {
    soloLectura = true;
    avisar('No se puede usar el almacenamiento del navegador (¿modo privado?). El álbum se muestra en solo lectura: ' + (e && e.message || e));
    modelo = { cargar: async () => {}, cantidad: () => 0, cambiar: async () => { throw new Error('almacenamiento no disponible'); }, progreso: () => null };
  }
  adaptador = new AdaptadorColeccion(mapa, modelo);
  await adaptador.cargar();
  // el modelo tiene tantas hojas como pide el catálogo: album.glb (9 hojas, Teselia) o album-<n>h.glb (blender/exportar_glb.py --hojas n)
  const modeloPorDefecto = mapa.hojas === 9 ? 'album.glb' : `album-${mapa.hojas}h.glb`;
  album = await cargarAlbum('modelo/' + (/^[\w.-]+\.glb$/.test(params.get('modelo') || '') ? params.get('modelo') : modeloPorDefecto), { renderer });
  if (album.geo.n !== mapa.hojas) throw new Error(`El modelo tiene ${album.geo.n} hojas y el catálogo necesita ${mapa.hojas}. Regenera album.glb (python blender/exportar_glb.py).`);
  if (diag) diag.estadoGlb = 'ok · ' + album.carga.bytes + ' bytes · descarga ' + Math.round(album.carga.descargaMs) + ' ms · proceso ' + Math.round(album.carga.procesoMs) + ' ms';
  album.onCambio = () => pedirFrame();
  if (reducirMovimiento) album.estado.duracion = 0.01;
  scene.add(album.escena);
  aspecto.alCambiar = () => pedirFrame();
  aspecto.aplicarAlbum(album);
  dim = dimensiones(album.params);
  resaltado = new Resaltado({ reducirMovimiento: () => reducirMovimiento, color: TEMAS[tema].aro });
  cursor = new Resaltado({ reducirMovimiento: () => reducirMovimiento, color: TEMAS[tema].aro, opacidad: 0.5 });   // 3.27: cursor del teclado, más tenue que la selección

  const manifiesto = await cargarManifiesto();
  // 3.43 · tus imágenes propias (Map id → data URL): el 3D y la ficha las usan antes que cualquier otra
  const propias = almacen ? await almacen.imagenesPropias().catch(() => new Map()) : new Map();
  precios = propio ? (carga.precios?.cartas ? carga.precios : null) : await cargarPrecios('../../' + albumActual.precios);   // opcional: null si no hay precios
  cache = new CacheTexturas({ presupuestoBytes: (+params.get('mem') || 32) * 1048576, concurrencia: 4 });
  vista = new VistaBolsillos({ album, adaptador, cache, materialCarta: (c, r) => aspecto.materialCarta(c, r), reducirMovimiento: () => reducirMovimiento,
    productores: crearProductores({ manifiesto, remotas: propio, propias, anisotropia: Math.min(4, renderer.capabilities.getMaxAnisotropy()) }) });   // propio: imágenes de TCGdex
  vista.animandoTurno = () => album.estado.animando;

  ficha = new FichaUI({ raiz: $('ficha'), fondo: $('f-fondo'), imagen: $('f-imagen'), miImagen: $('f-mi-imagen'), quitarImagen: $('f-quitar-imagen'), archivo: $('f-archivo'), variantes: $('f-variantes'), nombre: $('f-nombre'), expansion: $('f-exp'), numero: $('f-num'), precio: $('f-precio'), cardmarket: $('f-cardmarket'), cantidad: $('f-cant'),
    estadoTxt: $('f-estado-txt'), error: $('f-error'), cerrar: $('f-cerrar'), anadir: $('f-mas'), retirar: $('f-menos') },
  { manifiesto, precios, remotas: propio, propias, alMiImagen: soloLectura ? null : (f) => ponerMiImagen(f), alQuitarImagen: () => quitarMiImagen(), alCerrar: cerrarFicha, alAnadir: () => { cambioAMano(); ctrl.anadir(); }, alRetirar: () => { cambioAMano(); ctrl.retirar(); },
    // 3.16 · variantes (normal / reverse / holo): solo en álbumes cuyo catálogo las trae (Asako Ito)
    alVariante: (v, d) => { cambioAMano(); ctrl.cambiarVariante(v, d); }, alClasificar: (v) => { cambioAMano(); ctrl.clasificar(v); }, alVisible: (v) => { cambioAMano(); ctrl.fijarVisible(v); } });
  if (soloLectura) { $('f-mas').disabled = $('f-menos').disabled = true; }
  // 3.43 · «Usar mi imagen» / «Quitar mi imagen» (y pegar una imagen con Ctrl+V / Cmd+V con la ficha abierta)
  const imagenCambiada = (id) => { vista.actualizarImagen(id); if (ctrl.fichaAbierta && ctrl.seleccion.id === id) ficha.recargarImagen(); pedirFrame(); };
  async function ponerMiImagen(archivo) {
    if (!ctrl.fichaAbierta || soloLectura) return;
    const id = ctrl.seleccion.id; ficha.ocupadoImagen(true);
    try {
      const datos = await prepararImagen(archivo);
      await almacen.guardarImagenPropia(id, datos);
      propias.set(id, datos); imagenCambiada(id);
      avisar('Imagen guardada' + (navigator.onLine === false ? ' (se subirá a tu cuenta al volver la conexión).' : '.')); setTimeout(() => avisar(''), 3000);
    } catch (e) { avisar('No se pudo usar esa imagen: ' + (e.message || e)); setTimeout(() => avisar(''), 5000); }
    finally { ficha.ocupadoImagen(false); }
  }
  async function quitarMiImagen() {
    if (!ctrl.fichaAbierta || soloLectura) return;
    const id = ctrl.seleccion.id; ficha.ocupadoImagen(true);
    try { await almacen.quitarImagenPropia(id); propias.delete(id); imagenCambiada(id); }
    catch (e) { avisar('No se pudo quitar: ' + (e.message || e)); setTimeout(() => avisar(''), 5000); }
    finally { ficha.ocupadoImagen(false); }
  }
  document.addEventListener('paste', (e) => { const f = ctrl?.fichaAbierta && !soloLectura && imagenPegada(e); if (f) { e.preventDefault(); ponerMiImagen(f); } });
  const fichaConProgreso = Object.create(ficha); // tras cada cambio confirmado se refresca el contador de progreso
  fichaConProgreso.actualizar = (d) => { ficha.actualizar(d); pintarProgreso(); };
  ctrl = new Controlador({ adaptador, estado: album.estado, vista, ficha: fichaConProgreso });

  // selector de salto directo
  const sel = botones.salto;
  for (let p = 1; p <= mapa.totalPaginas; p++) {
    const primera = mapa.paginas[p - 1].bolsillos.find(Boolean);
    sel.append(new Option(`Página ${p} · ${primera ? primera.nombre : ''}`, String(p)));
  }
  // 3.13–3.14 · menú «⋯»: añadir / eliminar todas las cartas del álbum (con confirmación y deshacer)
  const releer = async () => { await adaptador.cargar(); vista.refrescar(); pintarProgreso(); pedirFrame(); };
  let idAviso = 0;
  let otrosAlbumes = null;                                        // catálogos de los demás álbumes (solo para avisar de cartas compartidas)
  const cargarOtros = async () => otrosAlbumes || (otrosAlbumes = await Promise.all((await listarTodos(almacen, { fijos: verFijos })).filter((a) => a.id !== albumActual.id)
    .map(async (a) => ({ nombre: a.nombre, ids: (await cargarAlbumColeccion(a.id, almacen)).catalogo.cartas.map((c) => c.id) }))));   // 3.37: también los creados en la app
  // 3.44 · álbumes creados en la app: «Editar cartas» (añadir las que salgan más adelante, quitar…) abre el selector en la biblioteca
  if (propio && !soloLectura) {
    const b = $('m-editar'); b.hidden = false;
    b.onclick = () => {
      const u = new URL($('b-biblioteca').href);
      u.searchParams.set('editar', albumActual.id);
      if (params.get('bd')) u.searchParams.set('bd', params.get('bd'));                     // pruebas: la misma base de datos
      location.href = u.href;
    };
    // 3.45 · borrar el álbum desde el visor (las cartas marcadas no se tocan) y volver a la biblioteca
    const borrar = $('m-borrar'); borrar.hidden = false;
    borrar.onclick = async () => {
      if (!confirm(`¿Borrar el álbum «${albumActual.nombre}»?\n\nLas cartas que tengas marcadas NO se borran: siguen en tu colección y en los demás álbumes.`)) return;
      await almacen.quitarAlbumPropio(albumActual.id);
      const u = new URL($('b-biblioteca').href);
      if (params.get('bd')) u.searchParams.set('bd', params.get('bd'));
      location.href = u.href;
    };
  }
  menuAlbum = montarMenu({ boton: $('b-opciones'), menu: $('menu-album'), todas: $('m-todas'), quitar: $('m-quitar'), deshacer: $('m-deshacer'),
    dialogo: $('d-todas'), titulo: $('d-todas-t'), texto: $('d-todas-txt'), aceptar: $('d-aceptar'), cancelar: $('d-cancelar') }, {
    nombre: albumActual.nombre, total: mapa.cartas.length, soloLectura, cartas: mapa.cartas, cantidadDe: (id) => modelo.cantidad(id),
    completar: async (ids) => { if (ids.length) { await almacen.importar(copiasParaCompletar(ids), 'combinar'); } await releer(); },
    // eliminar: se lee la colección ENTERA en el momento y se reescribe sin las cartas del álbum (todo lo demás, con su cantidad exacta)
    vaciar: async (ids) => { if (ids.length) { await almacen.importar(copiasSinAlbum(await almacen.leerTodas(), mapa.cartas.map((c) => c.id)), 'reemplazar'); } await releer(); },
    compartidas: async (ids) => compartidasCon(ids, await cargarOtros()),
    deshacer: async () => { await almacen.deshacerImportacion(); await releer(); },
    avisar: (t) => { avisar(t); const id = ++idAviso; setTimeout(() => { if (id === idAviso) avisar(''); }, 5000); },
  });
  // 3.31 · con sesión iniciada, la colección se sincroniza con la cuenta (lo que marques aquí aparece en tus otros dispositivos y al revés)
  if (almacen && !soloLectura && !params.get('bd')) {             // ?bd=… (pruebas) nunca toca la cuenta
    let primeraAvisada = false;
    iniciarSincronizacion(almacen, {
      alCambiar: async (ids, r) => {                               // han llegado cambios de otro dispositivo
        if (r.imagenes?.length) {                                    // 3.43: imágenes propias puestas o quitadas en otro dispositivo
          const nuevas = await almacen.imagenesPropias();
          propias.clear(); for (const [k, v] of nuevas) propias.set(k, v);
          for (const id of r.imagenes) imagenCambiada(id);
        }
        try {
          await releer(); cambioAMano();
          if (ctrl.fichaAbierta) ficha.actualizar(adaptador.fichaDe(ctrl.seleccion.nombre));
          for (const id of ids) vista.actualizarAcabado?.(id);
        } catch (e) { console.warn('No se pudieron mostrar los cambios sincronizados:', e); }
        if (r.primera && !primeraAvisada) { primeraAvisada = true; avisar('Colección sincronizada con tu cuenta.'); setTimeout(() => avisar(''), 4000); }
      },
      alEstado: (e) => { if (e.estado === 'error') console.warn('Sincronización:', e.error?.message || e.error); },
    });
  }
  // 3.37 · álbum creado en la app con más de 7 días: se vuelve a pedir a TCGdex en segundo plano (cartas nuevas, precios); se verá al reabrirlo
  if (propio && !soloLectura && navigator.onLine !== false && Date.now() - Date.parse(catalogo.generado || 0) > 7 * 864e5) {
    actualizarAlbumPropio(almacen, albumActual.id).then((r) => {
      if (r?.nuevas) { avisar(`Han salido ${r.nuevas === 1 ? 'una carta nueva' : r.nuevas + ' cartas nuevas'} para este álbum: añádelas desde ⋯ › Añadir o quitar cartas.`); setTimeout(() => avisar(''), 8000); }
      else if (r && r.cartas !== mapa.cartas.length) { avisar(`El álbum tiene cartas nuevas (${r.cartas}). Vuelve a abrirlo para verlas.`); setTimeout(() => avisar(''), 6000); }
    }).catch((e) => console.warn('No se pudo actualizar el álbum desde TCGdex:', e));
  }
  addEventListener('visibilitychange', async () => {            // volver de la app original (otra pestaña) → releer lo guardado
    if (document.visibilityState !== 'visible' || ctrl.fichaAbierta) return;
    try { await adaptador.cargar(); vista.refrescar(); pintarProgreso(); cambioAMano(); } catch (e) { /* si falla se sigue con lo que hay */ }
  });

  metricas = new Metricas($('panel'), renderer, album, cache, vista);
  metricas.tiempo('modeloListoMs', performance.now());
  metricas.tiempo('arranqueMs', performance.now() - t0);
  // 3.46 · desde «Buscar carta» de la biblioteca (?buscar=meowth): se abre por la primera página donde está esa carta
  const buscada = String(params.get('buscar') || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const paginaBuscada = buscada.length >= 2 ? mapa.paginas.find((p) => p.bolsillos.some((c) => c && String(c.nombre).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(buscada)))?.numero : null;
  const inicial = +params.get('pagina') || paginaBuscada || 0;
  if (inicial >= 1 && inicial <= mapa.totalPaginas) { album.estado.irA(vueltasParaPagina(inicial)); album.aplicar(); lado = inicial % 2 === 1 ? 'der' : 'izq'; }
  sincronizarTexturas(); pintarProgreso(); actualizarUi();
  ajustarTamano();                                              // primer encuadre (instantáneo) con la interfaz ya montada
  $('cargando').hidden = true;
  // 3.7.23 · Entrada: un dolly suave hasta el plano héroe. Nunca en automatización (las pruebas capturan a los 500 ms), ni con enlaces profundos ni mediciones.
  if (!reducirMovimiento && !navigator.webdriver && !params.get('auto') && !(+params.get('pagina') >= 1)) {
    const destino = orbita.estado();
    orbita.az = destino.az + 10 * GRAD;
    orbita.el = Math.min(orbita.limites.el[1], destino.el + 16 * GRAD);
    orbita.radio = Math.min(orbita.limites.radio[1], destino.radio * 1.45);
    orbita.llevarA(destino, 1.6);
    pedirFrame(1800);
  }
  setInterval(() => { if (!$('panel').hidden) metricas.pintar(); }, 500);
  console.info('Álbum 3D · fase ' + FASE + ' · tapa: ' + (aspecto.resumen().portada ? 'lámina de ' + albumActual.nombre : aspecto.resumen().emblema ? 'emblema bordado' : 'lisa (nivel legado o ?emblema=0)'));
  window.__album3d = { FASE, medirEscenas, aspecto, dim, resaltado, cursor, foco, diagCam, reservado, album, orbita, metricas, THREE, scene, camara, renderer, cache, vista, adaptador, ctrl };   // para depurar desde la consola
  requestAnimationFrame(bucle);
  if (params.get('auto') === 'medir') setTimeout(medir, 800);
  if (params.get('auto') === 'escenas') setTimeout(() => medirEscenas(), 1500);
}

arrancar().catch((err) => {
  console.error(err);
  if (diag) diag.estadoGlb = 'ERROR: ' + err.message;
  $('cargando').hidden = false;
  $('cargando').textContent = 'Error: ' + err.message;
});
