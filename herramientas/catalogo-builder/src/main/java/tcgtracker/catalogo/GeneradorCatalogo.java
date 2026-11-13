package tcgtracker.catalogo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Convierte las fichas completas de TCGdex en el catálogo que usará la web (catalogo.json).
 *
 * El catálogo solo contiene datos oficiales de las cartas. Tu colección (cuántas copias tienes
 * de cada variante) se guardará aparte, en el móvil, así que regenerar este archivo nunca la toca.
 * Las variantes salen únicamente de variants_detailed: no se inventa ninguna.
 */
public class GeneradorCatalogo {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static void generar(List<JsonNode> expansiones, List<JsonNode> cartas, Path archivoSalida)
            throws IOException {
        ObjectNode raiz = MAPPER.createObjectNode();
        raiz.put("idioma", "es");
        raiz.put("fuente", "TCGdex (api.tcgdex.net), datos con licencia MIT");
        raiz.put("generado", LocalDate.now().toString());

        Map<String, Integer> oficialesPorExpansion = new HashMap<>();
        ArrayNode listaExpansiones = raiz.putArray("expansiones");
        for (JsonNode expansion : expansiones) {
            String id = expansion.path("id").asText();
            int oficiales = expansion.path("cardCount").path("official").asInt();
            oficialesPorExpansion.put(id, oficiales);

            ObjectNode salida = listaExpansiones.addObject();
            salida.put("id", id);
            salida.put("nombre", expansion.path("name").asText());
            salida.put("oficiales", oficiales);
            salida.put("total", expansion.path("cardCount").path("total").asInt());
            if (expansion.hasNonNull("logo")) {
                salida.put("logo", expansion.path("logo").asText());
            }
        }

        int totalVariantes = 0;
        int cartasSinVariantes = 0;
        ArrayNode listaCartas = raiz.putArray("cartas");
        for (JsonNode carta : cartas) {
            String idExpansion = carta.path("set").path("id").asText();
            String numero = carta.path("localId").asText();

            ObjectNode salida = listaCartas.addObject();
            salida.put("id", carta.path("id").asText());
            salida.put("expansion", idExpansion);
            salida.put("numero", numero);
            salida.put("numerada", esNumerada(numero, oficialesPorExpansion.getOrDefault(idExpansion, 0)));
            salida.put("nombre", carta.path("name").asText());
            salida.put("categoria", carta.path("category").asText(""));
            salida.put("rareza", Traducciones.rareza(carta.path("rarity").asText("")));
            salida.put("ilustrador", carta.path("illustrator").asText(""));
            salida.put("imagen", carta.path("image").asText(""));

            if (carta.path("types").isArray()) {
                ArrayNode tipos = salida.putArray("tipos");
                for (JsonNode tipo : carta.path("types")) {
                    tipos.add(tipo.asText());
                }
            }

            // Cada variante se copia tal cual (variantId, type, foil, size y cualquier otro campo).
            ArrayNode variantes = salida.putArray("variantes");
            for (JsonNode variante : carta.path("variants_detailed")) {
                JsonNode copia = variante.deepCopy();
                variantes.add(copia);
                totalVariantes++;
            }
            if (variantes.size() == 0) {
                cartasSinVariantes++;
            }
        }

        compararConAnterior(archivoSalida, raiz);

        String json = MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(raiz);
        Archivos.guardarSinRiesgo(archivoSalida, json);

        System.out.println();
        System.out.println("Catálogo guardado en: " + archivoSalida.toAbsolutePath().normalize());
        System.out.println("  " + expansiones.size() + " expansiones, " + cartas.size()
                + " cartas, " + totalVariantes + " variantes");
        if (cartasSinVariantes > 0) {
            System.out.println("ATENCIÓN: " + cartasSinVariantes
                    + " cartas no tienen variantes en TCGdex y no se podrán registrar en la colección.");
        }
    }

    /** Una carta es "numerada" si su número está entre 1 y el total oficial (ej. 001 a 086). */
    private static boolean esNumerada(String numero, int oficiales) {
        try {
            int n = Integer.parseInt(numero);
            return n >= 1 && n <= oficiales;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /** Avisa de las variantes que existían en el catálogo anterior y ya no están. */
    private static void compararConAnterior(Path archivo, JsonNode nuevo) {
        if (!Files.exists(archivo)) {
            System.out.println("Es el primer catálogo: no hay versión anterior con la que comparar.");
            return;
        }
        try {
            JsonNode anterior = MAPPER.readTree(archivo.toFile());
            Set<String> antes = clavesDeVariantes(anterior);
            Set<String> ahora = clavesDeVariantes(nuevo);

            Set<String> desaparecidas = new TreeSet<>(antes);
            desaparecidas.removeAll(ahora);
            Set<String> nuevas = new TreeSet<>(ahora);
            nuevas.removeAll(antes);

            System.out.println("Comparación con el catálogo anterior: " + nuevas.size()
                    + " variantes nuevas, " + desaparecidas.size() + " desaparecidas.");
            if (!desaparecidas.isEmpty()) {
                System.out.println("ATENCIÓN: estas variantes ya no existen en TCGdex. Si las tenías en tu "
                        + "colección habría que revisarlas (se muestran las 20 primeras):");
                desaparecidas.stream().limit(20).forEach(clave -> System.out.println("  " + clave));
            }
        } catch (IOException e) {
            System.out.println("No se pudo leer el catálogo anterior para comparar: " + e.getMessage());
        }
    }

    /** Clave única de cada variante: idCarta|variantId. */
    private static Set<String> clavesDeVariantes(JsonNode catalogo) {
        Set<String> claves = new TreeSet<>();
        for (JsonNode carta : catalogo.path("cartas")) {
            for (JsonNode variante : carta.path("variantes")) {
                claves.add(carta.path("id").asText() + "|" + variante.path("variantId").asText(""));
            }
        }
        return claves;
    }
}
