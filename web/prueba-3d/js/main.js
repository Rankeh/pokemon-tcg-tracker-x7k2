// Álbum 3D de la colección REAL (Fase 3.6.2): Three.js + catálogo + IndexedDB (mismos módulos que la app original).
// Regla de oro heredada: primero se guarda en IndexedDB y SOLO si se confirma se actualiza la ficha y el 3D.
import * as THREE from 'three';
import { Almacen } from '../../js/almacen.js';
import { ModeloColeccion } from '../../js/album/modelo.js';
import { crearMapa, AdaptadorColeccion } from './adaptador-coleccion.js';
import { cargarAlbum } from './album3d.js';
import { OrbitaLigera, distanciaEncuadre, planosRecorte } from './camara.js';
import { Metricas } from './metricas.js';
import { Diagnostico } from './diagnostico.js';
import { CacheTexturas } from './texturas.js';
import { crearProductores, cargarManifiesto } from './texturas3d.js';
import { VistaBolsillos } from './bolsillos3d.js';
import { Controlador } from './controlador.js';
import { FichaUI } from './ficha-ui.js';
import { etiquetaPaginas, paginasNecesarias, irAPagina, vueltasParaPagina } from './navegacion3d.js';
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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(32, 1, 0.02, 5);
scene.add(new THREE.HemisphereLight(0xbfd2f2, 0x2a2018, 0.9));
const luzPrincipal = new THREE.DirectionalLight(0xffe1c0, 2.4); luzPrincipal.position.set(-0.5, 0.9, 0.5); scene.add(luzPrincipal);
const luzRelleno = new THREE.DirectionalLight(0x9db8e6, 0.7); luzRelleno.position.set(0.7, 0.5, 0.2); scene.add(luzRelleno);
const mesa = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.4), new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.92 }));
mesa.rotation.x = -Math.PI / 2; mesa.position.y = -0.0005; scene.add(mesa);

const orbita = new OrbitaLigera();
let album = null, metricas = null, diag = null, cache = null, vista = null, ctrl = null, adaptador = null, ficha = null;
let sucioHasta = 0, continuo = false, forzarDibujo = false, claveNav = '';
const pedirFrame = (ms = 1200) => { sucioHasta = Math.max(sucioHasta, performance.now() + ms); };
const avisar = (t) => { $('aviso').textContent = t || ''; $('aviso').hidden = !t; };

function ajustarTamano() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camara.aspect = w / h;
  // Encuadre: distancia calculada para que el álbum abierto quepa en ancho y alto; near/far salen de esa distancia (corrección 3.5.1).
  const radio = distanciaEncuadre({ fovGrados: camara.fov, aspect: camara.aspect, elevacion: orbita.el });
  if (!ctrl || !ctrl.fichaAbierta) orbita.radio = radio;
  orbita.limites.radio = [Math.min(0.3, radio), radio * 1.6];
  const pl = planosRecorte(radio, orbita.limites.radio[1]);
  camara.near = pl.near; camara.far = pl.far;
  camara.updateProjectionMatrix();
  pedirFrame();
}
new ResizeObserver(ajustarTamano).observe(canvas);
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (diag) diag.contextoPerdido = true; avisar('El navegador ha perdido el contexto WebGL (en iPhone pasa si se gasta mucha memoria). Espera o recarga la página.'); });
canvas.addEventListener('webglcontextrestored', () => { avisar(''); vista?.refrescar(); pedirFrame(); });

if (params.get('debug') === '1') {
  diag = new Diagnostico($('diag'), { renderer, scene, camara, orbita, getAlbum: () => album, getExtra: () => ({ cache, vista, adaptador }) });
  diag.estadoGlb = 'cargando…';
  setInterval(() => diag.pintar(), 500);
  forzarDibujo = true;
}

// ------------------------------------------------------------------ navegación (botones, teclado, salto directo)
const botones = { abrir: $('b-abrir'), ant: $('b-ant'), sig: $('b-sig'), salto: $('b-salto'), metricas: $('b-metricas'), medir: $('b-medir'), informe: $('b-informe') };
const puedeNavegar = () => !ctrl.fichaAbierta && !continuo;

