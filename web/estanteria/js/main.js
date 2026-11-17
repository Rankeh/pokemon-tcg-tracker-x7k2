// Estantería 3D: biblioteca de álbumes de pie, mostrando el lomo, sobre una isla de diorama pintada (hierba, corte de tierra, agua y árboles).
// Un solo renderer y una sola escena; se dibuja solo cuando algo cambia.
// No abre IndexedDB: los álbumes vienen de albumes.js (solo lectura). Tocar el lomo de un álbum abre su visor (sin animación hasta la Fase 2).
import * as THREE from 'three';
import { elegirCalidad, generarEntorno } from '../../prueba-3d/js/aspecto.js';
import { listarAlbumes } from './albumes.js';
import { disponer, huecosPorBalda, medidasMueble, posicionLibro, altoVisibleEnBaldas, ALTO_HUECO, MUEBLE } from './disposicion.js';
import { crearMaterialesMueble, construirMueble } from './mueble.js';
import { crearFabricaLibros } from './libros.js';
import { crearMaterialesIsla, crearIsla } from '../../diorama/isla.js';

export const FASE = 'estanteria-1';
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reducir = matchMedia('(prefers-reduced-motion: reduce)');

// ------------------------------------------------------------------ calidad (misma elección que el álbum 3D)
const eleccion = elegirCalidad({ parametro: params.get('calidad'), tactil: matchMedia('(pointer: coarse)').matches,
  nucleos: navigator.hardwareConcurrency || 0, memoriaGb: navigator.deviceMemory || 0 });
const NIVELES = {
  baja: { pixelRatio: 1.25, anisotropia: 1, entorno: false, antialias: false },
  media: { pixelRatio: 2, anisotropia: 4, entorno: true, antialias: true },
  alta: { pixelRatio: 2, anisotropia: 8, entorno: true, antialias: true },
};
const nivel = NIVELES[eleccion.nivel] ? eleccion.nivel : 'media';
const calidad = { nivel, ...NIVELES[nivel] };

// ------------------------------------------------------------------ renderer, escena, luz
const canvas = $('lienzo');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: calidad.antialias, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, +params.get('pr') || calidad.pixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
const recursos = [];

// luz de día de diorama: cielo azul que rellena las sombras, sol cálido desde arriba a la izquierda y un rebote suave de la hierba
scene.add(new THREE.HemisphereLight(0xd6eeff, 0x8a7a50, 0.8));
const principal = new THREE.DirectionalLight(0xfff0d2, 2.0); principal.position.set(-0.8, 1.5, 1.3); scene.add(principal);
const relleno = new THREE.DirectionalLight(0xbfe3ff, 0.45); relleno.position.set(1, 0.5, 0.9); scene.add(relleno);
if (calidad.entorno) {        // reflejos de cielo para el oro del lomo y el barniz de la madera
  const tam = 64, t = new THREE.DataTexture(generarEntorno(tam, { arriba: 0x8fcff5, horizonte: 0xd8eef9, abajo: 0x6b8a4a, ventana: 0xfff4d8, ganancia: 1.4, aro: 0xffffff, ganancia2: 0.5 }), tam, tam / 2, THREE.RGBAFormat);
  t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  scene.environment = t; recursos.push(t);
}

// ------------------------------------------------------------------ dibujo bajo demanda
let pendiente = false;
const pedirFrame = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(bucle); } };

const matMueble = crearMaterialesMueble(calidad, recursos);
const matIsla = crearMaterialesIsla({ anisotropia: calidad.anisotropia, res: nivel === 'baja' ? 0.5 : nivel === 'media' ? 0.75 : 1 }, recursos);
export const ISLA = { alto: 0.13, agua: 0.17, margen: 0.16 };
const libros = crearFabricaLibros(calidad, recursos, pedirFrame);
let albumes = [], estanteria = null, recursosMueble = [], disp = null, dims = null, ultimoHueco = 0;

