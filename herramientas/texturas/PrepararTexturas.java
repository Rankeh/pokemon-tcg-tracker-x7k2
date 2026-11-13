import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Fase 3.6.2 — Prepara las texturas LOCALES del álbum 3D a partir del catálogo (datos/catalogo/coleccion-teselia.json).
 *
 * Uso (desde la raíz del repositorio, solo hace falta el JDK):
 *     java herramientas/texturas/PrepararTexturas.java
 *     java herramientas/texturas/PrepararTexturas.java --solo sv10.5b-087        (una carta)
 *     java herramientas/texturas/PrepararTexturas.java --forzar                  (rehacer todo)
 *
 * Qué hace, carta por carta (las que el catálogo marca como 'sin-imagen' se saltan y quedan como ausentes):
 *  1. Descarga la imagen original de TCGdex (misma ruta que el catálogo pero en JPG; si no existe, PNG). El original NO se guarda ni se modifica.
 *  2. Comprueba que es una imagen válida y que tiene proporción de carta (≈ 63 × 88 mm).
 *  3. Escribe dos copias JPEG con la proporción original: mini (256 px de ancho, textura del bolsillo) y grande (480 px, ficha).
 *  4. Anota todo en web/prueba-3d/assets/cartas/manifiesto.json (id → archivos, tamaños, huella SHA-256 del original, URL de origen).
 * Es idempotente: lo ya hecho se omite (no hay duplicados) salvo con --forzar. Solo pide a TCGdex una imagen cada vez, con pausa.
 * Formato: JPEG porque el JDK no escribe WebP; Safari y Chrome lo leen sin problemas y una carta pesa ~15-25 KB.
 */
public final class PrepararTexturas {
    static final double PROPORCION_CARTA = 63.0 / 88.0;

    public static void main(String[] a) throws Exception {
        Map<String, String> o = new LinkedHashMap<>();
        o.put("--catalogo", "datos/catalogo/coleccion-teselia.json");
        o.put("--salida", "web/prueba-3d/assets/cartas");
        o.put("--base", "");                 // cambia el servidor de imágenes (para probar con uno local)
        o.put("--ancho-mini", "256");
        o.put("--ancho-grande", "480");
        o.put("--calidad", "0.86");
        o.put("--pausa-ms", "150");
        o.put("--solo", "");
        boolean forzar = false;
        for (int i = 0; i < a.length; i++) {
            if (a[i].equals("--forzar")) forzar = true;
            else if (o.containsKey(a[i]) && i + 1 < a.length) o.put(a[i], a[++i]);
            else { System.err.println("Argumento desconocido: " + a[i]); System.exit(2); }
        }
        Path catalogo = Path.of(o.get("--catalogo")), salida = Path.of(o.get("--salida"));
        if (!Files.isRegularFile(catalogo)) { System.err.println("No encuentro " + catalogo + " (ejecuta desde la raiz del repositorio)."); System.exit(2); }
        int anchoMini = Integer.parseInt(o.get("--ancho-mini")), anchoGrande = Integer.parseInt(o.get("--ancho-grande"));
        float calidad = Float.parseFloat(o.get("--calidad"));
        long pausa = Long.parseLong(o.get("--pausa-ms"));

        @SuppressWarnings("unchecked")
        List<Object> cartas = (List<Object>) ((Map<String, Object>) Json.leer(Files.readString(catalogo, StandardCharsets.UTF_8))).get("cartas");
        Files.createDirectories(salida.resolve("mini"));
        Files.createDirectories(salida.resolve("grande"));
        Path ruta = salida.resolve("manifiesto.json");
        Map<String, Object> previo = Files.isRegularFile(ruta) ? castMapa(Json.leer(Files.readString(ruta, StandardCharsets.UTF_8))) : new LinkedHashMap<>();
        Map<String, Object> entradas = castMapa(previo.getOrDefault("cartas", new LinkedHashMap<>()));
        Map<String, Object> ausentes = new LinkedHashMap<>();
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).followRedirects(HttpClient.Redirect.NORMAL).build();

