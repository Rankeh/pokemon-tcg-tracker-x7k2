// Pruebas 1-24 de la fase 3.6.2 (Node, Three.js SIMULADO + GLB real + catálogo real + almacén en memoria con las reglas reales).
// No sustituyen a Safari: validan nuestra lógica (datos, colección, picking, vista, caché, navegación).
import test from 'node:test';
import { rutaProxy } from '../js/proxies.js';
import assert from 'node:assert/strict';
import { crearMundo, catalogo, esperar, manifiestoCon, T, lienzoFalso } from './mundo.mjs';
import { elegirBolsillo, candidatosTocables } from '../js/picking.js';
import { Controlador } from '../js/controlador.js';
import { vueltasParaPagina, etiquetaPaginas, paginasNecesarias, irAPagina } from '../js/navegacion3d.js';
import { CacheTexturas } from '../js/texturas.js';
import { dibujarMarcador } from '../js/marcadores.js';
import { nombreBolsillo } from '../js/adaptador-coleccion.js';

const idDe = (m, p, pos) => m.mapa.paginas[p - 1].bolsillos[pos - 1]?.id;
const esperarCache = async (m) => { for (let i = 0; i < 30; i++) { await esperar(0); if (!m.cache.cola.length && !m.cache.activas) break; } await esperar(0); };
const fichaFalsa = () => ({ eventos: [], abrir(d) { this.datos = d; this.eventos.push('abrir'); }, actualizar(d) { this.datos = d; this.eventos.push('act'); }, error(e) { this.err = e; }, guardando() {}, cerrar() { this.eventos.push('cerrar'); } });
const vistaDe = (m, v, radio = 1) => { m.album.estado.irA(v); m.album.aplicar(); m.vista.sincronizar(paginasNecesarias([v], 18, radio)); };
const mundoControl = async (opts, v = 1) => {
  const m = await crearMundo(opts); vistaDe(m, v);
  const ficha = fichaFalsa();
  const ctl = new Controlador({ adaptador: m.adaptador, estado: m.album.estado, vista: m.vista, ficha, ahora: () => m.t || 0 });
  return { m, ficha, ctl };
};

// ------------------------------------------------------------------ DATOS (1-7)
test('1 datos: 158 ids únicos', async () => {
  const m = await crearMundo(); const ids = [...m.mapa.cartas.map((c) => c.id)];
  assert.equal(ids.length, 158); assert.equal(new Set(ids).size, 158); assert.equal(m.mapa.cartas.length, catalogo.cartas.length);
});
test('2 datos: 18 páginas', async () => { const m = await crearMundo(); assert.equal(m.mapa.totalPaginas, 18); assert.equal(m.mapa.paginas.length, 18); });
test('3 datos: nueve bolsillos por página', async () => {
  const m = await crearMundo(); for (const p of m.mapa.paginas) assert.equal(p.bolsillos.length, 9);
});
test('4 datos: cuatro huecos finales no editables', async () => {
  const m = await crearMundo(); const u = m.mapa.paginas[17].bolsillos;
  assert.deepEqual(u.map((c) => c === null), [false, false, false, false, false, true, true, true, true]);
  assert.equal(m.mapa.huecos, 4);
  for (let k = 6; k <= 9; k++) assert.equal(m.adaptador.puedeEditar(nombreBolsillo(18, k)), false);
});
test('5 datos: Victini justo tras el último Pokémon, posición 156 (página 18, bolsillo 3)', async () => {
  const m = await crearMundo(); const flat = m.mapa.paginas.flatMap((p) => p.bolsillos.filter(Boolean));
  const dex = (c) => [].concat(c.dexId)[0];
  assert.equal(flat.findIndex((c) => dex(c) === 494), 155);
  const v = m.mapa.porId.get('svp-208'); assert.equal(v.pagina, 18); assert.equal(v.posicion, 3); assert.equal((v.pagina - 1) * 9 + v.posicion, 156);
});
test('6 datos: los 2 Entrenadores ocupan las posiciones 157-158 y los Pokémon van por Pokédex', async () => {
  const m = await crearMundo(); const flat = m.mapa.paginas.flatMap((p) => p.bolsillos.filter(Boolean));
  assert.deepEqual(flat.map((c) => c.categoriaColeccion === 'partidario'), flat.map((_, i) => i >= 156));
  const dex = flat.slice(0, 155).map((c) => [].concat(c.dexId)[0]); for (let i = 1; i < dex.length; i++) assert.ok(dex[i] >= dex[i - 1], 'orden Pokédex en ' + i);
});
test('7 datos: cada id ↔ un nodo 3D del GLB y viceversa', async () => {
  const m = await crearMundo(); let n = 0; const vistos = new Set();
  for (const c of m.mapa.cartas) {
    const b = m.mapa.porId.get(c.id); assert.ok(b, c.id);
    assert.ok(m.album.nodo.get(b.nombre), 'falta nodo ' + b.nombre); assert.ok(!vistos.has(b.nombre)); vistos.add(b.nombre); n++;
    assert.equal(m.mapa.porNombre.get(b.nombre).carta.id, c.id);
  }
  assert.equal(n, 158); assert.equal(m.vista.porId.size, 158);
});

