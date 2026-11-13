// Álbum 3D de la colección REAL (Fase 3.6.2): Three.js + catálogo + IndexedDB (mismos módulos que la app original).
// Regla de oro heredada: primero se guarda en IndexedDB y SOLO si se confirma se actualiza la ficha y el 3D.
import * as THREE from 'three';
import { Almacen } from '../../js/almacen.js';
import { ModeloColeccion } from '../../js/album/modelo.js';
import { crearMapa, AdaptadorColeccion } from './adaptador-coleccion.js';
import { cargarAlbum } from './album3d.js';
import { OrbitaLigera } from './camara.js';
import { dimensiones, puntosVista, puntosGiro, calcularEncuadre, elevacionPara, planos, reservadoDesdeDom, claseVista, COMPOSICION, cajasReales, cajasDimensiones, puntosPagina, puntosConjunto, elegirEncuadreSeleccion } from './encuadre.js';
import { crearGeometria } from './logica.js';
import { Resaltado } from './resaltado.js';
import { Metricas } from './metricas.js';
import { Aspecto, elegirCalidad } from './aspecto.js';
import { Diagnostico } from './diagnostico.js';
import { CacheTexturas } from './texturas.js';
import { crearProductores, cargarManifiesto } from './texturas3d.js';
import { VistaBolsillos } from './bolsillos3d.js';
import { Controlador } from './controlador.js';
import { FichaUI } from './ficha-ui.js';
import { etiquetaPaginas, paginasNecesarias, irAPagina, vueltasParaPagina, pasoLectura } from './navegacion3d.js';
import { elegirBolsillo, candidatosTocables } from './picking.js';

const $ = (id) => document.getElementById(id);
const GRAD = Math.PI / 180;
const params = new URLSearchParams(location.search);
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
const aspecto = new Aspecto({ renderer, scene, nivel: calidad.nivel, origen: calidad.origen });

const orbita = new OrbitaLigera();
let album = null, metricas = null, diag = null, cache = null, vista = null, ctrl = null, adaptador = null, ficha = null;
let sucioHasta = 0, continuo = false, forzarDibujo = false, claveNav = '';
const pedirFrame = (ms = 1200) => { sucioHasta = Math.max(sucioHasta, performance.now() + ms); };
const avisar = (t) => { $('aviso').textContent = t || ''; $('aviso').hidden = !t; };

// ------------------------------------------------------------------ cámara cinematográfica (Fase 3.7.1)
// El encuadre NO usa distancias fijas: se calcula con calcularEncuadre() a partir del viewport, la proporción, la elevación, las dimensiones reales
// del modelo, las páginas visibles y el espacio que ocupan la cabecera, la barra inferior y la ficha (medidos en el DOM).
const diagCam = { nivel: '', radio: 0 };       // para depurar y para las pruebas de la página real
let dim = null, tamano = { w: 0, h: 0 }, claveCamara = '', resaltado = null;
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
    return calcularEncuadre({ puntos: [...puntosVista({ vueltas: e.vueltas, dim }), ...puntosVista({ vueltas: e.objetivo, dim }), ...puntosGiro(dim)], fovGrados: FOV, aspect, el, reservado: res, margen: COMPOSICION.margenDoble });
  }
  if (modo === 'pagina' && e.vueltas > 0) {
    const cajas = cajasDe(e.vueltas, true);
    return calcularEncuadre({ puntos: puntosPagina({ lado, cajas, hoja: hojaAncho() }), fovGrados: FOV, aspect, el, reservado: res, margen: COMPOSICION.margen, centroVisual: cara(cajas, lado), sesgo: COMPOSICION.sesgoOptico });
  }
  const cerrado = e.vueltas === 0;
  return calcularEncuadre({ puntos: puntosConjunto(cajasDe(e.vueltas, true)), fovGrados: FOV, aspect, el, reservado: res, margen: cerrado ? COMPOSICION.margen : COMPOSICION.margenDoble });
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
  sel.value = String((modo === 'pagina' ? (lado === 'izq' ? izquierda : derecha) : derecha) || derecha || izquierda || '');
}

