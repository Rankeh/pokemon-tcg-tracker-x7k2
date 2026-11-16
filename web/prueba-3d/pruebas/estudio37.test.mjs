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

test('E5 (3.7.20) rugosidad correlacionada: en los acabados el satinado sigue la trama (crestas pulidas) y el grano no cambia', () => {
  const h = A.alturaRelieve(64, 11, 'tejido'), r = A.generarRugosidad(64, 11, 'tejido');
  let iMax = 0, iMin = 0;
  for (let k = 0; k < h.length; k++) { if (h[k] > h[iMax]) iMax = k; if (h[k] < h[iMin]) iMin = k; }
  assert.ok(r[iMax * 4] < r[iMin * 4], 'cresta más pulida (valor menor) que el valle');
  const g = A.generarRugosidad(32), hg = A.alturaRelieve(32, 11, 'grano');
  for (const k of [0, 100, 500]) assert.equal(g[k * 4], Math.round((0.82 + 0.18 * hg[k]) * 255), 'fórmula del grano intacta');
});

test('E6 (3.7.20) tejido anisótropo: a los tamaños reales del mapa (128 media, 256 alta) la urdimbre varía más que la trama', () => {
  // a 64 px los hilos (48 ciclos) hacen aliasing y la medida no vale; 128/256 son los tamaños que usan los niveles
  for (const [tam, minimo] of [[128, 1.08], [256, 1.1]]) {
    const h = A.alturaRelieve(tam, 7, 'tejido');
    let dx = 0, dy = 0;
    for (let j = 0; j < tam; j++) for (let i = 0; i < tam; i++) {
      dx += Math.abs(h[j * tam + (i + 1) % tam] - h[j * tam + i]);
      dy += Math.abs(h[((j + 1) % tam) * tam + i] - h[j * tam + i]);
    }
    assert.ok(dx > dy * minimo, `anisotropía a ${tam}: ratio=${(dx / dy).toFixed(3)}`);
  }
});

test('E7 (3.7.21) OrbitaLigera: el arrastre y el zoom del usuario cancelan la transición en curso y respetan los límites', async () => {
  const { OrbitaLigera } = await import('../js/camara.js');
  const o = new OrbitaLigera();
  o.llevarA({ radio: 0.9 }, 0.6);
  assert.ok(o.tween, 'transición en marcha');
  o.arrastrar(40, 0, 400);
  assert.equal(o.tween, null, 'el arrastre toma el control');
  const az1 = o.az; o.actualizar(0.1); assert.equal(o.az, az1, 'sin tween no hay movimiento programado');
  o.llevarA({ radio: 0.9 }, 0.6); o.zoom(0.5);
  assert.equal(o.tween, null, 'el zoom también cancela');
  o.zoom(1e-6); assert.ok(o.radio >= o.limites.radio[0], 'límite inferior'); o.zoom(1e6); assert.ok(o.radio <= o.limites.radio[1], 'límite superior');
});

test('E8 (3.7.22) hojeo acelerado: con cola larga cada giro dura menos (tope ÷3,6), de uno en uno dura lo de siempre; cerrar en cascada', async () => {
  const { crearGeometria, EstadoAlbum } = await import('../js/logica.js');
  const geo = crearGeometria({ n_hojas: 9, grosor_tapa: 0.003, paso: 0.004, y_base: 0.0015, ancho_tapa: 0.26, ancho_hoja: 0.24 });
  const e = new EstadoAlbum(geo, 0.9);
  e.avanzar(); e.actualizar(0.01);
  assert.ok(Math.abs(e.actual.dur - 0.9) < 1e-9, 'un solo giro: duración completa');
  e.irA(0);
  for (let i = 0; i < 6; i++) e.avanzar();                       // 6 en cola: el primero arranca con 5 pendientes → 0,9 / (1+0,8·5=5 → tope 3,6)
  e.actualizar(0.01);
  assert.ok(Math.abs(e.actual.dur - 0.9 / 3.6) < 1e-9, 'cola larga: giro rápido');
  let t = 0; while (e.animando && t < 30) { e.actualizar(0.05); t += 0.05; }
  assert.equal(e.vueltas, 6, 'llega igual de exacto');
  assert.ok(t < 3, `cerrar/saltar 6 hojas tarda ${t.toFixed(2)} s, no 5,4 s (el último giro conserva sus 0,9 s: la hoja final se asienta)`);
});

