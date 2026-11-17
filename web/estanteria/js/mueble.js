// Mueble de la biblioteca: laterales, baldas, fondo con luz horneada, zócalo, remate con placa de latón, filetes de latón y tiras de luz.
// Pocas piezas y materiales compartidos: el coste no crece con el número de libros, solo con el de baldas (1 fondo + 1 balda + 1 tira por balda).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MUEBLE, ALTO_HUECO, medidasMueble, ySueloBalda } from './disposicion.js';
import { generarMadera, generarFondoHueco, generarPlaca, generarSuelo, normalDesdeAltura } from './texturas.js';

/** Halo cálido de la tira LED sobre la cara inferior de la balda (más fuerte junto a la tira, se apaga hacia el fondo). */
function resplandorTex() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 128;
  const ctx = c.getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,190,120,.0)'); g.addColorStop(0.12, 'rgba(255,190,120,.55)'); g.addColorStop(0.3, 'rgba(255,170,100,.32)'); g.addColorStop(1, 'rgba(255,150,90,.04)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Recursos compartidos (texturas y materiales) que se crean una vez y se reutilizan aunque cambie el número de baldas. */
export function crearMaterialesMueble(calidad, recursos) {
  const r = (x) => { recursos.push(x); return x; };
  const conRelieve = calidad.nivel !== 'baja';
  const madera = generarMadera(calidad.nivel === 'alta' ? 512 : 256);
  const tex = (c, srgb = true) => { const t = r(new THREE.CanvasTexture(c)); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = calidad.anisotropia; return t; };
  const color = tex(madera.color), normal = conRelieve ? tex(normalDesdeAltura(madera.alto, 1.2), false) : null;
  const vertical = (t) => { if (!t) return null; const v = r(t.clone()); v.center.set(0.5, 0.5); v.rotation = Math.PI / 2; v.needsUpdate = true; return v; };
  const nogal = (map, normalMap) => r(new THREE.MeshStandardMaterial({ map, normalMap, roughness: 0.62, metalness: 0, color: 0xffffff }));
  const fondo = r(new THREE.CanvasTexture(generarFondoHueco()));
  fondo.colorSpace = THREE.SRGBColorSpace;
  const placa = r(new THREE.CanvasTexture(generarPlaca('MI BIBLIOTECA')));
  placa.colorSpace = THREE.SRGBColorSpace; placa.anisotropy = calidad.anisotropia;
  const suelo = r(new THREE.CanvasTexture(generarSuelo()));
  suelo.colorSpace = THREE.SRGBColorSpace;
  return {
    horizontal: nogal(color, normal),
    vertical: nogal(vertical(color), vertical(normal)),
    fondo: r(new THREE.MeshStandardMaterial({ map: fondo, roughness: 0.85, metalness: 0 })),
    laton: r(new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 0.32, metalness: 1 })),
    placa: r(new THREE.MeshStandardMaterial({ map: placa, roughness: 0.38, metalness: 0.85 })),
    led: r(new THREE.MeshBasicMaterial({ color: 0xffd6a0, toneMapped: false })),
    resplandor: r(new THREE.MeshBasicMaterial({ map: r(resplandorTex()), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })),
    suelo: r(new THREE.MeshBasicMaterial({ map: suelo, transparent: true, depthWrite: false })),
  };
}

/** Construye el mueble para `huecos` × `baldas`. Devuelve un Group (las geometrías se registran en `recursos` para liberarlas). */
export function construirMueble({ huecos, baldas }, mat, recursos) {
  const g = new THREE.Group(); g.name = 'Mueble';
  const { interior, ancho, alto, fondo } = medidasMueble(huecos, baldas);
  const r = (x) => { recursos.push(x); return x; };
  const caja = (w, h, d, m, x, y, z, radio = 0.003, nombre = '') => {
    const o = new THREE.Mesh(r(new RoundedBoxGeometry(w, h, d, 2, Math.min(radio, w / 2, h / 2, d / 2))), m);
    o.position.set(x, y, z); o.name = nombre; g.add(o); return o;
  };
  const zFondo = -fondo / 2;

  // laterales (de suelo a remate) y trasera exterior
  for (const s of [-1, 1]) caja(MUEBLE.lateral, alto, fondo + 0.012, mat.vertical, s * (interior / 2 + MUEBLE.lateral / 2), alto / 2, zFondo + 0.006, 0.004, 'Lateral');
  caja(ancho, alto, 0.012, mat.vertical, 0, alto / 2, -fondo - 0.006, 0.002, 'Trasera');
  // zócalo retranqueado y remate superior con vuelo
  caja(interior, MUEBLE.zocalo - 0.008, fondo - 0.03, mat.horizontal, 0, (MUEBLE.zocalo - 0.008) / 2, zFondo - 0.015, 0.003, 'Zocalo');
  const yRemate = alto - MUEBLE.corona / 2;
  caja(ancho + 0.03, MUEBLE.corona, fondo + 0.04, mat.horizontal, 0, yRemate, zFondo + 0.01, 0.006, 'Remate');
  caja(ancho + 0.034, 0.006, 0.006, mat.laton, 0, alto - MUEBLE.corona + 0.006, 0.033, 0.002, 'FileteRemate');
  const placa = new THREE.Mesh(r(new THREE.PlaneGeometry(Math.min(0.26, ancho * 0.42), 0.042)), mat.placa);
  placa.position.set(0, yRemate + 0.002, 0.0312); placa.name = 'Placa'; g.add(placa);

  // baldas (b = 0 arriba) con filete de latón en el canto, tira de luz bajo la balda superior de cada hueco y fondo con luz horneada
  const fondoGeo = r(new THREE.PlaneGeometry(interior, ALTO_HUECO));
  const haloGeo = r(new THREE.PlaneGeometry(interior, fondo));
  for (let b = 0; b <= baldas; b++) {
    const ySuelo = b < baldas ? ySueloBalda(b, baldas) : null;
    const yBalda = b < baldas ? ySuelo - MUEBLE.balda / 2 : ySueloBalda(0, baldas) + ALTO_HUECO + MUEBLE.balda / 2;   // la última es el techo del hueco superior
    caja(interior, MUEBLE.balda, fondo, mat.horizontal, 0, yBalda, zFondo, 0.003, 'Balda');
    caja(interior - 0.004, 0.0035, 0.002, mat.laton, 0, yBalda + MUEBLE.balda * 0.18, 0.0012, 0.001, 'FileteBalda');
    if (b < baldas) {
      const techo = ySuelo + ALTO_HUECO;
      caja(interior - 0.02, 0.0025, 0.006, mat.led, 0, techo - 0.0016, -0.03, 0.001, 'Led');
      const halo = new THREE.Mesh(haloGeo, mat.resplandor);                // cara inferior de la balda iluminada por la tira
      halo.rotation.x = Math.PI / 2; halo.position.set(0, techo - 0.0004, -fondo / 2); halo.name = 'Halo'; g.add(halo);
      const f = new THREE.Mesh(fondoGeo, mat.fondo);
      f.position.set(0, ySuelo + ALTO_HUECO / 2, -fondo + 0.0005); f.name = 'Fondo'; g.add(f);
    }
  }

  // suelo que se funde con la pared
  const suelo = new THREE.Mesh(r(new THREE.PlaneGeometry(ancho * 3, 1.4)), mat.suelo);
  suelo.rotation.x = -Math.PI / 2; suelo.position.set(0, 0.0005, -0.1); suelo.renderOrder = -1; suelo.name = 'Suelo'; g.add(suelo);
  g.userData = { ancho, alto, interior, fondo };
  return g;
}