function montar(huecos) {
  if (estanteria) { scene.remove(estanteria); for (const r of recursosMueble) r.dispose?.(); recursosMueble = []; }
  disp = disponer({ albumes, huecos, minBaldas: 3 });
  dims = medidasMueble(disp.huecos, disp.baldas);
  estanteria = new THREE.Group(); estanteria.name = 'Estanteria';
  estanteria.add(construirMueble(disp, matMueble, recursosMueble));
  // isla bajo el mueble: tierra con margen alrededor, franja de agua delante, árboles a los lados y el cielo en arco detrás
  const fondoTierra = dims.fondo + ISLA.margen * 1.6, anchoIsla = dims.ancho + ISLA.margen * 2 + 0.3;
  const isla = crearIsla({
    ancho: anchoIsla, fondo: fondoTierra + ISLA.agua, alto: ISLA.alto, agua: ISLA.agua, radio: 0.04, semilla: 3, matas: 34,
    // árboles fuera del mueble: la copa más ancha mide ~0,2 m × escala desde el tronco
    arboles: [[-(dims.ancho / 2 + 0.26), -dims.fondo * 0.7, 1.6], [dims.ancho / 2 + 0.22, -dims.fondo * 0.5, 1.35], [dims.ancho / 2 + 0.16, -dims.fondo - 0.08, 1.05]],
    fondoArco: { ancho: anchoIsla - 0.02, alto: dims.alto + ISLA.alto + 0.62, z: -dims.fondo - ISLA.margen * 1.6 },
  }, matIsla, recursosMueble);
  isla.position.z = -dims.fondo / 2 + ISLA.agua / 2 + 0.02;
  estanteria.add(isla);
  for (const e of disp.elementos) {
    const pos = posicionLibro(e, disp.huecos, disp.baldas);
    estanteria.add(e.tipo === 'album' ? libros.crearAlbum(albumes.find((a) => a.id === e.id), pos) : libros.crearNuevo(pos));
  }
  if (disp.sujetalibros) estanteria.add(libros.crearSujetalibros(posicionLibro(disp.sujetalibros, disp.huecos, disp.baldas), matMueble.pata));
  scene.add(estanteria);
  ultimoHueco = huecos;
}

// ------------------------------------------------------------------ cámara: encuadre por ancho y alto, desplazamiento vertical entre baldas
const cam = { y: 0, objetivoY: 0, yMin: 0, yMax: 0, dist: 1, mediaAltura: 0.5, px: 0, objetivoPx: 0 };
function encuadrar(primeraVez = false) {
  const w = canvas.clientWidth, h = canvas.clientHeight, aspecto = w / h;
  const huecos = huecosPorBalda(aspecto);
  if (huecos !== ultimoHueco) montar(huecos);
  camara.aspect = aspecto; camara.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  const tan = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
  const altoVisible = altoVisibleEnBaldas(aspecto) * (ALTO_HUECO + MUEBLE.balda);
  cam.dist = Math.max(altoVisible / 2 / tan, (dims.ancho * 1.08) / 2 / (tan * aspecto));
  cam.mediaAltura = cam.dist * tan;
  const cabecera = document.querySelector('.cabecera').getBoundingClientRect().bottom;
  const mPorPx = (2 * cam.mediaAltura) / h;
  cam.yMax = dims.alto + 0.09 - cam.mediaAltura + cabecera * mPorPx;    // arriba: el cartel queda justo bajo la cabecera
  cam.yMin = cam.mediaAltura - ISLA.alto - 0.16;                         // abajo: se ve la isla entera con su corte de tierra y agua
  if (cam.yMin > cam.yMax) cam.yMin = cam.yMax = dims.alto / 2;
  if (primeraVez) cam.y = cam.objetivoY = cam.yMax;
  cam.objetivoY = Math.min(cam.yMax, Math.max(cam.yMin, cam.objetivoY));
  $('desplazar').hidden = cam.yMax - cam.yMin < 0.02;
  pedirFrame();
}

function colocarCamara() {
  const elev = 0.07;                                                      // un poco por encima, mirando ligeramente hacia abajo
  camara.position.set(cam.px, cam.y + elev, cam.dist + 0.02);
  camara.lookAt(cam.px * 0.3, cam.y, 0);
}

// ------------------------------------------------------------------ animación
let hover = null;
function bucle() {
  pendiente = false;
  const k = reducir.matches ? 1 : 0.18;
  cam.y += (cam.objetivoY - cam.y) * k; cam.px += (cam.objetivoPx - cam.px) * k;
  let moviendo = Math.abs(cam.objetivoY - cam.y) > 1e-4 || Math.abs(cam.objetivoPx - cam.px) > 1e-4;
  for (const o of estanteria.children) {                               // el lomo bajo el puntero sobresale un poco (solo ratón)
    if (!o.userData.tipo) continue;
    const base = o.userData.zBase ?? (o.userData.zBase = o.position.z);
    const meta = base + (o === hover ? 0.008 : 0);
    o.position.z += (meta - o.position.z) * (reducir.matches ? 1 : 0.25);
    if (Math.abs(meta - o.position.z) > 1e-5) moviendo = true;
  }
  colocarCamara();
  renderer.render(scene, camara);
  if (moviendo) pedirFrame();
}

