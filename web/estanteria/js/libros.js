// Libros del carrusel: álbumes de pie (lomo en +z, tapa delantera en +x) y el elemento «Nuevo álbum».
// 3.20: cada álbum se construye con la MISMA anatomía y materiales que el álbum 3D del visor (tela negra en sarga, tapas con esquinas
// redondeadas, banda y panel en relieve con la lámina impresa, bloque de hojas grafito) y con su grosor real.
// Al girar −90° en Y, la tapa delantera (+x) mira a la cámara: así el elegido enseña su portada.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LIBRO, ANATOMIA } from './disposicion.js';
import { ACABADOS, ENTORNO, generarNormales, generarRugosidad } from '../../prueba-3d/js/aspecto.js';
import { dibujarPortada, dibujarBanda, PORTADA } from '../../prueba-3d/js/portada-tapa.js';
import { dibujarLomoEditorial, dibujarLomoNuevo, dibujarTapaNueva } from './lomo-teselia.js';
import { generarSombra, normalDesdeAltura } from './texturas.js';
import { cargarCartas } from '../../prueba-3d/js/portada-tapa.js';

export function crearFabricaLibros(calidad, recursos, alCambiar = () => {}) {
  const r = (x) => { recursos.push(x); return x; };
  const geo = r(new RoundedBoxGeometry(LIBRO.grueso, LIBRO.alto, LIBRO.fondo, 3, 0.0042));
  const ancho = { baja: 96, media: 160, alta: 224 }[calidad.nivel] || 160;
  const tex = (c, srgb = true) => { const t = r(new THREE.CanvasTexture(c)); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = calidad.anisotropia; return t; };
  const sombraMat = r(new THREE.MeshBasicMaterial({ map: tex(generarSombra()), color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false }));
  const sombraGeo = r(new THREE.PlaneGeometry(1, 1));
  const cache = new Map();
  const conRelieve = calidad.nivel !== 'baja';

  // ------------------------------------------------------------ 3.20 · el MISMO acabado que el álbum 3D (tema editorial): tela negra en sarga
  const AC = ACABADOS.editorial;
  const telaNormal = conRelieve ? (() => { const tam = calidad.nivel === 'alta' ? 256 : 128, t = r(new THREE.DataTexture(generarNormales(tam, AC.fuerza, 7, AC.tipo), tam, tam, THREE.RGBAFormat));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = calidad.anisotropia; t.needsUpdate = true; return t; })() : null;
  const telaRugo = conRelieve ? (() => { const tam = 128, t = r(new THREE.DataTexture(generarRugosidad(tam, 11, AC.tipo), tam, tam, THREE.RGBAFormat));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t; })() : null;
  /** Tela con el color del acabado; `vertexColors` aclara los cantos como en el álbum (cantoPorNormal 1,4). */
  const tela = (color = AC.color) => {
    const m = r(calidad.nivel === 'alta' ? new THREE.MeshPhysicalMaterial({ color, roughness: AC.rugosidad, metalness: 0, sheen: 0.8, sheenRoughness: 0.55, sheenColor: new THREE.Color(AC.sheen) })
      : new THREE.MeshStandardMaterial({ color, roughness: AC.rugosidad, metalness: 0 }));
    if (telaNormal) { m.normalMap = telaNormal; m.normalScale.set(AC.relieve, AC.relieve); m.roughnessMap = telaRugo; }
    m.vertexColors = true; m.envMapIntensity = ENTORNO.intensidad.cubierta;
    return m;
  };
  const matTela = tela(), matHojas = r(new THREE.MeshStandardMaterial({ map: tex(cantosHojas()), roughness: 0.75, metalness: 0 }));

  /** Cantos del bloque de hojas: grafito con líneas de hoja (las páginas del álbum son grafito en el tema editorial). */
  function cantosHojas() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#2b2b2b'; x.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 128; i += 3) { x.fillStyle = i % 6 ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.07)'; x.fillRect(i, 0, 1, 64); }
    return c;
  }
  /** Rectángulo redondeado con radio distinto junto al lomo (izquierda, u = 0) y fuera; lo extruye `grosor` a lo largo de +z. */
  function losa(ancho, alto, radioLomo, radioFuera, grosor, bisel) {
    const sh = new THREE.Shape(), a = ancho / 2, b = alto / 2, rl = Math.min(radioLomo, a, b), rf = Math.min(radioFuera, a, b);
    sh.moveTo(-a + rl, -b); sh.lineTo(a - rf, -b); sh.quadraticCurveTo(a, -b, a, -b + rf); sh.lineTo(a, b - rf); sh.quadraticCurveTo(a, b, a - rf, b);
    sh.lineTo(-a + rl, b); sh.quadraticCurveTo(-a, b, -a, b - rl); sh.lineTo(-a, -b + rl); sh.quadraticCurveTo(-a, -b, -a + rl, -b);
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.0001, grosor - 2 * bisel), bevelEnabled: bisel > 0, bevelThickness: bisel, bevelSize: bisel, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -(grosor - 2 * bisel) / 2);
    // UV en metros / tamaño de la trama (como rellenarUV en el álbum): la sarga mide lo mismo en todas las piezas
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / AC.uv, uv.getY(i) / AC.uv);
    return g;
  }
  /** Color de vértice: caras planas 1, cantos y bisel 1,4 (los cantos «atrapan» la luz y separan la tapa del fondo). */
  function cantos(g, eje = 'z') {
    const n = g.attributes.normal, c = new Float32Array(n.count * 3);
    for (let i = 0; i < n.count; i++) { const v = Math.abs(eje === 'z' ? n.getZ(i) : n.getX(i)), t = Math.min(1, Math.max(0, (v - 0.6) / 0.3)), k = 1.4 + (1 - 1.4) * t * t * (3 - 2 * t); c.set([k, k, k], i * 3); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    return g;
  }
  const geos = new Map();                            // geometrías compartidas por grosor (álbumes con el mismo nº de hojas)
  function geometrias(T) {
    if (geos.has(T)) return geos.get(T);
    const A = ANATOMIA, gt = A.grosorTapa;
    const g = {
      tapa: r(cantos(losa(A.anchoTapa, LIBRO.alto, 0.0016, A.radioTapa, gt, 0.0012))),
      banda: r(cantos(losa(A.banda[1] - A.banda[0], A.altoPieza, A.radioBanda, A.radioBanda, 0.0014, 0.0006))),
      panel: r(cantos(losa(A.panel[1] - A.panel[0], A.altoPieza, A.radioPanel, A.radioPanel, 0.0010, 0.0004))),
      hojas: r(new RoundedBoxGeometry(Math.max(0.002, T - 2 * gt), A.altoHoja, A.anchoHoja, 2, 0.001)),
      lomo: r(cantos(new RoundedBoxGeometry(T, LIBRO.alto, A.lomo + 0.004, 4, Math.min(T / 2, 0.0045)), 'x')),
    };
    geos.set(T, g); return g;
  }

  /** Lomo (diseño editorial) y láminas impresas de portada y banda de un álbum: una vez por álbum. Las láminas usan el MISMO material que la
   *  tapa del visor (satinado con algo de emisión, aspecto.js → _montarPortada). Las ilustraciones llegan después y se repinta. */
  function materialesEditorial(album, T) {
    const k = 'editorial:' + album.id;
    if (cache.has(k)) return cache.get(k);
    const A = ANATOMIA, lado = calidad.nivel === 'alta' ? 1024 : calidad.nivel === 'media' ? 768 : 512;
    const lomoC = dibujarLomoEditorial(ancho, album.lomo, T);
    const mr = tex(lomoC.mr, false);
    const lomo = r(new THREE.MeshStandardMaterial({ map: tex(lomoC.color), roughnessMap: mr, metalnessMap: mr, roughness: 1, metalness: 1,
      normalMap: conRelieve ? tex(normalDesdeAltura(lomoC.alto, 3), false) : null }));
    if (lomo.normalMap) lomo.normalScale.set(0.9, 0.9);
    const lamina = (anchoM, altoM, px, dibujar) => {
      const w = px, h = Math.round(px * altoM / anchoM), c = document.createElement('canvas'); c.width = w; c.height = h;
      dibujar(c.getContext('2d'), w, h);
      const t = tex(c), m = r(new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0, transparent: true, emissive: 0xffffff, emissiveMap: t,
        emissiveIntensity: PORTADA.emision, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      m.envMapIntensity = ENTORNO.intensidad.cubierta * 0.35;
      return { m, c, t, geo: r(new THREE.PlaneGeometry(anchoM, altoM)) };
    };
    const mp = PORTADA.margen, mb = PORTADA.margenBanda;
    const p = lamina(A.panel[1] - A.panel[0] - 2 * mp, A.altoPieza - 2 * mp, lado, (x, w, h) => dibujarPortada(x, w, h, {}, album.portada));
    const b = lamina(A.banda[1] - A.banda[0] - 2 * mb, A.altoPieza - 2 * mb, Math.round(lado / 6), (x, w, h) => dibujarBanda(x, w, h, album.portada));
    const res = { lomo, portada: p.m, banda: b.m, geoPanel: p.geo, geoBanda: b.geo };
    cache.set(k, res);
    cargarCartas(new URL('../../prueba-3d/assets/cartas/grande/', import.meta.url), album.portada && album.portada.cartas).then((cartas) => {
      if (!cartas.blanca && !cartas.negra) return;
      dibujarPortada(p.c.getContext('2d'), p.c.width, p.c.height, cartas, album.portada); p.t.needsUpdate = true; alCambiar();
    });
    return res;
  }

  /** Sombra de contacto: se queda en el suelo (y = 0) y sigue al libro en x/z. La añade el llamador a la escena. */
  function sombra() {
    const s = new THREE.Mesh(sombraGeo, sombraMat); s.rotation.x = -Math.PI / 2; s.position.y = 0.0005; s.renderOrder = 1;
    return s;
  }

  /** Álbum de pie con la anatomía del álbum 3D: dos tapas de tela, bloque de hojas, lomo redondeado con su diseño, y en la tapa delantera la
   *  banda y el panel en relieve con la lámina impresa (la misma de la tapa del visor). `T` = grosor real (2 tapas + hojas del modelo).
   *  Ejes del grupo: x = grosor (tapa delantera en +x), y = alto, z = fondo (lomo en +z). */
  function crearAlbum(album, T = LIBRO.grueso) {
    const g = new THREE.Group(); g.name = 'Libro_' + album.id;
    const A = ANATOMIA, gt = A.grosorTapa, G = geometrias(T), zLomoInt = LIBRO.fondo / 2 - A.lomo;     // z donde acaba el lomo y empieza la tapa
    const add = (geo, mat, x, z, nombre = '') => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, 0, z); m.name = nombre;
      m.rotation.y = Math.PI / 2;                                // la losa (simétrica en grosor) se extruye en +z: girada, su cara mira a ±x y su lado u = 0 (esquinas pequeñas) queda junto al lomo
      g.add(m); return m;
    };
    const zTapa = zLomoInt - A.anchoTapa / 2;
    add(G.tapa, matTela, T / 2 - gt / 2, zTapa, 'Tapa');
    add(G.tapa, matTela, -T / 2 + gt / 2, zTapa, 'Contratapa');
    const hojas = new THREE.Mesh(G.hojas, matHojas); hojas.position.set(0, 0, zLomoInt - A.anchoHoja / 2); g.add(hojas);
    const d = materialesEditorial(album, T);
    const lomo = new THREE.Mesh(G.lomo, [matTela, matTela, matTela, matTela, d.lomo, matTela]); lomo.position.z = LIBRO.fondo / 2 - (A.lomo + 0.004) / 2; lomo.name = 'Lomo'; g.add(lomo);
    // banda y panel en relieve (tela) sobre la tapa delantera, y encima la lámina impresa con su margen
    const xFrente = T / 2, zDe = (x0, x1) => zLomoInt - (x0 + x1) / 2;
    add(G.banda, matTela, xFrente + 0.0006, zDe(...A.banda), 'Banda');
    add(G.panel, matTela, xFrente + 0.0004, zDe(...A.panel), 'Panel');
    const lamina = (geo, mat, x0, x1, alto) => { const m = new THREE.Mesh(geo, mat); m.rotation.y = Math.PI / 2; m.position.set(xFrente + alto, 0, zDe(x0, x1)); m.renderOrder = 1; g.add(m); };
    lamina(d.geoBanda, d.banda, ...A.banda, 0.0014);
    lamina(d.geoPanel, d.portada, ...A.panel, 0.0010);
    g.userData = { tipo: 'album', id: album.id };
    g.traverse((o) => { if (o.isMesh) o.userData = g.userData; });
    return g;
  }

  /** «Nuevo álbum»: libro de cristal ahumado con lomo y portada propios, para que también pueda quedar seleccionado. */
  function crearNuevo() {
    const g = new THREE.Group(); g.name = 'NuevoAlbum';
    const vidrio = r(new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.55 }));
    const lomo = r(new THREE.MeshBasicMaterial({ map: tex(dibujarLomoNuevo(ancho)), toneMapped: false }));
    const tapa = r(new THREE.MeshBasicMaterial({ map: tex(dibujarTapaNueva(calidad.nivel === 'baja' ? 384 : 640)), toneMapped: false }));
    const cuerpo = new THREE.Mesh(geo, [tapa, vidrio, vidrio, vidrio, lomo, vidrio]); g.add(cuerpo);
    g.userData = { tipo: 'nuevo', id: 'nuevo' };
    cuerpo.userData = g.userData;
    return g;
  }

  return { crearAlbum, crearNuevo, sombra };
}
