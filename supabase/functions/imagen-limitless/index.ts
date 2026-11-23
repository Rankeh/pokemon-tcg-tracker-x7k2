// Intermediario de imágenes de cartas de limitlesstcg (3.39). Limitless no envía CORS, así que el navegador no puede usar sus imágenes como
// texturas 3D; esta función las pide y las devuelve con CORS. SOLO imágenes de cartas de ese servidor, con la forma exacta de su ruta:
// no se puede usar para pedir ninguna otra cosa. Sin sesión (las imágenes son públicas y deben verse también sin cuenta).
//   ?buscar=1&set=<código oficial, p. ej. CRZ:GG>&num=<número, p. ej. GG19>&id=<id de expansión de TCGdex>  → { ruta } o 404
//   ?ruta=CRZ/CRZ_GG19_R_ES_LG.png                                                                         → la imagen (PNG)
const ORIGEN = "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/";
const RUTA = /^[A-Z0-9]{2,6}\/[A-Z0-9]{2,6}_[A-Za-z0-9]{1,10}_(R|U|C|RR)_(ES|EN)_LG\.png$/;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
// Expansiones cuyo código en Limitless no es el «oficial» de TCGdex (comprobadas a mano: 3.15, 3.33, 3.35)
const ESPECIALES: Record<string, { codigo: string; prefijo?: string }> = {
  "swshp": { codigo: "SP" }, "svp": { codigo: "SVP" }, "mep": { codigo: "MEP" }, "30th-c": { codigo: "30C", prefijo: "CC" },
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" } });

/** Rutas candidatas en orden: español antes que inglés; el número tal cual, sin ceros tras las letras (TG05 → TG5) y con 3 cifras. */
function candidatas(set: string, num: string, id: string): string[] {
  const esp = ESPECIALES[id];
  const [oficial, sub] = set.split(":");
  const codigo = esp?.codigo ?? oficial;
  if (!/^[A-Z0-9]{2,6}$/.test(codigo) || !/^[A-Za-z0-9]{1,10}$/.test(num)) return [];
  let base = num.replace(/^SWSH/i, "");                                       // promos SWSH284 → 284
  if (esp?.prefijo) base = esp.prefijo + String(parseInt(base, 10));
  else if (sub && /^\d+$/.test(base)) base = sub + base;
  const nums = [...new Set([base, base.replace(/^([A-Za-z]+)0+(\d)/, "$1$2"), /^\d+$/.test(base) ? base.padStart(3, "0") : base, /^\d+$/.test(base) ? String(parseInt(base, 10)) : base])];
  const res: string[] = [];
  for (const lengua of ["ES", "EN"]) for (const rareza of ["R", "U", "C", "RR"]) for (const n of nums) res.push(`${codigo}/${codigo}_${n}_${rareza}_${lengua}_LG.png`);
  return res.filter((r) => RUTA.test(r));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return json({ error: "solo GET" }, 405);
  const q = new URL(req.url).searchParams;
  if (q.get("buscar")) {
    for (const ruta of candidatas(q.get("set") || "", q.get("num") || "", q.get("id") || "").slice(0, 24)) {
      const r = await fetch(ORIGEN + ruta, { method: "HEAD" });
      if (r.ok) return json({ ruta });
    }
    return json({ ruta: null }, 404);
  }
  const ruta = q.get("ruta") || "";
  if (!RUTA.test(ruta)) return json({ error: "ruta no válida" }, 400);
  const r = await fetch(ORIGEN + ruta);
  if (!r.ok) return json({ error: "no existe" }, 404);
  return new Response(r.body, { headers: { ...CORS, "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
});
