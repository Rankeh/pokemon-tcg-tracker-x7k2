// Selección de bolsillos con un rayo (PURA). Three.js solo aporta el rayo de la cámara y las matrices del mundo (matrixWorld.elements);
// la intersección se hace aquí para poder probarla sin navegador y para tener una zona táctil algo MAYOR que la carta.
//
// Cada bolsillo es un rectángulo en su plano local y=0, centrado en su nodo. Candidatos: {nombre, matriz (16, column-major), lado}
//   lado = +1 para la cara frontal (se ve desde +y local) y -1 para la dorsal (se ve desde -y local): no se acepta un toque "desde atrás".
export const ZONA = { mitadX: (0.0655 + 0.006) / 2, mitadZ: (0.0905 + 0.006) / 2 };     // bolsillo + media separación

/** Distancia t del rayo (origen o, dirección d, en el mundo) a la zona del bolsillo, o null si no la toca. */
export function distanciaARectangulo(o, d, m, lado, mitad = ZONA) {
  const tx = m[12], ty = m[13], tz = m[14];
  const px = o[0] - tx, py = o[1] - ty, pz = o[2] - tz;
  // R es ortonormal (solo rotaciones y traslaciones): local = Rᵀ · v
  const lo = [m[0] * px + m[1] * py + m[2] * pz, m[4] * px + m[5] * py + m[6] * pz, m[8] * px + m[9] * py + m[10] * pz];
  const ld = [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[4] * d[0] + m[5] * d[1] + m[6] * d[2], m[8] * d[0] + m[9] * d[1] + m[10] * d[2]];
  if (Math.abs(ld[1]) < 1e-9) return null;
  if (lo[1] * lado <= 0) return null;                  // la cámara está detrás del plástico de esa cara
  const t = -lo[1] / ld[1];
  if (t <= 0) return null;
  const x = lo[0] + t * ld[0], z = lo[2] + t * ld[2];
  return Math.abs(x) <= mitad.mitadX && Math.abs(z) <= mitad.mitadZ ? t : null;
}

/** El bolsillo más cercano a la cámara que toca el rayo, o null (toque fuera del álbum). */
export function elegirBolsillo(origen, direccion, candidatos) {
  let mejor = null;
  for (const c of candidatos) {
    const t = distanciaARectangulo(origen, direccion, c.matriz, c.lado);
    if (t !== null && (mejor === null || t < mejor.t)) mejor = { nombre: c.nombre, t };
  }
  return mejor;
}

/** Candidatos tocables: solo las caras superiores de cada pila, sin giro en curso y solo bolsillos con carta asignada (los 4 huecos no). */
export function candidatosTocables(estado, adaptador, matrizDe) {
  const res = [];
  for (const { hoja, cara } of estado.tocables()) {
    for (let k = 0; k < 9; k++) {
      const nombre = `Hoja_${hoja - 1}_${cara}_Bolsillo_${k}`;
      if (!adaptador.puedeEditar(nombre)) continue;
      const matriz = matrizDe(nombre);
      if (matriz) res.push({ nombre, matriz, lado: cara === 'F' ? 1 : -1 });
    }
  }
  return res;
}
