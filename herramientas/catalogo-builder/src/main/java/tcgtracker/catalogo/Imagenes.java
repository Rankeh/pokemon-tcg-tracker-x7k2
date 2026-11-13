package tcgtracker.catalogo;

import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Comprueba que una imagen REALMENTE se puede cargar (no basta con que exista la cadena URL)
 * y la clasifica en: espanol-verificada, otro-idioma o sin-imagen.
 */
public final class Imagenes {

    public static final String ESPANOL = "espanol-verificada";
    public static final String OTRO_IDIOMA = "otro-idioma";
    public static final String SIN_IMAGEN = "sin-imagen";

    public record Comprobacion(boolean carga, String motivo) {
    }

    private static final HttpClient CLIENTE = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private Imagenes() {
    }

    /** Pide la imagen (HEAD y, si el servidor no lo admite, los primeros bytes) y mira el tipo de contenido. */
    public static Comprobacion comprobar(String url) {
        if (url == null || url.isBlank()) {
            return new Comprobacion(false, "no hay URL");
        }
        try {
            HttpResponse<Void> r = CLIENTE.send(base(url).method("HEAD", HttpRequest.BodyPublishers.noBody()).build(),
                    HttpResponse.BodyHandlers.discarding());
            if (r.statusCode() != 200) {
                r = CLIENTE.send(base(url).header("Range", "bytes=0-0").GET().build(),
                        HttpResponse.BodyHandlers.discarding());
            }
            if (r.statusCode() != 200 && r.statusCode() != 206) {
                return new Comprobacion(false, "el servidor respondió HTTP " + r.statusCode());
            }
            String tipo = r.headers().firstValue("content-type").orElse("");
            if (!tipo.toLowerCase().startsWith("image/")) {
                return new Comprobacion(false, "responde pero no es una imagen (" + tipo + ")");
            }
            return new Comprobacion(true, "HTTP " + r.statusCode() + ", " + tipo);
        } catch (IOException e) {
            return new Comprobacion(false, "error de red: " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Comprobacion(false, "interrumpido");
        }
    }

    private static HttpRequest.Builder base(String url) {
        return HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(15))
                .header("User-Agent", "pokemon-tcg-tracker (uso personal)");
    }

    /** Idioma que indica la propia URL de TCGdex (/es/, /en/...), o "" si no se puede saber. */
    public static String idiomaDe(String url) {
        if (url.contains("/es/")) return "es";
        if (url.contains("/en/")) return "en";
        return "";
    }

    /** Anota en la ficha el estado de su imagen (sin tocar el resto de campos). */
    public static void anotar(ObjectNode carta, String idioma, Comprobacion c, String origen) {
        String url = carta.path("imagen").asText("");
        String estado = url.isEmpty() || !c.carga() ? SIN_IMAGEN : idioma.equals("es") ? ESPANOL : OTRO_IDIOMA;
        carta.put("estadoImagen", estado);
        carta.put("idiomaImagen", estado.equals(SIN_IMAGEN) ? "" : idioma);
        carta.put("imagenCarga", c.carga());
        carta.put("origenImagen", origen);
        carta.put("detalleImagen", c.motivo());
    }
}
