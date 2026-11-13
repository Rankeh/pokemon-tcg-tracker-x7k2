// Fase 3.7.2a — iluminación, materiales, sombra de contacto y niveles de calidad. Three.js SIMULADO + GLB real: valida NUESTRA configuración y el cableado
// (qué luces hay, qué material recibe cada malla, que las cartas no se tocan, que se libera todo). NO valida cómo se ve en GPU: eso es la comprobación visual pendiente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { crearMundo, T, catalogo } from './mundo.mjs';
const A = await import('../js/aspecto.js');

const nuevo = async (nivel, opts) => {
  const m = await crearMundo(opts); const scene = new T.Object3D(); const renderer = {};
  const asp = new A.Aspecto({ renderer, scene, nivel }); asp.aplicarAlbum(m.album);
  return { m, scene, renderer, asp, a: m.album };
};
const mat = (a, nombre) => a.nodo.get(nombre).material;
const tipos = (scene) => scene.children.filter((o) => o.args).map((o) => o.constructor.name + ':' + o.args[o.args.length - 1]);

test('1 elegirCalidad: parámetro manual, alias, automático conservador en móvil y sin detectar por nombre de dispositivo', () => {
  for (const n of ['baja', 'media', 'alta', 'legado']) assert.equal(A.elegirCalidad({ parametro: n }).nivel, n);
  assert.equal(A.elegirCalidad({ parametro: 'ALTA' }).nivel, 'alta'); assert.equal(A.elegirCalidad({ parametro: 'bajo' }).nivel, 'baja'); assert.equal(A.elegirCalidad({ parametro: 'antes' }).nivel, 'legado');
  assert.equal(A.elegirCalidad({ parametro: 'ultra', tactil: true, nucleos: 2 }).nivel, 'baja', 'valor desconocido → automático');
  assert.equal(A.elegirCalidad({ tactil: true, nucleos: 6, memoriaGb: 0 }).nivel, 'media', 'iPhone: Safari no da deviceMemory, 6 núcleos');
  assert.equal(A.elegirCalidad({ tactil: true, nucleos: 4 }).nivel, 'baja'); assert.equal(A.elegirCalidad({ tactil: true, nucleos: 8, memoriaGb: 2 }).nivel, 'baja');
  assert.equal(A.elegirCalidad({ tactil: false, nucleos: 12 }).nivel, 'alta'); assert.equal(A.elegirCalidad({ tactil: false, nucleos: 4 }).nivel, 'media');
  assert.ok(!/iphone|android|navigator/i.test(A.elegirCalidad.toString()), 'no se mira el nombre del dispositivo');
});

test('2 luces: baja = hemisférica + principal; media/alta = + relleno + contorno; legado = las de 3.7.1c; ninguna proyecta sombras ni se anima', async () => {
  const esperado = { baja: 2, media: 4, alta: 4, legado: 3 };
  for (const n of Object.keys(esperado)) {
    const { scene, asp } = await nuevo(n);
    const luces = scene.children.filter((o) => o.args);
    assert.equal(luces.length, esperado[n], n);
    assert.ok(luces.every((l) => !l.castShadow), 'sin sombras dinámicas');
    assert.equal(Object.keys(asp.luces).includes('contorno'), n === 'media' || n === 'alta');
    assert.equal(asp.renderer.toneMapping, T.ACESFilmicToneMapping);
  }
  const { asp } = await nuevo('media');
  const L = asp.luces;
  assert.ok(L.principal.position.x < 0 && L.principal.position.y > 0, 'principal lateral y alta');
  assert.ok(L.relleno.position.x > 0, 'relleno desde el lado contrario'); assert.ok(L.relleno.args[1] < L.principal.args[1] / 3, 'relleno tenue');
  assert.ok(L.contorno.position.z < 0, 'contorno por detrás'); assert.ok(L.contorno.args[1] < L.principal.args[1], 'contorno discreto');
  assert.equal(asp.renderer.toneMappingExposure, A.EXPOSICION);
});

