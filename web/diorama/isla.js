// Isla de diorama (Three.js): bloque de tierra con hierba encima y corte lateral pintado, franja de agua delante con su corte,
// árboles redondeados, matas de hierba y fondo en arco. La usan la estantería (con el mueble encima) y el álbum (con el álbum encima).
// Coste bajo: unas pocas mallas con geometrías y materiales compartidos; todas las texturas salen de pintura.js (una vez por página).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { texturaHierba, texturaCorteTierra, texturaCorteAgua, texturaSuperficieAgua, texturaCopa, texturaFondoArco, azar, PALETA } from './pintura.js';

/** Materiales compartidos (se crean una vez). `anisotropia` y `res` según la calidad. */
export function crearMaterialesIsla({ anisotropia = 4, res = 1 } = {}, recursos = []) {
  const r = (x) => { recursos.push(x); return x; };
  const tex = (c, rep = [1, 1]) => { const t = r(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropia; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); return t; };
  const s = (n) => Math.round(n * res);
  const corte = tex(texturaCorteTierra(s(512), s(256)));
  corte.wrapT = THREE.ClampToEdgeWrapping;
  const corteAgua = tex(texturaCorteAgua(s(512), s(256)));
  corteAgua.wrapT = THREE.ClampToEdgeWrapping;
  const mate = (map, extra = {}) => r(new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, ...extra }));
  return {
    hierba: mate(tex(texturaHierba(s(256)))),
    corte: mate(corte),
    fondoTierra: mate(null, { color: PALETA.tierraHonda }),
    agua: mate(tex(texturaSuperficieAgua(s(256))), { roughness: 0.25, transparent: true, opacity: 0.92 }),
    corteAgua: mate(corteAgua, { roughness: 0.3, transparent: true, opacity: 0.94, emissive: 0x0b3d66, emissiveIntensity: 0.25 }),
    copa: mate(tex(texturaCopa(s(256))), { roughness: 0.9 }),
    tronco: mate(null, { color: PALETA.tronco[0], roughness: 0.9 }),
    mata: mate(null, { color: PALETA.hierba[1], roughness: 0.9, flatShading: true }),
    nenufar: mate(null, { color: '#6cbf5a', roughness: 0.6 }),
    flor: mate(null, { color: '#fff3f6', roughness: 0.7 }),
    fondo: r(new THREE.MeshBasicMaterial({ map: (() => { const t = tex(texturaFondoArco(s(1024), s(1024))); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; })(), transparent: true, depthWrite: false, toneMapped: false })),
  };
}

/**
 * Isla: tierra de `ancho` × `fondo` (la cara de arriba en y = 0) y `alto` de corte hacia abajo; si `agua` > 0, una franja de agua de esa
 * profundidad delante (z positiva), algo más baja que la hierba. Devuelve un Group con `userData.caja` = { x0, x1, z0, z1, yAbajo }.
 */