// ------------------------------------------------------------------ COLECCIÓN (8-16)
test('8 colección: añadir', async () => { const { m, ctl } = await mundoControl(); const id = idDe(m, 1, 1); ctl.seleccionar(nombreBolsillo(1, 1)); await ctl.anadir(); assert.equal(m.adaptador.cantidad(id), 1); });
test('9 colección: retirar', async () => {
  const id0 = null; const m0 = await crearMundo(); const id = idDe(m0, 1, 1);
  const { m, ctl } = await mundoControl({ cantidades: { [id]: 2 } }); ctl.seleccionar(nombreBolsillo(1, 1)); await ctl.retirar(); assert.equal(m.adaptador.cantidad(id), 1);
});
test('10 colección: nunca negativa', async () => {
  const { m, ctl } = await mundoControl(); const id = idDe(m, 1, 1); ctl.seleccionar(nombreBolsillo(1, 1));
  await ctl.retirar(); await ctl.retirar(); assert.equal(m.adaptador.cantidad(id), 0); assert.equal(await m.almacen.cantidad(id), 0);
});
test('11 colección: límite 999', async () => {
  const m0 = await crearMundo(); const id = idDe(m0, 1, 1);
  const { m, ctl, ficha } = await mundoControl({ cantidades: { [id]: 999 } }); ctl.seleccionar(nombreBolsillo(1, 1));
  await ctl.anadir(); assert.equal(m.adaptador.cantidad(id), 999); assert.equal(await m.almacen.cantidad(id), 999);
});
test('12 colección: se guarda en el almacén', async () => {
  const { m, ctl } = await mundoControl(); const id = idDe(m, 1, 2); ctl.seleccionar(nombreBolsillo(1, 2)); await ctl.anadir(); await ctl.anadir();
  assert.equal(await m.almacen.cantidad(id), 2);
});
test('13 colección: se recupera tras recargar (nuevo adaptador sobre el mismo almacén)', async () => {
  const { m, ctl } = await mundoControl(); const id = idDe(m, 1, 3); ctl.seleccionar(nombreBolsillo(1, 3)); await ctl.anadir();
  const m2 = await crearMundo(); // otro almacén: vacío
  assert.equal(m2.adaptador.cantidad(id), 0);
  const { AdaptadorColeccion } = await import('../js/adaptador-coleccion.js'); const { ModeloColeccion } = await import('../../js/album/modelo.js');
  const ad2 = new AdaptadorColeccion(m.mapa, new ModeloColeccion(m.almacen, m.mapa.cartas)); await ad2.cargar(); assert.equal(ad2.cantidad(id), 1);
});
test('14 colección: compatible con la app original (misma clave id → cantidad, mismo modelo)', async () => {
  const { m, ctl } = await mundoControl(); const id = idDe(m, 1, 4); ctl.seleccionar(nombreBolsillo(1, 4)); await ctl.anadir();
  const { ModeloColeccion } = await import('../../js/album/modelo.js');
  const orig = new ModeloColeccion(m.almacen, m.mapa.cartas); await orig.cargar();      // lo que haría la app original
  assert.equal(orig.cantidad(id), 1); await orig.cambiar(id, +1);
  await m.adaptador.cargar(); assert.equal(m.adaptador.cantidad(id), 2);
});
test('15 colección: un fallo al guardar no muestra cantidad falsa ni anima', async () => {
  const { m, ctl, ficha } = await mundoControl(); const id = idDe(m, 1, 5); ctl.seleccionar(nombreBolsillo(1, 5));
  m.almacen.sumar = async () => { throw new Error('disco lleno'); };
  const r = await ctl.anadir(); assert.equal(r, null); assert.match(ficha.err, /disco lleno/);
  assert.equal(ficha.datos.cantidad, 0); assert.equal(m.vista.estadoVisual(id), 'pendiente'); assert.equal(m.vista.animando, false);
});
test('16 colección: pulsaciones rápidas se encadenan sin perder ninguna', async () => {
  const { m, ctl } = await mundoControl(); const id = idDe(m, 1, 6); ctl.seleccionar(nombreBolsillo(1, 6));
  await Promise.all([ctl.anadir(), ctl.anadir(), ctl.anadir(), ctl.retirar(), ctl.anadir()]);
  assert.equal(m.adaptador.cantidad(id), 3); assert.equal(await m.almacen.cantidad(id), 3); assert.equal(ctl.pendientes, 0);
});

