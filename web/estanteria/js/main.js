// Biblioteca (pantalla principal), dirección editorial: una sola fila horizontal de lomos sobre fondo oscuro. El álbum elegido sale de la fila
// y gira para enseñar su portada en el centro; debajo, su ficha (título, expansiones, cartas) y el botón para abrirlo. Al abrir, la cámara se
// acerca a la portada y la pantalla funde a negro antes de pasar al visor 3D. Un solo renderer y una sola escena; se dibuja solo si algo cambia.
// No abre IndexedDB: los álbumes vienen de albumes.js (solo lectura).
import * as THREE from 'three';
import { elegirCalidad, generarEntorno } from '../../prueba-3d/js/aspecto.js';
import { listarAlbumes, conCifras } from './albumes.js';
import { LIBRO, grosorAlbum } from './disposicion.js';
import { poses, mover, elementos, series, altoVisible, CARRUSEL } from './carrusel.js';
import { crearFabricaLibros } from './libros.js';

export const FASE = 'biblioteca-editorial-1';
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reducir = matchMedia('(prefers-reduced-motion: reduce)');
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: no pasa nada */ } };
const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

// ------------------------------------------------------------------ calidad (misma elección que el álbum 3D)
const eleccion = elegirCalidad({ parametro: params.get('calidad'), tactil: matchMedia('(pointer: coarse)').matches,
  nucleos: navigator.hardwareConcurrency || 0, memoriaGb: navigator.deviceMemory || 0 });
const NIVELES = {
  baja: { pixelRatio: 1.5, anisotropia: 2, entorno: false, antialias: true },
  media: { pixelRatio: 2, anisotropia: 4, entorno: true, antialias: true },
  alta: { pixelRatio: 2, anisotropia: 8, entorno: true, antialias: true },
};
const nivel = NIVELES[eleccion.nivel] ? eleccion.nivel : 'media';
const calidad = { nivel, ...NIVELES[nivel] };

// ------------------------------------------------------------------ renderer, escena y luz de estudio
const canvas = $('lienzo');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: calidad.antialias, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, +params.get('pr') || calidad.pixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
const recursos = [];
scene.add(new THREE.HemisphereLight(0xffffff, 0x101010, 0.55));
const principal = new THREE.DirectionalLight(0xfff4e8, 2.6); principal.position.set(-0.5, 0.9, 1.6); scene.add(principal);   // foco frontal, algo cenital
const contorno = new THREE.DirectionalLight(0xffe0d0, 2.4); contorno.position.set(0.8, 0.6, -1); scene.add(contorno);          // recorta los cantos sobre el negro
const contorno2 = new THREE.DirectionalLight(0xdfe6ff, 1.5); contorno2.position.set(-0.9, 0.4, -0.8); scene.add(contorno2);     // 3.18: y por el otro lado (lomos y tapas negras se separan del fondo)
if (calidad.entorno) {        // estudio oscuro con un softbox: brillo en el oro del lomo y en la lámina de la portada
  const tam = 64, t = new THREE.DataTexture(generarEntorno(tam, { arriba: 0x2a2a2a, horizonte: 0x161616, abajo: 0x080808, ventana: 0xffffff, ganancia: 1.6, aro: 0xffd8c8, ganancia2: 0.4 }), tam, tam / 2, THREE.RGBAFormat);
  t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  scene.environment = t; recursos.push(t);
}

// ------------------------------------------------------------------ estado
let pendiente = false;
const pedirFrame = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(bucle); } };
const libros = crearFabricaLibros(calidad, recursos, pedirFrame);
let albumes = [], filtro = null, items = [], sel = 0, objetos = [], hover = null, apertura = null;
const fila = new THREE.Group(); fila.name = 'Fila'; scene.add(fila);
const cache = new Map();                                                  // los objetos 3D se reutilizan al cambiar de filtro

