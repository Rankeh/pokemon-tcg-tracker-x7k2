package tcgtracker.catalogo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Convierte las entradas de variants_detailed de UNA carta en variantes coleccionables del catálogo.
 *
 * - Atributos físicos (type, foil, size, stamp) van en la variante; el precio no se guarda nunca.
 * - De thirdParty solo se conservan los identificadores (referenciasExternas).
 * - Si dos entradas comparten idCarta|variantId se exige una decisión explícita
 *   (separar o fusionar) en datos/decisiones/variantes.json. Nada se borra por su cuenta.
 */
public final class ResolutorVariantes {

    private static final List<String> FISICOS = List.of("type", "foil", "size", "stamp");
    private static final String PRECIOS = "(?i).*(price|avg|average|low|high|trend).*";

    private ResolutorVariantes() {
    }

    public static List<ObjectNode> resolver(String idCarta, JsonNode carta, Decisiones decisiones,
                                            Anomalias anomalias) throws IOException {
        Map<String, List<JsonNode>> grupos = new LinkedHashMap<>();
        for (JsonNode v : carta.path("variants_detailed")) {
            if (!v.isObject()) {
                throw new IOException("Variante con formato inesperado en " + idCarta);
            }
            grupos.computeIfAbsent(ClavesDeVariante.clave(idCarta, v), k -> new ArrayList<>()).add(v);
        }

        List<ObjectNode> salida = new ArrayList<>();
        for (Map.Entry<String, List<JsonNode>> g : grupos.entrySet()) {
            String claveBase = g.getKey();
            List<JsonNode> entradas = g.getValue();
            if (entradas.size() == 1) {
                salida.add(construir(claveBase, entradas.get(0), anomalias));
                continue;
            }

            boolean fisicaIgual = entradas.stream().map(ClavesDeVariante::firma).distinct().count() == 1;
            JsonNode decision = decisiones.para(claveBase);
            String resumen = claveBase + ": " + entradas.size() + " entradas, atributos físicos "
                    + (fisicaIgual ? "idénticos" : "DISTINTOS") + " (" + ClavesDeVariante.firma(entradas.get(0)) + ")";
            if (decision == null) {
                anomalias.error("Colisión sin decisión. " + resumen
                        + ". Añade una decisión en datos/decisiones/variantes.json.");
                continue;
            }
            String tipo = decision.path("decision").asText();
            boolean dudosa = decision.path("dudosa").asBoolean(false);
            String nota = decision.path("motivo").asText("");

            if (tipo.equals("fusionar")) {
                ObjectNode v = construir(claveBase, entradas.get(0), anomalias);
                ArrayNode refs = JsonNodeFactory.instance.arrayNode();
                for (JsonNode e : entradas) {
                    refs.add(referencias(e));
                }
                v.set("referenciasExternas", refs);
                marcar(v, dudosa, nota);
                salida.add(v);
                anomalias.aviso("FUSIONADA " + resumen + " -> cuenta como 1 variante.");
            } else if (tipo.equals("separar")) {
                Set<String> usadas = new HashSet<>();
                List<ObjectNode> separadas = new ArrayList<>();
                for (JsonNode e : entradas) {
                    String sufijo = sufijoPara(decision, e);
                    if (sufijo == null || !usadas.add(sufijo)) {
                        anomalias.error("Decisión 'separar' incompleta o ambigua en " + resumen
                                + ": revisa las 'versiones' (ancla/sufijo).");
                        separadas.clear();
                        break;
                    }
                    ObjectNode v = construir(claveBase + "#" + sufijo, e, anomalias);
                    marcar(v, dudosa, nota);
                    separadas.add(v);
                }
                salida.addAll(separadas);
                if (!separadas.isEmpty()) {
                    anomalias.aviso("SEPARADA " + resumen + " -> cuentan como " + separadas.size()
                            + " variantes" + (dudosa ? " (DUDOSA)" : "") + ".");
                }
            } else {
                anomalias.error("Decisión desconocida '" + tipo + "' para " + claveBase
                        + " (usa 'separar' o 'fusionar').");
            }
        }

        // Dos variantes con distinta clave pero idéntico aspecto físico: puede ser un duplicado.
        Map<String, String> vistas = new LinkedHashMap<>();
        for (ObjectNode v : salida) {
            ObjectNode fisica = JsonNodeFactory.instance.objectNode();
            for (String campo : FISICOS) {
                if (v.has(campo)) {
                    fisica.set(campo, v.get(campo));
                }
            }
            String firma = ClavesDeVariante.firma(fisica);
            String previa = vistas.putIfAbsent(firma, v.path("clave").asText());
            if (previa != null && !previa.split("#")[0].equals(v.path("clave").asText().split("#")[0])) {
                anomalias.aviso(idCarta + ": " + previa + " y " + v.path("clave").asText()
                        + " tienen los mismos atributos físicos (" + firma + ").");
            }
        }
        return salida;
    }

    private static String sufijoPara(JsonNode decision, JsonNode entrada) {
        for (JsonNode version : decision.path("versiones")) {
            if (contieneValor(entrada.path("thirdParty"), version.path("ancla").asText())) {
                return version.path("sufijo").asText();
            }
        }
        return null;
    }

    private static boolean contieneValor(JsonNode nodo, String valor) {
        if (valor.isEmpty()) {
            return false;
        }
        if (nodo.isValueNode()) {
            return nodo.asText().equals(valor);
        }
        for (JsonNode hijo : nodo) {
            if (contieneValor(hijo, valor)) {
                return true;
            }
        }
        return false;
    }

    private static void marcar(ObjectNode v, boolean dudosa, String nota) {
        if (dudosa) {
            v.put("dudosa", true);
        }
        if (!nota.isEmpty()) {
            v.put("nota", nota);
        }
    }

    private static ObjectNode construir(String clave, JsonNode entrada, Anomalias anomalias) {
        ObjectNode v = JsonNodeFactory.instance.objectNode();
        v.put("clave", clave);
        if (entrada.hasNonNull("variantId")) {
            v.put("variantId", entrada.get("variantId").asText());
        }
        for (String campo : FISICOS) {
            if (entrada.has(campo)) {
                v.set(campo, entrada.get(campo).deepCopy());
            }
        }
        Iterator<String> nombres = entrada.fieldNames();
        while (nombres.hasNext()) {
            String campo = nombres.next();
            if (campo.equals("variantId") || FISICOS.contains(campo)
                    || ClavesDeVariante.CAMPOS_COMERCIALES.contains(campo)) {
                continue;
            }
            v.set(campo, entrada.get(campo).deepCopy());
            anomalias.aviso(clave + ": campo no previsto '" + campo + "' (se conserva tal cual).");
        }
        ObjectNode refs = referencias(entrada);
        if (refs.size() > 0) {
            v.set("referenciasExternas", refs);
        }
        return v;
    }

    /** Copia de thirdParty sin ningún campo que parezca un precio. */
    private static ObjectNode referencias(JsonNode entrada) {
        ObjectNode r = JsonNodeFactory.instance.objectNode();
        JsonNode tp = entrada.path("thirdParty");
        if (tp.isObject()) {
            Iterator<String> nombres = tp.fieldNames();
            while (nombres.hasNext()) {
                String campo = nombres.next();
                if (!campo.matches(PRECIOS)) {
                    r.set(campo, tp.get(campo).deepCopy());
                }
            }
        }
        return r;
    }
}