function pintarProgreso() {
  const p = adaptador.modelo.progreso ? adaptador.modelo.progreso() : null;
  $('progreso').textContent = p ? `${p.conseguidas} de ${p.total}` : '';
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
function irAPagina0() { album.estado.irA(0); album.aplicar(); sincronizarTexturas(); actualizarUi(); pedirFrame(); }
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
  if (ctrl?.fichaAbierta) { if (e.key === 'Escape') cerrarFicha(); return; }
  if (e.key === 'ArrowRight') siguiente(); else if (e.key === 'ArrowLeft') anterior();
});

// ------------------------------------------------------------------ selección táctil / ratón (rayo → bolsillo → adaptador)
const rayo = new THREE.Raycaster();
const puntero = { activo: false, x0: 0, y0: 0, x: 0, y: 0, arrastre: false, id: null };
canvas.addEventListener('pointerdown', (e) => {
  if (puntero.activo) return;                                    // un solo dedo/puntero cuenta como toque
  canvas.setPointerCapture(e.pointerId);
  Object.assign(puntero, { activo: true, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, arrastre: false });
});
canvas.addEventListener('pointermove', (e) => {
  if (!puntero.activo || e.pointerId !== puntero.id) return;
  if (Math.hypot(e.clientX - puntero.x0, e.clientY - puntero.y0) > 10) puntero.arrastre = true;     // umbral algo mayor en táctil
  if (puntero.arrastre && !ctrl?.fichaAbierta && modoEfectivo() !== 'pagina') { orbita.arrastrar(e.clientX - puntero.x, e.clientY - puntero.y, canvas.clientWidth); pedirFrame(300); }
  puntero.x = e.clientX; puntero.y = e.clientY;
});
const soltar = (e, cancelado) => {
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
  const o = rayo.ray.origin, d = rayo.ray.direction;
  const golpe = elegirBolsillo([o.x, o.y, o.z], [d.x, d.y, d.z], candidatosTocables(album.estado, adaptador, (n) => album.matrizMundo(n)));
  if (!golpe) return;                                            // toque fuera del álbum, en un hueco o en una hoja enterrada: no pasa nada
  if (ctrl.seleccionar(golpe.nombre)) {
    resaltado.mostrar(album.nodo.get(golpe.nombre));
    claveCamara = huellaCamara(); aplicarCamara(true);              // encuadre de selección: la página entera dentro del espacio que deja la ficha
    actualizarUi(); pedirFrame();
  }
}