// ------------------------------------------------------------------ interacción: tocar, arrastrar, rueda, puntero
const rayo = new THREE.Raycaster(), ndc = new THREE.Vector2();
function elegir(x, y) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  rayo.setFromCamera(ndc, camara);
  for (const i of rayo.intersectObjects(estanteria.children, true)) {
    let o = i.object; while (o && !o.userData.tipo) o = o.parent;
    if (o) return o;
  }
  return null;
}
function activar(o) {
  if (!o) return;
  if (o.userData.tipo === 'album') {
    avisar('Abriendo ' + o.userData.nombre + '…');
    location.href = new URL(o.userData.ruta, document.baseURI).href;      // Fase 2: aquí irá la animación de sacar el libro
  } else if (o.userData.tipo === 'nuevo') avisar('Crear álbumes llegará en la Fase 3.');
}

let toqueId = 0;
function avisar(t) {
  const el = $('aviso'); el.textContent = t; el.hidden = false; const id = ++toqueId;
  setTimeout(() => { if (id === toqueId) el.hidden = true; }, 2600);
}

const puntero = { activo: false, x: 0, y: 0, arrastre: false, yInicio: 0 };
canvas.addEventListener('pointerdown', (e) => { Object.assign(puntero, { activo: true, x: e.clientX, y: e.clientY, arrastre: false, yInicio: cam.objetivoY }); canvas.setPointerCapture?.(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (puntero.activo) {
    const dy = e.clientY - puntero.y;
    if (!puntero.arrastre && Math.abs(dy) > 6) puntero.arrastre = true;
    if (puntero.arrastre) {
      const mPorPx = (2 * cam.mediaAltura) / canvas.clientHeight;
      cam.objetivoY = Math.min(cam.yMax, Math.max(cam.yMin, puntero.yInicio + dy * mPorPx));
      ocultarPista(); pedirFrame();
    }
  } else if (e.pointerType === 'mouse') {
    const o = elegir(e.clientX, e.clientY);
    if (o !== hover) { hover = o; canvas.style.cursor = o ? 'pointer' : 'default'; pedirFrame(); }
    const r = canvas.getBoundingClientRect();
    cam.objetivoPx = reducir.matches ? 0 : ((e.clientX - r.left) / r.width - 0.5) * 0.03;    // paralaje muy ligero
    pedirFrame();
  }
});
canvas.addEventListener('pointerup', (e) => { if (puntero.activo && !puntero.arrastre) { ocultarPista(); activar(elegir(e.clientX, e.clientY)); } puntero.activo = false; });
canvas.addEventListener('pointercancel', () => { puntero.activo = false; });
canvas.addEventListener('pointerleave', () => { if (hover) { hover = null; canvas.style.cursor = 'default'; } cam.objetivoPx = 0; pedirFrame(); });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const mPorPx = (2 * cam.mediaAltura) / canvas.clientHeight;
  cam.objetivoY = Math.min(cam.yMax, Math.max(cam.yMin, cam.objetivoY - e.deltaY * mPorPx * 0.8));
  ocultarPista(); pedirFrame();
}, { passive: false });
addEventListener('keydown', (e) => {
  const paso = ALTO_HUECO + MUEBLE.balda;
  if (e.key === 'ArrowDown' || e.key === 'PageDown') cam.objetivoY = Math.max(cam.yMin, cam.objetivoY - paso);
  else if (e.key === 'ArrowUp' || e.key === 'PageUp') cam.objetivoY = Math.min(cam.yMax, cam.objetivoY + paso);
  else return;
  e.preventDefault(); pedirFrame();
});
function ocultarPista() { $('pista').classList.add('oculta'); }

canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); avisar('El navegador ha liberado la memoria gráfica; recarga si no vuelve.'); });
canvas.addEventListener('webglcontextrestored', () => pedirFrame());
new ResizeObserver(() => encuadrar()).observe(canvas);
reducir.addEventListener?.('change', pedirFrame);

// ------------------------------------------------------------------ arranque
async function iniciar() {
  albumes = await listarAlbumes();
  // lista accesible (lectores de pantalla / teclado) con los mismos álbumes que la estantería
  const lista = $('lista-albumes');
  lista.replaceChildren(...albumes.map((a) => { const li = document.createElement('li'), enl = document.createElement('a'); enl.href = a.ruta; enl.textContent = `${a.nombre} — ${a.subtitulo}`; li.append(enl); return li; }));
  $('contador').textContent = albumes.length === 1 ? '1 álbum' : `${albumes.length} álbumes`;
  encuadrar(true);
  document.body.classList.add('lista');
  console.info(`Estantería · ${FASE} · calidad ${calidad.nivel} (${eleccion.origen}) · ${albumes.length} álbum(es) · ${disp.huecos}×${disp.baldas} huecos`);
  window.__estanteria = { FASE, THREE, scene, camara, renderer, cam, disp, calidad };
}
iniciar().catch((e) => { console.error(e); document.body.classList.add('sin-3d'); });
