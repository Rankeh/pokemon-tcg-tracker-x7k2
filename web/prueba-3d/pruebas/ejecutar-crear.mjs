// 3.37 · Prueba de navegador: CREAR UN ÁLBUM DESDE LA APP (biblioteca → «Nuevo álbum» → visor 3D), con IndexedDB real y Three.js REAL
// (npm install --no-save three@0.160.0) en Chromium con SwiftShader. TCGdex simulado: una expansión de prueba de 3 cartas.
// Uso:  node web/prueba-3d/pruebas/ejecutar-crear.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
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
const dirThree = path.join(raiz, 'node_modules/three');                    // Three.js real: npm install --no-save three@0.160.0 (no se versiona)
try { await readFile(path.join(dirThree, 'build/three.module.js')); } catch { console.error('Falta Three.js: npm install --no-save --no-package-lock three@0.160.0'); process.exit(2); }
const nav = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fallos = 0, total = 0;
const ok = (c, msg) => { total++; console.log((c ? 'OK      ' : 'FALLO   ') + msg); if (!c) fallos++; };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------ TCGdex simulado
const IMG = 'https://assets.tcgdex.net/';
const carta = (n, nombre, dex, rarity, ilu = 'Ilustradora Prueba') => ({ id: 'x1-00' + n, localId: '00' + n, name: nombre, rarity, dexId: [dex], illustrator: ilu,
  set: { id: 'x1', name: 'Test Set' }, variants: { normal: true, reverse: true, holo: false }, image: IMG + 'en/sv/x1/00' + n,
  pricing: { cardmarket: { trend: n * 2.5, low: n, updated: '2026-11-20T00:00:00Z' } } });
const CARTAS = [carta(1, 'Charmander', 4, 'Common'), carta(2, 'Charizard ex', 6, 'Special illustration rare', 'Otra Persona'), carta(3, 'Pikachu', 25, 'Rare'),
  { ...carta(4, 'Mewtwo', 150, 'Rare'), image: undefined }];                  // 3.39: sin imagen en TCGdex → la de limitlesstcg
const pedidas = [];
const tcgdex = (u) => {
  const p = decodeURIComponent(new URL(u).pathname + new URL(u).search).replace('/v2/', '');
  pedidas.push(p);
  if (p === 'es/sets') return [{ id: 'x1', name: 'Expansión de Prueba', cardCount: { total: 3 } }, { id: 'A1', name: 'Pocket digital', cardCount: { total: 9 } }];
  if (p === 'en/series/tcgp') return { id: 'tcgp', sets: [{ id: 'A1' }] };
  if (p === 'en/illustrators') return ['Ilustradora Prueba', 'Otra Persona', 'Mitsuhiro Arita'];
  if (p === 'en/sets/x1') return { id: 'x1', name: 'Test Set', serie: { id: 'sv' }, abbreviation: { official: 'TST' }, cards: CARTAS.map((c) => ({ id: c.id })) };
  if (p === 'es/sets/x1') return { id: 'x1', name: 'Expansión de Prueba', cards: CARTAS.map((c) => ({ id: c.id, name: c.name, image: c.image && IMG + 'es/sv/x1/' + c.localId })) };
  const m = /^en\/cards\/(x1-\d+)$/.exec(p); if (m) return CARTAS.find((c) => c.id === m[1]) ?? null;
  if (p === 'en/cards?illustrator=eq:Ilustradora Prueba') return CARTAS.filter((c) => c.illustrator === 'Ilustradora Prueba').map((c) => ({ id: c.id }));
  if (/^(en|es)\/cards\?name=eq:Pikachu$/.test(p)) return [{ id: 'x1-003' }];
  if (/cards\?name=eq:/.test(p)) return [];
  return null;
};
const imagen = await readFile(path.join(raiz, 'web/prueba-3d/assets/cartas/mini/sv06-034.webp'));
const pedidasImg = [];
async function preparar(ctx) {
  await ctx.route('**/cdn.jsdelivr.net/npm/three@0.160.0/**', async (r) => {
    const rel = new URL(r.request().url()).pathname.replace('/npm/three@0.160.0/', '');
    r.fulfill({ contentType: 'text/javascript', body: await readFile(path.join(dirThree, rel)) });
  });
  await ctx.route('**/api.tcgdex.net/**', (r) => { const d = tcgdex(r.request().url()); r.fulfill(d === null ? { status: 404, body: '{}' } : { contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) }); });
  await ctx.route('**/functions/v1/imagen-limitless**', (r) => {            // intermediario de limitlesstcg (Supabase), simulado
    const q = new URL(r.request().url()).searchParams; pedidasImg.push(r.request().url());
    if (q.get('buscar')) return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ ruta: q.get('set') === 'TST' && q.get('num') === '004' ? 'TST/TST_004_R_ES_LG.png' : null }), status: q.get('num') === '004' ? 200 : 404 });
    return r.fulfill({ contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: imagen });
  });
  await ctx.route('**/assets.tcgdex.net/**', (r) => { pedidasImg.push(r.request().url()); r.fulfill({ contentType: 'image/webp', headers: { 'access-control-allow-origin': '*' }, body: imagen }); });
}

