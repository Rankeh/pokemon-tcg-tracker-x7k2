// Prueba de humo de album3d.js contra el GLB REAL, con un doble de Three.js. Ejecutar:  node --test web/prueba-3d/pruebas/
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('./hooks.mjs', import.meta.url);
const ruta = new URL('../modelo/album.glb', import.meta.url);
globalThis.fetch = async () => { const b = readFileSync(ruta); return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
const { cargarAlbum } = await import('../js/album3d.js');
const renderer = { capabilities: { getMaxAnisotropy: () => 8 } };
const espera = () => new Promise((r) => setTimeout(r, 5));

async function nuevo() { return cargarAlbum('x.glb', { renderer, urlCarta: (n) => 'cartas/c' + n + '.png' }); }

test('carga: raíz, tapa y 6 hojas localizadas por nombre; parámetros leídos del propio GLB', async () => {
  const a = await nuevo();
  assert.equal(a.elemento.length, 7);
  assert.ok(a.elemento.every(Boolean));
  assert.equal(a.geo.n, 6);
  assert.ok(a.params.paso > 0 && a.params.ancho_tapa > 0.2);
});

test('cada hoja tiene 2 caras con 9 nodos-bolsillo, y las cartas son meshes SOLO en los ocupados', async () => {
  const a = await nuevo();
  let bolsillos = 0, cartas = 0;
  a.escena.traverse((o) => { if (o.userData.tipo === 'bolsillo') { bolsillos++; assert.ok(o.children.length <= 1); } if (o.userData.tipo === 'carta') { cartas++; assert.ok(o.isMesh && o.parent.userData.tipo === 'bolsillo'); } });
  assert.equal(bolsillos, 6 * 2 * 9);
  assert.ok(cartas > 0 && cartas < bolsillos, 'hay bolsillos vacíos y ocupados');
});

test('cada carta tiene SU material; geometría compartida entre cartas de la misma cara', async () => {
  const a = await nuevo();
  const mats = new Set(), geos = { F: new Set(), D: new Set() };
  a.escena.traverse((o) => { if (o.userData.tipo === 'carta') { mats.add(o.material); geos[o.parent.userData.cara].add(o.geometry); } });
  assert.equal(mats.size, a.cartaDe.size);
  assert.equal(geos.F.size, 1); assert.equal(geos.D.size, 1);
});

test('setCartaImagen cambia solo el map de esa carta; la caché reutiliza la textura', async () => {
  const a = await nuevo();
  const [n1, n2] = [...a.cartaDe.keys()];
  await a.setCartaImagen(n1, 'u/1.png'); await a.setCartaImagen(n2, 'u/1.png');
  const m1 = a.cartaDe.get(n1).material, m2 = a.cartaDe.get(n2).material;
  assert.equal(m1.map.url, 'u/1.png'); assert.strictEqual(m1.map, m2.map);
  await a.setCartaImagen(n1, 'u/2.png');
  assert.equal(m1.map.url, 'u/2.png'); assert.equal(m2.map.url, 'u/1.png');
  assert.equal(a.texturas.size, 2);
});

test('vaciar y rellenar un bolsillo no reconstruye nada y reutiliza la geometría', async () => {
  const a = await nuevo();
  a.estado.irA(3); a.aplicar();
  const b = a.bolsillo(3, 'F', 0);
  const antes = a.cartaEn(b);
  const geoRef = a.geomCarta.F;
  if (antes) assert.ok(a.quitarCarta(b)); assert.equal(a.cartaEn(b), null);
  const c = a.ponerCarta(b, 7);
  assert.strictEqual(c.geometry, geoRef); assert.equal(c.name, 'Hoja_2_F_Carta_0');
  assert.ok(!a.ponerCarta(b, 9) || a.cartaEn(b) === c, 'no duplica si ya hay carta');
  await espera(); assert.ok(c.material.map);
  assert.ok(a.cartasTocables().includes(c));
});

test('aplicar(): poses, ocultar hojas enterradas y centrado', async () => {
  const a = await nuevo();
  assert.ok(Math.abs(a.raiz.position.x + a.geo.ancho / 2) < 1e-9, 'cerrado: desplazado media tapa');
  assert.ok(a.elemento.some((e) => !e.visible), 'hay hojas ocultas con el álbum cerrado');
  a.estado.irA(4); a.aplicar();
  assert.ok(Math.abs(a.raiz.position.x) < 1e-9);
  assert.ok(Math.abs(a.elemento[1].rotation.z - Math.PI) < 1e-9 && a.elemento[5].rotation.z === 0);
  assert.ok(a.elemento[4].position.y > a.elemento[5].position.y, 'la hoja superior de la pila derecha está más alta');
  a.estado.irA(0); a.estado.avanzar(); a.actualizar(0.45);
  assert.ok(a.elemento[0].rotation.z > 0 && a.elemento[0].rotation.z < Math.PI);
});

test('cargarVisibles: pide solo las texturas de las caras necesarias (no las enterradas)', async () => {
  const a = await nuevo();
  a.estado.irA(3); a.cargarVisibles(); await espera();
  const urls = new Set(); a.cartaDe.forEach((m) => m.userData.url && urls.add(m.userData.url));
  const con = [...a.cartaDe.values()].filter((m) => m.userData.url).length;
  assert.ok(con > 0 && con < a.cartaDe.size, `texturas pedidas ${con} de ${a.cartaDe.size}`);
  for (const m of a.cartaDe.values()) if (m.userData.url) { const i = m.name.split('_')[1]; assert.ok(+i + 1 >= 1 && +i + 1 <= 5); }
});

test('métricas contadas: triángulos totales y visibles', async () => {
  const a = await nuevo();
  const t = a.contarEscena({ soloVisibles: false }), v = a.contarEscena({ soloVisibles: true });
  assert.ok(t.triangulos > 2000 && t.triangulos < 5000);
  assert.ok(v.triangulos < t.triangulos && v.mallas < t.mallas);
});