function cerrarFicha() {
  if (!ctrl.fichaAbierta) return;
  ctrl.cerrar();
  resaltado.ocultar();
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
  const catalogo = await (await fetch('../../datos/catalogo/coleccion-teselia.json')).json();
  const mapa = crearMapa(catalogo);
  // Persistencia: LA MISMA base de datos de la app original ('coleccion-teselia'). ?bd=otro-nombre solo para pruebas con datos ajenos.
  let modelo, soloLectura = false;
  try {
    const almacen = await Almacen.abrir(params.get('bd') || undefined);
    modelo = new ModeloColeccion(almacen, mapa.cartas);
    await modelo.cargar();
  } catch (e) {
    soloLectura = true;
    avisar('No se puede usar el almacenamiento del navegador (¿modo privado?). El álbum se muestra en solo lectura: ' + (e && e.message || e));
    modelo = { cargar: async () => {}, cantidad: () => 0, cambiar: async () => { throw new Error('almacenamiento no disponible'); }, progreso: () => null };
  }
  adaptador = new AdaptadorColeccion(mapa, modelo);
  await adaptador.cargar();
  album = await cargarAlbum('modelo/' + (/^[\w.-]+\.glb$/.test(params.get('modelo') || '') ? params.get('modelo') : 'album.glb'), { renderer });
  if (album.geo.n !== mapa.hojas) throw new Error(`El modelo tiene ${album.geo.n} hojas y el catálogo necesita ${mapa.hojas}. Regenera album.glb (python blender/exportar_glb.py).`);
  if (diag) diag.estadoGlb = 'ok · ' + album.carga.bytes + ' bytes · descarga ' + Math.round(album.carga.descargaMs) + ' ms · proceso ' + Math.round(album.carga.procesoMs) + ' ms';
  album.onCambio = () => pedirFrame();
  if (reducirMovimiento) album.estado.duracion = 0.01;
  scene.add(album.escena);
  aspecto.aplicarAlbum(album);
  dim = dimensiones(album.params);
  resaltado = new Resaltado({ reducirMovimiento: () => reducirMovimiento });

  const manifiesto = await cargarManifiesto();
  cache = new CacheTexturas({ presupuestoBytes: (+params.get('mem') || 32) * 1048576, concurrencia: 4 });
  vista = new VistaBolsillos({ album, adaptador, cache, materialCarta: (c, r) => aspecto.materialCarta(c, r), reducirMovimiento: () => reducirMovimiento,
    productores: crearProductores({ manifiesto, anisotropia: Math.min(4, renderer.capabilities.getMaxAnisotropy()) }) });
  vista.animandoTurno = () => album.estado.animando;

  ficha = new FichaUI({ raiz: $('ficha'), fondo: $('f-fondo'), imagen: $('f-imagen'), nombre: $('f-nombre'), expansion: $('f-exp'), numero: $('f-num'), cantidad: $('f-cant'),
    estadoTxt: $('f-estado-txt'), error: $('f-error'), cerrar: $('f-cerrar'), anadir: $('f-mas'), retirar: $('f-menos') },
  { manifiesto, alCerrar: cerrarFicha, alAnadir: () => ctrl.anadir(), alRetirar: () => ctrl.retirar() });
  if (soloLectura) { $('f-mas').disabled = $('f-menos').disabled = true; }
  const fichaConProgreso = Object.create(ficha); // tras cada cambio confirmado se refresca el contador de progreso
  fichaConProgreso.actualizar = (d) => { ficha.actualizar(d); pintarProgreso(); };
  ctrl = new Controlador({ adaptador, estado: album.estado, vista, ficha: fichaConProgreso });

  // selector de salto directo
  const sel = botones.salto;
  for (let p = 1; p <= mapa.totalPaginas; p++) {
    const primera = mapa.paginas[p - 1].bolsillos.find(Boolean);
    sel.append(new Option(`Página ${p} · ${primera ? primera.nombre : ''}`, String(p)));
  }
  addEventListener('visibilitychange', async () => {            // volver de la app original (otra pestaña) → releer lo guardado
    if (document.visibilityState !== 'visible' || ctrl.fichaAbierta) return;
    try { await adaptador.cargar(); vista.refrescar(); pintarProgreso(); } catch (e) { /* si falla se sigue con lo que hay */ }
  });

  metricas = new Metricas($('panel'), renderer, album, cache, vista);
  metricas.tiempo('modeloListoMs', performance.now());
  metricas.tiempo('arranqueMs', performance.now() - t0);
  const inicial = +params.get('pagina');
  if (inicial >= 1 && inicial <= mapa.totalPaginas) { album.estado.irA(vueltasParaPagina(inicial)); album.aplicar(); lado = inicial % 2 === 1 ? 'der' : 'izq'; }
  sincronizarTexturas(); pintarProgreso(); actualizarUi();
  ajustarTamano();                                              // primer encuadre (instantáneo) con la interfaz ya montada
  $('cargando').hidden = true;
  setInterval(() => { if (!$('panel').hidden) metricas.pintar(); }, 500);
  window.__album3d = { medirEscenas, aspecto, dim, resaltado, diagCam, reservado, album, orbita, metricas, THREE, scene, camara, renderer, cache, vista, adaptador, ctrl };   // para depurar desde la consola
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
