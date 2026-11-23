// Intermediario de imágenes de cartas para las que TCGdex no tiene imagen (3.39; 3.41: también cartas antiguas).
// Limitless no envía CORS, así que el navegador no puede usar sus imágenes como texturas 3D: esta función las pide y las devuelve con CORS.
// Solo imágenes de cartas, con la forma exacta de sus rutas: no se puede usar para pedir ninguna otra cosa. Sin sesión (imágenes públicas).
//   ?buscar=1&id=<expansión de TCGdex>&num=<número>[&set=<código oficial, p. ej. CRZ:GG>]  → { ruta } o { pio } o 404
//   ?ruta=CRZ/CRZ_GG19_R_ES_LG.png   → imagen de limitlesstcg (cartas desde Blanco y Negro, 2011)
//   ?pio=base1/4_hires.png           → imagen de pokemontcg.io (la que usa limitlesstcg para las cartas antiguas)
//   ?tcgdex=es/sv/sv03/223/low.webp  → imagen de TCGdex (3.41: sus imágenes en español llevan la cabecera CORS duplicada y los
//                                      navegadores las rechazan para el 3D; aquí se devuelven con una sola)
// Orden de búsqueda: carpeta de limitlesstcg (español, luego inglés) → la imagen que enseña su página de la carta → pokemontcg.io.
const TPCI = "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/";
const PIO = "https://images.pokemontcg.io/";
const RUTA = /^[A-Z0-9]{2,6}\/[A-Z0-9]{2,6}_[A-Za-z0-9]{1,10}_(R|U|C|RR)_(ES|EN)_LG\.png$/;
const RUTA_PIO = /^[a-z0-9]{2,12}\/[A-Za-z0-9]{1,10}(_hires)?\.png$/;
const TCGDEX = "https://assets.tcgdex.net/";
const RUTA_TCGDEX = /^[a-z]{2}(-[a-z]{2})?\/[a-z0-9-]{1,12}\/[A-Za-z0-9.-]{1,20}\/[A-Za-z0-9-]{1,12}\/(low|high)\.webp$/;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
// Expansiones cuyo código en Limitless no es el «oficial» de TCGdex (comprobadas a mano: 3.15, 3.33, 3.35)
// 3.41 · Colección Clásica del 30.º Aniversario: Limitless la numera en OTRO orden (su CC18 es N, el 018 de TCGdex es Gengar). Tabla cruzada por
// nombre con las 30 páginas de limitlesstcg.com/cards/30C/CC1…CC30; en esta colección se usa SIEMPRE la tabla, nunca el número.
const CLASICA_30: Record<string, string> = { "001": "CC2", "002": "CC8", "003": "CC11", "004": "CC20", "005": "CC3", "006": "CC9", "007": "CC5", "008": "CC25", "009": "CC22", "010": "CC13", "011": "CC14", "012": "CC27", "013": "CC24", "014": "CC1", "015": "CC4", "016": "CC19", "017": "CC23", "018": "CC15", "019": "CC16", "020": "CC17", "021": "CC18", "022": "CC12", "023": "CC21", "024": "CC6", "025": "CC10", "026": "CC28", "027": "CC29", "028": "CC26", "029": "CC7", "030": "CC30" };
const ESPECIALES: Record<string, { codigo: string; mapa?: Record<string, string> }> = {
  "swshp": { codigo: "SP" }, "svp": { codigo: "SVP" }, "mep": { codigo: "MEP" }, "30th-c": { codigo: "30C", mapa: CLASICA_30 },
};

// 3.42 · ids de pokemontcg.io que no coinciden con los de TCGdex (comprobados mirando las cartas): kits de entrenador EX y McDonald's
const PIO_IDS: Record<string, string> = { "tk-ex-latia": "tk1a", "tk-ex-latio": "tk1b", "tk-ex-p": "tk2a", "tk-ex-m": "tk2b" };
const idPio = (id: string) => PIO_IDS[id] ?? (/^20(\d\d)[a-z]+$/.exec(id) ? "mcd" + /^20(\d\d)/.exec(id)![1] : id);   // 2016xy → mcd16

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" } });

/** Variantes del número: tal cual, sin ceros tras las letras (TG05 → TG5), con 3 cifras y sin ceros (007 → 7). */
function numeros(base: string): string[] {
  return [...new Set([base, base.replace(/^([A-Za-z]+)0+(\d)/, "$1$2"), /^\d+$/.test(base) ? base.padStart(3, "0") : base, /^\d+$/.test(base) ? String(parseInt(base, 10)) : base])];
}

