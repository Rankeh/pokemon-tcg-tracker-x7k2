// Libros de la estantería: álbumes de pie mostrando el lomo (cara +z), y el lomo especial «Nuevo álbum».
// Una sola geometría para todos los libros (mismas medidas que el álbum 3D); cada diseño de lomo comparte sus materiales.
// Caras de la caja (orden de BoxGeometry): 0 +x tapa delantera · 1 −x contratapa · 2 +y canto superior · 3 −y canto inferior · 4 +z LOMO · 5 −z canto delantero.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LIBRO } from './disposicion.js';
import { dibujarLomoTeselia, dibujarTapa, dibujarCantos, dibujarLomoNuevo, COLORES } from './lomo-teselia.js';
import { generarSombra, normalDesdeAltura } from './texturas.js';
import { cargarCartas } from '../../prueba-3d/js/portada-tapa.js';

export function crearFabricaLibros(calidad, recursos, alCambiar = () => {}) {
  const r = (x) => { recursos.push(x); return x; };
  const geo = r(new RoundedBoxGeometry(LIBRO.grueso, LIBRO.alto, LIBRO.fondo, 3, 0.0042));
  const ancho = { baja: 96, media: 160, alta: 224 }[calidad.nivel] || 160;
  const tex = (c, srgb = true) => { const t = r(new THREE.CanvasTexture(c)); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = calidad.anisotropia; return t; };
  const sombraTex = tex(generarSombra());
  const sombraMat = r(new THREE.MeshBasicMaterial({ map: sombraTex, color: 0x000000, transparent: true, opacity: 0.7, depthWrite: false }));
  const sombraGeo = r(new THREE.PlaneGeometry(LIBRO.grueso * 2.3, LIBRO.fondo * 1.25));
  const cache = new Map();

  function materialesTeselia() {
    if (cache.has('teselia')) return cache.get('teselia');
    const lomo = dibujarLomoTeselia(ancho);
    const conRelieve = calidad.nivel !== 'baja';
    const mr = tex(lomo.mr, false);                               // una sola textura: G = rugosidad, B = metal
    const mLomo = r(new THREE.MeshStandardMaterial({
      map: tex(lomo.color), roughnessMap: mr, metalnessMap: mr, roughness: 1, metalness: 1,
      normalMap: conRelieve ? tex(normalDesdeAltura(lomo.alto, 3), false) : null,
    }));
    if (mLomo.normalMap) mLomo.normalScale.set(0.9, 0.9);
    const lienzoTapa = dibujarTapa({}, calidad.nivel === 'baja' ? 256 : 512);
    const tTapa = tex(lienzoTapa);
    const mTapa = r(new THREE.MeshStandardMaterial({ map: tTapa, roughness: 0.78, metalness: 0 }));
    const mContra = r(new THREE.MeshStandardMaterial({ color: COLORES.tejido, roughness: 0.82, metalness: 0 }));
    const mCantos = r(new THREE.MeshStandardMaterial({ map: tex(dibujarCantos()), roughness: 0.9, metalness: 0 }));
    const lista = [mTapa, mContra, mCantos, mCantos, mLomo, mCantos];
    cache.set('teselia', lista);
    // la lámina de la portada lleva Reshiram y Zekrom: se repinta cuando llegan las imágenes locales (no bloquea el primer dibujo)
    cargarCartas(new URL('../../prueba-3d/assets/cartas/grande/', import.meta.url)).then((cartas) => {
      if (!cartas.blanca && !cartas.negra) return;
      const nuevo = dibujarTapa(cartas, lienzoTapa.width);
      lienzoTapa.getContext('2d').drawImage(nuevo, 0, 0); tTapa.needsUpdate = true; alCambiar();
    });
    return lista;
  }

  /** Álbum de pie en el hueco. El grupo se coloca en el centro del libro; `userData` identifica el álbum para el picking. */
  function crearAlbum(album, pos) {
    const g = new THREE.Group(); g.name = 'Libro_' + album.id;
    const mats = album.lomo.diseno === 'teselia' ? materialesTeselia() : materialesLisos(album.lomo.color);
    const libro = new THREE.Mesh(geo, mats); libro.name = 'Cuerpo';
    g.add(libro);
    const s = new THREE.Mesh(sombraGeo, sombraMat); s.rotation.x = -Math.PI / 2; s.position.y = -LIBRO.alto / 2 + 0.0006; s.renderOrder = 1; g.add(s);
    g.position.set(pos.x, pos.y, pos.z);
    g.userData = { tipo: 'album', id: album.id, ruta: album.ruta, nombre: album.nombre };
    libro.userData = g.userData;
    return g;
  }

  function materialesLisos(color) {
    const k = 'liso:' + color;
    if (cache.has(k)) return cache.get(k);
    const m = r(new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0 }));
    const mCantos = cache.get('teselia')?.[2] || r(new THREE.MeshStandardMaterial({ map: tex(dibujarCantos()), roughness: 0.9 }));
    const lista = [m, m, mCantos, mCantos, m, mCantos];
    cache.set(k, lista); return lista;
  }

  /** «Nuevo álbum»: volumen de cristal muy tenue + lomo dibujado (sin libro ficticio: se lee como hueco disponible). */
  function crearNuevo(pos) {
    const g = new THREE.Group(); g.name = 'NuevoAlbum';
    const vidrio = r(new THREE.MeshStandardMaterial({ color: 0xffe6b8, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.06, depthWrite: false }));
    const volumen = new THREE.Mesh(geo, vidrio); g.add(volumen);
    const t = tex(dibujarLomoNuevo(ancho));
    const frente = new THREE.Mesh(r(new THREE.PlaneGeometry(LIBRO.grueso, LIBRO.alto)),
      r(new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.95 })));
    frente.position.z = LIBRO.fondo / 2 + 0.0008; g.add(frente);
    const s = new THREE.Mesh(sombraGeo, sombraMat); s.rotation.x = -Math.PI / 2; s.position.y = -LIBRO.alto / 2 + 0.0006; s.scale.set(0.8, 0.8, 1); s.renderOrder = 1; g.add(s);
    g.position.set(pos.x, pos.y, pos.z);
    g.userData = { tipo: 'nuevo', id: 'nuevo' };
    volumen.userData = g.userData; frente.userData = g.userData;
    return g;
  }

  /** Sujetalibros de latón en L (detalle metálico; no es un libro). */
  function crearSujetalibros(pos, laton) {
    const g = new THREE.Group(); g.name = 'Sujetalibros';
    const base = new THREE.Mesh(r(new RoundedBoxGeometry(0.05, 0.004, 0.11, 2, 0.0015)), laton); base.position.set(0.006, -LIBRO.alto / 2 + 0.002, 0);
    const placa = new THREE.Mesh(r(new RoundedBoxGeometry(0.004, 0.16, 0.11, 2, 0.0015)), laton); placa.position.set(-0.016, -LIBRO.alto / 2 + 0.08, 0);
    g.add(base, placa);
    g.position.set(pos.x, pos.y, pos.z + LIBRO.fondo / 2 - 0.07);
    return g;
  }

  return { crearAlbum, crearNuevo, crearSujetalibros };
}