function construir() {
  fila.clear();
  items = elementos(albumes, filtro);
  objetos = items.map((it) => {
    let o = cache.get(it.id);
    if (!o) {
      const grueso = it.tipo === 'album' ? grosorAlbum(it.album.cartas) : LIBRO.grueso;     // 3.20: el grosor real del álbum 3D
      o = { grupo: it.tipo === 'album' ? libros.crearAlbum(it.album, grueso) : libros.crearNuevo(), sombra: libros.sombra(), primera: true, grueso }; cache.set(it.id, o);
    }
    o.item = it; fila.add(o.grupo, o.sombra);
    return o;
  });
  const recordado = items.findIndex((it) => it.id === leer('biblioteca.sel'));
  sel = recordado >= 0 ? recordado : 0;
  colocar(true);
  actualizarUi();
}

/** Lleva cada libro a su pose (con animación salvo `ya`). */
function colocar(ya = false) {
  const p = poses(items.length, sel, objetos.map((o) => o.grueso));
  objetos.forEach((o, i) => { o.meta = p[i]; if (ya || o.primera || reducir.matches) { aplicar(o, 1); o.primera = false; } });
  pedirFrame();
}
function aplicar(o, k) {
  const g = o.grupo, m = o.meta, lev = o === hover && o !== objetos[sel] ? 0.012 : 0;
  g.position.x += (m.x - g.position.x) * k; g.position.y += (m.y + lev - g.position.y) * k; g.position.z += (m.z - g.position.z) * k;
  g.rotation.y += (m.giro - g.rotation.y) * k;
  // la sombra se queda en el suelo y cambia de forma al girar (lomo estrecho ↔ portada ancha)
  const t = Math.min(1, Math.abs(g.rotation.y) / (Math.PI / 2));
  o.sombra.position.set(g.position.x, 0.0005, g.position.z);
  o.sombra.scale.set(o.grueso * 2.1 * (1 - t) + LIBRO.fondo * 1.12 * t, LIBRO.fondo * 1.12 * (1 - t) + o.grueso * 2.4 * t, 1);
  return Math.abs(m.x - g.position.x) + Math.abs(m.y + lev - g.position.y) + Math.abs(m.z - g.position.z) + Math.abs(m.giro - g.rotation.y);
}

function seleccionar(i) {
  const n = mover(items.length, i, 0);
  if (n === sel) return;
  sel = n; guardar('biblioteca.sel', items[sel].id);
  colocar(); actualizarUi();
}

// ------------------------------------------------------------------ cámara
const cam = { yc: 0, visH: 1, dist: 1 };
function encuadrar() {
  const w = canvas.clientWidth, h = canvas.clientHeight, aspecto = w / h;
  camara.aspect = aspecto; camara.updateProjectionMatrix(); renderer.setSize(w, h, false);
  const tan = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
  // Banda libre para el libro: entre las pestañas y (el pie menos la ficha). Así la ficha nunca pisa el pie, sea cual sea la pantalla.
  const filtros = $('filtros').getBoundingClientRect(), pie = document.querySelector('.pie').getBoundingClientRect();
  const altoFicha = $('info').getBoundingClientRect().height, AIRE = 18;
  const arriba = filtros.bottom + 22, abajo = pie.top - altoFicha - AIRE - 20;
  const banda = Math.max(120, abajo - arriba);
  const altoLibro = LIBRO.alto + CARRUSEL.levante;
  cam.visH = Math.max(altoVisible(aspecto), altoLibro * h / (banda * 0.97));   // el más restrictivo: ancho (portada + vecinos) o alto (banda)
  cam.dist = cam.visH / 2 / tan;
  const altoPx = altoLibro * h / cam.visH, techo = arriba + (banda - altoPx) / 2;   // el libro centrado en la banda
  cam.yc = altoLibro - (0.5 - techo / h) * cam.visH;                    // y del mundo en el centro de la pantalla (en el plano del libro)
  document.documentElement.style.setProperty('--y-info', `${Math.round(techo + altoPx + AIRE)}px`);
  document.documentElement.style.setProperty('--y-centro', `${Math.round(techo + altoPx / 2)}px`);
  pedirFrame();
}
function colocarCamara() {
  const z = cam.dist + CARRUSEL.salida;
  if (apertura) {                                                       // acercamiento a la portada del libro elegido
    const t = Math.min(1, (performance.now() - apertura.t0) / apertura.dur), e = t * t * (3 - 2 * t);
    camara.position.set(0, cam.yc + (LIBRO.alto / 2 - cam.yc) * e, z + (CARRUSEL.salida + 0.16 - z) * e);
    camara.lookAt(0, cam.yc + (LIBRO.alto / 2 - cam.yc) * e, 0);
    return t < 1;
  }
  camara.position.set(0, cam.yc, z); camara.lookAt(0, cam.yc, 0);       // de frente: la retícula de la página casa con el libro
  return false;
}

