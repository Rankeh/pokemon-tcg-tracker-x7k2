// Regresión de la Fase 3.5.1: en un iPhone vertical (390×663) la cámara quedaba a 3,6 m y el álbum caía más allá de far=3 → solo se veía la mesa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { OrbitaLigera, distanciaEncuadre, planosRecorte } from '../js/camara.js';

const GRAD = Math.PI / 180;
const FOV = 32;
const pantallas = { 'iPhone vertical 390×663': 390 / 663, 'iPhone horizontal 844×390': 844 / 390, 'PC 1920×1080': 1920 / 1080, 'cuadrada': 1 };

// Cámara "mira a": proyección en perspectiva sin Three.js
function proyectar(p, pos, tgt, aspect, near, far) {
  const f = tgt.map((v, i) => v - pos[i]); const lf = Math.hypot(...f); f.forEach((_, i) => (f[i] /= lf));
  const rx = f[1] * 0 - f[2] * 1, rz = f[0] * 1 - f[1] * 0; const lr = Math.hypot(rx, rz); const R = [rx / lr, 0, rz / lr];
  const U = [R[1] * f[2] - R[2] * f[1], R[2] * f[0] - R[0] * f[2], R[0] * f[1] - R[1] * f[0]];
  const d = p.map((v, i) => v - pos[i]);
  const x = d[0] * R[0] + d[1] * R[1] + d[2] * R[2], y = d[0] * U[0] + d[1] * U[1] + d[2] * U[2], z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  const tv = Math.tan(FOV * GRAD / 2);
  return { x: x / (z * tv * aspect), y: y / (z * tv), z, dentroProfundidad: z > near && z < far };
}

const esquinas = [];                                           // caja del álbum abierto (±0,258 en x, ±0,161 en z, y 0..0,04)
for (const x of [-0.258, 0.258]) for (const z of [-0.161, 0.161]) for (const y of [0, 0.04]) esquinas.push([x, y, z]);

for (const [nombre, aspect] of Object.entries(pantallas)) {
  test('encuadre en ' + nombre + ': todo el álbum cabe en pantalla y entre near y far', () => {
    const o = new OrbitaLigera();
    const radio = distanciaEncuadre({ fovGrados: FOV, aspect, elevacion: o.el });
    o.radio = radio;
    const rMax = radio * 1.6, pl = planosRecorte(radio, rMax);
    for (const rr of [radio, rMax]) {                          // también con el máximo alejamiento permitido por el zoom
      o.radio = rr;
      const pos = o.posicion();
      for (const c of esquinas) {
        const q = proyectar(c, pos, o.objetivo, aspect, pl.near, pl.far);
        assert.ok(q.dentroProfundidad, `esquina fuera de near/far (z=${q.z.toFixed(2)}, far=${pl.far})`);
        if (rr === radio) assert.ok(Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1, `esquina fuera de pantalla (${q.x.toFixed(2)}, ${q.y.toFixed(2)})`);
      }
    }
  });
}

test('la fórmula antigua (÷cos, far=3) sacaba el álbum del frustum en el iPhone vertical (reproduce el fallo)', () => {
  const aspect = 390 / 663, el = 62 * GRAD, th = Math.tan(FOV * GRAD / 2) * aspect;
  const antiguo = Math.max(0.62, (0.30 / th) / Math.cos(el) * 0.95);
  assert.ok(antiguo > 3, 'radio antiguo ' + antiguo.toFixed(2) + ' m > far 3 m');
  assert.ok(distanciaEncuadre({ fovGrados: FOV, aspect, elevacion: el }) < 3);
});
