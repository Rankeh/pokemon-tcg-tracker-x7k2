package tcgtracker.catalogo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

/**
 * Decisiones humanas sobre colisiones de clave, guardadas en datos/decisiones/variantes.json.
 * El programa nunca decide solo si dos entradas son la misma carta física o dos distintas.
 */
public final class Decisiones {

    private final Map<String, JsonNode> porClave = new HashMap<>();

    public static Decisiones cargar(Path archivo) throws IOException {
        Decisiones d = new Decisiones();
        if (!Files.exists(archivo)) {
            return d;
        }
        JsonNode raiz = new ObjectMapper().readTree(archivo.toFile());
        for (JsonNode c : raiz.path("colisiones")) {
            d.porClave.put(c.path("carta").asText() + "|" + c.path("variantId").asText(), c);
        }
        return d;
    }

    /** Decisión para la clave base idCarta|variantId, o null si no hay. */
    public JsonNode para(String claveBase) {
        return porClave.get(claveBase);
    }
}
