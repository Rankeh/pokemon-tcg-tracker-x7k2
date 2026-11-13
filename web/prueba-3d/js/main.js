// Prueba 3.5 — Álbum 3D (Blender → GLB → Three.js). Ruta independiente: no usa IndexedDB, ni el catálogo, ni la navegación de la app.
import * as THREE from 'three';
import { cargarAlbum } from './album3d.js';
import { OrbitaLigera } from './camara.js';
import { Metricas } from './metricas.js';
import { limitar } from './logica.js';

const $ = (id) => document.getElementById(id);
const GRAD = Math.PI / 180;
const params = new URLSearchParams(location.search);
const urlCarta = (n) => 'cartas/c' + String(n % 12).padStart(2, '0') + '.png';
const reducirMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ renderer y escena (sin sombras en tiempo real: ahorra mucho en iPhone)
const canvas = $('lienzo');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, +params.get('pr') || 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(32, 1, 0.02, 3);
scene.add(new THREE.HemisphereLight(0xbfd2f2, 0x2a2018, 0.9));
const luzPrincipal = new THREE.DirectionalLight(0xffe1c0, 2.4);
luzPrincipal.position.set(-0.5, 0.9, 0.5);
scene.add(luzPrincipal);
const luzRelleno = new THREE.DirectionalLight(0x9db8e6, 0.7);
luzRelleno.position.set(0.7, 0.5, 0.2);
scene.add(luzRelleno);
const mesa = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.4), new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.92 }));
mesa.rotation.x = -Math.PI / 2;
mesa.position.y = -0.0005;
scene.add(mesa);

const orbita = new OrbitaLigera();
let album = null, metricas = null;
let sucioHasta = 0, continuo = false;
const pedirFrame = (ms = 1200) => { sucioHasta = Math.max(sucioHasta, performance.now() + ms); };

function ajustarTamano() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camara.aspect = w / h;
  // Encuadre: el álbum abierto mide ~0,52 m de ancho; la cámara se aleja lo justo para que quepa también en vertical (móvil).
  const tv = Math.tan(camara.fov * GRAD / 2), th = tv * camara.aspect;
  const radio = Math.max(0.62, (0.30 / th) / Math.cos(orbita.el) * 0.95);
  if (!sel) orbita.radio = radio;
  orbita.limites.radio = [Math.min(0.3, radio), radio * 1.5];
  camara.updateProjectionMatrix();
  pedirFrame();
}
new ResizeObserver(ajustarTamano).observe(canvas);

canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); $('aviso').hidden = false; $('aviso').textContent = 'El navegador ha perdido el contexto WebGL (pasa en iPhone si la página gasta mucha memoria). Espera o recarga.'; });
canvas.addEventListener('webglcontextrestored', () => { $('aviso').hidden = true; pedirFrame(); });

// ------------------------------------------------------------------ interfaz
const botones = {
  abrir: $('b-abrir'), ant: $('b-ant'), sig: $('b-sig'), rellenar: $('b-rellenar'), medir: $('b-medir'), metricas: $('b-metricas'), informe: $('b-informe'),
};
let sel = null;                                   // carta seleccionada: {mesh, bolsillo, cara, lift, cerrando, previo}

function actualizarUi() {
  const e = album.estado, v = e.vueltas, n = album.geo.n;
  const bloqueado = !!sel;
  botones.abrir.textContent = e.objetivo === 0 ? 'Abrir álbum' : 'Cerrar álbum';
  botones.abrir.disabled = bloqueado || continuo;
  botones.sig.disabled = bloqueado || continuo || !e.puedeAvanzar();
  botones.ant.disabled = bloqueado || continuo || !e.puedeRetroceder();
  botones.rellenar.disabled = bloqueado || continuo || e.animando;
  const t = e.tocables();
  $('estado').textContent = e.objetivo === 0 ? 'Álbum cerrado' :
    'Abierto · ' + (t.map((x) => `hoja ${x.hoja} (${x.cara === 'F' ? 'frente' : 'dorso'})`).join(' + ') || (v >= n + 1 ? 'contratapa' : 'tapa interior'));
}

function avanzar() { if (album.estado.avanzar()) { pedirFrame(); actualizarUi(); } }
function retroceder() { if (album.estado.retroceder()) { pedirFrame(); actualizarUi(); } }
function alternarAbrir() {
  if (album.estado.objetivo === 0) avanzar();
  else { while (album.estado.retroceder()); pedirFrame(); actualizarUi(); }
}