        int hechas = 0, omitidas = 0, fallos = 0;
        for (Object c : cartas) {
            Map<String, Object> carta = castMapa(c);
            String id = (String) carta.get("id"), url = String.valueOf(carta.getOrDefault("imagen", ""));
            if (!o.get("--solo").isEmpty() && !o.get("--solo").equals(id)) continue;
            if (url.isBlank() || "sin-imagen".equals(carta.get("estadoImagen"))) { ausentes.put(id, "el catálogo no tiene imagen"); continue; }
            Path mini = salida.resolve("mini").resolve(id + ".jpg"), grande = salida.resolve("grande").resolve(id + ".jpg");
            if (!forzar && entradas.containsKey(id) && Files.isRegularFile(mini) && Files.isRegularFile(grande)) { omitidas++; continue; }
            try {
                String base = url.replaceAll("/high\\.webp$", "/high");
                if (!o.get("--base").isEmpty()) base = o.get("--base") + URI.create(base).getRawPath();
                byte[] datos = null; String origen = null; Exception ultimo = null;
                for (String ext : new String[]{".jpg", ".png"}) {
                    try { datos = descargar(http, base + ext); origen = base + ext; break; } catch (Exception e) { ultimo = e; }
                }
                if (datos == null) throw ultimo;
                BufferedImage img = ImageIO.read(new ByteArrayInputStream(datos));
                if (img == null) throw new IllegalStateException("el archivo descargado no es una imagen legible");
                double prop = (double) img.getWidth() / img.getHeight();
                if (img.getWidth() < 200 || Math.abs(prop - PROPORCION_CARTA) > 0.06) throw new IllegalStateException("tamano o proporcion de carta inesperados: " + img.getWidth() + "x" + img.getHeight());
                BufferedImage m = reducir(img, anchoMini), g = reducir(img, Math.min(anchoGrande, img.getWidth()));
                byte[] bm = jpeg(m, calidad), bg = jpeg(g, calidad);
                Files.write(mini, bm); Files.write(grande, bg);
                Map<String, Object> e = new LinkedHashMap<>();
                e.put("mini", "mini/" + id + ".jpg"); e.put("grande", "grande/" + id + ".jpg");
                e.put("anchoMini", m.getWidth()); e.put("altoMini", m.getHeight()); e.put("anchoGrande", g.getWidth()); e.put("altoGrande", g.getHeight());
                e.put("bytesMini", bm.length); e.put("bytesGrande", bg.length);
                e.put("origen", origen); e.put("anchoOriginal", img.getWidth()); e.put("altoOriginal", img.getHeight());
                e.put("sha256Original", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(datos)));
                entradas.put(id, e);
                hechas++;
                System.out.printf("OK   %-14s %dx%d -> mini %d B, grande %d B%n", id, img.getWidth(), img.getHeight(), bm.length, bg.length);
            } catch (Exception e) {
                fallos++;
                ausentes.put(id, "fallo al preparar: " + e.getMessage());
                System.out.println("FALLO " + id + ": " + e.getMessage());
            }
            Thread.sleep(pausa);
        }
        // las entradas de cartas que fallan o ya no existen en el catálogo no se dejan en el manifiesto
        entradas.keySet().removeIf(k -> !Files.isRegularFile(salida.resolve("mini").resolve(k + ".jpg")));
        Map<String, Object> man = new LinkedHashMap<>();
        man.put("version", 1);
        man.put("generado", Instant.now().toString());
        man.put("herramienta", "herramientas/texturas/PrepararTexturas.java");
        man.put("procedencia", "Imágenes de cartas de TCGdex (https://tcgdex.net). Las ilustraciones pertenecen a The Pokémon Company, Nintendo, Creatures y GAME FREAK. Uso personal para el seguimiento de la propia colección; no redistribuir ni usar comercialmente.");
        man.put("formato", "JPEG, proporción original; mini = textura del bolsillo, grande = ficha");
        man.put("anchoMini", anchoMini); man.put("anchoGrande", anchoGrande);
        man.put("cartas", ordenar(entradas));
        Map<String, Object> aus = new LinkedHashMap<>(castMapa(previo.getOrDefault("ausentes", new LinkedHashMap<>())));
        aus.keySet().removeIf(entradas::containsKey);
        aus.putAll(ausentes);
        man.put("ausentes", ordenar(aus));
        Files.writeString(ruta, Json.escribir(man, 0) + "\n", StandardCharsets.UTF_8);
        System.out.printf("%nHechas %d - omitidas (ya existian) %d - fallos %d - en el manifiesto %d - ausentes %d%n", hechas, omitidas, fallos, entradas.size(), aus.size());
        System.out.println("Manifiesto: " + ruta);
        System.exit(fallos > 0 ? 1 : 0);
    }

    static Map<String, Object> ordenar(Map<String, Object> m) { return new java.util.TreeMap<>(m); }

    @SuppressWarnings("unchecked")
    static Map<String, Object> castMapa(Object o) { return (Map<String, Object>) o; }

    static byte[] descargar(HttpClient http, String url) throws Exception {
        Exception ultimo = null;
        for (int intento = 1; intento <= 3; intento++) {
            try {
                HttpResponse<byte[]> r = http.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(30)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
                if (r.statusCode() == 404) throw new IllegalStateException("HTTP 404 en " + url);
                if (r.statusCode() != 200) throw new IllegalStateException("HTTP " + r.statusCode() + " en " + url);
                return r.body();
            } catch (IllegalStateException e) { throw e;
            } catch (Exception e) { ultimo = e; Thread.sleep(500L * intento); }
        }
        throw ultimo;
    }

    /** Reduce con interpolación bicúbica y en varios pasos (mejor calidad que un salto directo) conservando la proporción. */
    static BufferedImage reducir(BufferedImage src, int ancho) {
        int alto = (int) Math.round((double) src.getHeight() * ancho / src.getWidth());
        BufferedImage cur = toRgb(src);
        while (cur.getWidth() / 2 >= ancho) cur = escalar(cur, cur.getWidth() / 2, cur.getHeight() / 2);
        return cur.getWidth() == ancho ? cur : escalar(cur, ancho, alto);
    }

    static BufferedImage toRgb(BufferedImage s) {
        BufferedImage d = new BufferedImage(s.getWidth(), s.getHeight(), BufferedImage.TYPE_INT_RGB);
        var g = d.createGraphics(); g.setColor(java.awt.Color.BLACK); g.fillRect(0, 0, d.getWidth(), d.getHeight()); g.drawImage(s, 0, 0, null); g.dispose();
        return d;
    }

    static BufferedImage escalar(BufferedImage s, int w, int h) {
        BufferedImage d = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        var g = d.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.drawImage(s, 0, 0, w, h, null); g.dispose();
        return d;
    }

    static byte[] jpeg(BufferedImage img, float calidad) throws Exception {
        ImageWriter w = ImageIO.getImageWritersByFormatName("jpeg").next();
        ImageWriteParam p = w.getDefaultWriteParam();
        p.setCompressionMode(ImageWriteParam.MODE_EXPLICIT); p.setCompressionQuality(calidad); p.setProgressiveMode(ImageWriteParam.MODE_DEFAULT);
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        try (ImageOutputStream os = ImageIO.createImageOutputStream(bo)) { w.setOutput(os); w.write(null, new IIOImage(img, null, null), p); }
        w.dispose();
        return bo.toByteArray();
    }

    /** Lector/escritor JSON mínimo (sin librerías externas): objetos, listas, cadenas, números, booleanos y null. */
    static final class Json {
        private final String s; private int i;
        private Json(String s) { this.s = s; }
        static Object leer(String t) { Json j = new Json(t); Object v = j.valor(); j.blancos(); if (j.i != t.length()) throw new IllegalStateException("JSON con texto sobrante"); return v; }
        private void blancos() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }
        private Object valor() {
            blancos(); char c = s.charAt(i);
            if (c == '{') { i++; Map<String, Object> m = new LinkedHashMap<>(); blancos(); if (s.charAt(i) == '}') { i++; return m; }
                while (true) { blancos(); String k = cadena(); blancos(); i++; m.put(k, valor()); blancos(); if (s.charAt(i++) == '}') return m; } }
            if (c == '[') { i++; List<Object> l = new ArrayList<>(); blancos(); if (s.charAt(i) == ']') { i++; return l; }
                while (true) { l.add(valor()); blancos(); if (s.charAt(i++) == ']') return l; } }
            if (c == '"') return cadena();
            if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (s.startsWith("null", i)) { i += 4; return null; }
            int j = i; while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            String n = s.substring(j, i); return n.contains(".") || n.contains("e") || n.contains("E") ? (Object) Double.parseDouble(n) : (Object) Long.parseLong(n);
        }
        private String cadena() {
            StringBuilder b = new StringBuilder(); i++;
            while (true) { char c = s.charAt(i++);
                if (c == '"') return b.toString();
                if (c != '\\') { b.append(c); continue; }
                char e = s.charAt(i++);
                switch (e) { case 'n' -> b.append('\n'); case 't' -> b.append('\t'); case 'r' -> b.append('\r'); case 'b' -> b.append('\b'); case 'f' -> b.append('\f');
                    case 'u' -> { b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; } default -> b.append(e); } }
        }
        @SuppressWarnings("unchecked")
        static String escribir(Object v, int nivel) {
            String sang = "  ".repeat(nivel + 1), fin = "  ".repeat(nivel);
            if (v == null) return "null";
            if (v instanceof String t) { StringBuilder b = new StringBuilder("\"");
                for (char c : t.toCharArray()) { switch (c) { case '"' -> b.append("\\\""); case '\\' -> b.append("\\\\"); case '\n' -> b.append("\\n"); case '\t' -> b.append("\\t"); case '\r' -> b.append("\\r");
                    default -> { if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c); } } }
                return b.append('"').toString(); }
            if (v instanceof Map<?, ?> m) { if (m.isEmpty()) return "{}"; List<String> p = new ArrayList<>();
                for (Map.Entry<String, Object> e : ((Map<String, Object>) m).entrySet()) p.add(sang + escribir(e.getKey(), 0) + ": " + escribir(e.getValue(), nivel + 1));
                return "{\n" + String.join(",\n", p) + "\n" + fin + "}"; }
            if (v instanceof List<?> l) { List<String> p = new ArrayList<>(); for (Object x : l) p.add(escribir(x, nivel + 1)); return "[" + String.join(", ", p) + "]"; }
            return String.valueOf(v);
        }
    }
}