/** Código y número en Limitless para una carta de TCGdex. */
function enLimitless(set: string, num: string, id: string): { codigo: string; nums: string[] } | null {
  const esp = ESPECIALES[id];
  const [oficial, sub] = set.split(":");
  const codigo = esp?.codigo ?? oficial;
  if (!/^[A-Z0-9]{2,6}$/.test(codigo) || !/^[A-Za-z0-9]{1,10}$/.test(num)) return null;
  if (esp?.mapa) { const n = esp.mapa[String(parseInt(num, 10)).padStart(3, "0")]; return n ? { codigo, nums: [n] } : null; }
  let base = num.replace(/^SWSH/i, "");                                       // promos SWSH284 → 284
  if (sub && /^\d+$/.test(base)) base = sub + base;
  return { codigo, nums: numeros(base) };
}

/** Rutas candidatas en la carpeta de limitlesstcg: español antes que inglés. */
function candidatas(codigo: string, nums: string[]): string[] {
  const res: string[] = [];
  for (const lengua of ["ES", "EN"]) for (const rareza of ["R", "U", "C", "RR"]) for (const n of nums) res.push(`${codigo}/${codigo}_${n}_${rareza}_${lengua}_LG.png`);
  return res.filter((r) => RUTA.test(r));
}

/** La imagen que enseña la página de la carta en limitlesstcg.com (og:image), si es de una fuente permitida. */
async function dePagina(codigo: string, nums: string[]): Promise<{ ruta?: string; pio?: string } | null> {
  for (const n of nums.slice(0, 3)) {
    const r = await fetch(`https://limitlesstcg.com/cards/${codigo}/${n}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) continue;
    const og = /property="og:image"[^>]*content="([^"]+)"/i.exec(await r.text())?.[1] || "";
    const tpci = og.startsWith(TPCI) && og.slice(TPCI.length).replace(/_(SM|XS)\.png$/, "_LG.png");
    if (tpci && RUTA.test(tpci)) return { ruta: tpci };
    const pio = og.startsWith(PIO) && og.slice(PIO.length).replace(/(?<!_hires)\.png$/, "_hires.png");
    if (pio && RUTA_PIO.test(pio)) return { pio };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return json({ error: "solo GET" }, 405);
  const q = new URL(req.url).searchParams;
  if (q.get("buscar")) {
    const id = (q.get("id") || "").slice(0, 20), num = q.get("num") || "";
    if (!/^[a-z0-9.-]{1,20}$/i.test(id) || !/^[A-Za-z0-9]{1,10}$/.test(num)) return json({ error: "datos no válidos" }, 400);
    let set = q.get("set") || "";
    if (!set && !ESPECIALES[id]) {                                     // sin código: se lo pregunta a TCGdex
      const s = await fetch("https://api.tcgdex.net/v2/en/sets/" + encodeURIComponent(id)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      set = s?.abbreviation?.official || s?.tcgOnline || "";
    }
    const l = enLimitless(set, num, id);
    if (l) {
      for (const ruta of candidatas(l.codigo, l.nums).slice(0, 24)) if ((await fetch(TPCI + ruta, { method: "HEAD" })).ok) return json({ ruta });
      const p = await dePagina(l.codigo, l.nums);
      if (p) return json(p);
    }
    if (!ESPECIALES[id]?.mapa) for (const n of numeros(num.replace(/^([A-Za-z]+)0+(\d)/, "$1$2"))) {   // cartas antiguas: pokemontcg.io con el id de TCGdex (base1, ecard3…)
      const pio = `${idPio(id)}/${n}_hires.png`;
      if (RUTA_PIO.test(pio) && (await fetch(PIO + pio, { method: "HEAD" })).ok) return json({ pio });
    }
    return json({ ruta: null }, 404);
  }
  const ruta = q.get("ruta"), pio = q.get("pio"), tcgdex = q.get("tcgdex");
  const origen = ruta && RUTA.test(ruta) ? TPCI + ruta : pio && RUTA_PIO.test(pio) ? PIO + pio : tcgdex && RUTA_TCGDEX.test(tcgdex) ? TCGDEX + tcgdex : null;
  if (!origen) return json({ error: "ruta no válida" }, 400);
  const r = await fetch(origen);
  if (!r.ok) return json({ error: "no existe" }, 404);
  return new Response(r.body, { headers: { ...CORS, "Content-Type": tcgdex ? "image/webp" : "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
});
