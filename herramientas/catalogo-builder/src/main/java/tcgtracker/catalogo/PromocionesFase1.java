package tcgtracker.catalogo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Categoría D. Por cada candidata pide a TCGdex SOLO la lista de la serie svp (una petición)
 * y las fichas de las cartas con ese nombre. No descarga el resto de promociones.
 */
public final class PromocionesFase1 {

    /** Coincidencia real de TCGdex para una candidata (para que tú elijas la correcta mirando la imagen). */
    public record Coincidencia(String id, String numero, String nombre, String rareza, String ilustrador,
                               String imagen, String idioma) {
    }

    public record Informe(JsonNode candidata, List<Coincidencia> coincidencias, String nota) {
    }

    public final List<Informe> informes = new ArrayList<>();
    public final List<ObjectNode> confirmadas = new ArrayList<>();
    public final List<String> problemas = new ArrayList<>();

    public static PromocionesFase1 procesar(Path archivoDecisiones, Path carpetaCrudo) throws IOException {
        PromocionesFase1 p = new PromocionesFase1();
        JsonNode config = new ObjectMapper().readTree(archivoDecisiones.toFile());

        TcgdexCliente es = new TcgdexCliente("es", carpetaCrudo.resolve("es"));
        TcgdexCliente en = new TcgdexCliente("en", carpetaCrudo.resolve("en"));

        JsonNode listaEs = intentar(es, "svp");
        JsonNode listaEn = listaEs == null ? intentar(en, "svp") : null;

        for (JsonNode c : config.path("candidatas")) {
            String nombre = c.path("busqueda").asText();
            List<Coincidencia> coincidencias = new ArrayList<>();
            String nota = "";
            if (listaEs == null && listaEn == null) {
                nota = "No se pudo descargar la serie svp (revisa la conexión).";
            } else {
                // Preferimos español; si la serie no existe en español, usamos inglés y lo decimos.
                JsonNode lista = listaEs != null ? listaEs : listaEn;
                TcgdexCliente cliente = listaEs != null ? es : en;
                String idioma = listaEs != null ? "es" : "en";
                for (JsonNode resumen : lista.path("cards")) {
                    if (!resumen.path("name").asText().toLowerCase().contains(nombre.toLowerCase())) {
                        continue;
                    }
                    try {
                        JsonNode carta = cliente.obtenerCarta(resumen.path("id").asText());
                        coincidencias.add(new Coincidencia(carta.path("id").asText(), carta.path("localId").asText(),
                                carta.path("name").asText(), carta.path("rarity").asText(""),
                                carta.path("illustrator").asText(""),
                                carta.hasNonNull("image") ? carta.path("image").asText() + "/high.webp" : "",
                                idioma));
                    } catch (IOException | InterruptedException e) {
                        p.problemas.add(resumen.path("id").asText() + ": " + e.getMessage());
                    }
                }
                if (idioma.equals("en")) {
                    nota = "La serie svp no está en español en TCGdex: datos e imágenes en inglés (requiere tu aprobación).";
                }
                if (coincidencias.isEmpty()) {
                    nota += " Sin coincidencias en svp para '" + nombre + "'.";
                }
            }
            p.informes.add(new Informe(c, coincidencias, nota.trim()));

            if (c.path("estado").asText().equals("confirmada")) {
                p.recogerConfirmada(c, coincidencias);
            }
        }
        return p;
    }

    private void recogerConfirmada(JsonNode c, List<Coincidencia> coincidencias) {
        String id = c.path("tcgdex").asText("");
        Coincidencia elegida = coincidencias.stream().filter(x -> x.id().equals(id)).findFirst().orElse(null);
        if (elegida == null) {
            problemas.add("'" + c.path("clave").asText() + "' está confirmada pero su id '" + id
                    + "' no aparece entre las coincidencias de TCGdex; no se incluye.");
            return;
        }
        ObjectNode o = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        o.put("id", elegida.id());
        o.put("categoriaColeccion", Selector.PROMO);
        o.put("nombre", elegida.nombre());
        o.put("numero", elegida.numero());
        o.put("expansion", elegida.id().split("-")[0]);
        o.put("nombreExpansion", "Promociones Escarlata y Púrpura (svp)");
        o.put("rareza", elegida.rareza());
        o.put("ilustrador", elegida.ilustrador());
        o.put("imagen", elegida.imagen());
        o.put("idiomaImagen", elegida.idioma());
        o.put("producto", c.path("producto").asText());
        o.put("tipoIlustracion", c.path("tipoIlustracion").asText());
        o.put("verificacion", "confirmada por el usuario");
        confirmadas.add(o);
    }

    private static JsonNode intentar(TcgdexCliente cliente, String id) {
        try {
            return cliente.obtenerExpansion(id);
        } catch (IOException | InterruptedException e) {
            return null;
        }
    }
}