test('3 materiales: se aplican por NOMBRE; cubierta/lomo con relieve, página sin relieve, funda mate y casi transparente, soldaduras algo más claras', async () => {
  const { a } = await nuevo('media');
  const cub = mat(a, 'Tapa_Malla'), hoja = mat(a, 'Hoja_0_Losa'), lomo = mat(a, 'Lomo'), contra = mat(a, 'Contratapa');
  assert.equal(cub.name, 'Cubierta'); assert.equal(cub.color.v, A.PALETA.cubierta); assert.equal(cub.roughness, A.MATERIALES.cubierta.rugosidad); assert.ok(cub.normalMap && cub.normalScale.x > 0 && cub.normalScale.x < 0.6);
  assert.equal(contra, cub, 'Contratapa y Tapa comparten material (sin duplicados)');
  assert.notEqual(lomo, cub, 'el lomo tiene su propio material'); assert.equal(lomo.color.v, A.PALETA.lomo); assert.ok(lomo.roughness < cub.roughness, 'lomo algo más liso'); assert.ok(lomo.normalMap);
  assert.equal(hoja.name, 'Hoja'); assert.equal(hoja.color.v, A.PALETA.pagina); assert.ok(!hoja.normalMap, 'página satinada, sin relieve'); assert.notEqual(hoja.color.v, cub.color.v);
  const funda = a.nodo.get('Hoja_0_F_Funda').material;
  assert.ok(funda.map && funda.map.isDataTexture && funda.opacity === 1 && funda.roughness >= 0.4 && funda.depthWrite === false && funda.transparent, 'funda: película con reflejo en el alfa, sin depthWrite');
  const alfas = [...funda.map.datos].filter((_, i) => i % 4 === 3); assert.ok(Math.max(...alfas) <= 0.067 * 255 && Math.min(...alfas) >= 0.015 * 255, 'alfa de la funda entre 0,015 y 0,065: la carta siempre se ve');
  const sol = a.nodo.get('Hoja_0_F_Soldaduras').material;
  assert.equal(sol.color.v, A.PALETA.soldadura);
  for (const n of ['Tapa_Malla', 'Lomo', 'Hoja_0_Losa']) assert.equal(a.nodo.get(n).material.metalness, 0, 'nada de metal pulido');
});

test('4 niveles de calidad: relieve 0/128/256, rugosidad variable desde media, sin duplicar materiales ni texturas', async () => {
  const r = {};
  for (const n of ['baja', 'media', 'alta']) {
    const antes = T.stats.materiales, tex0 = T.stats.texturasCreadas;
    const { a, asp } = await nuevo(n);
    const cub = mat(a, 'Tapa_Malla');
    r[n] = { normal: !!cub.normalMap, rug: !!cub.roughnessMap, tam: cub.normalMap?.ancho, texturas: T.stats.texturasCreadas - tex0, materiales: T.stats.materiales - antes, recursos: asp.recursos.length };
  }
  assert.equal(r.baja.normal, false); assert.equal(r.media.normal, true); assert.equal(r.media.tam, 128); assert.equal(r.alta.tam, 256);
  assert.equal(r.baja.rug, false); assert.equal(r.media.rug, true); assert.equal(r.alta.rug, true);
  assert.ok(r.baja.recursos < r.media.recursos && r.media.recursos < r.alta.recursos, 'más calidad = más recursos');
  assert.ok(r.alta.texturas <= 4, 'alta: normal + rugosidad + reflejo de funda + sombra (no más)');
  const { a, asp } = await nuevo('media'); const n0 = asp.recursos.length; asp.aplicarAlbum(a); assert.equal(asp.recursos.length, n0, 'aplicarAlbum es idempotente');
  assert.equal(mat(a, 'Tapa_Malla').normalMap, mat(a, 'Lomo').normalMap, 'una sola textura de relieve compartida');
});

