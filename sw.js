// Service worker de la app instalada (PWA): la web funciona sin conexión y las imágenes salen del dispositivo.
//  · Código, páginas, catálogos y precios: SIEMPRE primero la red (así un cambio publicado se ve al momento); sin red, la copia guardada.
//  · Imágenes de cartas, modelos 3D, iconos y Three.js (versión fija): primero la copia guardada; si no está, la red (y se guarda).
//  · Imágenes de TCGdex (álbumes creados en la app, 3.37): primero la copia guardada (no cambian nunca para una misma dirección).
//  · Supabase (cuenta y sincronización), la API de TCGdex y cualquier otro sitio: nunca se guardan, van siempre en directo.
// La lista de lo que se guarda al instalar está en precache.json (herramientas/pwa/generar_precache.py).
const NUCLEO = 'nucleo-v1', RECURSOS = 'recursos-v1', CACHES = [NUCLEO, RECURSOS];
const RAIZ = new URL('./', self.location).href;
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/', SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/';
const ESPERA_PAGINA_MS = 5000;                     // una página que no llega en 5 s (cobertura mala) se sirve de la copia guardada

const TCGDEX_IMG = 'https://assets.tcgdex.net/';
const esRecurso = (url) => url.startsWith(THREE) || url.startsWith(SUPABASE_JS) || url.startsWith(TCGDEX_IMG) ||
  (url.startsWith(RAIZ) && /\.(webp|png|jpg|jpeg|svg|glb)$/i.test(new URL(url).pathname));
const delNucleo = (url) => url.startsWith(RAIZ);

async function guardarLista(cache, urls, { reintentar = false } = {}) {
  const ya = new Set((await cache.keys()).map((r) => r.url));
  for (const u of urls) {
    const url = new URL(u, RAIZ).href;
    if (ya.has(url) && !reintentar) continue;
    try { const r = await fetch(url, { cache: 'no-cache' }); if (r.ok) await cache.put(url, r); } catch { /* sin red: se intentará la próxima vez */ }
  }
}
/** Revisa precache.json y guarda lo que falte: el núcleo se refresca entero, las miniaturas y Three.js solo si faltan. */
async function actualizarCopias({ refrescarNucleo }) {
  let lista;
  try { const r = await fetch(new URL('precache.json', RAIZ).href, { cache: 'no-cache' }); if (!r.ok) return; lista = await r.json(); } catch { return; }
  await guardarLista(await caches.open(NUCLEO), lista.nucleo, { reintentar: refrescarNucleo });
  const rec = await caches.open(RECURSOS);
  await guardarLista(rec, lista.externos);
  await guardarLista(rec, lista.miniaturas);
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    // lo imprescindible para abrir la app sin conexión; las miniaturas siguen en segundo plano tras activarse
    try {
      const lista = await (await fetch(new URL('precache.json', RAIZ).href, { cache: 'no-cache' })).json();
      await guardarLista(await caches.open(NUCLEO), lista.nucleo, { reintentar: true });
      await guardarLista(await caches.open(RECURSOS), lista.externos);
    } catch { /* sin red al instalar: se completará al abrir la app con conexión */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!CACHES.includes(k)) await caches.delete(k);   // copias de versiones anteriores del service worker
    await self.clients.claim();
  })());
});

// la página avisa al abrirse con conexión: se revisa la lista en segundo plano (álbumes nuevos, miniaturas que faltan)
self.addEventListener('message', (e) => {
  if (e.data?.tipo === 'revisar') e.waitUntil(actualizarCopias({ refrescarNucleo: false }));
});

async function primeroRed(req, { espera = 0 } = {}) {
  const cache = await caches.open(NUCLEO);
  const red = fetch(req).then(async (r) => { if (r.ok && r.type !== 'opaque') await cache.put(req, r.clone()); return r; });
  red.catch(() => {});                                        // si se sirvió la copia por lentitud y luego falla, no es un error
  try {
    if (!espera) return await red;
    return await Promise.race([red, new Promise((_, no) => setTimeout(() => no(new Error('lenta')), espera))]);
  } catch (err) {
    const guardada = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (guardada) return guardada;
    if (espera) { try { return await red; } catch { /* tampoco */ } }
    throw err;
  }
}

async function primeroCopia(req, e) {
  const cache = await caches.open(RECURSOS);
  const guardada = await cache.match(req);
  if (guardada) {
    // imágenes y modelos propios: se comprueba en segundo plano si han cambiado (GitHub Pages responde «sin cambios» casi gratis)
    if (req.url.startsWith(RAIZ)) e.waitUntil(fetch(req, { cache: 'no-cache' }).then((r) => r.ok && cache.put(req, r)).catch(() => {}));
    return guardada;
  }
  const r = await fetch(req);
  if (r.ok) await cache.put(req, r.clone());
  return r;
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = req.url;
  if (req.method === 'HEAD' && url.startsWith(RAIZ)) {        // comprobación de la copia local de Three.js: sin red, «no está» (y se usa la guardada)
    e.respondWith(fetch(req).catch(() => new Response(null, { status: 504 })));
    return;
  }
  if (req.method !== 'GET') return;                           // guardar en la cuenta, etc.: siempre en directo
  if (esRecurso(url)) { e.respondWith(primeroCopia(req, e)); return; }
  if (delNucleo(url)) { e.respondWith(primeroRed(req, { espera: req.mode === 'navigate' ? ESPERA_PAGINA_MS : 0 })); return; }
  // resto (Supabase, Cardmarket…): sin tocar
});
