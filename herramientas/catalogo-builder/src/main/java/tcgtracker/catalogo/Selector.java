package tcgtracker.catalogo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Reglas de selección de la colección de Teselia (categorías A, B y C).
 * Solo usa campos reales de TCGdex: category, rarity, dexId, trainerType, image, set.
 */
public final class Selector {

    public static final String IR = "ir";
    public static final String SIR = "sir";
    public static final String PARTIDARIO = "partidario";
    public static final String PROMO = "promo";

    static final int DEX_MIN = 494;
    static final int DEX_MAX = 649;

    /** Resultado de aplicar las reglas a todas las cartas. */
    public static final class Resultado {
        public final List<ObjectNode> incluidas = new ArrayList<>();
        /** Cumplen los criterios pero su imagen no es en español: necesitan tu aprobación. */
        public final List<ObjectNode> sinImagenEspanol = new ArrayList<>();
        /** Motivo de exclusión -> cartas excluidas (texto corto). */
        public final Map<String, List<String>> excluidas = new LinkedHashMap<>();
        /** Cosas que requieren revisión manual (p. ej. Pokémon IR sin dexId). */
        public final List<String> revisarAMano = new ArrayList<>();

        void excluir(String motivo, String texto) {
            excluidas.computeIfAbsent(motivo, k -> new ArrayList<>()).add(texto);
        }
    }

    private Selector() {
    }

    public static Resultado seleccionar(List<JsonNode> cartas) {
        Resultado r = new Resultado();
        for (JsonNode carta : cartas) {
            String id = carta.path("id").asText();
            String etiqueta = id + " " + carta.path("name").asText();
            String rareza = Traducciones.rareza(carta.path("rarity").asText(""));
            boolean especial = rareza.equals("Rara Ilustración") || rareza.equals("Rara Ilustración Especial");
            String categoria = normalizar(carta.path("category").asText(""));

            if (rareza.equals("Rara Blanca y Negra")) {
                r.excluir("BWR (Rara Blanca y Negra)", etiqueta);
                continue;
            }
            if (!especial) {
                r.excluir("Rareza no incluida (" + (rareza.isEmpty() ? "sin rareza" : rareza) + ")", etiqueta);
                continue;
            }

            String coleccion;
            if (categoria.startsWith("pokemon")) {
                JsonNode dex = carta.path("dexId");
                if (!dex.isArray() || dex.size() == 0) {
                    r.revisarAMano.add(etiqueta + ": carta Pokémon " + rareza + " sin dexId; no se puede comprobar si es de Teselia.");
                    continue;
                }
                if (!esDeTeselia(dex)) {
                    r.excluir("Pokémon " + rareza + " que no es de Teselia", etiqueta + " (dex " + dex + ")");
                    continue;
                }
                coleccion = rareza.equals("Rara Ilustración") ? IR : SIR;
            } else if (categoria.startsWith("trainer") || categoria.startsWith("entrenador")) {
                String tipo = carta.path("trainerType").asText("");
                if (!esPartidario(tipo)) {
                    r.excluir("Entrenador " + rareza + " que no es Partidario (trainerType=" + tipo + ")", etiqueta);
                    continue;
                }
                coleccion = PARTIDARIO;
            } else {
                r.excluir("Categoría no incluida (" + carta.path("category").asText("") + ")", etiqueta);
                continue;
            }

            ObjectNode salida = describir(carta, coleccion, rareza);
            if (carta.path("image").asText("").contains("/es/")) {
                r.incluidas.add(salida);
            } else {
                r.sinImagenEspanol.add(salida);
            }
        }
        return r;
    }

    /** Ficha de una carta objetivo (sin datos comerciales). */
    public static ObjectNode describir(JsonNode carta, String coleccion, String rareza) {
        ObjectNode o = JsonNodeFactory.instance.objectNode();
        o.put("id", carta.path("id").asText());
        o.put("categoriaColeccion", coleccion);
        o.put("nombre", carta.path("name").asText());
        o.put("numero", carta.path("localId").asText());
        o.put("expansion", carta.path("set").path("id").asText());
        o.put("nombreExpansion", carta.path("set").path("name").asText());
        o.put("rareza", rareza);
        o.put("ilustrador", carta.path("illustrator").asText(""));
        String imagen = carta.path("image").asText("");
        o.put("imagen", imagen.isEmpty() ? "" : imagen + "/high.webp");
        if (carta.path("dexId").isArray()) {
            o.set("dexId", carta.path("dexId").deepCopy());
        }
        if (carta.hasNonNull("trainerType")) {
            o.put("tipoEntrenador", carta.path("trainerType").asText());
        }
        return o;
    }

    static boolean esDeTeselia(JsonNode dexId) {
        for (JsonNode n : dexId) {
            if (n.asInt() >= DEX_MIN && n.asInt() <= DEX_MAX) {
                return true;
            }
        }
        return false;
    }

    static boolean esPartidario(String trainerType) {
        String t = normalizar(trainerType);
        return t.equals("supporter") || t.equals("partidario");
    }

    private static String normalizar(String s) {
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
    }
}
