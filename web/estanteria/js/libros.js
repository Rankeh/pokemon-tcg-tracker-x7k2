// Libros del carrusel: álbumes de pie (lomo en la cara +z) y el elemento «Nuevo álbum».
// Una sola geometría para todos (mismas medidas que el álbum 3D). Caras (orden de BoxGeometry):
// 0 +x tapa delantera · 1 −x contratapa · 2 +y canto superior · 3 −y canto inferior · 4 +z LOMO · 5 −z canto delantero.
// Al girar −90° en Y, la tapa delantera (+x) mira a la cámara: así el elegido enseña su portada.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LIBRO } from './disposicion.js';
import { dibujarLomoEditorial, dibujarTapa, dibujarCantos, dibujarLomoNuevo, dibujarTapaNueva, COLORES } from './lomo-teselia.js';
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

  /** Materiales de un álbum de diseño editorial (lomo, tapa con su portada, contratapa y cantos), uno por álbum. */
  function materialesEditorial(album) {
    const k = 'editorial:' + album.id;
    if (cache.has(k)) return cache.get(k);
    const lomo = dibujarLomoEditorial(ancho, album.lomo);
    const mr = tex(lomo.mr, false);                               // una sola textura: G = rugosidad, B = metal
    const mLomo = r(new THREE.MeshStandardMaterial({
      map: tex(lomo.color), roughnessMap: mr, metalnessMap: mr, roughness: 1, metalness: 1,
      normalMap: calidad.nivel !== 'baja' ? tex(normalDesdeAltura(lomo.alto, 3), false) : null,
    }));
    if (mLomo.normalMap) mLomo.normalScale.set(0.9, 0.9);
    const lienzoTapa = dibujarTapa({}, calidad.nivel === 'baja' ? 384 : 768, album.portada);
    const tTapa = tex(lienzoTapa);
    const mTapa = r(new THREE.MeshStandardMaterial({ map: tTapa, roughness: 0.72, metalness: 0 }));
    const mContra = r(new THREE.MeshStandardMaterial({ color: COLORES.tejido, roughness: 0.82, metalness: 0 }));
    const mCantos = r(new THREE.MeshStandardMaterial({ map: tex(dibujarCantos()), roughness: 0.9, metalness: 0 }));
    const lista = [mTapa, mContra, mCantos, mCantos, mLomo, mCantos];
    cache.set(k, lista);
    // la lámina de la portada lleva Reshiram y Zekrom: se repinta cuando llegan las imágenes locales (no bloquea el primer dibujo)
    cargarCartas(new URL('../../prueba-3d/assets/cartas/grande/', import.meta.url), album.portada && album.portada.cartas).then((cartas) => {
      if (!cartas.blanca && !cartas.negra) return;
      lienzoTapa.getContext('2d').drawImage(dibujarTapa(cartas, lienzoTapa.width, album.portada), 0, 0); tTapa.needsUpdate = true; alCambiar();
    });
    return lista;
  }

  function materialesLisos(color) {
    const k = 'liso:' + color;
    if (cache.has(k)) return cache.get(k);
    const m = r(new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0 }));
    const mCantos = r(new THREE.MeshStandardMaterial({ map: tex(dibujarCantos()), roughness: 0.9 }));
    const lista = [m, m, mCantos, mCantos, m, mCantos];
    cache.set(k, lista); return lista;
  }

  /** Sombra de contacto: se queda en el suelo (y = 0) y sigue al libro en x/z. La añade el llamador a la escena. */
  function sombra() {
    const s = new THREE.Mesh(sombraGeo, sombraMat); s.rotation.x = -Math.PI / 2; s.position.y = 0.0005; s.renderOrder = 1;
    return s;
  }

  /** Álbum de pie. El grupo se coloca en el centro del libro; `userData` identifica el álbum para el picking. */
  function crearAlbum(album) {
    const g = new THREE.Group(); g.name = 'Libro_' + album.id;
    const libro = new THREE.Mesh(geo, album.lomo.diseno === 'liso' ? materialesLisos(album.lomo.color) : materialesEditorial(album));
    libro.name = 'Cuerpo'; g.add(libro);
    g.userData = { tipo: 'album', id: album.id };
    libro.userData = g.userData;
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
