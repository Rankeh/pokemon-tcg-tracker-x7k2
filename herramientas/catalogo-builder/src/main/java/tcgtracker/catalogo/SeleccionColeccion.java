package tcgtracker.catalogo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * FASE 1: selecciona las cartas de la colección de Teselia y escribe
 *  - datos/catalogo/coleccion-teselia.json  (solo cartas objetivo confirmadas)
 *  - datos/catalogo/seleccion-fase1.md      (listas, totales, comprobaciones y pendientes)
 * No toca catalogo.json ni el generador. Lee las fichas ya descargadas (datos/crudo).
 */
public class SeleccionColeccion {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        Path raiz = RaizRepositorio.encontrar();
        Path crudo = raiz.resolve("datos").resolve("crudo");
        Path salidaJson = raiz.resolve("datos").resolve("catalogo").resolve("coleccion-teselia.json");
        Path salidaInforme = raiz.resolve("datos").resolve("catalogo").resolve("seleccion-fase1.md");

        // 1) Catálogo completo: se lee de la caché local; solo se descarga lo que falte.
        TcgdexCliente cliente = new TcgdexCliente("es", crudo.resolve("es"));
        List<JsonNode> cartas = new ArrayList<>();
        for (String idExpansion : List.of("sv10.5b", "sv10.5w")) {
            JsonNode expansion = cliente.obtenerExpansion(idExpansion);
            for (JsonNode resumen : expansion.path("cards")) {
                cartas.add(cliente.obtenerCarta(resumen.path("id").asText()));
            }
        }
        System.out.println("Cartas leídas del catálogo: " + cartas.size() + " | " + cliente.resumen());

        Selector.Resultado seleccion = Selector.seleccionar(cartas);

        // 2) Promociones (categoría D): solo las candidatas del archivo de decisiones.
        PromocionesFase1 promos = PromocionesFase1.procesar(
                raiz.resolve("datos").resolve("decisiones").resolve("promociones.json"), crudo);

        List<ObjectNode> objetivo = new ArrayList<>(seleccion.incluidas);
        objetivo.addAll(promos.confirmadas);

        // 3) Comprobaciones
        List<String> comprobaciones = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        int repetidas = 0;
        int bwr = 0;
        int rarezaIncorrecta = 0;
        for (ObjectNode c : objetivo) {
            if (!ids.add(c.path("id").asText())) {
                repetidas++;
            }
            String rareza = c.path("rareza").asText();
            if (rareza.equals("Rara Blanca y Negra")) {
                bwr++;
            }
            boolean promo = c.path("categoriaColeccion").asText().equals(Selector.PROMO);
            if (!promo && !rareza.equals("Rara Ilustración") && !rareza.equals("Rara Ilustración Especial")) {
                rarezaIncorrecta++;
            }
        }
        comprobaciones.add("Cartas BWR en la selección: " + bwr + (bwr == 0 ? " (correcto)" : " (ERROR)"));
        comprobaciones.add("Identificadores repetidos: " + repetidas + (repetidas == 0 ? " (correcto)" : " (ERROR)"));
        comprobaciones.add("Cartas IR/SIR/Partidario con rareza que incumple el criterio: " + rarezaIncorrecta
                + (rarezaIncorrecta == 0 ? " (correcto)" : " (ERROR)"));

        // 4) coleccion-teselia.json
        ObjectNode raizJson = MAPPER.createObjectNode();
        raizJson.put("generado", LocalDate.now().toString());
        raizJson.put("fuente", "TCGdex (datos MIT) + promociones confirmadas manualmente");
        ObjectNode totales = raizJson.putObject("totales");
        totales.put("total", objetivo.size());
        totales.put("sv10.5b", contar(objetivo, "expansion", "sv10.5b"));
        totales.put("sv10.5w", contar(objetivo, "expansion", "sv10.5w"));
        totales.put("promociones", contar(objetivo, "categoriaColeccion", Selector.PROMO));
        totales.put("ir", contar(objetivo, "categoriaColeccion", Selector.IR));
        totales.put("sir", contar(objetivo, "categoriaColeccion", Selector.SIR));
        totales.put("partidarios", contar(objetivo, "categoriaColeccion", Selector.PARTIDARIO));
        ArrayNode lista = raizJson.putArray("cartas");
        objetivo.forEach(lista::add);
        Archivos.guardarSinRiesgo(salidaJson, MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(raizJson));