const bd = 'prueba-crear-' + Math.random().toString(36).slice(2);
const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
await preparar(ctx);
const pag = await ctx.newPage(); const errores = [];
pag.on('pageerror', (e) => errores.push(String(e))); pag.on('console', (m) => m.type() === 'error' && !/404|Failed to load resource/.test(m.text()) && errores.push(m.text()));
pag.on('dialog', (d) => d.accept());                                 // confirmación de «Quitar de la biblioteca»
await pag.goto(`${base}/web/prueba-3d/pruebas/integracion.html`).catch(() => {});      // una página del sitio, para poder usar localStorage
const biblioteca = async () => {
  await pag.goto(`${base}/index.html?bd=${bd}`);
  await pag.waitForFunction(() => document.body.classList.contains('lista'), null, { timeout: 90000 });
};
const crear = async (tipo, rellenar) => {
  await pag.evaluate(() => localStorage.setItem('biblioteca.sel', 'nuevo')); await biblioteca();
  ok(await pag.isHidden('#quitar-album'), `«Nuevo álbum» seleccionado: no se ofrece «Quitar» (${tipo})`);
  await pag.click('#abrir'); await pag.waitForSelector('#d-nuevo[open]');
  await pag.click(`[data-tipo="${tipo}"]`); await rellenar();
  await pag.click('#n-crear');
  await pag.waitForFunction(() => !document.getElementById('d-nuevo').open || document.getElementById('n-estado').dataset.tipo === 'error', null, { timeout: 30000 });
};
const propios = () => pag.evaluate(async (bd) => { const { Almacen } = await import('/web/js/almacen.js'); const a = await Almacen.abrir(bd);
  const r = (await a.albumesPropios()).map((x) => ({ id: x.id, nombre: x.registro.nombre, cartas: x.datos.catalogo.cartas.length, portada: x.registro.portada.cartas, tipo: x.registro.definicion.tipo }));
  const pend = (await a.albumesParaSubir()).map((x) => x.id); a.cerrar(); return { albumes: r, pend }; }, bd);

// 0) 3.38 · visitante (sin la cuenta del administrador): biblioteca vacía, solo «Nuevo álbum»; los álbumes de la web, cerrados
await pag.evaluate(() => localStorage.removeItem('biblioteca.sel'));
await pag.goto(`${base}/index.html?bd=${bd}&visitante`);
await pag.waitForFunction(() => document.body.classList.contains('lista'), null, { timeout: 90000 });
const vis = await pag.evaluate(() => ({ items: window.__biblioteca.estado().items, enlaces: document.querySelectorAll('#lista-albumes a').length, contador: document.getElementById('contador').textContent }));
ok(JSON.stringify(vis.items) === '["nuevo"]' && vis.enlaces === 0, 'visitante: la biblioteca solo tiene «Nuevo álbum» ' + JSON.stringify(vis));
ok((await pag.textContent('#i-titulo')) === 'Nuevo álbum' && (await pag.textContent('#abrir')).includes('Crear'), 'visitante: lo primero que ve es «Crear álbum»');
await pag.goto(`${base}/web/prueba-3d/index.html?album=osare&bd=${bd}&visitante`); await dormir(2500);
ok((await pag.textContent('#cargando')).includes('privado'), 'visitante: un álbum de la web, aunque se escriba su dirección, está cerrado');
await pag.goto(`${base}/web/prueba-3d/pruebas/integracion.html`).catch(() => {});