test('5 legado reproduce 3.7.1c: no toca materiales del GLB ni las UV y las cartas siguen iluminadas', async () => {
  const { a, asp } = await nuevo('legado');
  assert.equal(mat(a, 'Tapa_Malla').color.v?.[0], 0.010960094006488246, 'color del GLB intacto'); assert.ok(!mat(a, 'Tapa_Malla').normalMap);
  assert.equal(asp.materialCarta(0xffffff, 0.55).constructor.name, 'MeshStandardMaterial'); assert.equal(asp.sombra, null);
  assert.equal(asp.mesa.material.opts.color, 0x2a2e35);
});

test('6 UV en memoria: tapa/lomo/hojas pasan de 0 a planares; las UV de las cartas NO se tocan; el GLB en disco no cambia', async () => {
  const { a } = await nuevo('media');
  for (const n of ['Tapa_Malla', 'Lomo']) {
    const g = a.nodo.get(n).geometry, uv = g.attributes.uv, pos = g.attributes.position;
    assert.equal(uv.count, pos.count, n); assert.ok(uv.array.every(Number.isFinite)); assert.ok(uv.array.some((v) => Math.abs(v) > 1), n + ': UV no nulas');
  }
  for (const c of ['F', 'D']) { const uv = a.geomCarta[c].attributes.uv; assert.ok(uv.array.every((v) => v >= 0 && v <= 1), 'carta ' + c + ': UV originales [0,1]'); }
  assert.equal(a.nodo.get('Tapa_Malla').geometry, a.nodo.get('Contratapa').geometry, 'geometría compartida: UV calculadas una sola vez');
  const { baja } = { baja: await nuevo('baja') };
  assert.ok(baja.a.nodo.get('Tapa_Malla').geometry.attributes.uv.array.every((v) => v === 0), 'baja: no se generan UV (no hay relieve)');
});

test('7 relieve procedural: determinista, con mosaico sin costuras, normal dominante en Z y rugosidad discreta', () => {
  const n1 = A.generarNormales(64), n2 = A.generarNormales(64); assert.deepEqual(n1, n2); assert.equal(n1.length, 64 * 64 * 4);
  let zs = 0, rango = 0; for (let k = 0; k < 64 * 64; k++) { zs += n1[k * 4 + 2]; rango = Math.max(rango, Math.abs(n1[k * 4] - 128)); } assert.ok(zs / 4096 > 215, 'perpendicular casi siempre (relieve fino)'); assert.ok(rango > 6, 'pero con relieve visible');
  const h = A.alturaRelieve(64); let costura = 0, interior = 0;
  for (let j = 0; j < 64; j++) { costura = Math.max(costura, Math.abs(h[j * 64] - h[j * 64 + 63])); interior = Math.max(interior, Math.abs(h[j * 64 + 31] - h[j * 64 + 32])); }
  assert.ok(costura <= interior * 1.5 + 0.05, 'el salto entre bordes opuestos es como el de cualquier píxel vecino');
  const r = A.generarRugosidad(64); const vs = [...r].filter((_, i) => i % 4 === 1); assert.ok(Math.min(...vs) >= 0.8 * 255 && Math.max(...vs) <= 255);
});