        // 5) Informe legible
        Archivos.guardarSinRiesgo(salidaInforme, informe(objetivo, seleccion, promos, comprobaciones, totales));

        System.out.println();
        System.out.println("Total de cartas objetivo: " + objetivo.size()
                + " (IR " + totales.path("ir").asInt() + ", SIR " + totales.path("sir").asInt()
                + ", Partidarios " + totales.path("partidarios").asInt()
                + ", Promociones " + totales.path("promociones").asInt() + ")");
        System.out.println("Fulgor Negro: " + totales.path("sv10.5b").asInt()
                + " | Llama Blanca: " + totales.path("sv10.5w").asInt());
        comprobaciones.forEach(c -> System.out.println("  " + c));
        System.out.println("Sin imagen en español (necesitan tu aprobación): "
                + (seleccion.sinImagenEspanol.size() + promos.pendientesImagenEspanol.size())
                + " (de ellas promociones: " + promos.pendientesImagenEspanol.size() + ")");
        promos.avisos.forEach(a -> System.out.println("  aviso: " + a));
        promos.problemas.forEach(a -> System.out.println("  PROBLEMA: " + a));
        System.out.println("A revisar a mano: " + seleccion.revisarAMano.size());
        System.out.println("Candidatas de promoción pendientes: "
                + (promos.informes.size() - promos.confirmadas.size()));
        System.out.println("Guardado: " + salidaJson.toAbsolutePath().normalize());
        System.out.println("Informe:  " + salidaInforme.toAbsolutePath().normalize());
    }

    private static int contar(List<ObjectNode> cartas, String campo, String valor) {
        return (int) cartas.stream().filter(c -> c.path(campo).asText().equals(valor)).count();
    }

    private static String informe(List<ObjectNode> objetivo, Selector.Resultado sel, PromocionesFase1 promos,
                                  List<String> comprobaciones, ObjectNode t) {
        StringBuilder sb = new StringBuilder();
        sb.append("# Fase 1 — Selección de la colección de Teselia\n\n");
        sb.append("## Totales\n\n");
        sb.append("| Concepto | Cartas |\n|---|---|\n");
        sb.append("| Total de cartas objetivo | ").append(t.path("total").asInt()).append(" |\n");
        sb.append("| Fulgor Negro | ").append(t.path("sv10.5b").asInt()).append(" |\n");
        sb.append("| Llama Blanca | ").append(t.path("sv10.5w").asInt()).append(" |\n");
        sb.append("| Promociones | ").append(t.path("promociones").asInt()).append(" |\n");
        sb.append("| Pokémon IR | ").append(t.path("ir").asInt()).append(" |\n");
        sb.append("| Pokémon SIR | ").append(t.path("sir").asInt()).append(" |\n");
        sb.append("| Partidarios especiales | ").append(t.path("partidarios").asInt()).append(" |\n\n");

        sb.append("## Comprobaciones\n\n");
        comprobaciones.forEach(c -> sb.append("- ").append(c).append("\n"));

        tabla(sb, "1. Pokémon IR", objetivo, Selector.IR);
        tabla(sb, "2. Pokémon SIR", objetivo, Selector.SIR);
        tabla(sb, "3. Partidarios especiales", objetivo, Selector.PARTIDARIO);
        tabla(sb, "4. Promocionales de ilustración especial (confirmadas)", objetivo, Selector.PROMO);

        sb.append("\n## Promociones candidatas pendientes de revisión manual\n\n");
        sb.append("Ninguna cuenta en el progreso hasta que `estado` sea `confirmada` y tenga el id `tcgdex` en ")
                .append("`datos/decisiones/promociones.json`. Abre las imágenes y elige la carta correcta.\n\n");
        for (PromocionesFase1.Informe i : promos.informes) {
            JsonNode c = i.candidata();
            sb.append("### ").append(c.path("pokemon").asText()).append(" — ").append(c.path("estado").asText()).append("\n\n");
            sb.append("- Producto: ").append(c.path("producto").asText()).append("\n");
            sb.append("- Ilustración: ").append(c.path("tipoIlustracion").asText()).append("\n");
            if (!c.path("nota").asText().isEmpty()) {
                sb.append("- Nota: ").append(c.path("nota").asText()).append("\n");
            }
            sb.append("- Fuentes: ").append(String.join("; ", texto(c.path("fuentes")))).append("\n");
            if (!i.nota().isEmpty()) {
                sb.append("- Aviso: ").append(i.nota()).append("\n");
            }
            if (i.coincidencias().isEmpty()) {
                sb.append("- Coincidencias en TCGdex (serie svp): ninguna\n\n");
            } else {
                sb.append("- Coincidencias en TCGdex (serie svp):\n\n");
                sb.append("| Id | Número | Nombre | Rareza | Ilustrador | Idioma | Imagen |\n|---|---|---|---|---|---|---|\n");
                for (PromocionesFase1.Coincidencia x : i.coincidencias()) {
                    sb.append("| ").append(x.id()).append(" | ").append(x.numero()).append(" | ").append(x.nombre())
                            .append(" | ").append(x.rareza()).append(" | ").append(x.ilustrador()).append(" | ")
                            .append(x.idioma()).append(" | ").append(x.imagen()).append(" |\n");
                }
                sb.append("\n");
            }
        }
        promos.avisos.forEach(a -> sb.append("- Aviso: ").append(a).append("\n"));
        if (!promos.problemas.isEmpty()) {
            sb.append("### Problemas con promociones\n\n");
            promos.problemas.forEach(p -> sb.append("- ").append(p).append("\n"));
        }

        sb.append("\n## Cartas que cumplen los criterios pero SIN imagen en español (necesitan tu aprobación)\n\n");
        if (sel.sinImagenEspanol.isEmpty() && promos.pendientesImagenEspanol.isEmpty()) {
            sb.append("Ninguna.\n");
        }
        for (ObjectNode c : promos.pendientesImagenEspanol) {
            sb.append("- (promoción) ").append(c.path("id").asText()).append(" ").append(c.path("nombre").asText())
                    .append(" — imagen en ").append(c.path("idiomaImagen").asText())
                    .append(": ").append(c.path("imagen").asText()).append("\n");
        }
        for (ObjectNode c : sel.sinImagenEspanol) {
            sb.append("- ").append(c.path("id").asText()).append(" ").append(c.path("nombre").asText()).append("\n");
        }

        sb.append("\n## A revisar a mano\n\n");
        if (sel.revisarAMano.isEmpty()) {
            sb.append("Nada.\n");
        }
        sel.revisarAMano.forEach(r -> sb.append("- ").append(r).append("\n"));

        sb.append("\n## Cartas excluidas (por motivo)\n\n");
        for (Map.Entry<String, List<String>> e : sel.excluidas.entrySet()) {
            sb.append("- **").append(e.getKey()).append("**: ").append(e.getValue().size());
            boolean detalle = e.getKey().startsWith("Pokémon Rara Ilustración") || e.getKey().startsWith("Entrenador")
                    || e.getKey().startsWith("BWR");
            if (detalle) {
                sb.append(" — ").append(String.join(", ", e.getValue()));
            }
            sb.append("\n");
        }
        return sb.toString();
    }

    private static void tabla(StringBuilder sb, String titulo, List<ObjectNode> cartas, String categoria) {
        sb.append("\n## ").append(titulo).append("\n\n");
        boolean promo = categoria.equals(Selector.PROMO);
        sb.append(promo
                ? "| Nombre | Número | Serie | Rareza | Id TCGdex | Producto | Ilustración | Imagen |\n|---|---|---|---|---|---|---|---|\n"
                : "| Nombre | Número | Código | Expansión | Rareza | Id TCGdex | Imagen |\n|---|---|---|---|---|---|---|\n");
        int n = 0;
        for (ObjectNode c : cartas) {
            if (!c.path("categoriaColeccion").asText().equals(categoria)) {
                continue;
            }
            n++;
            sb.append("| ").append(c.path("nombre").asText()).append(" | ").append(c.path("numero").asText())
                    .append(" | ").append(c.path("expansion").asText());
            if (!promo) {
                sb.append(" | ").append(c.path("nombreExpansion").asText());
            }
            sb.append(" | ").append(c.path("rareza").asText()).append(" | ").append(c.path("id").asText());
            if (promo) {
                sb.append(" | ").append(c.path("producto").asText()).append(" | ").append(c.path("tipoIlustracion").asText());
            }
            sb.append(" | ").append(c.path("imagen").asText()).append(" |\n");
        }
        if (n == 0) {
            sb.append("| (ninguna) |\n");
        }
        sb.append("\nTotal: ").append(n).append("\n");
    }

    private static List<String> texto(JsonNode array) {
        List<String> r = new ArrayList<>();
        array.forEach(x -> r.add(x.asText()));
        return r;
    }
}