botones.abrir.onclick = alternarAbrir;
botones.sig.onclick = avanzar;
botones.ant.onclick = retroceder;
botones.rellenar.onclick = () => {
  const vacios = album.vaciosVisibles();
  vacios.forEach((b, i) => album.ponerCarta(b, (i * 5 + 3) % 12));
  $('estado').textContent = vacios.length ? `Rellenados ${vacios.length} bolsillos vacíos (geometría compartida, sin reconstruir)` : 'No hay bolsillos vacíos a la vista';
  pedirFrame();
};
botones.metricas.onclick = () => { $('panel').hidden = !$('panel').hidden; pedirFrame(); };
botones.informe.onclick = async () => {
  const txt = JSON.stringify(metricas.instantanea(), null, 1);
  try { await navigator.clipboard.writeText(txt); $('estado').textContent = 'Informe copiado al portapapeles'; }
  catch { $('informe').hidden = false; $('informe').value = txt; $('informe').select(); }
};
addEventListener('keydown', (e) => {
  if (sel) { if (e.key === 'Escape') volver(); return; }
  if (e.key === 'ArrowRight') avanzar(); else if (e.key === 'ArrowLeft') retroceder();
});

// ------------------------------------------------------------------ selección de carta (clic / toque) y ficha
const rayo = new THREE.Raycaster();
const puntero = { activo: false, x0: 0, y0: 0, x: 0, y: 0, arrastre: false };

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  Object.assign(puntero, { activo: true, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, arrastre: false });
});
canvas.addEventListener('pointermove', (e) => {
  if (!puntero.activo) return;
  if (Math.hypot(e.clientX - puntero.x0, e.clientY - puntero.y0) > 6) puntero.arrastre = true;
  if (puntero.arrastre && !sel) { orbita.arrastrar(e.clientX - puntero.x, e.clientY - puntero.y, canvas.clientWidth); pedirFrame(300); }
  puntero.x = e.clientX; puntero.y = e.clientY;
});
canvas.addEventListener('pointerup', (e) => {
  if (!puntero.activo) return;
  puntero.activo = false;
  if (!puntero.arrastre) tocar(e.clientX, e.clientY);
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (!sel) { orbita.zoom(Math.exp(e.deltaY * 0.001)); pedirFrame(300); } }, { passive: false });

function tocar(cx, cy) {
  if (sel || !album) return;
  const r = canvas.getBoundingClientRect();
  rayo.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camara);
  const golpe = rayo.intersectObjects(album.cartasTocables(), false)[0];
  if (golpe) seleccionar(golpe.object);
}

function seleccionar(mesh) {
  const bolsillo = mesh.parent;
  const cara = bolsillo.userData.cara;
  sel = { mesh, bolsillo, cara, lift: 0, cerrando: false, previo: orbita.estado() };
  const p = mesh.getWorldPosition(new THREE.Vector3());
  orbita.llevarA({ az: 0, el: 74 * GRAD, radio: Math.max(0.2, 0.2 * (innerHeight > innerWidth ? 1.5 : 1)), objetivo: [p.x, p.y, p.z] }, reducirMovimiento ? 0.01 : 0.7);
  const f = $('ficha');
  $('f-img').src = mesh.userData.url || urlCarta(mesh.userData.imagen);
  $('f-titulo').textContent = 'Carta de prueba ' + String(mesh.userData.imagen + 1).padStart(2, '0');
  $('f-detalle').textContent = `Hoja ${bolsillo.userData.hoja} · ${cara === 'F' ? 'cara frontal' : 'cara dorsal'} · bolsillo ${bolsillo.userData.k + 1} de 9\nNodo: ${mesh.name}`;
  f.hidden = false;
  actualizarUi(); pedirFrame();
}

function volver(trasCerrar) {
  if (!sel || sel.cerrando) return;
  sel.cerrando = true; sel.despues = trasCerrar;
  orbita.llevarA(sel.previo, reducirMovimiento ? 0.01 : 0.6);
  $('ficha').hidden = true;
  pedirFrame();
}

