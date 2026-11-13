// Montaje común de las pruebas con Three.js simulado: catálogo real + GLB real + adaptador (almacén en memoria) + vista de bolsillos.
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('./hooks.mjs', import.meta.url);
const bytes = readFileSync(new URL('../modelo/album.glb', import.meta.url));
globalThis.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });

export const catalogo = JSON.parse(readFileSync(new URL('../../../datos/catalogo/coleccion-teselia.json', import.meta.url), 'utf8'));
const { cargarAlbum } = await import('../js/album3d.js');
const { crearMapa, AdaptadorColeccion } = await import('../js/adaptador-coleccion.js');
const { ModeloColeccion } = await import('../../js/album/modelo.js');
const { CacheTexturas } = await import('../js/texturas.js');
const { crearProductores } = await import('../js/texturas3d.js');
const { VistaBolsillos } = await import('../js/bolsillos3d.js');
const { AlmacenMemoria } = await import('./almacen-memoria.mjs');
export const T = await import('./three-doble.mjs');

export const lienzoFalso = (w, h) => {
  const llamadas = [];
  const ctx = new Proxy({ measureText: (t) => ({ width: String(t).length * 6 }), setLineDash() {} },
    { get: (o, k) => (k in o ? o[k] : (...a) => { if (k === 'fillText') llamadas.push(a[0]); }), set: () => true });
  return { width: w, height: h, getContext: () => ctx, textos: llamadas };
};

export async function crearMundo({ manifiesto = null, reducir = false, presupuestoMB = 32, cantidades = {}, materialCarta = null } = {}) {
  const album = await cargarAlbum('x.glb', { renderer: {} });
  const mapa = crearMapa(catalogo);
  const almacen = new AlmacenMemoria();
  for (const [id, n] of Object.entries(cantidades)) await almacen.fijar(id, n);
  const modelo = new ModeloColeccion(almacen, mapa.cartas);
  const adaptador = new AdaptadorColeccion(mapa, modelo);
  await adaptador.cargar();
  const cache = new CacheTexturas({ presupuestoBytes: presupuestoMB * 1048576, concurrencia: 4 });
  const lienzos = [];
  const productores = crearProductores({ manifiesto, anisotropia: 1, crearLienzo: (w, h) => { const l = lienzoFalso(w, h); lienzos.push(l); return l; } });
  let reducirMov = reducir;
  const vista = new VistaBolsillos({ album, adaptador, cache, productores, materialCarta, reducirMovimiento: () => reducirMov });
  return { album, mapa, almacen, modelo, adaptador, cache, productores, vista, lienzos, setReducir: (v) => { reducirMov = v; } };
}
export const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms));
export const manifiestoCon = (ids) => ({ version: 1, cartas: Object.fromEntries(ids.map((id) => [id, { mini: `mini/${id}.jpg`, grande: `grande/${id}.jpg`, anchoMini: 256, altoMini: 352 }])) });
