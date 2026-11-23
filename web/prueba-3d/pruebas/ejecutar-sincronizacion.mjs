// 3.31 · Sincronización entre dispositivos, con IndexedDB REAL (Chromium) en dos bases de datos desechables («móvil» y «ordenador»)
// y un servidor de prueba en memoria con la MISMA regla que Supabase (gana el cambio más reciente; nunca se borran filas).
// Uso:  node web/prueba-3d/pruebas/ejecutar-sincronizacion.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png' };
const servidor = http.createServer(async (req, res) => {
  try {
    const ruta = path.join(raiz, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!ruta.startsWith(raiz)) throw new Error('fuera');
    const cuerpo = await readFile(ruta);
    res.writeHead(200, { 'Content-Type': tipos[path.extname(ruta)] || 'application/octet-stream' }); res.end(cuerpo);
  } catch { res.writeHead(404); res.end('no'); }
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const { chromium } = createRequire(import.meta.url)('playwright');
const nav = await chromium.launch();
let fallos = 0, total = 0;
const ok = (c, msg) => { total++; console.log((c ? 'OK      ' : 'FALLO   ') + msg); if (!c) fallos++; };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const ctx = await nav.newContext();
const pag = await ctx.newPage(); const errores = [];
pag.on('pageerror', (e) => errores.push(String(e))); pag.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errores.push(m.text()));
await pag.goto(`${base}/web/prueba-3d/pruebas/integracion.html`).catch(() => {});
const sufijo = Math.random().toString(36).slice(2);
const r = await pag.evaluate(async (sufijo) => {
  const { Almacen } = await import('/web/js/almacen.js');
  const { sincronizar, haySesionGuardada } = await import('/web/js/sincronizacion.js');
  const espera = () => new Promise((ok) => setTimeout(ok, 8));
  // servidor de prueba: misma regla que el disparador de Supabase (una escritura más antigua no pisa) y hora de llegada propia
  const srv = { filas: new Map(), n: 0, caido: false, subidas: 0 };
  const remoto = (usuario) => ({
    usuario: async () => usuario,
    leer: async (desde) => { if (srv.caido) throw new Error('sin conexión'); return [...srv.filas.values()].filter((f) => !desde || f.servidor > desde).sort((a, b) => a.servidor.localeCompare(b.servidor)).map((f) => structuredClone(f)); },
    subir: async (filas) => { if (srv.caido) throw new Error('sin conexión'); srv.subidas += filas.length;
      return filas.map((f) => { const v = srv.filas.get(f.carta); if (v && Date.parse(f.actualizado) < Date.parse(v.actualizado)) return structuredClone(v);
        const n = { ...structuredClone(f), servidor: new Date(Date.UTC(2030, 0, 1) + ++srv.n).toISOString() }; srv.filas.set(f.carta, n); return structuredClone(n); }); },
  });
  const pc = await Almacen.abrir('sync-pc-' + sufijo), movil = await Almacen.abrir('sync-movil-' + sufijo);
  const yo = remoto('usuario-1');
  const res = {};
  // 1) el ordenador ya tenía cartas; el móvil tenía una suya
  await pc.fijar('sv10.5w-166', 2); await pc.fijar('30th-027', 1); await pc.sumarVariante('30th-028', 'holo', 1);
  await movil.fijar('sv06-034', 1);
  const r1 = await sincronizar(pc, yo);
  res.primeraPc = { r: r1, servidor: srv.filas.size, pendientes: (await pc.pendientes()).size };
  await espera();
  const r2 = await sincronizar(movil, yo);
  res.primeraMovil = { r: r2, movil: Object.fromEntries(await movil.leerTodas()), foto: await movil.fotoAntesDeSincronizar(), variantes: (await movil.leerRegistros()).get('30th-028')?.variantes };
  const r3 = await sincronizar(pc, yo);
  res.pcRecibe = { r: r3, pc: Object.fromEntries(await pc.leerTodas()) };
  // 2) quitar una carta en el móvil llega al ordenador (la baja viaja como cantidad 0)
  await espera(); await movil.fijar('30th-027', 0);
  await sincronizar(movil, yo); const r4 = await sincronizar(pc, yo);
  res.baja = { r: r4, pc: Object.fromEntries(await pc.leerTodas()), servidor: srv.filas.get('30th-027')?.cantidad };
  // 3) la misma carta cambiada en los dos: gana la más reciente, aunque se suba antes la más nueva
  await pc.fijar('sv10.5w-166', 5); await espera(); await movil.fijar('sv10.5w-166', 7);
  await sincronizar(movil, yo); const r5 = await sincronizar(pc, yo);
  res.conflicto = { pc: await pc.cantidad('sv10.5w-166'), movil: await movil.cantidad('sv10.5w-166'), servidor: srv.filas.get('sv10.5w-166').cantidad, r: r5, pendPc: (await pc.pendientes()).size };
  // 4) sin conexión: nada se pierde, queda pendiente y se sube después
  await espera(); await movil.fijar('me01-091', 3); srv.caido = true;
  try { await sincronizar(movil, yo); res.caida = 'NO LANZÓ'; } catch (e) { res.caida = e.message; }
  res.pendienteTrasCaida = [...(await movil.pendientes()).keys()]; srv.caido = false;
  await sincronizar(movil, yo); await sincronizar(pc, yo);
  res.trasVolver = { pc: await pc.cantidad('me01-091'), pendientes: (await movil.pendientes()).size };
  // 5) un cambio hecho MIENTRAS se subía no se da por subido
  await espera(); await pc.fijar('sv06-034', 2); const p = await pc.pendientes(); const filas = await pc.filasParaSubir(p);
  await espera(); await pc.fijar('sv06-034', 4); await pc.confirmarSubidas(filas);
  res.cambioDuranteSubida = (await pc.pendientes()).has('sv06-034');
  await sincronizar(pc, yo); await sincronizar(movil, yo); res.cambioDuranteSubidaFinal = await movil.cantidad('sv06-034');
  // 6) sin cambios no se sube nada otra vez
  const antes = srv.subidas; await sincronizar(pc, yo); await sincronizar(movil, yo); res.sinCambiosSube = srv.subidas - antes;
  // 7) otra cuenta en el mismo navegador = primera sincronización otra vez (con su foto); sin sesión, no hace nada
  res.sinSesion = (await sincronizar(pc, remoto(null))).estado;
  // 8) deshacer la primera sincronización del móvil: vuelve a lo que tenía y queda pendiente de subir
  await movil.deshacerSincronizacion();
  res.deshacer = { movil: Object.fromEntries(await movil.leerTodas()), pendientes: [...(await movil.pendientes()).keys()].sort(), foto: await movil.fotoAntesDeSincronizar() };
  // 9) datos raros del servidor se ignoran
  res.raros = await movil.aplicarRemotas([{ carta: '', cantidad: 1, actualizado: '2031-01-01T00:00:00Z' }, { carta: 'x', cantidad: -3, actualizado: '2031-01-01T00:00:00Z' }, { carta: 'y', cantidad: 2 }]);
  res.sesionGuardada = [haySesionGuardada({ length: 1, key: () => 'sb-untiwlxjdklqjwjbvdym-auth-token' }), haySesionGuardada({ length: 1, key: () => 'otra-cosa' })];
  pc.cerrar(); movil.cerrar();
  for (const n of ['sync-pc-' + sufijo, 'sync-movil-' + sufijo]) indexedDB.deleteDatabase(n);
  return res;
}, sufijo);

ok(r.primeraPc.r.primera && r.primeraPc.servidor === 3 && r.primeraPc.pendientes === 0, `ordenador, primera vez: sube sus 3 cartas a la cuenta (${r.primeraPc.servidor} en el servidor)`);
ok(r.primeraMovil.r.primera && r.primeraMovil.movil['sv10.5w-166'] === 2 && r.primeraMovil.movil['30th-027'] === 1 && r.primeraMovil.movil['sv06-034'] === 1,
  'móvil, primera vez: recibe las del ordenador y conserva la suya ' + JSON.stringify(r.primeraMovil.movil));
ok(r.primeraMovil.foto && r.primeraMovil.foto.cartas === 1, 'antes de juntar, guarda una foto de lo que había en el móvil (para deshacer)');
ok(r.primeraMovil.variantes?.holo === 1, 'las variantes viajan (holo del Pikachu 028)');
ok(r.pcRecibe.pc['sv06-034'] === 1 && r.pcRecibe.r.cambiadas.includes('sv06-034'), 'el ordenador recibe la carta que solo tenía el móvil');
ok(!('30th-027' in r.baja.pc) && r.baja.servidor === 0, 'quitar una carta en el móvil la quita en el ordenador (en la cuenta queda con 0)');
ok(r.conflicto.pc === 7 && r.conflicto.movil === 7 && r.conflicto.servidor === 7 && r.conflicto.pendPc === 0, `misma carta cambiada en los dos: gana la más reciente en todas partes (${JSON.stringify(r.conflicto)})`);
ok(r.caida === 'sin conexión' && r.pendienteTrasCaida.includes('me01-091'), 'sin conexión: falla sin perder nada, el cambio queda pendiente');
ok(r.trasVolver.pc === 3 && r.trasVolver.pendientes === 0, 'al volver la conexión se sube y llega al otro dispositivo');
ok(r.cambioDuranteSubida === true && r.cambioDuranteSubidaFinal === 4, 'un cambio hecho mientras se subía sigue pendiente y acaba llegando (4)');
ok(r.sinCambiosSube === 0, 'sin cambios, no se vuelve a subir nada');
ok(r.sinSesion === 'sin-sesion', 'sin sesión no hace nada');
ok(JSON.stringify(r.deshacer.movil) === JSON.stringify({ 'sv06-034': 1 }) && r.deshacer.pendientes.length >= 3 && !r.deshacer.foto,
  'deshacer la primera sincronización: el móvil vuelve a lo suyo y los cambios quedan pendientes ' + JSON.stringify(r.deshacer));
ok(Array.isArray(r.raros) && r.raros.length === 0, 'filas raras del servidor se ignoran');
ok(r.sesionGuardada[0] === true && r.sesionGuardada[1] === false, 'detecta la sesión de Supabase guardada sin cargar la librería');
const alb = await pag.evaluate(async (sufijo) => {
  const { Almacen } = await import('/web/js/almacen.js');
  const { sincronizar } = await import('/web/js/sincronizacion.js');
  const espera = () => new Promise((ok) => setTimeout(ok, 8));
  const srv = { copias: new Map(), albumes: new Map(), n: 0 };
  const lww = (mapa, clave) => async (filas) => filas.map((f) => { const v = mapa.get(f[clave]); if (v && Date.parse(f.actualizado) < Date.parse(v.actualizado)) return structuredClone(v);
    const n = { ...structuredClone(f), servidor: new Date(Date.UTC(2030, 0, 1) + ++srv.n).toISOString() }; mapa.set(f[clave], n); return structuredClone(n); });
  const leer = (mapa) => async (desde) => [...mapa.values()].filter((f) => !desde || f.servidor > desde).sort((a, b) => a.servidor.localeCompare(b.servidor)).map((f) => structuredClone(f));
  const yo = { usuario: async () => 'u1', leer: leer(srv.copias), subir: lww(srv.copias, 'carta'), leerAlbumes: leer(srv.albumes), subirAlbumes: lww(srv.albumes, 'id') };
  const pc = await Almacen.abrir('alb-pc-' + sufijo), movil = await Almacen.abrir('alb-movil-' + sufijo), res = {};
  const registro = { id: 'mio-prueba-ab12', nombre: 'Mi álbum', lomo: { diseno: 'editorial', material: 'cuero' }, ruta: 'x' };
  await pc.guardarAlbumPropio({ id: 'mio-prueba-ab12', registro, datos: { catalogo: { cartas: [{ id: 'a-1' }] }, precios: { cartas: {} } } });
  const r1 = await sincronizar(pc, yo); await espera(); const r2 = await sincronizar(movil, yo);
  res.llega = { r2: r2.albumes, movil: (await movil.albumesPropios()).map((a) => a.registro.nombre), pendPc: (await pc.albumesParaSubir()).length };
  await espera(); await movil.quitarAlbumPropio('mio-prueba-ab12'); await sincronizar(movil, yo); const r3 = await sincronizar(pc, yo);
  res.quitado = { r3: r3.albumes, pc: (await pc.albumesPropios()).length, servidor: srv.albumes.get('mio-prueba-ab12')?.borrado };
  const viejo = await pc.aplicarAlbumesRemotos([{ id: 'mio-prueba-ab12', datos: { registro, datos: { catalogo: { cartas: [] } } }, borrado: false, actualizado: '2020-01-01T00:00:00Z' }]);
  res.viejoNoResucita = viejo.length === 0 && (await pc.albumesPropios()).length === 0;
  res.raro = await pc.aplicarAlbumesRemotos([{ id: '../malo', datos: {}, actualizado: '2031-01-01T00:00:00Z' }]);
  pc.cerrar(); movil.cerrar(); for (const n of ['alb-pc-' + sufijo, 'alb-movil-' + sufijo]) indexedDB.deleteDatabase(n);
  return res;
}, sufijo);
ok(JSON.stringify(alb.llega.movil) === '["Mi álbum"]' && alb.llega.r2.includes('mio-prueba-ab12') && alb.llega.pendPc === 0, 'álbum creado en el ordenador: llega al móvil ' + JSON.stringify(alb.llega));
ok(alb.quitado.pc === 0 && alb.quitado.servidor === true && alb.quitado.r3.includes('mio-prueba-ab12'), 'quitado en el móvil: desaparece del ordenador (en la cuenta queda como borrado) ' + JSON.stringify(alb.quitado));
ok(alb.viejoNoResucita, 'una versión vieja del álbum no lo resucita');
ok(Array.isArray(alb.raro) && alb.raro.length === 0, 'álbumes con id raro de la cuenta se ignoran');
const img = await pag.evaluate(async (sufijo) => {
  const { Almacen } = await import('/web/js/almacen.js');
  const { sincronizar } = await import('/web/js/sincronizacion.js');
  const espera = () => new Promise((ok) => setTimeout(ok, 8));
  const srv = { copias: new Map(), imagenes: new Map(), n: 0 };
  const lww = (mapa, clave) => async (filas) => filas.map((f) => { const v = mapa.get(f[clave]); if (v && Date.parse(f.actualizado) < Date.parse(v.actualizado)) return structuredClone(v);
    const n = { ...structuredClone(f), servidor: new Date(Date.UTC(2030, 0, 1) + ++srv.n).toISOString() }; mapa.set(f[clave], n); return structuredClone(n); });
  const leer = (mapa) => async (desde) => [...mapa.values()].filter((f) => !desde || f.servidor > desde).sort((a, b) => a.servidor.localeCompare(b.servidor)).map((f) => structuredClone(f));
  const yo = { usuario: async () => 'u1', leer: leer(srv.copias), subir: lww(srv.copias, 'carta'), leerImagenes: leer(srv.imagenes), subirImagenes: lww(srv.imagenes, 'carta') };
  const pc = await Almacen.abrir('img-pc-' + sufijo), movil = await Almacen.abrir('img-movil-' + sufijo), res = {};
  const foto = 'data:image/jpeg;base64,' + btoa('foto de prueba');
  await pc.guardarImagenPropia('tk-hs-r-4', foto);
  await sincronizar(pc, yo); await espera(); const r2 = await sincronizar(movil, yo);
  res.llega = { r2: r2.imagenes, movil: [...(await movil.imagenesPropias()).entries()] };
  await espera(); await movil.quitarImagenPropia('tk-hs-r-4'); await sincronizar(movil, yo); const r3 = await sincronizar(pc, yo);
  res.quitada = { r3: r3.imagenes, pc: (await pc.imagenesPropias()).size, servidor: srv.imagenes.get('tk-hs-r-4')?.borrado };
  res.rara = await pc.aplicarImagenesRemotas([{ carta: 'x', imagen: 'javascript:alert(1)', actualizado: '2031-01-01T00:00:00Z' }]);
  let tipo = null; try { await pc.guardarImagenPropia('x', 'https://otro.sitio/a.png'); } catch (e) { tipo = e.message; }
  res.noData = tipo;
  pc.cerrar(); movil.cerrar(); for (const n of ['img-pc-' + sufijo, 'img-movil-' + sufijo]) indexedDB.deleteDatabase(n);
  return res;
}, sufijo);
ok(JSON.stringify(img.llega.movil) === JSON.stringify([['tk-hs-r-4', 'data:image/jpeg;base64,' + Buffer.from('foto de prueba').toString('base64')]]) && img.llega.r2.includes('tk-hs-r-4'), 'imagen propia puesta en el ordenador: llega al móvil');
ok(img.quitada.pc === 0 && img.quitada.servidor === true && img.quitada.r3.includes('tk-hs-r-4'), 'quitada en el móvil: desaparece del ordenador ' + JSON.stringify(img.quitada));
ok(Array.isArray(img.rara) && img.rara.length === 0, 'de la cuenta solo se aceptan imágenes (data:image/…), nada más');
ok(img.noData === 'imagen no válida', 'el dispositivo tampoco guarda direcciones externas como «imagen propia»');
const imp = await pag.evaluate(async (sufijo) => {
  const { Almacen } = await import('/web/js/almacen.js');
  const a = await Almacen.abrir('sync-imp-' + sufijo), res = {};
  await a.fijar('x-1', 1); await a.fijar('x-2', 1);
  await a.confirmarSubidas((await a.filasParaSubir(await a.pendientes())));          // como si ya estuvieran subidas
  res.limpio = (await a.pendientes()).size;
  await a.importar(new Map([['x-1', 1], ['x-3', 1], ['x-4', 1]]), 'combinar');       // «Añadir todas»: x-1 ya estaba igual
  res.combinar = [...(await a.pendientes()).keys()].sort();
  await a.confirmarSubidas((await a.filasParaSubir(await a.pendientes())));
  await a.importar(new Map([['x-1', 1]]), 'reemplazar');                             // «Eliminar todas» / copia de seguridad
  res.reemplazar = [...(await a.pendientes()).keys()].sort();
  const filas = await a.filasParaSubir(await a.pendientes());
  res.bajas = filas.filter((f) => f.cantidad === 0).map((f) => f.carta).sort();
  await a.confirmarSubidas(filas); await a.deshacerImportacion();
  res.deshacer = [...(await a.pendientes()).keys()].sort();
  a.cerrar(); indexedDB.deleteDatabase('sync-imp-' + sufijo);
  return res;
}, sufijo);
ok(imp.limpio === 0 && JSON.stringify(imp.combinar) === '["x-3","x-4"]', 'añadir todas: quedan pendientes solo las cartas que cambian ' + JSON.stringify(imp.combinar));
ok(JSON.stringify(imp.reemplazar) === '["x-2","x-3","x-4"]' && JSON.stringify(imp.bajas) === '["x-2","x-3","x-4"]', 'eliminar todas / importar: las cartas quitadas se suben como bajas (0) ' + JSON.stringify(imp.bajas));
ok(JSON.stringify(imp.deshacer) === '["x-2","x-3","x-4"]', 'deshacer la importación también se sube ' + JSON.stringify(imp.deshacer));
ok(errores.length === 0, 'sin errores de consola/JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
await ctx.close(); await nav.close(); servidor.close();
console.log(`\n${total} comprobaciones, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