function actualizarUi() {
  const e = album.estado, total = adaptador.mapa.totalPaginas;
  $('estado').textContent = etiquetaPaginas(e.objetivo, total);
  botones.abrir.textContent = e.objetivo === 0 ? 'Abrir álbum' : 'Cerrar álbum';
  const libre = puedeNavegar();
  botones.abrir.disabled = !libre; botones.ant.disabled = !libre || !e.puedeRetroceder(); botones.sig.disabled = !libre || !e.puedeAvanzar(); botones.salto.disabled = !libre;
  const v = e.objetivo, sel = botones.salto;
  const { izquierda, derecha } = { izquierda: v >= 2 ? 2 * (v - 1) : null, derecha: v >= 1 ? 2 * v - 1 : null };
  sel.value = String(derecha || izquierda || '');
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

function avanzar() { if (puedeNavegar() && album.estado.avanzar()) { pedirFrame(); sincronizarTexturas(); actualizarUi(); } }
function retroceder() { if (puedeNavegar() && album.estado.retroceder()) { pedirFrame(); sincronizarTexturas(); actualizarUi(); } }
function alternarAbrir() {
  if (!puedeNavegar()) return;
  if (album.estado.objetivo === 0) avanzar(); else irAPagina0();
}
function irAPagina0() { album.estado.irA(0); album.aplicar(); sincronizarTexturas(); actualizarUi(); pedirFrame(); }
function saltarA(pagina) {
  if (!puedeNavegar()) return;
  const r = irAPagina(album.estado, pagina, adaptador.mapa.totalPaginas);
  if (!r.animado) album.aplicar();
  sincronizarTexturas(); actualizarUi(); pedirFrame();
}

botones.abrir.onclick = alternarAbrir; botones.sig.onclick = avanzar; botones.ant.onclick = retroceder;
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
  if (e.key === 'ArrowRight') avanzar(); else if (e.key === 'ArrowLeft') retroceder();
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
  if (puntero.arrastre && !ctrl?.fichaAbierta) { orbita.arrastrar(e.clientX - puntero.x, e.clientY - puntero.y, canvas.clientWidth); pedirFrame(300); }
  puntero.x = e.clientX; puntero.y = e.clientY;
});
const soltar = (e, cancelado) => {
  if (!puntero.activo || e.pointerId !== puntero.id) return;
  puntero.activo = false;
  if (!cancelado && !puntero.arrastre) tocar(e.clientX, e.clientY);
};
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
    const m = album.matrizMundo(golpe.nombre);
    foco.previo = orbita.estado();
    orbita.llevarA({ az: 0, el: 74 * GRAD, radio: innerHeight > innerWidth ? 0.42 : 0.24, objetivo: [m[12], m[13], m[14]] }, reducirMovimiento ? 0.01 : 0.7);
    actualizarUi(); pedirFrame();
  }
}
const foco = { previo: null };

function cerrarFicha() {
  if (!ctrl.fichaAbierta) return;
  ctrl.cerrar();
  if (foco.previo) orbita.llevarA(foco.previo, reducirMovimiento ? 0.01 : 0.6);
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
  const clave = album.estado.vueltas + ':' + album.estado.objetivo + ':' + album.estado.animando;
  if (clave !== claveNav) { claveNav = clave; sincronizarTexturas(); actualizarUi(); }
  if (!(activo || continuo || forzarDibujo || ahora < sucioHasta)) { metricas.pausa(); return; }
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

  const manifiesto = await cargarManifiesto();
  cache = new CacheTexturas({ presupuestoBytes: (+params.get('mem') || 32) * 1048576, concurrencia: 4 });
  vista = new VistaBolsillos({ album, adaptador, cache, reducirMovimiento: () => reducirMovimiento,
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
  ajustarTamano();
  const inicial = +params.get('pagina');
  if (inicial >= 1 && inicial <= mapa.totalPaginas) { album.estado.irA(vueltasParaPagina(inicial)); album.aplicar(); }
  sincronizarTexturas(); pintarProgreso(); actualizarUi();
  $('cargando').hidden = true;
  setInterval(() => { if (!$('panel').hidden) metricas.pintar(); }, 500);
  window.__album3d = { album, orbita, metricas, THREE, scene, camara, renderer, cache, vista, adaptador, ctrl };   // para depurar desde la consola
  requestAnimationFrame(bucle);
  if (params.get('auto') === 'medir') setTimeout(medir, 800);
}

arrancar().catch((err) => {
  console.error(err);
  if (diag) diag.estadoGlb = 'ERROR: ' + err.message;
  $('cargando').hidden = false;
  $('cargando').textContent = 'Error: ' + err.message;
});