export function crearIsla({ ancho = 1, fondo = 0.6, alto = 0.16, agua = 0, radio = 0.035, semilla = 1, arboles = [], matas = 0, fondoArco = null } = {}, mat, recursos = []) {
  const r = (x) => { recursos.push(x); return x; };
  const g = new THREE.Group(); g.name = 'Isla';
  // bloque de tierra: caras 0..5 = +x, −x, +y (hierba), −y, +z (frente), −z
  const fondoTierra = fondo - agua;
  const tierra = new THREE.Mesh(r(new RoundedBoxGeometry(ancho, alto, fondoTierra, 4, radio)), [mat.corte, mat.corte, mat.hierba, mat.fondoTierra, mat.corte, mat.corte]);
  tierra.position.set(0, -alto / 2, -agua / 2);
  ajustarUV(tierra.geometry, ancho, alto, fondoTierra);
  g.add(tierra);
  if (agua > 0) {                                                      // franja de agua delante: superficie un poco más baja que la hierba
    const altoAgua = alto * 0.86;
    const bloque = new THREE.Mesh(r(new RoundedBoxGeometry(ancho - 0.004, altoAgua, agua + radio, 4, radio)),
      [mat.corteAgua, mat.corteAgua, mat.agua, mat.fondoTierra, mat.corteAgua, mat.corteAgua]);
    bloque.position.set(0, -alto * 0.14 - altoAgua / 2, fondo / 2 - agua / 2 - radio / 2 + 0.002);
    bloque.renderOrder = 2;
    ajustarUV(bloque.geometry, ancho, altoAgua, agua);
    g.add(bloque);
    const rnd = azar(semilla + 40);                                    // nenúfares
    const geoN = r(new THREE.CircleGeometry(1, 16, 0.25, Math.PI * 2 - 0.5));
    for (let i = 0; i < 4; i++) {
      const n = new THREE.Mesh(geoN, mat.nenufar), s = 0.012 + rnd() * 0.012;
      n.scale.set(s, s, s); n.rotation.set(-Math.PI / 2, 0, rnd() * 6);
      n.position.set((rnd() - 0.5) * ancho * 0.85, -alto * 0.14 + 0.0015, fondo / 2 - agua * (0.25 + rnd() * 0.5));
      g.add(n);
    }
  }
  // árboles: [x, z, escala]
  const geoCopa = r(new THREE.SphereGeometry(1, 20, 14)), geoTronco = r(new THREE.CylinderGeometry(0.6, 0.85, 1, 10));
  for (const [x, z, s] of arboles) g.add(crearArbol(x, z, s, mat, geoCopa, geoTronco));
  // matas de hierba: conos achatados y facetados, repartidos por los bordes
  if (matas) {
    const rnd = azar(semilla + 7), geoM = r(new THREE.ConeGeometry(1, 1, 5));
    for (let i = 0; i < matas; i++) {
      const m = new THREE.Mesh(geoM, mat.mata), s = 0.012 + rnd() * 0.016;
      const borde = rnd() < 0.5 ? -1 : 1, enX = rnd() < 0.6;
      const x = enX ? (rnd() - 0.5) * ancho * 0.92 : borde * (ancho / 2 - 0.02 - rnd() * 0.05);
      const z = enX ? -agua / 2 + (rnd() < 0.5 ? -1 : 1) * (fondoTierra / 2 - 0.015 - rnd() * 0.03) : -agua / 2 + (rnd() - 0.5) * fondoTierra * 0.9;
      m.scale.set(s, s * (1.4 + rnd()), s); m.position.set(x, s * 0.6, z); m.rotation.y = rnd() * 6;
      g.add(m);
    }
  }
  if (fondoArco) {                                                     // cielo en arco detrás: { ancho, alto, z }
    const f = new THREE.Mesh(r(new THREE.PlaneGeometry(fondoArco.ancho, fondoArco.alto)), mat.fondo);
    f.position.set(0, fondoArco.alto / 2 - alto * 1.05, fondoArco.z); f.renderOrder = -2; f.name = 'FondoArco';
    g.add(f);
  }
  g.userData.caja = { x0: -ancho / 2, x1: ancho / 2, z0: -fondo / 2 - agua / 2, z1: fondo / 2, yAbajo: -alto };
  return g;
}

/** Árbol de diorama: tronco corto y copa de 3 bolas pintadas. */
export function crearArbol(x, z, s, mat, geoCopa, geoTronco) {
  const a = new THREE.Group(); a.name = 'Arbol';
  const t = new THREE.Mesh(geoTronco, mat.tronco); t.scale.set(0.035 * s, 0.16 * s, 0.035 * s); t.position.y = 0.08 * s; a.add(t);
  for (const [dx, dy, dz, k] of [[0, 0.24, 0, 0.12], [-0.06, 0.19, 0.02, 0.085], [0.06, 0.2, -0.01, 0.09], [0.01, 0.31, 0, 0.08]]) {
    const c = new THREE.Mesh(geoCopa, mat.copa); c.scale.set(k * s, k * s * 0.92, k * s); c.position.set(dx * s, dy * s, dz * s); a.add(c);
  }
  a.position.set(x, 0, z);
  return a;
}

/** Repite la textura según el tamaño real de cada cara (las caras de RoundedBox traen UV 0..1): la pincelada mide lo mismo en toda la isla. */
function ajustarUV(geo, ancho, alto, fondo) {
  const uv = geo.attributes.uv, n = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, uv.getX(i) * ancho / 0.35, uv.getY(i) * fondo / 0.35);       // hierba: mosaico de 35 cm
    else uv.setX(i, uv.getX(i) * (ax > az ? fondo : ancho) / 0.5);                                   // corte: 50 cm a lo ancho, alto completo
  }
  uv.needsUpdate = true;
}