// 1) por expansión, eligiendo en el buscador
await crear('expansion', async () => {
  await dormir(400);
  ok(!(await pag.textContent('#n-exp-lista')).includes('Pocket'), 'el buscador de expansiones no ofrece las de TCG Pocket');
  await pag.fill('#n-exp', 'prueba'); await pag.click('#n-exp-lista button');
  ok(await pag.inputValue('#n-exp') === 'Expansión de Prueba', 'buscar «prueba» (sin tilde) encuentra «Expansión de Prueba»');
});
ok(!(await pag.evaluate(() => document.getElementById('d-nuevo').open)), 'se crea y se cierra la ventana');
let p = await propios();
const exp = p.albumes.find((a) => a.tipo === 'expansion');
ok(exp && exp.nombre === 'Expansión de Prueba' && exp.cartas === 4, 'álbum guardado en el dispositivo con sus 4 cartas: ' + JSON.stringify(exp));
ok(exp?.portada[0]?.includes('/es/sv/x1/002'), 'portada con la carta más vistosa (la SIR) en español: ' + exp?.portada);
ok(p.pend.includes(exp?.id), 'queda pendiente de subir a la cuenta (para el resto de dispositivos)');
await pag.waitForFunction(() => document.getElementById('i-titulo').textContent === 'Expansión de Prueba', null, { timeout: 15000 }).catch(() => {});   // la lista se recarga tras crear
ok((await pag.textContent('#i-titulo')) === 'Expansión de Prueba' && await pag.isVisible('#quitar-album'), 'la biblioteca lo enseña seleccionado, con «Quitar de la biblioteca»');
ok((await pag.textContent('#filtros')).includes('Mis álbumes'), 'filtro «Mis álbumes»');
ok(await pag.evaluate((id) => !!document.querySelector(`#lista-albumes a[href$="album=${id}"]`), exp.id), 'también en la lista de enlaces (teclado y lectores de pantalla)');

// 2) abrirlo en el visor 3D: modelo de 1 hoja, imágenes de TCGdex, ficha con su imagen
const marcar = (id, n) => pag.evaluate(async ([bd, id, n]) => { const { Almacen } = await import('/web/js/almacen.js'); const a = await Almacen.abrir(bd); await a.fijar(id, n); a.cerrar(); }, [bd, id, n]);
await marcar('x1-002', 1);
await pag.goto(`${base}/web/prueba-3d/index.html?album=${exp.id}&bd=${bd}`);
const abrio = await pag.waitForFunction(() => window.__album3d && document.getElementById('cargando').hidden, null, { timeout: 120000 }).then(() => true, () => false);
ok(abrio, 'el visor 3D abre el álbum creado' + (abrio ? '' : ': ' + await pag.textContent('#cargando')));
if (abrio) {
  const v = await pag.evaluate(() => { const a = window.__album3d; return { hojas: a.album.geo.n, cartas: a.adaptador.mapa.cartas.length, titulo: document.title, orden: a.adaptador.mapa.paginas[0].bolsillos.slice(0, 3).map((c) => c?.nombre) }; });
  ok(v.hojas === 1 && v.cartas === 4, `modelo de 1 hoja (album-1h.glb) y 4 cartas (${JSON.stringify(v)})`);
  ok(v.titulo === 'Álbum Expansión de Prueba', 'título del álbum');
  ok(JSON.stringify(v.orden) === '["Charmander","Charizard ex","Pikachu"]', 'en orden de Pokédex');
  await marcar('x1-004', 1);
  await pag.click('#b-abrir'); await pag.waitForFunction(() => !window.__album3d.album.estado.animando, null, { timeout: 60000 }); await dormir(1500);
  ok(pedidasImg.some((u) => u.endsWith('/es/sv/x1/002/low.webp')), 'la carta marcada se pinta con la imagen pequeña de TCGdex (en español)');
  await pag.evaluate(() => { const a = window.__album3d; a.ctrl.ultimoCierre = -Infinity; a.ctrl.seleccionar(a.adaptador.mapa.porId.get('x1-002').nombre); });
  await dormir(800);
  ok((await pag.getAttribute('#f-imagen img', 'src') || '').endsWith('/es/sv/x1/002/high.webp'), 'la ficha usa la imagen grande de TCGdex');
  ok((await pag.textContent('#ficha')).includes('Rara Ilustración Especial') && (await pag.textContent('#ficha')).includes('5'), 'ficha con rareza en castellano y precio');
  await pag.click('#f-cerrar'); await dormir(600);
  await pag.evaluate(() => { const a = window.__album3d; a.ctrl.ultimoCierre = -Infinity; a.ctrl.seleccionar(a.adaptador.mapa.porId.get('x1-004').nombre); }); await dormir(800);
  ok((await pag.getAttribute('#f-imagen img', 'src') || '').includes('imagen-limitless?ruta=TST%2FTST_004_R_ES_LG.png'), 'carta sin imagen en TCGdex: la ficha usa la de limitlesstcg (vía Supabase)');
}