$('f-volver').onclick = () => volver();
$('f-cambiar').onclick = () => {
  if (!sel) return;
  const u = sel.mesh.userData;
  u.imagen = (u.imagen + 1) % 12;                                // cambia la imagen SIN reconstruir el modelo: solo material.map
  const url = urlCarta(u.imagen);
  album.setCartaImagen(sel.mesh.name, url).then(() => { $('f-img').src = url; });
  $('f-titulo').textContent = 'Carta de prueba ' + String(u.imagen + 1).padStart(2, '0');
};
$('f-quitar').onclick = () => { if (sel) { const b = sel.bolsillo; volver(() => album.quitarCarta(b)); } };

function avanzarSeleccion(dt) {
  if (!sel) return false;
  const objetivo = sel.cerrando ? 0 : 1;
  const k = reducirMovimiento ? 1 : Math.min(1, dt * 8);
  sel.lift += (objetivo - sel.lift) * k;
  if (Math.abs(objetivo - sel.lift) < 0.003) sel.lift = objetivo;
  sel.mesh.position.y = (sel.cara === 'D' ? -1 : 1) * 0.012 * sel.lift;
  if (sel.cerrando && sel.lift === 0 && !orbita.tween) {
    const d = sel.despues; sel.mesh.position.y = 0; sel = null;
    if (d) d();
    actualizarUi();
  }
  return true;
}

// ------------------------------------------------------------------ medición automática (12 s aprox.): recorre todo el álbum
function medir() {
  if (sel || continuo) return;
  continuo = true; metricas.iniciarBench();
  const guion = ['abrir', ...Array(album.geo.n).fill('sig'), ...Array(album.geo.n).fill('ant'), 'cerrar'];
  const paso = () => {
    if (!guion.length) { const r = metricas.terminarBench(); continuo = false; actualizarUi(); $('estado').textContent = `Medición: ${r.fpsMedio} FPS medios, mínimo ${r.fpsMinimo}, ${r.frames} frames en ${r.duracionS} s`; return; }
    if (!album.estado.animando) {
      const a = guion.shift();
      if (a === 'abrir' || a === 'sig') avanzar(); else if (a === 'ant') retroceder(); else while (album.estado.retroceder());
    }
    setTimeout(paso, 120);
  };
  actualizarUi(); paso();
}
botones.medir.onclick = medir;

// ------------------------------------------------------------------ bucle: solo dibuja cuando hay algo que mostrar (ahorra batería en iPhone)
let tPrev = performance.now(), primerFrame = false;
function bucle(ahora) {
  requestAnimationFrame(bucle);
  const dt = Math.min(0.05, (ahora - tPrev) / 1000);
  tPrev = ahora;
  if (!album) return;
  let activo = album.actualizar(dt);
  activo = orbita.actualizar(dt) || activo;
  activo = avanzarSeleccion(dt) || activo;
  if (activo) { album.cargarVisibles(); actualizarUi(); }
  if (!(activo || continuo || ahora < sucioHasta)) { metricas.pausa(); return; }
  const [x, y, z] = orbita.posicion();
  camara.position.set(x, y, z);
  camara.lookAt(...orbita.objetivo);
  renderer.render(scene, camara);
  metricas.frame(ahora);
  if (!primerFrame) { primerFrame = true; metricas.tiempo('primerFrameMs', ahora); }
}

// ------------------------------------------------------------------ arranque
(async () => {
  try {
    album = await cargarAlbum('modelo/' + (/^[\w.-]+\.glb$/.test(params.get('modelo') || '') ? params.get('modelo') : 'album.glb'), { renderer, urlCarta });
    album.onCambio = () => pedirFrame();
    if (reducirMovimiento) album.estado.duracion = 0.01;
    scene.add(album.escena);
    metricas = new Metricas($('panel'), renderer, album);
    metricas.tiempo('modeloListoMs', performance.now());
    album.cargarVisibles();
    ajustarTamano();
    actualizarUi();
    $('cargando').hidden = true;
    setInterval(() => { if (!$('panel').hidden) metricas.pintar(); }, 500);
    window.__album3d = { album, orbita, metricas, THREE, scene, camara, renderer };   // para depurar desde la consola
    requestAnimationFrame(bucle);
    if (params.get('auto') === 'medir') setTimeout(medir, 800);
  } catch (err) {
    console.error(err);
    $('cargando').textContent = 'Error: ' + err.message;
  }
})();
