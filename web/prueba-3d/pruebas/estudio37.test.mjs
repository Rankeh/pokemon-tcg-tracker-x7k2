// Fase 3.7.19 — entorno de estudio (IBL procedural). Three SIMULADO + GLB real: valida la generación del panorama y el cableado
// (scene.environment, compensación de la hemisférica, envMapIntensity por material, liberar). CÓMO SE VE solo puede juzgarlo un navegador real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearMundo, T } from './mundo.mjs';
const A = await import('../js/aspecto.js');

const nuevo = async (nivel, opts = {}) => {
  const m = await crearMundo(); const scene = new T.Object3D(); const renderer = {};
  const asp = new A.Aspecto({ renderer, scene, nivel, ...opts }); asp.aplicarAlbum(m.album);
  return { m, scene, asp, a: m.album };
};
const luz = (p) => p[0] + p[1] + p[2];
const pixel = (datos, tam, u, v) => { const i = Math.round(u * tam), j = Math.round(v * (tam >> 1)), k = (j * tam + i) * 4; return [datos[k], datos[k + 1], datos[k + 2], datos[k + 3]]; };

test('E1 generarEntorno: tamaño equirect 2:1, alfa opaca, gradiente cielo→suelo y ventana más luminosa que su alrededor', () => {
  for (const tema of A.NOMBRES_TEMA) {
    const p = A.TEMAS[tema].entorno;
    assert.ok(p, 'todos los temas tienen entorno: ' + tema);
    const d = A.generarEntorno(64, p);
    assert.equal(d.length, 64 * 32 * 4);
    assert.equal(pixel(d, 64, 0.95, 0.5)[3], 255, 'opaco');
    assert.ok(luz(pixel(d, 64, 0.6, 0.06)) > luz(pixel(d, 64, 0.6, 0.94)), 'arriba más claro que abajo (' + tema + ')');
    assert.ok(luz(pixel(d, 64, 0.3, 0.3)) > luz(pixel(d, 64, 0.55, 0.3)) + 30, 'la ventana destaca (' + tema + ')');
    for (const x of d) assert.ok(x >= 0 && x <= 255);
  }
});

test('E2 cableado: media/alta montan scene.environment (equirect sRGB) y bajan la hemisférica; baja, legado y ?ibl=0 no', async () => {
  for (const nivel of ['media', 'alta']) {
    const { scene, asp } = await nuevo(nivel);
    assert.ok(scene.environment && scene.environment.isDataTexture, nivel);
    assert.equal(scene.environment.mapping, T.EquirectangularReflectionMapping);
    assert.equal(scene.environment.colorSpace, T.SRGBColorSpace);
    assert.equal(scene.environment.ancho, A.ENTORNO.tam); assert.equal(scene.environment.alto, A.ENTORNO.tam / 2);
    assert.equal(asp.luces.hemi.intensity, A.TEMAS.noche.luces.hemi.intensidad * A.ENTORNO.compensacionHemi, 'hemisférica compensada');
    assert.equal(asp.resumen().entorno, true);
  }
  for (const [nivel, opts] of [['baja', {}], ['legado', {}], ['media', { entorno: false }]]) {
    const { scene, asp } = await nuevo(nivel, opts);
    assert.ok(!scene.environment, nivel + JSON.stringify(opts));
    assert.equal(asp.luces.hemi.intensity, undefined, 'sin compensación');
    assert.equal(asp.resumen().entorno, false);
  }
});

test('E3 reflejo graduado por material: pulido alto (soldadura, funda), textil bajo (tapa, lomo, hoja), suelo mínimo; cartas intactas', async () => {
  const { a, asp } = await nuevo('media');
  const I = A.ENTORNO.intensidad;
  assert.equal(a.nodo.get('Tapa_Malla').material.envMapIntensity, I.cubierta);
  assert.equal(a.nodo.get('Lomo').material.envMapIntensity, I.lomo);
  assert.equal(a.nodo.get('Hoja_0_Losa').material.envMapIntensity, I.hoja);
  assert.equal(a.nodo.get('Hoja_0_F_Soldaduras').material.envMapIntensity, I.soldadura);
  assert.equal(a.nodo.get('Hoja_0_F_Funda').material.envMapIntensity, I.funda);
  assert.ok(I.soldadura > I.cubierta && I.funda > I.soldadura && I.suelo < I.hoja, 'orden: pulido > textil > suelo');
  assert.equal(asp.mesa.material.envMapIntensity, I.suelo);
  assert.ok(asp.materialCarta(0xffffff, 0.5).toneMapped === false, 'las cartas siguen sin iluminación: colores exactos');
  const { a: a2 } = await nuevo('media', { entorno: false });
  assert.equal(a2.nodo.get('Tapa_Malla').material.envMapIntensity, 1, 'sin entorno, intensidad neutra');
});

test('E4 liberar: scene.environment queda limpio y la textura del panorama se libera', async () => {
  const { scene, asp } = await nuevo('media');
  const t = scene.environment;
  asp.liberar();
  assert.equal(scene.environment, null);
  assert.equal(t.disposed, true);
  assert.equal(asp.resumen().entorno, false);
});