// 3) por Pokémon y por ilustrador (sugerencias)
await crear('pokemon', async () => { await pag.fill('#n-pok', 'Pikachu'); });
await crear('ilustrador', async () => { await dormir(300); await pag.fill('#n-ilu', 'ilus'); await pag.click('#n-ilu-lista button'); await pag.fill('#n-nombre', 'Mi ilustradora'); });
p = await propios();
ok(p.albumes.some((a) => a.tipo === 'pokemon' && a.nombre === 'Pikachu' && a.cartas === 1), 'álbum de Pokémon (Pikachu, 1 carta)');
ok(p.albumes.some((a) => a.tipo === 'ilustrador' && a.nombre === 'Mi ilustradora' && a.cartas === 3), 'álbum de ilustrador con nombre propio (3 cartas, sin la de otra persona)');

// 4) errores: nombre que no existe → aviso y no se guarda nada; sin elegir → aviso
await crear('pokemon', async () => { await pag.fill('#n-pok', 'Noexiste'); });
ok((await pag.textContent('#n-estado')).includes('no tiene cartas') && (await propios()).albumes.length === 3, 'Pokémon que no existe: lo explica y no guarda nada');
await pag.click('#n-cancelar');
await pag.click('#abrir'); await pag.click('[data-tipo="ilustrador"]'); await pag.click('#n-crear');
ok((await pag.textContent('#n-estado')).includes('Elige un ilustrador'), 'sin elegir: dice qué falta');
await pag.click('#n-cancelar');

// 5) quitar: desaparece, pero la carta marcada sigue en la colección
await pag.evaluate((id) => localStorage.setItem('biblioteca.sel', id), exp.id); await biblioteca();
await pag.click('#quitar-album'); await dormir(800);
p = await propios();
const sigue = await pag.evaluate(async (bd) => { const { Almacen } = await import('/web/js/almacen.js'); const a = await Almacen.abrir(bd); const n = await a.cantidad('x1-002'); a.cerrar(); return n; }, bd);
ok(!p.albumes.some((a) => a.id === exp.id) && p.pend.includes(exp.id), 'quitado de la biblioteca (y la baja, pendiente de subir a la cuenta)');
ok(sigue === 1, 'la carta marcada de ese álbum sigue en la colección');
await pag.goto(`${base}/web/prueba-3d/index.html?album=${exp.id}&bd=${bd}`); await dormir(3000);
ok((await pag.textContent('#cargando')).includes('otro dispositivo'), 'abrir un álbum que no está aquí lo explica');
const inesperados = errores.filter((e) => !/otro dispositivo|privado/.test(e));     // los avisos de «no está aquí» y «privado» son esperados
ok(inesperados.length === 0, 'sin errores de JS' + (inesperados.length ? ': ' + inesperados.join(' | ') : ''));
await ctx.close(); await nav.close(); servidor.close();
console.log(`\n${total} comprobaciones, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