test('E9 (3.7.23) plano héroe: dentro de los límites de la órbita y claramente más bajo que la vista abierta', async () => {
  const { COMPOSICION, elevacionPara, calcularEncuadre, dimensiones, puntosVista } = await import('../js/encuadre.js');
  const { OrbitaLigera } = await import('../js/camara.js');
  const GRAD = Math.PI / 180, o = new OrbitaLigera(), h = COMPOSICION.heroe;
  assert.ok(h.el * GRAD >= o.limites.el[0] && h.el * GRAD <= o.limites.el[1], 'elevación alcanzable');
  assert.ok(Math.abs(h.az * GRAD) <= Math.abs(o.limites.az[0]) + 1e-9, 'azimut alcanzable');
  assert.ok(h.el * GRAD < elevacionPara(0.6) - 8 * GRAD, 'bastante más bajo que la vista normal');
  const dim = dimensiones({ ancho_tapa: 0.26, alto_tapa: 0.322, y_base: 0.0015, grosor_tapa: 0.003, n_hojas: 9, paso: 0.004, ancho_hoja: 0.24 });
  const c = calcularEncuadre({ puntos: puntosVista({ vueltas: 0, dim }), aspect: 390 / 663, az: h.az * GRAD, el: h.el * GRAD, reservado: { arriba: 0.1, abajo: 0.12 }, margen: 0.035 });
  assert.ok(c.radio > 0.1 && c.radio < 2, 'el encuadre héroe converge (radio razonable): ' + c.radio.toFixed(3));
});

test('E10 (3.7.24/26) vidrio ligero: la regla CSS existe, quita el backdrop-filter y es el modo por defecto (?vidrio=pleno lo devuelve)', async () => {
  const css = await (await import('node:fs/promises')).readFile(new URL('../css/prueba-3d.css', import.meta.url), 'utf8');
  assert.match(css, /body\[data-vidrio="ligero"\][^{]*\{[^}]*backdrop-filter: none !important/);
  const html = await (await import('node:fs/promises')).readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /q\.get\('vidrio'\) !== 'pleno'/, 'ligero por defecto, pleno opcional');
});

test('E11 (3.7.25) emblema: alfa 1 dentro y 0 fuera del parche, orla y rombo en relieve sobre la tela base', async () => {
  const t = A.EMBLEMA.tam, { h, alfa } = A.alturaEmblema(t);
  const en = (x, y) => Math.round(((y + 1) / 2) * t - 0.5) * t + Math.round(((x + 1) / 2) * t - 0.5);
  assert.equal(alfa[en(0, 0)], 1, 'centro opaco'); assert.equal(alfa[en(0.99, 0.99)], 0, 'esquina transparente');
  assert.ok(h[en(0, 0)] > 0.5, 'rombo satinado más alto que la tela'); assert.ok(h[en(0.84, 0)] > h[en(0.65, 0.65) ] + 0.2, 'orla en relieve');
  const n = A.generarEmblemaNormales(t);
  assert.equal(n.length, t * t * 4); assert.equal(n[(en(0.99, 0.99)) * 4 + 3], 0, 'el alfa viaja en el canal A');
});

test('E12 (3.7.25) cableado del emblema: decal hijo de Tapa_Malla, transparente, se quita con emblema:false y al liberar', async () => {
  const { m, scene, asp, a } = await nuevo('media');
  const d = a.nodo.get('Tapa_Malla').children.find((o) => o.name === 'Tapa_Emblema');
  assert.ok(d, 'existe como hijo de la tapa (gira con ella)');
  assert.equal(d.material.transparent, true); assert.ok(d.material.normalMap, 'relieve'); assert.equal(d.material.depthWrite, false);
  assert.equal(asp.resumen().emblema, true);
  asp.liberar();
  assert.ok(!a.nodo.get('Tapa_Malla').children.includes(d), 'liberar lo retira');
  const sin = await nuevo('media', { emblema: false });
  assert.ok(!sin.a.nodo.get('Tapa_Malla').children.find((o) => o.name === 'Tapa_Emblema'));
  assert.equal(sin.asp.resumen().emblema, false);
  assert.ok(m && scene);
});