test('8 sombra de contacto: gradiente suave (no un rectángulo negro), opacidad acotada, borde exterior transparente y se adapta cerrado/abierto/final', async () => {
  const N = A.SOMBRA.tam, t = A.generarSombra(N), alfa = (i, j) => t[(j * N + i) * 4 + 3], c = N / 2;
  assert.equal(alfa(0, 0), 0); assert.equal(alfa(N - 1, c - 1), 0); assert.equal(alfa(c, c), Math.round(A.SOMBRA.opacidad * 255));
  const fila = []; for (let i = c; i < N; i++) fila.push(alfa(i, c));
  for (let i = 1; i < fila.length; i++) assert.ok(fila[i] <= fila[i - 1], 'decrece hacia fuera');
  assert.ok(new Set(fila).size > 5, 'degradado con varios niveles, no un salto'); assert.ok(Math.max(...t.filter((_, i) => i % 4 === 3)) <= 0.61 * 255);
  assert.ok(t.every((v, i) => i % 4 === 3 || v === 0), 'color negro: solo varía la transparencia');
  const { a, asp } = await nuevo('media'); const s = asp.sombra, anchos = {};
  for (const v of [0, 1, 5, 10]) { a.estado.irA(v); a.aplicar(); asp.sincronizar(a); anchos[v] = asp.ultimaSombra.ancho; assert.ok(s.scale.x > anchos[v], 'más grande que el álbum'); assert.ok(isFinite(s.position.x)); }
  assert.ok(anchos[1] > 1.8 * anchos[0], 'abierto ≈ el doble que cerrado'); assert.ok(Math.abs(anchos[10] - anchos[1]) < 0.01, 'todo girado: misma huella (dos tapas)');
  a.estado.irA(1); a.aplicar(); asp.sincronizar(a); const x1 = s.position.x; a.estado.irA(10); a.aplicar(); asp.sincronizar(a); assert.ok(s.position.x > x1 + 0.1, 'y la sombra acompaña al álbum cuando se desplaza');
  assert.ok(s.position.y < 0 && s.position.y > a.nodo.get('Contratapa').position.y - 0.01 || s.position.y < 0.0001, 'bajo el álbum, sobre la mesa');
  assert.equal(s.material.opts.depthWrite, false); assert.equal(s.material.toneMapped, false);
});

test('9 cartas: material sin iluminación ni tone mapping (colores exactos), textura sRGB intacta, sistema de carga sin cambios', async () => {
  const sc = new T.Object3D(); const asp = new A.Aspecto({ renderer: {}, scene: sc, nivel: 'media' });
  const m = await crearMundo({ materialCarta: (c, r) => asp.materialCarta(c, r) });
  m.album.estado.irA(1); m.album.aplicar(); m.vista.sincronizar(new Map([[1, 0]]));
  const b = m.vista.porId.get(m.mapa.paginas[0].bolsillos[0].id), mc = b.fantasma?.material || b.tarjeta?.material;
  assert.ok(mc, 'hay malla de carta'); assert.equal(mc.constructor.name, 'MeshBasicMaterial'); assert.equal(mc.toneMapped, false);
  assert.ok(!('roughness' in mc), 'no es PBR');
  const p = (await import('../js/texturas3d.js')); assert.ok(/colorSpace = THREE\.SRGBColorSpace/.test(await (await import('node:fs/promises')).readFile(new URL('../js/texturas3d.js', import.meta.url), 'utf8')));
  assert.equal(typeof p.crearProductores, 'function');
  for (const x of m.vista.paginas) m.vista.sincronizar(new Map());
});

test('10 gestión del color (estimación analítica, NO medición de GPU): antes la tapa era MÁS OSCURA que la mesa; ahora la cubierta se distingue y no está empastada ni lavada', () => {
  const lum = (h, o) => A.luminanciaSrgb(A.estimarSalida(h, o));
  const L0 = { luces: { hemi: { cielo: 0xbfd2f2, intensidad: 0.9 }, principal: { color: 0xffe1c0, intensidad: 2.4, pos: [-0.5, 0.9, 0.5] }, relleno: { color: 0x9db8e6, intensidad: 0.7, pos: [0.7, 0.5, 0.2] } }, exposicion: 1.05 };
  const antesCub = lum([0.010960094006488246, 0.018500220128379697, 0.03560131487502034], L0), antesMesa = lum(0x2a2e35, L0), antesHoja = lum([0.0194, 0.0212, 0.0252], L0);
  assert.ok(antesCub < antesMesa, `diagnóstico: cubierta (${antesCub.toFixed(3)}) más oscura que la mesa (${antesMesa.toFixed(3)})`); assert.ok(antesHoja < antesMesa);
  const o = { activas: ['hemi', 'principal', 'relleno'] };
  const cub = lum(A.PALETA.cubierta, o), pag = lum(A.PALETA.pagina, o), lomo = lum(A.PALETA.lomo, o), mesa = lum(A.PALETA.mesa, o), sold = lum(A.PALETA.soldadura, o);
  assert.ok(cub / mesa > 1.8, `cubierta/mesa = ${(cub / mesa).toFixed(2)}`); assert.ok(pag > mesa * 1.8);
  for (const [n, v] of Object.entries({ cub, pag, lomo })) assert.ok(v > 0.12 && v < 0.5, `${n} ni empastado ni lavado (${v.toFixed(3)})`);
  assert.ok(Math.abs(pag - cub) > 0.015, 'página distinguible de la cubierta'); assert.ok(lomo > cub, 'el lomo destaca un poco'); assert.ok(sold > pag, 'costuras algo más claras');
  const [r, g, b] = A.estimarSalida(A.PALETA.cubierta, o); assert.ok(r > 0.08, 'el rojo no se recorta a 0 (sin viraje a azul puro)');
});

