// 3.36 · Prueba de navegador de la página de CUENTA: entrar con Google (Supabase simulado: no hay red ni cuenta real en las pruebas).
// Uso:  node web/prueba-3d/pruebas/ejecutar-cuenta.mjs
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
const nav = await chromium.launch();
let fallos = 0, total = 0;
const ok = (c, msg) => { total++; console.log((c ? 'OK      ' : 'FALLO   ') + msg); if (!c) fallos++; };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const doble = (sesion) => `
window.__oauth = [];
export function createClient() { return {
  auth: { getSession: async () => ({ data: { session: ${sesion ? "{ user: { id: 'u1', email: 'yo@gmail.com', user_metadata: { full_name: 'Fran de Google' } } }" : 'null'} } }),
    onAuthStateChange() {}, signOut: async () => {}, signInWithOAuth: async (o) => { window.__oauth.push(o); return { error: null }; } },
  from: () => { const q = { select: () => q, eq: () => q, gt: () => q, order: () => q, range: async () => ({ data: [], error: null }), upsert: () => ({ select: async () => ({ data: [], error: null }) }),
    maybeSingle: async () => ({ data: { nombre_usuario: null }, error: null }) }; return q; } }; }`;
async function abrir(google, sesion = false, consulta = '') {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pag = await ctx.newPage(); const errores = [];
  pag.on('pageerror', (e) => errores.push(String(e)));
  await pag.route('**/cdn.jsdelivr.net/npm/@supabase/**', (r) => r.fulfill({ contentType: 'text/javascript', body: doble(sesion) }));
  await pag.route('**/auth/v1/settings', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ external: { email: true, google } }) }));
  await pag.goto(`${base}/web/cuenta.html${consulta}`); await dormir(700);
  return { ctx, pag, errores };
}
{
  const { ctx, pag, errores } = await abrir(false);
  ok(await pag.isVisible('#entrar-google') && (await pag.textContent('#entrar-google')).includes('Continuar con Google'), 'botón «Continuar con Google» visible sin sesión');
  await pag.click('#entrar-google'); await dormir(400);
  ok((await pag.textContent('#mensaje')).includes('aún no está activado') && (await pag.evaluate(() => window.__oauth.length)) === 0,
    'Google desactivado en Supabase: avisa y NO lleva a una página de error');
  ok(!(await pag.isDisabled('#entrar-google')), 'el botón vuelve a estar disponible');
  ok(errores.length === 0, 'sin errores de JS ' + errores.join(' | '));
  await ctx.close();
}
{
  const { ctx, pag } = await abrir(true);
  await pag.click('#entrar-google'); await dormir(400);
  const o = await pag.evaluate(() => window.__oauth[0]);
  ok(o?.provider === 'google' && o.options.redirectTo === `${base}/web/cuenta.html`, 'Google activado: pide entrar con Google y volver a la página de cuenta ' + JSON.stringify(o));
  await ctx.close();
}
{
  const { ctx, pag } = await abrir(true, false, '?error=access_denied&error_description=The+user+denied');
  ok((await pag.textContent('#mensaje')).includes('Has cancelado'), 'al volver de Google tras cancelar: lo explica en castellano');
  ok(!new URL(pag.url()).search, 'y limpia la dirección');
  await ctx.close();
}
{
  const { ctx, pag } = await abrir(true, true);
  ok((await pag.textContent('#usuario')) === 'Fran de Google' && await pag.isHidden('#formularios'), 'con sesión de Google: saluda con el nombre de la cuenta de Google');
  await ctx.close();
}
await nav.close(); servidor.close();
console.log(`\n${total} comprobaciones, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
