// Mueble de la biblioteca en estilo diorama: madera de juguete color miel pintada a pincel, cantos muy redondeados, fondo de cada hueco
// pintado con la luz que entra desde arriba y un cartel de madera con el nombre. Pocas piezas y materiales compartidos.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MUEBLE, ALTO_HUECO, medidasMueble, ySueloBalda } from './disposicion.js';
import { texturaMadera, pinceladas, lienzo } from '../../diorama/pintura.js';

/** Fondo de un hueco: tablas verticales de madera más oscura, con la luz del día entrando por arriba y sombra en los rincones. */
function pintarFondo(w = 384, h = 320) {
  const c = lienzo(w, h), ctx = c.getContext('2d');
  ctx.save(); ctx.translate(w, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(texturaMadera(h, w, 31, true), 0, 0); ctx.restore();
  for (let x = w / 5; x < w; x += w / 5) { ctx.fillStyle = 'rgba(60,30,10,.35)'; ctx.fillRect(x - 1.5, 0, 3, h); }
  let g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(0.18, 'rgba(255,220,160,.12)'); g.addColorStop(0.6, 'rgba(255,220,160,.06)'); g.addColorStop(1, 'rgba(40,20,5,.35)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(40,20,5,.35)'); g.addColorStop(0.12, 'rgba(0,0,0,0)'); g.addColorStop(0.88, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(40,20,5,.35)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  return c;
}

/** Cartel de madera con letras pintadas en crema (sustituye a la placa de latón). */
function pintarCartel(texto, w = 512, h = 112) {
  const c = lienzo(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#9c6234'; ctx.beginPath(); ctx.roundRect(0, 0, w, h, h * 0.3); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, w, h, h * 0.3); ctx.clip();
  pinceladas(ctx, { x: 0, y: 0, w, h }, ['#b57640', '#8f5a2f', '#c4864c'], { n: 260, largo: w * 0.2, grosor: h * 0.05, desvio: 0.03, alfa: [0.3, 0.6], semilla: 5 });
  ctx.restore();
  ctx.strokeStyle = 'rgba(70,40,15,.6)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.roundRect(8, 8, w - 16, h - 16, h * 0.22); ctx.stroke();
  ctx.font = `800 ${h * 0.42}px ui-rounded, "SF Pro Rounded", "Nunito", "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(60,30,10,.45)'; ctx.fillText(texto, w / 2, h / 2 + 4);
  ctx.fillStyle = '#fff3d6'; ctx.fillText(texto, w / 2, h / 2);
  for (const x of [h * 0.34, w - h * 0.34]) { ctx.beginPath(); ctx.arc(x, h / 2, h * 0.07, 0, 2 * Math.PI); ctx.fillStyle = '#6b4220'; ctx.fill(); }   // clavos
  return c;
}

/** Recursos compartidos (texturas y materiales) que se crean una vez y se reutilizan aunque cambie el número de baldas. */
export function crearMaterialesMueble(calidad, recursos) {
  const r = (x) => { recursos.push(x); return x; };
  const lado = calidad.nivel === 'alta' ? 512 : calidad.nivel === 'media' ? 384 : 256;
  const tex = (c) => { const t = r(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = calidad.anisotropia; return t; };
  const madera = tex(texturaMadera(lado, lado));
  const vertical = r(madera.clone()); vertical.center.set(0.5, 0.5); vertical.rotation = Math.PI / 2; vertical.needsUpdate = true;
  const mate = (map, extra = {}) => r(new THREE.MeshStandardMaterial({ map, roughness: 0.8, metalness: 0, ...extra }));
  return {
    horizontal: mate(madera),
    vertical: mate(vertical),
    canto: mate(null, { color: '#a86b39', roughness: 0.75 }),
    fondo: mate(tex(pintarFondo()), { roughness: 0.95 }),
    cartel: mate(tex(pintarCartel('MI BIBLIOTECA')), { roughness: 0.85 }),
    pata: mate(null, { color: '#8f5a31', roughness: 0.85 }),
  };
}

/** Construye el mueble para `huecos` × `baldas`. Devuelve un Group (las geometrías se registran en `recursos` para liberarlas). */
export function construirMueble({ huecos, baldas }, mat, recursos) {
  const g = new THREE.Group(); g.name = 'Mueble';
  const { interior, ancho, alto, fondo } = medidasMueble(huecos, baldas);
  const r = (x) => { recursos.push(x); return x; };
  const caja = (w, h, d, m, x, y, z, radio = 0.006, nombre = '') => {
    const o = new THREE.Mesh(r(new RoundedBoxGeometry(w, h, d, 3, Math.min(radio, w / 2.01, h / 2.01, d / 2.01))), m);
    o.position.set(x, y, z); o.name = nombre; g.add(o); return o;
  };
  const zFondo = -fondo / 2;

  // laterales gruesos y redondeados (juguete), trasera y zócalo con patitas
  for (const s of [-1, 1]) caja(MUEBLE.lateral, alto - MUEBLE.zocalo * 0.5, fondo + 0.014, mat.vertical, s * (interior / 2 + MUEBLE.lateral / 2), (alto + MUEBLE.zocalo * 0.5) / 2, zFondo + 0.007, 0.012, 'Lateral');
  caja(ancho - 0.01, alto - MUEBLE.zocalo * 0.5, 0.014, mat.vertical, 0, (alto + MUEBLE.zocalo * 0.5) / 2, -fondo - 0.005, 0.005, 'Trasera');
  caja(interior + 0.01, MUEBLE.zocalo * 0.55, fondo - 0.02, mat.horizontal, 0, MUEBLE.zocalo * 0.5 + MUEBLE.zocalo * 0.275 - 0.004, zFondo, 0.01, 'Zocalo');
  for (const sx of [-1, 1]) for (const sz of [0.25, 0.85]) caja(0.05, MUEBLE.zocalo * 0.55, 0.05, mat.pata, sx * (interior / 2 + MUEBLE.lateral / 2 - 0.005), MUEBLE.zocalo * 0.275, -fondo * sz, 0.018, 'Pata');

  // remate con vuelo y cartel de madera encima, apoyado en dos postes
  const yRemate = alto - MUEBLE.corona / 2;
  caja(ancho + 0.036, MUEBLE.corona, fondo + 0.05, mat.horizontal, 0, yRemate, zFondo + 0.012, 0.016, 'Remate');
  const anchoCartel = Math.min(0.3, ancho * 0.62), altoCartel = anchoCartel * 112 / 512;
  const cartel = caja(anchoCartel, altoCartel, 0.016, mat.cartel, 0, alto + 0.012 + altoCartel / 2, -0.03, 0.006, 'Cartel');
  cartel.material = [mat.pata, mat.pata, mat.pata, mat.pata, mat.cartel, mat.pata];
  cartel.rotation.z = -0.025;                                          // un pelín torcido: hecho a mano

  // baldas (b = 0 arriba) con un listón más oscuro en el canto y el fondo pintado de cada hueco
  const fondoGeo = r(new THREE.PlaneGeometry(interior, ALTO_HUECO));
  for (let b = 0; b <= baldas; b++) {
    const ySuelo = b < baldas ? ySueloBalda(b, baldas) : null;
    const yBalda = b < baldas ? ySuelo - MUEBLE.balda / 2 : ySueloBalda(0, baldas) + ALTO_HUECO + MUEBLE.balda / 2;
    caja(interior + 0.004, MUEBLE.balda, fondo, mat.horizontal, 0, yBalda, zFondo, 0.008, 'Balda');
    caja(interior - 0.01, MUEBLE.balda * 0.55, 0.006, mat.canto, 0, yBalda, 0.002, 0.003, 'Liston');
    if (b < baldas) {
      const f = new THREE.Mesh(fondoGeo, mat.fondo);
      f.position.set(0, ySuelo + ALTO_HUECO / 2, -fondo + 0.0025); f.name = 'Fondo'; g.add(f);
    }
  }
  g.userData = { ancho, alto, interior, fondo };
  return g;
}