function bucle() {
  pendiente = false;
  let moviendo = false;
  const k = reducir.matches ? 1 : 0.16;
  for (const o of objetos) if (aplicar(o, k) > 1e-4) moviendo = true;
  if (colocarCamara()) moviendo = true;
  renderer.render(scene, camara);
  if (moviendo) pedirFrame();
}

// ------------------------------------------------------------------ interfaz
function actualizarUi() {
  const it = items[sel];
  if (it.tipo === 'album') {
    const a = it.album;
    $('i-titulo').textContent = a.nombre;
    $('i-sub').textContent = a.subtitulo.toUpperCase();
    $('i-meta').textContent = (a.meta || `${a.cartas} cartas`).toUpperCase();
    $('abrir').textContent = 'Abrir álbum';
  } else {
    $('i-titulo').textContent = 'Nuevo álbum';
    $('i-sub').textContent = 'PRÓXIMAMENTE';
    $('i-meta').textContent = 'CREA UNA COLECCIÓN PARA OTRA EXPANSIÓN';
    $('abrir').textContent = 'Crear álbum';
  }
  $('ant').disabled = sel === 0; $('sig').disabled = sel === items.length - 1;
  $('posicion').textContent = `${String(sel + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
}

function pintarFiltros() {
  const cont = $('filtros'), opciones = [{ id: null, nombre: 'Todos' }, ...series(albumes)];
  cont.replaceChildren(...opciones.map((s) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'e-caja'; b.textContent = s.nombre; b.setAttribute('aria-pressed', String(s.id === filtro));
    b.onclick = () => { filtro = s.id; pintarFiltros(); construir(); };
    return b;
  }));
}

function abrir() {
  const it = items[sel];
  if (it.tipo === 'nuevo') { avisar('Crear álbumes llegará en la Fase 3.'); return; }
  if (apertura) return;
  const destino = new URL(it.album.ruta, document.baseURI).href;
  if (reducir.matches) { location.href = destino; return; }
  apertura = { t0: performance.now(), dur: 700 };
  document.body.classList.add('abriendo');                              // funde a negro por CSS mientras la cámara se acerca
  pedirFrame();
  setTimeout(() => { location.href = destino; }, 720);
}

let idAviso = 0;
function avisar(t) {
  const el = $('aviso'); el.textContent = t; el.hidden = false; const id = ++idAviso;
  setTimeout(() => { if (id === idAviso) el.hidden = true; }, 2600);
}

// ------------------------------------------------------------------ gestos: tocar, deslizar, rueda, teclado, ratón
const rayo = new THREE.Raycaster(), ndc = new THREE.Vector2();
function elegido(x, y) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  rayo.setFromCamera(ndc, camara);
  for (const i of rayo.intersectObjects(objetos.map((o) => o.grupo), true)) {
    let o = i.object; while (o && !o.userData.tipo) o = o.parent;
    if (o) return objetos.find((x) => x.grupo === o) || null;
  }
  return null;
}
const PASO_ARRASTRE = 70;
const puntero = { activo: false, x0: 0, arrastre: false, base: 0 };
canvas.addEventListener('pointerdown', (e) => { Object.assign(puntero, { activo: true, x0: e.clientX, arrastre: false, base: sel }); canvas.setPointerCapture?.(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (puntero.activo) {
    const dx = e.clientX - puntero.x0;
    if (!puntero.arrastre && Math.abs(dx) > 8) puntero.arrastre = true;
    if (puntero.arrastre) seleccionar(puntero.base - Math.round(dx / PASO_ARRASTRE));     // arrastrar a la izquierda = siguientes
  } else if (e.pointerType === 'mouse') {
    const o = elegido(e.clientX, e.clientY);
    if (o !== hover) { hover = o; canvas.style.cursor = o ? 'pointer' : 'default'; pedirFrame(); }
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (puntero.activo && !puntero.arrastre) {
    const i = objetos.indexOf(elegido(e.clientX, e.clientY));
    if (i === sel) abrir(); else if (i >= 0) seleccionar(i);
  }
  puntero.activo = false;
});
canvas.addEventListener('pointercancel', () => { puntero.activo = false; });
canvas.addEventListener('pointerleave', () => { if (hover) { hover = null; canvas.style.cursor = 'default'; pedirFrame(); } });
let ultimaRueda = 0;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(d) < 4 || performance.now() - ultimaRueda < 260) return;
  ultimaRueda = performance.now(); seleccionar(sel + Math.sign(d));
}, { passive: false });
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select')) return;
  if (e.key === 'ArrowRight') seleccionar(sel + 1);
  else if (e.key === 'ArrowLeft') seleccionar(sel - 1);
  else if (e.key === 'Enter' && e.target === document.body) abrir();
  else return;
  e.preventDefault();
});
$('ant').onclick = () => seleccionar(sel - 1);
$('sig').onclick = () => seleccionar(sel + 1);
$('abrir').onclick = abrir;

// al volver con «atrás» (Safari guarda la página en caché): quitar el fundido y la cámara de apertura
addEventListener('pageshow', (e) => { if (e.persisted) { apertura = null; document.body.classList.remove('abriendo'); pedirFrame(); } });
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); avisar('El navegador ha liberado la memoria gráfica; recarga si no vuelve.'); });
canvas.addEventListener('webglcontextrestored', () => pedirFrame());
new ResizeObserver(() => encuadrar()).observe(canvas);
reducir.addEventListener?.('change', pedirFrame);

// ------------------------------------------------------------------ arranque
async function iniciar() {
  // 3.16 · nº de cartas real de cada álbum (leído de su catálogo): los álbumes que crecen no tienen cifras escritas a mano
  albumes = await Promise.all((await listarAlbumes()).map(async (a) => {
    try { return conCifras(a, (await (await fetch(a.catalogo)).json()).cartas.length); } catch { return conCifras(a, a.cartas); }
  }));
  $('lista-albumes').replaceChildren(...albumes.map((a) => { const li = document.createElement('li'), enl = document.createElement('a'); enl.href = a.ruta; enl.textContent = `${a.nombre} — ${a.subtitulo}`; li.append(enl); return li; }));
  const cartas = albumes.reduce((s, a) => s + (a.cartas || 0), 0);
  $('contador').textContent = `${albumes.length} ${albumes.length === 1 ? 'álbum' : 'álbumes'} · ${cartas} cartas`;
  pintarFiltros();
  construir();
  encuadrar();
  new ResizeObserver(() => encuadrar()).observe($('info'));            // la ficha cambia de alto (título de otro álbum, fuentes que cargan)
  document.body.classList.add('lista');
  console.info(`Biblioteca · ${FASE} · calidad ${calidad.nivel} (${eleccion.origen}) · ${albumes.length} álbum(es)`);
  window.__biblioteca = { FASE, THREE, scene, camara, renderer, calidad, estado: () => ({ sel, items: items.map((i) => i.id), filtro }) };
}
iniciar().catch((e) => { console.error(e); document.body.classList.add('sin-3d'); });
