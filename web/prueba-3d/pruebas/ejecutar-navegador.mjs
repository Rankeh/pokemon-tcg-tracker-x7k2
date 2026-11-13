// Ejecuta integracion.html en Chromium (Playwright) con IndexedDB real, en un perfil desechable. Uso:  node web/prueba-3d/pruebas/ejecutar-navegador.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const servidor = http.createServer(async (req, res) => {
  try {
    const ruta = path.join(raiz, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!ruta.startsWith(raiz)) throw new Error('fuera');
    res.writeHead(200, { 'Content-Type': tipos[path.extname(ruta)] || 'application/octet-stream' }); res.end(await readFile(ruta));
  } catch { res.writeHead(404); res.end('no'); }
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const { chromium } = createRequire(import.meta.url)('playwright');
const nav = await chromium.launch();
const pag = await (await nav.newContext()).newPage();            // contexto nuevo = IndexedDB vacío y desechable
const errores = []; pag.on('pageerror', (e) => errores.push(String(e))); pag.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
await pag.goto(`http://127.0.0.1:${servidor.address().port}/web/prueba-3d/pruebas/integracion.html?nombre-real=1`);
await pag.waitForFunction(() => window.__resultado, null, { timeout: 120000 });
const r = await pag.evaluate(() => window.__resultado);
console.log(r.lineas.join('\n'));
console.log(`\n${r.total} pruebas, ${r.fallos.length} fallos, ${errores.length} errores de consola`);
r.fallos.forEach((f) => console.log('FALLO', f.nombre, f.error));
errores.forEach((e) => console.log('ERROR', e));
await nav.close(); servidor.close();
process.exit(r.fallos.length || errores.length || r.total < 14 ? 1 : 0);
