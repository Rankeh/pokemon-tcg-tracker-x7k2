package tcgtracker.catalogo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.function.Predicate;

/**
 * Habla con la API de TCGdex y guarda cada respuesta en disco.
 *
 * Reglas que cumple:
 * - Solo guarda una respuesta si es una ficha COMPLETA (nunca un resumen).
 * - Si ya hay una ficha completa en disco, no vuelve a pedirla.
 * - Si la ficha guardada está vacía, dañada o es un resumen, la vuelve a descargar.
 * - Si falla la conexión o el servidor está saturado, reintenta con esperas cada vez mayores.
 */
public class TcgdexCliente {

    private static final String URL_BASE = "https://api.tcgdex.net/v2";
    private static final int MAX_INTENTOS = 4;
    private static final long PAUSA_ENTRE_PETICIONES_MS = 200;
    private static final long MAX_ESPERA_RETRY_AFTER_S = 60;

    /** Error que no tiene sentido reintentar (por ejemplo, un 404). */
    private static class ErrorDefinitivo extends IOException {
        private static final long serialVersionUID = 1L;

        ErrorDefinitivo(String mensaje) {
            super(mensaje);
        }
    }

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private final ObjectMapper mapper = new ObjectMapper();
    private final String idioma;
    private final Path carpetaCache;

    private int peticionesRed = 0;
    private int leidasDeDisco = 0;
    private int vueltasADescargar = 0;

    public TcgdexCliente(String idioma, Path carpetaCache) {
        this.idioma = idioma;
        this.carpetaCache = carpetaCache;
    }

    public JsonNode obtenerExpansion(String idExpansion) throws IOException, InterruptedException {
        return obtener("sets/" + idExpansion, "expansion-" + idExpansion + ".json",
                TcgdexCliente::expansionCompleta);
    }

    public JsonNode obtenerCarta(String idCarta) throws IOException, InterruptedException {
        return obtener("cards/" + idCarta, "cartas/" + idCarta + ".json",
                TcgdexCliente::cartaCompleta);
    }

    /**
     * Una ficha completa tiene categoría, expansión y variantes. El resumen que viene en el
     * listado de una expansión solo trae id, número, nombre e imagen, así que no pasa esta prueba.
     */
    static boolean cartaCompleta(JsonNode carta) {
        return carta != null
                && carta.hasNonNull("id")
                && carta.hasNonNull("name")
                && carta.hasNonNull("category")
                && carta.hasNonNull("set")
                && carta.hasNonNull("variants");
    }

    static boolean expansionCompleta(JsonNode expansion) {
        return expansion != null
                && expansion.hasNonNull("id")
                && expansion.hasNonNull("name")
                && expansion.hasNonNull("cardCount")
                && expansion.path("cards").isArray()
                && expansion.path("cards").size() > 0;
    }

    public String resumen() {
        return "Respuestas recibidas de la red: " + peticionesRed
                + " | Fichas leídas de disco: " + leidasDeDisco
                + " | Fichas guardadas que hubo que volver a descargar: " + vueltasADescargar;
    }

    private JsonNode obtener(String ruta, String nombreArchivo, Predicate<JsonNode> esCompleta)
            throws IOException, InterruptedException {
        Path archivo = carpetaCache.resolve(nombreArchivo);

        if (Files.exists(archivo)) {
            JsonNode guardado = leerSiEsValido(archivo, esCompleta);
            if (guardado != null) {
                leidasDeDisco++;
                return guardado;
            }
            vueltasADescargar++;
            System.out.println("  Ficha guardada vacía, dañada o incompleta; se vuelve a descargar: " + nombreArchivo);
        }

        String url = URL_BASE + "/" + idioma + "/" + ruta;
        String cuerpo = descargar(url);
        JsonNode nuevo = mapper.readTree(cuerpo);

        // Solo se guarda si es una ficha completa: así un resumen nunca pisa una ficha buena.
        if (!esCompleta.test(nuevo)) {
            throw new IOException("La respuesta de " + url + " está incompleta; no se guarda.");
        }

        Archivos.guardarSinRiesgo(archivo, cuerpo);
        return nuevo;
    }

    /** Devuelve el JSON guardado, o null si el archivo está vacío, roto o incompleto. */
    private JsonNode leerSiEsValido(Path archivo, Predicate<JsonNode> esCompleta) {
        try {
            if (Files.size(archivo) == 0) {
                return null;
            }
            JsonNode nodo = mapper.readTree(archivo.toFile());
            return esCompleta.test(nodo) ? nodo : null;
        } catch (IOException e) {
            return null;
        }
    }

    private String descargar(String url) throws IOException, InterruptedException {
        IOException ultimoError = null;

        for (int intento = 1; intento <= MAX_INTENTOS; intento++) {
            long esperaMs = 1000L * (1L << (intento - 1)); // 1 s, 2 s, 4 s...

            try {
                HttpRequest peticion = HttpRequest.newBuilder(URI.create(url))
                        .timeout(Duration.ofSeconds(20))
                        .header("User-Agent", "pokemon-tcg-tracker (uso personal)")
                        .GET()
                        .build();
                HttpResponse<String> respuesta = http.send(peticion, HttpResponse.BodyHandlers.ofString());
                peticionesRed++;
                int codigo = respuesta.statusCode();

                if (codigo == 200) {
                    Thread.sleep(PAUSA_ENTRE_PETICIONES_MS); // cortesía con un servicio gratuito
                    return respuesta.body();
                }
                if (codigo == 429 || codigo >= 500) {
                    ultimoError = new IOException("HTTP " + codigo + " al pedir " + url);
                    esperaMs = Math.max(esperaMs, segundosRetryAfter(respuesta) * 1000L);
                } else {
                    throw new ErrorDefinitivo("HTTP " + codigo + " al pedir " + url);
                }
            } catch (ErrorDefinitivo e) {
                throw e;
            } catch (IOException e) {
                // Sin conexión, tiempo agotado, etc.
                ultimoError = e;
            }

            if (intento < MAX_INTENTOS) {
                System.out.println("  Fallo al pedir " + url + " (" + ultimoError.getMessage()
                        + "). Reintento " + (intento + 1) + "/" + MAX_INTENTOS + " en " + (esperaMs / 1000) + " s...");
                Thread.sleep(esperaMs);
            }
        }

        throw new IOException("No se pudo descargar " + url + " tras " + MAX_INTENTOS
                + " intentos: " + ultimoError.getMessage(), ultimoError);
    }

    /** Si el servidor pide esperar (cabecera Retry-After en segundos), le hacemos caso. */
    private static long segundosRetryAfter(HttpResponse<?> respuesta) {
        return respuesta.headers().firstValue("Retry-After").map(valor -> {
            try {
                return Math.min(Long.parseLong(valor.trim()), MAX_ESPERA_RETRY_AFTER_S);
            } catch (NumberFormatException e) {
                return 0L;
            }
        }).orElse(0L);
    }
}
