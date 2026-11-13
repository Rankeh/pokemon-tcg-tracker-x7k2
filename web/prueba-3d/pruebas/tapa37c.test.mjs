// Fase 3.7.1c — la tapa izquierda (y los cuerpos de las hojas) nunca desaparecen. Three.js SIMULADO + GLB real: valida la estructura y las
// transformaciones, NO sustituye a una comprobación visual en navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearMundo } from './mundo.mjs';

const cuerpo = (a, i) => (i === 0 ? a.nodo.get('Tapa_Malla') : a.nodo.get('Hoja_' + (i - 1) + '_Losa'));
const dibujado = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
const ir = (a, v) => { a.estado.irA(v); a.aplicar(); };

test('1 todos los estados 0..10: Tapa, Contratapa, Lomo y los 10 cuerpos se dibujan siempre', async () => {
  const { album: a } = await crearMundo();
  for (let v = 0; v <= a.geo.elementos; v++) {
    ir(a, v);
    for (let i = 0; i < a.geo.elementos; i++) assert.ok(dibujado(cuerpo(a, i)), `v=${v} cuerpo ${i}`);
    for (const n of ['Contratapa', 'Lomo']) assert.ok(dibujado(a.nodo.get(n)), `v=${v} ${n}`);
  }
});
test('2 el detalle (fundas/bolsillos) sigue ocultándose fuera de la ventana, y se muestra en las hojas visibles y en movimiento', async () => {
  const { album: a } = await crearMundo();
  ir(a, 5);
  const det = (i) => a.detalle[i];
  assert.ok(det(1).length > 0 && det(1).every((h) => !h.visible), 'hoja enterrada: sin detalle');
  assert.ok(det(4).every((h) => h.visible) && det(6).every((h) => h.visible), 'hojas de la ventana: con detalle');
  a.estado.avanzar(); a.estado.actualizar(0.1); a.aplicar();
  assert.ok(det(6).every((h) => h.visible), 'la hoja en movimiento conserva el detalle');
});
test('3 la tapa izquierda queda en la pila izquierda (y=base, rotada π) y pegada al lomo en todos los estados abiertos', async () => {
  const { album: a } = await crearMundo();
  for (let v = 1; v <= a.geo.elementos; v++) {
    ir(a, v);
    const t = a.elemento[0];
    assert.ok(Math.abs(Math.abs(t.rotation.z) - Math.PI) < 1e-6, `v=${v} tapa girada`);
    const sobreTapa = a.elemento.slice(1).filter((e) => e.rotation.z > 3).every((e) => e.position.y > t.position.y);
    assert.ok(sobreTapa, `v=${v} las hojas de la pila izquierda quedan POR ENCIMA de la tapa`);
    const caja = a.cajaMalla('Tapa_Malla'), lomo = a.cajaMalla('Lomo');
    assert.ok(caja && lomo);
  }
});
test('4 avanzar y retroceder paso a paso: la tapa conserva posición y nunca se oculta (1→2, 2–3, 4–5, 8–9, 17–18, vuelta a 1, cerrar y reabrir)', async () => {
  const { album: a } = await crearMundo();
  const foto = () => JSON.stringify([a.elemento[0].position.y, a.elemento[0].rotation.z]);
  ir(a, 0); const cerrada = foto();
  const vistos = [];
  for (let v = 1; v <= a.geo.elementos; v++) {
    a.estado.avanzar();
    for (let k = 0; k < 200 && a.estado.animando; k++) { a.actualizar(0.05); assert.ok(dibujado(cuerpo(a, 0)), `avanzando v→${v}, paso ${k}`); }
    vistos.push(foto());
  }
  for (let v = a.geo.elementos - 1; v >= 0; v--) {
    a.estado.retroceder();
    for (let k = 0; k < 200 && a.estado.animando; k++) { a.actualizar(0.05); assert.ok(dibujado(cuerpo(a, 0)), `retrocediendo v→${v}, paso ${k}`); }
  }
  assert.equal(foto(), cerrada, 'cerrar de nuevo devuelve la tapa a su sitio');
  // en toda la fase abierta (hojas 1..9 giradas) la tapa no se mueve: es la base de la pila izquierda
  assert.equal(new Set(vistos.slice(0, 9)).size, 1, 'la tapa izquierda permanece quieta mientras se pasan hojas');
  for (const v of [1, 2, 3, 4, 8, 9, 17 % 10]) { ir(a, v); assert.ok(dibujado(cuerpo(a, 0)), 'v=' + v); }
});
test('5 sin recortes: la tapa izquierda y la caja de la pila izquierda están dentro de lo que encuadra la cámara (caja real)', async () => {
  const { album: a } = await crearMundo();
  const { aabbMundo } = await import('../js/encuadre.js');
  for (const v of [2, 3, 4, 9]) {
    ir(a, v);
    const t = aabbMundo(a.cajaMalla('Tapa_Malla')), lomo = aabbMundo(a.cajaMalla('Lomo'));
    assert.ok(t.x[1] >= lomo.x[0] - 0.012 && t.x[1] <= lomo.x[1] + 0.012 && t.x[0] < lomo.x[0] - 0.1, `v=${v}: la tapa queda a la izquierda del lomo, tocándolo`);
  }
});
