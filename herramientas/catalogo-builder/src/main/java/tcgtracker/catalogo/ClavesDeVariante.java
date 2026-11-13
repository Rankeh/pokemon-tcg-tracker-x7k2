package tcgtracker.catalogo;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Cómo identificamos y describimos cada variante coleccionable. */
public final class ClavesDeVariante {

    /** Campos que se muestran primero en la descripción de una variante. */
    private static final List<String> CAMPOS_PRINCIPALES = List.of("type", "foil", "size");

    private ClavesDeVariante() {
    }

    /**
     * Clave única de una variante de una carta concreta: idCarta|variantId.
     *
     * El variantId por sí solo NO sirve como clave: se reutiliza en muchas cartas (identifica un
     * tipo de variante, no una carta). Por eso la clave siempre lleva también el id de la carta;
     * así las cantidades de cartas distintas nunca se mezclan.
     */
    public static String clave(String idCarta, JsonNode variante) {
        String variantId = variante.hasNonNull("variantId") ? variante.get("variantId").asText() : "";
        if (variantId.isBlank()) {
            return idCarta + "|sin-id:" + firma(variante);
        }
        return idCarta + "|" + variantId;
    }

    /**
     * Descripción de la variante con todos sus campos salvo el variantId,
     * por ejemplo: "type=reverse, foil=pokeball, size=standard".
     */
    public static String firma(JsonNode variante) {
        Comparator<String> orden = Comparator
                .comparingInt((String campo) -> {
                    int posicion = CAMPOS_PRINCIPALES.indexOf(campo);
                    return posicion >= 0 ? posicion : CAMPOS_PRINCIPALES.size();
                })
                .thenComparing(Comparator.naturalOrder());
        Map<String, String> campos = new TreeMap<>(orden);

        Iterator<String> nombres = variante.fieldNames();
        while (nombres.hasNext()) {
            String campo = nombres.next();
            if (campo.equals("variantId")) {
                continue;
            }
            JsonNode valor = variante.get(campo);
            String texto;
            if (valor.isNull()) {
                texto = "null";
            } else if (valor.isValueNode()) {
                texto = valor.asText();
            } else {
                texto = valor.toString();
            }
            campos.put(campo, texto);
        }

        StringBuilder firma = new StringBuilder();
        for (Map.Entry<String, String> campo : campos.entrySet()) {
            if (firma.length() > 0) {
                firma.append(", ");
            }
            firma.append(campo.getKey()).append("=").append(campo.getValue());
        }
        return firma.toString();
    }
}
