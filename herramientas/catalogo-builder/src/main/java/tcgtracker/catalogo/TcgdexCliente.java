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

/** Se encarga de hablar con la API de TCGdex y de guardar las respuestas en disco. */
public class TcgdexCliente {

    private static final String URL_BASE = "https://api.tcgdex.net/v2";

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private final ObjectMapper mapper = new ObjectMapper();
    private final String idioma;
    private final Path carpetaCache;

    public TcgdexCliente(String idioma, Path carpetaCache) {
        this.idioma = idioma;
        this.carpetaCache = carpetaCache;
    }

    public JsonNode obtenerExpansion(String idExpansion) throws IOException, InterruptedException {
        return obtener("sets/" + idExpansion, "expansion-" + idExpansion + ".json");
    }

    public JsonNode obtenerCarta(String idCarta) throws IOException, InterruptedException {
        return obtener("cards/" + idCarta, "cartas/" + idCarta + ".json");
    }

    private JsonNode obtener(String ruta, String nombreArchivo) throws IOException, InterruptedException {
        Path archivo = carpetaCache.resolve(nombreArchivo);

        // Si ya lo descargamos antes, lo leemos del disco y no molestamos a la API.
        if (Files.exists(archivo)) {
            return mapper.readTree(archivo.toFile());
        }

        String url = URL_BASE + "/" + idioma + "/" + ruta;
        HttpRequest peticion = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(20))
                .GET()
                .build();
        HttpResponse<String> respuesta = http.send(peticion, HttpResponse.BodyHandlers.ofString());

        if (respuesta.statusCode() != 200) {
            throw new IOException("Error HTTP " + respuesta.statusCode() + " al pedir " + url);
        }

        Files.createDirectories(archivo.getParent());
        Files.writeString(archivo, respuesta.body());
        Thread.sleep(150); // pausa corta entre peticiones, por cortesía con un servicio gratuito
        return mapper.readTree(respuesta.body());
    }
}