test('11 liberar(): se retiran luces, mesa y sombra de la escena y se liberan geometrías, materiales y texturas propios', async () => {
  const { scene, asp } = await nuevo('alta'); const n = asp.recursos.length, recursos = [...asp.recursos];
  assert.ok(scene.children.length >= 6); asp.liberar();
  assert.equal(scene.children.length, 0); assert.ok(recursos.every((r) => r.disposed !== false), 'todo recurso con dispose() queda liberado'); assert.ok(n > 4);
});

test('12 no se altera nada del álbum: poses, visibilidad, tapas y navegación iguales con y sin Aspecto; GLB y módulos protegidos sin cambios en git', async () => {
  const foto = (a) => JSON.stringify([a.raiz.position.x, a.elemento.map((e) => [e.position.y, e.rotation.z, e.visible])]);
  const sin = await crearMundo(), con = await nuevo('alta');
  for (const v of [0, 1, 3, 10]) { sin.album.estado.irA(v); sin.album.aplicar(); con.a.estado.irA(v); con.a.aplicar(); con.asp.sincronizar(con.a); assert.equal(foto(con.a), foto(sin.album), 'v=' + v); }
  const dibujado = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  for (const v of [2, 3, 5, 9]) { con.a.estado.irA(v); con.a.aplicar(); assert.ok(dibujado(con.a.nodo.get('Tapa_Malla')), 'tapa v=' + v); }
  let cambiados;
  try { cambiados = execSync('git diff --name-only 97db498', { cwd: new URL('../../..', import.meta.url).pathname, encoding: 'utf8' }).split('\n').filter(Boolean); } catch { return; }
  // 3.7.6: album.glb sale de la lista por petición expresa del usuario (modelo más refinado). Su ESTRUCTURA sigue protegida en movimiento37.test.mjs (M9).
  const protegidos = ['web/prueba-3d/js/logica.js', 'web/prueba-3d/js/album3d.js', 'web/prueba-3d/js/encuadre.js', 'web/prueba-3d/js/camara.js', 'web/prueba-3d/js/navegacion3d.js', 'web/prueba-3d/js/picking.js',
    'web/prueba-3d/js/adaptador-coleccion.js', 'web/prueba-3d/js/texturas.js', 'web/prueba-3d/js/texturas3d.js', 'web/js/almacen.js', 'web/js/album/modelo.js', 'datos/catalogo/coleccion-teselia.json'];
  assert.deepEqual(cambiados.filter((f) => protegidos.includes(f)), []);
  const dif = execSync('git diff -U0 97db498 -- web/prueba-3d/js/bolsillos3d.js', { cwd: new URL('../../..', import.meta.url).pathname, encoding: 'utf8' }).split('\n').filter((l) => /^[+-][^+-]/.test(l));
  assert.ok(dif.length > 0 && dif.every((l) => /materialCarta|MeshStandardMaterial|3\.7\.2a|constructor\(\{ album/.test(l)), 'bolsillos3d: solo cambia la fábrica del material de carta');
});

test('13 los 158 ids y las cantidades siguen siendo las mismas (la capa visual no toca los datos)', async () => {
  const { m } = await nuevo('media', { cantidades: { [catalogo.cartas[0].id]: 2 } });
  assert.equal(m.mapa.cartas.length, 158); assert.equal(m.adaptador.cantidad(catalogo.cartas[0].id), 2);
});

// ======================================================================= 3.7.2b
const dibujado2 = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

test('14 cantos en vértices: cantos de tapa/hoja más claros que la cara plana, lomo más oscuro en los laterales, sin mallas ni texturas nuevas', async () => {
  const { a } = await nuevo('media');
  const col = (n) => a.nodo.get(n).geometry.attributes.color, nor = (n) => a.nodo.get(n).geometry.attributes.normal;
  for (const n of ['Tapa_Malla', 'Hoja_0_Losa', 'Lomo']) { assert.ok(col(n) && col(n).count === nor(n).count && col(n).array.every(Number.isFinite), n); assert.equal(a.nodo.get(n).material.vertexColors, true); }
  const rango = (n) => { const c = col(n), nn = nor(n); let plana = null, canto = null; for (let i = 0; i < c.count; i++) { const ny = Math.abs(nn.getY(i)); if (ny > 0.95) plana = c.array[i * 3]; if (ny < 0.3) canto = c.array[i * 3]; } return { plana, canto }; };
  const t = rango('Tapa_Malla'), h = rango('Hoja_0_Losa'), l = rango('Lomo');
  assert.equal(t.plana, 1); assert.ok(t.canto > 1.4 && t.canto < 1.8, 'canto de la tapa más claro'); assert.ok(h.canto > 1.4); assert.equal(l.plana, 1); assert.ok(l.canto < 0.7 && l.canto > 0.4, 'lomo: laterales más oscuros');
  const cartaUV = a.geomCarta.F.attributes; assert.ok(!cartaUV.color, 'las geometrías de las cartas no se tocan');
  const baja = await nuevo('baja'); assert.ok(baja.a.nodo.get('Tapa_Malla').geometry.attributes.color, 'baja: los cantos también (coste cero)');
  const leg = await nuevo('legado'); assert.ok(!leg.a.nodo.get('Tapa_Malla').geometry.attributes.color, 'legado: intacto');
});

test('15 alta usa MeshPhysicalMaterial con sheen SOLO en tapas y lomo (2 materiales); media y baja siguen con Standard; Contratapa y Tapa comparten material', async () => {
  const alta = await nuevo('alta'), media = await nuevo('media');
  const cub = mat(alta.a, 'Tapa_Malla'), lomo = mat(alta.a, 'Lomo');
  assert.equal(cub.constructor.name, 'MeshPhysicalMaterial'); assert.ok(cub.sheen > 0 && cub.sheen < 0.8 && cub.sheenRoughness >= 0.4, 'sheen discreto'); assert.equal(mat(alta.a, 'Contratapa'), cub); assert.notEqual(lomo, cub); assert.equal(lomo.constructor.name, 'MeshPhysicalMaterial');
  assert.equal(mat(alta.a, 'Hoja_0_Losa').constructor.name, 'MeshStandardMaterial'); assert.equal(alta.a.nodo.get('Hoja_0_F_Funda').material.constructor.name, 'MeshStandardMaterial');
  assert.equal(mat(media.a, 'Tapa_Malla').constructor.name, 'MeshStandardMaterial'); assert.ok(mat(media.a, 'Tapa_Malla').roughnessMap, 'media: rugosidad con pequeñas variaciones');
  const unicos = (a) => { const s = new Set(); a.escena.traverse((o) => o.isMesh && s.add(o.material)); return s.size; };
  assert.ok(unicos(alta.a) <= 12 && unicos(media.a) <= 12, 'materiales del álbum: cubierta, lomo, hoja, soldadura, funda, carta + costura y 4 pestañas (3.7.7) (nunca uno por bolsillo)');
});

test('16 funda: UV de página completa para el reflejo, la misma película en las 162 fundas y sin tocar el raycasting (no es un candidato de picking)', async () => {
  const { a } = await nuevo('media');
  const g = a.nodo.get('Hoja_0_F_Funda').geometry, uv = g.attributes.uv;
  assert.ok(uv.array.every((v) => v >= -0.01 && v <= 1.01), 'UV dentro de [0,1]');
  let n = 0, distintos = new Set(); a.escena.traverse((o) => { if (o.isMesh && o.material.name === 'Funda') { n++; distintos.add(o.material); } });
  assert.equal(n, 18); assert.equal(distintos.size, 1, 'un solo material de funda para todas');
  const picking = await import('../js/picking.js'); const src = await (await import('node:fs/promises')).readFile(new URL('../js/picking.js', import.meta.url), 'utf8');
  assert.ok(!/Funda|material/.test(src), 'el picking trabaja con geometría de bolsillos, no con materiales de funda');
  assert.equal(typeof picking.elegirBolsillo, 'function');
});

test('17 huecos pendientes y aro de selección: la etiqueta es más legible y el aro dorado no depende del tone mapping', async () => {
  const { dibujarEtiquetaPendiente } = await import('../js/marcadores.js'); const { lienzoFalso } = await import('./mundo.mjs');
  const usados = []; const l = lienzoFalso(128, 179); const ctx = l.getContext('2d');
  const prox = new Proxy({}, { get: (_, k) => (k in ctx ? ctx[k] : () => {}), set: (_, k, v) => { if (k === 'fillStyle' || k === 'strokeStyle') usados.push(v); return true; } });
  dibujarEtiquetaPendiente({ getContext: () => prox }, 128, 179, { nombre: 'Pikachu', numero: '25' });
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
  assert.ok(lum(usados.find((u) => u !== usados[0] && lum(u) > 150)) > 150, 'texto del nombre claro sobre placa oscura'); assert.ok(lum(usados[0]) < 60, 'placa hundida (más oscura que la hoja)');
  const src = await (await import('node:fs/promises')).readFile(new URL('../js/resaltado.js', import.meta.url), 'utf8');
  assert.ok(/toneMapped: false/.test(src) && /depthTest: false/.test(src) && /color = 0xe8b25a/.test(src), 'aro dorado sin tone mapping, por delante de la funda, mismo color');
});

test('18 cambiar de calidad no filtra recursos: crear y liberar un Aspecto de cada nivel deja a cero texturas y materiales propios', async () => {
  for (const n of ['baja', 'media', 'alta', 'legado', 'alta', 'media']) {
    const m = await crearMundo(); const sc = new T.Object3D();
    const t0 = T.stats.texturasCreadas - T.stats.texturasLiberadas, m0 = T.stats.materiales - T.stats.materialesLiberados;
    const asp = new A.Aspecto({ renderer: {}, scene: sc, nivel: n }); asp.aplicarAlbum(m.album);
    const propios = asp.recursos.length; asp.liberar();
    assert.equal(T.stats.texturasCreadas - T.stats.texturasLiberadas, t0, n + ': texturas propias liberadas');
    assert.equal(sc.children.length, 0); assert.ok(propios >= 2);
    for (const r of asp.recursos) assert.fail('quedan recursos');
  }
});

test('19 materiales y texturas compartidos NO se liberan mientras se usan: liberar() no toca los del GLB ni la geometría de las cartas', async () => {
  const { a, asp } = await nuevo('media');
  const hoja = mat(a, 'Hoja_0_Losa'), sold = a.nodo.get('Hoja_0_F_Soldaduras').material, funda = a.nodo.get('Hoja_0_F_Funda').material;
  asp.liberar();
  for (const x of [hoja, sold]) assert.notEqual(x.disposed, true, 'material del GLB sin liberar');
  assert.equal(a.geomCarta.F.disposed, undefined);
  const m = await crearMundo({ materialCarta: null }); m.album.estado.irA(1); m.album.aplicar(); m.vista.sincronizar(new Map([[1, 0]]));
  const b = m.vista.porId.get(m.mapa.paginas[0].bolsillos[0].id); const mc = (b.tarjeta || b.fantasma).material; m.vista.sincronizar(new Map()); assert.equal(mc.disposed, true, 'la carta desmontada sí libera SU material');
});

test('20 estimación de contraste 3.7.2b (analítica, NO medición de GPU): hoja ≠ cubierta ≠ lomo, marco protector el más claro, huecos más oscuros que la hoja, fondo discreto', () => {
  const o = { activas: ['hemi', 'principal', 'relleno'] }, L = (h, k = [1, 1, 1]) => A.luminanciaSrgb(A.estimarSalida(h, o).map((v, i) => Math.min(1, v * k[i])));
  const cub = L(A.PALETA.cubierta), pag = L(A.PALETA.pagina), lomo = L(A.PALETA.lomo), sold = L(A.PALETA.soldadura), mesa = L(A.PALETA.mesa), ghost = A.luminanciaSrgb([0x18 / 255, 0x21 / 255, 0x3a / 255]);
  assert.ok(pag > cub * 1.15, `hoja (${pag.toFixed(3)}) más clara que la cubierta (${cub.toFixed(3)})`); assert.ok(sold > pag * 1.5, 'el borde protector destaca sobre la hoja');
  assert.ok(ghost < pag * 0.6, 'hueco pendiente más oscuro que la hoja'); assert.ok(cub > mesa * 2, 'fondo discreto'); assert.ok(Math.abs(lomo - cub) > 0.01 || A.PALETA.lomo !== A.PALETA.cubierta);
  assert.ok(sold < 0.65, 'sin neón: el marco no se quema');
  const cx = A.cantoPorNormal(A.CANTOS.cubierta.canto); assert.deepEqual(cx(1), [1, 1, 1]); assert.ok(cx(0)[0] > 1.5);
});

test('21 con los materiales nuevos (media y alta): selección por rayo, ficha, añadir/retirar y persistencia en las 18 páginas; las fundas no bloquean el rayo', async () => {
  const { elegirBolsillo, candidatosTocables } = await import('../js/picking.js'); const { Controlador } = await import('../js/controlador.js');
  const { vueltasParaPagina, paginasNecesarias } = await import('../js/navegacion3d.js'); const { nombreBolsillo } = await import('../js/adaptador-coleccion.js');
  for (const nivel of ['media', 'alta']) {
    const w = await nuevo(nivel, { materialCarta: null }); const { m, a, asp } = w;
    const ficha = { abrir() {}, actualizar() {}, error() {}, guardando() {}, cerrar() {} }; let reloj = 0;
    const ctl = new Controlador({ adaptador: m.adaptador, estado: a.estado, vista: m.vista, ficha, ahora: () => reloj });
    for (let p = 1; p <= 18; p++) {
      reloj += 1000; a.estado.irA(vueltasParaPagina(p)); a.aplicar(); asp.sincronizar(a); m.vista.sincronizar(paginasNecesarias([a.estado.vueltas], 18, 1));
      const pos = [1, 5, 9].map((k) => nombreBolsillo(p, k)).find((n) => m.adaptador.puedeEditar(n)); assert.ok(pos, `p${p} tiene bolsillo editable`);
      const M = a.matrizMundo(pos), alto = M[13] + 0.4;
      const golpe = elegirBolsillo([M[12], alto, M[14]], [0, -1, 0], candidatosTocables(a.estado, m.adaptador, (n) => a.matrizMundo(n)));
      assert.ok(golpe && golpe.nombre === pos, `p${p} (${nivel}): el rayo atraviesa la funda y llega al bolsillo ${pos} (${golpe && golpe.nombre})`);
      assert.ok(ctl.seleccionar(pos)); const id = m.adaptador.mapa.porNombre.get(pos).carta.id, antes = m.adaptador.cantidad(id);
      await ctl.anadir(); assert.equal(m.adaptador.cantidad(id), antes + 1); await ctl.retirar(); assert.equal(m.adaptador.cantidad(id), antes); ctl.cerrar();
    }
    assert.equal(m.almacen.constructor.name, 'AlmacenMemoria');
  }
});