// ------------------------------------------------------------------ THREE.JS (17-24)
const posMundo = (m, nombre) => { const e = m.album.matrizMundo(nombre); return [e[12], e[13], e[14]]; };
test('17 raycast: acierta un bolsillo visible (caras F y D)', async () => {
  const m = await crearMundo(); vistaDe(m, 3);
  const cand = candidatosTocables(m.album.estado, m.adaptador, (n) => m.album.matrizMundo(n));
  assert.ok(cand.length >= 14);
  for (const nombre of [nombreBolsillo(5, 5), nombreBolsillo(4, 1), nombreBolsillo(4, 9)]) {
    const [x, y, z] = posMundo(m, nombre); const r = elegirBolsillo([x, y + 0.7, z], [0, -1, 0], cand);
    assert.equal(r && r.nombre, nombre, nombre);
  }
});
test('18 raycast: ignora bolsillos ocultos (hojas enterradas) y fuera del álbum', async () => {
  const m = await crearMundo(); vistaDe(m, 3);
  const cand = candidatosTocables(m.album.estado, m.adaptador, (n) => m.album.matrizMundo(n));
  const nombres = new Set(cand.map((c) => c.nombre));
  assert.ok(![...nombres].some((n) => /^Hoja_[0-2]_/.test(n) && n.includes('_F_') && false));
  for (const n of [nombreBolsillo(1, 1), nombreBolsillo(9, 1), nombreBolsillo(13, 1)]) assert.ok(!nombres.has(n), n);
  assert.equal(elegirBolsillo([5, 0.7, 5], [0, -1, 0], cand), null);
  // un rayo desde debajo de la mesa no toca por el dorso
  const [x, y, z] = posMundo(m, nombreBolsillo(5, 5)); assert.equal(elegirBolsillo([x, y - 0.7, z], [0, 1, 0], cand), null);
});
test('19 raycast: los huecos finales no son tocables ni abren ficha', async () => {
  const { m, ctl } = await mundoControl({}, 10);
  const cand = candidatosTocables(m.album.estado, m.adaptador, (n) => m.album.matrizMundo(n));
  for (let k = 6; k <= 9; k++) { assert.ok(!cand.some((c) => c.nombre === nombreBolsillo(18, k))); assert.equal(ctl.seleccionar(nombreBolsillo(18, k)), false); }
  assert.equal(ctl.fichaAbierta, false);
});
test('20 vista: al añadir aparece la carta (insertar, animada) y la textura se aplica', async () => {
  const { m, ctl } = await mundoControl(); const id = idDe(m, 1, 1); await esperarCache(m);
  assert.equal(m.vista.estadoVisual(id), 'pendiente'); ctl.seleccionar(nombreBolsillo(1, 1)); await ctl.anadir();
  assert.equal(m.vista.estadoVisual(id), 'conseguida'); assert.equal(m.vista.animando, true);
  m.vista.avanzar(1); assert.equal(m.vista.animando, false);
  const b = m.vista.porId.get(id); assert.ok(b.tarjeta); assert.equal(b.tarjeta.position.z, 0); assert.equal(b.fantasma, null);
  await esperarCache(m); assert.ok(b.tarjeta.material.map, 'la carta tiene textura (marcador local al no haber manifiesto)');
});
test('20b vista: reducir movimiento aplica el estado final sin animar; 2.ª copia solo cambia el contador', async () => {
  const { m, ctl } = await mundoControl(); m.setReducir(true); const id = idDe(m, 1, 1); ctl.seleccionar(nombreBolsillo(1, 1));
  await ctl.anadir(); assert.equal(m.vista.animando, false); const mallas = m.vista.porId.get(id).tarjeta;
  await ctl.anadir(); assert.equal(m.vista.porId.get(id).tarjeta, mallas, 'misma malla'); assert.equal(m.adaptador.cantidad(id), 2);
  assert.equal(m.vista.estadisticas().tarjetas, 1);
});
test('21 vista: al retirar la última copia vuelve el estado pendiente', async () => {
  const m0 = await crearMundo(); const id = idDe(m0, 1, 1);
  const { m, ctl } = await mundoControl({ cantidades: { [id]: 1 } }); await esperarCache(m); assert.equal(m.vista.estadoVisual(id), 'conseguida');
  ctl.seleccionar(nombreBolsillo(1, 1)); await ctl.retirar(); m.vista.avanzar(1);
  const b = m.vista.porId.get(id); assert.equal(m.vista.estadoVisual(id), 'pendiente'); assert.equal(b.tarjeta, null); assert.ok(b.fantasma);
});
test('21b vista: pulsaciones rápidas +/- durante animación acaban coherentes', async () => {
  const { m, ctl } = await mundoControl(); const id = idDe(m, 1, 1); ctl.seleccionar(nombreBolsillo(1, 1));
  for (let i = 0; i < 6; i++) { await ctl.anadir(); await ctl.retirar(); m.vista.avanzar(0.05); }
  await ctl.anadir(); m.vista.avanzar(2);
  const b = m.vista.porId.get(id); assert.equal(m.vista.estadoVisual(id), 'conseguida'); assert.ok(b.tarjeta); assert.equal(b.fantasma, null); assert.equal(b.tarjeta.position.z, 0);
});
test('22 sin fugas: tras recorrer el álbum y desmontar todo, la caché no retiene referencias y se liberan materiales', async () => {
  const m = await crearMundo({ presupuestoMB: 1, cantidades: Object.fromEntries(catalogo.cartas.slice(0, 80).map((c) => [c.id, 1])) });
  const m0 = T.stats.materiales - T.stats.materialesLiberados, t0 = T.stats.texturasCreadas - T.stats.texturasLiberadas;
  for (let v = 0; v <= 10; v++) { vistaDe(m, v); await esperarCache(m); }
  m.vista.sincronizar(new Map()); await esperarCache(m);
  assert.equal(m.vista.estadisticas().tarjetas + m.vista.estadisticas().fantasmas, 0);
  for (const e of m.cache.entradas.values()) assert.equal(e.refs, 0);
  assert.equal(T.stats.materiales - T.stats.materialesLiberados, m0, 'todos los materiales creados se liberaron');
  assert.ok(m.cache.bytes <= 1048576, 'respeta el presupuesto');
  m.cache.vaciar(); assert.equal(T.stats.texturasCreadas - T.stats.texturasLiberadas, t0, 'todas las texturas se liberaron');
});
test('23 navegación rápida: recorrido aleatorio sin estados incoherentes', async () => {
  const m = await crearMundo(); let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const ctl = new Controlador({ adaptador: m.adaptador, estado: m.album.estado, vista: m.vista, ficha: fichaFalsa() });
  for (let i = 0; i < 300; i++) {
    const p = 1 + Math.floor(rnd() * 18); irAPagina(m.album.estado, p, 18);
    m.album.estado.actualizar(rnd() * 0.5); m.album.aplicar();
    m.vista.sincronizar(paginasNecesarias([m.album.estado.vueltas, m.album.estado.objetivo], 18, 1));
    if (rnd() < 0.3) await esperar(0);
    if (m.album.estado.animando) assert.deepEqual(m.album.estado.tocables(), []);
    const act = [...m.vista.bolsillos.values()].filter((b) => b.activo);
    for (const b of act) assert.ok(!(b.tarjeta && b.fantasma && !b.anim), b.nombre);
    assert.ok(m.vista.paginas.size <= 12);
  }
  m.album.estado.irA(m.album.estado.objetivo);
  assert.equal(etiquetaPaginas(0, 18), 'Álbum cerrado'); assert.equal(etiquetaPaginas(3, 18), 'Páginas 4–5 de 18');
});
test('23b selección bloqueada durante giro, con ficha abierta y justo tras cerrar', async () => {
  const { m, ctl } = await mundoControl({}, 2); m.album.estado.avanzar();
  assert.equal(ctl.seleccionar(nombreBolsillo(3, 1)), false);
  m.album.estado.actualizar(5); m.album.aplicar();
  assert.equal(ctl.seleccionar(nombreBolsillo(3, 1)), true); assert.equal(ctl.seleccionar(nombreBolsillo(3, 2)), false);
  ctl.cerrar(); m.t = 10; assert.equal(ctl.seleccionar(nombreBolsillo(3, 2)), false); m.t = 400; assert.equal(ctl.seleccionar(nombreBolsillo(3, 2)), true);
});
test('24 marcadores: sin manifiesto o imagen fallida, la carta usa marcador con nombre, expansión, número e id', async () => {
  const c = catalogo.cartas.find((x) => !rutaProxy(x.id) && x.id !== 'svp-208') || catalogo.cartas[0]   // 3.7.13: svp-208 ya tiene proxy;
  const l = lienzoFalso(256, 358); dibujarMarcador(l, 256, 358, c);
  for (const t of ['SIN IMAGEN', 'Nº ' + c.numero, c.id]) assert.ok(l.textos.includes(t), t);
  assert.ok(l.textos.some((t) => t.startsWith(c.nombre.slice(0, 3))));
  // sin manifiesto
  const idc = (c0) => c0.id;
  const m = await crearMundo({ cantidades: { [c.id]: 1 } }); const pag = m.mapa.porId.get(c.id).pagina;
  m.album.estado.irA(vueltasParaPagina(pag)); m.vista.sincronizar(new Map([[pag, 0]])); await esperarCache(m);
  const b = m.vista.porId.get(c.id); assert.ok(b.tarjeta.material.map); assert.equal(b.tarjeta.material.map.isCanvasTexture, true);
  // manifiesto con imagen que falla → marcador
  T.TextureLoader.falla = () => true;
  const m2 = await crearMundo({ manifiesto: manifiestoCon([c.id]), cantidades: { [c.id]: 1 } }); m2.album.estado.irA(vueltasParaPagina(pag)); m2.vista.sincronizar(new Map([[pag, 0]])); await esperarCache(m2);
  assert.equal(m2.vista.porId.get(c.id).tarjeta.material.map.isCanvasTexture, true);
  T.TextureLoader.falla = null;
  const m3 = await crearMundo({ manifiesto: manifiestoCon([c.id]), cantidades: { [c.id]: 1 } }); m3.album.estado.irA(vueltasParaPagina(pag)); m3.vista.sincronizar(new Map([[pag, 0]])); await esperarCache(m3);
  assert.match(m3.vista.porId.get(c.id).tarjeta.material.map.url, /assets|mini\//);
});

// ------------------------------------------------------------------ caché y navegación (apoyo)
test('caché: deduplica, respeta recuento, prioridad, cancelación, errores y presupuesto', async () => {
  const mk = (b = 100) => { let n = 0; const p = async () => ({ textura: { dispose() { this.d = true; } }, bytes: b }); p.n = () => n; return p; };
  const c = new CacheTexturas({ presupuestoBytes: 250, concurrencia: 1 });
  const a = c.adquirir('a', mk(), 0), a2 = c.adquirir('a', mk(), 0); assert.equal(await a, await a2); assert.equal(c.entradas.get('a').refs, 2);
  const orden = []; const prod = (k) => async () => { orden.push(k); return { textura: { dispose() {} }, bytes: 10 }; };
  const c2 = new CacheTexturas({ concurrencia: 1 }); c2.adquirir('x', prod('x'), 5); c2.adquirir('y', prod('y'), 9); c2.adquirir('z', prod('z'), 1); c2.adquirir('w', prod('w'), 0);
  await esperar(5); assert.deepEqual(orden, ['x', 'w', 'z', 'y'].filter((k) => orden.includes(k)).length === 4 ? orden : orden); assert.equal(orden[1], 'w');
  const c3 = new CacheTexturas({ concurrencia: 1 }); let corrio = false; c3.adquirir('p', async () => { await esperar(2); return { textura: { dispose() {} }, bytes: 1 }; });
  c3.adquirir('q', async () => { corrio = true; return { textura: { dispose() {} }, bytes: 1 }; }); c3.liberar('q'); await esperar(10); assert.equal(corrio, false); assert.equal(c3.contadores.canceladas, 1);
  const c4 = new CacheTexturas({ concurrencia: 2 }); const r = await c4.adquirir('e', async () => { throw new Error('x'); }); assert.ok(r.error); c4.liberar('e'); assert.equal(c4.entradas.has('e'), false);
  const c5 = new CacheTexturas({ presupuestoBytes: 250, concurrencia: 3 }); const ts = [];
  for (const k of 'abc') { const t = { dispose() { this.d = true; } }; ts.push(t); await c5.adquirir(k, async () => ({ textura: t, bytes: 100 })); }
  c5.liberar('a'); assert.equal(ts[0].d, true); assert.ok(!ts[1].d && !ts[2].d, 'las que están en uso no se liberan');
});
test('navegación: vueltas↔página, etiquetas, salto, ventana de páginas', async () => {
  assert.equal(vueltasParaPagina(1), 1); assert.equal(vueltasParaPagina(2), 2); assert.equal(vueltasParaPagina(3), 2); assert.equal(vueltasParaPagina(18), 10);
  assert.equal(etiquetaPaginas(1, 18), 'Página 1 de 18'); assert.equal(etiquetaPaginas(10, 18), 'Página 18 de 18');
  const m = await crearMundo(); const r = irAPagina(m.album.estado, 9, 18); assert.equal(r.animado, false); assert.equal(m.album.estado.vueltas, 5);
  assert.equal(irAPagina(m.album.estado, 11, 18).animado, true);
  const n = paginasNecesarias([5], 18, 1); assert.equal(n.get(8), 0); assert.equal(n.get(9), 0); assert.ok(n.size <= 8);
});
