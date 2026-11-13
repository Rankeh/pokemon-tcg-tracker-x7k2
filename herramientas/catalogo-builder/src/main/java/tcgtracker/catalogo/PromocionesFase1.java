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
    public final List<String> avisos = new ArrayList<>();

    public static PromocionesFase1 procesar(Path archivoDecisiones, Path carpetaCrudo) throws IOException {
        PromocionesFase1 p = new PromocionesFase1();
        JsonNode config = new ObjectMapper().readTree(archivoDecisiones.toFile());

        TcgdexCliente es = new TcgdexCliente("es", carpetaCrudo.resolve("es"));
        TcgdexCliente en = new TcgdexCliente("en", carpetaCrudo.resolve("en"));

        JsonNode listaEs = intentar(es, "svp");
        JsonNode listaEn = null;
        boolean enIntentada = false;

        for (JsonNode c : config.path("candidatas")) {
            String nombre = c.path("busqueda").asText();
            List<Coincidencia> coincidencias = new ArrayList<>();
            String nota = "";

            // Primero español; si no hay la serie o la carta en español, se prueba inglés y se avisa.
            if (listaEs != null) {
                buscar(p, es, listaEs, nombre, "es", coincidencias);
            }
            if (coincidencias.isEmpty()) {
                if (!enIntentada) {
                    listaEn = intentar(en, "svp");
                    enIntentada = true;
                }
                if (listaEn != null) {
                    buscar(p, en, listaEn, nombre, "en", coincidencias);
                    if (!coincidencias.isEmpty()) {
                        nota = "No está en español en TCGdex: datos e imágenes en inglés (requiere tu aprobación).";
                    }
                }
            }
            if (coincidencias.isEmpty()) {
                nota = (listaEs == null && listaEn == null)
                        ? "No se pudo descargar la serie svp (revisa la conexión)."
                        : "Sin coincidencias en svp para '" + nombre + "'.";
            }
            p.informes.add(new Informe(c, coincidencias, nota.trim()));

            if (c.path("estado").asText().equals("confirmada")) {
                p.recogerConfirmada(c, coincidencias);
            }
        }
        return p;
    }

    private static void buscar(PromocionesFase1 p, TcgdexCliente cliente, JsonNode lista, String nombre,
                               String idioma, List<Coincidencia> destino) {
        for (JsonNode resumen : lista.path("cards")) {
            if (!resumen.path("name").asText().toLowerCase().contains(nombre.toLowerCase())) {
                continue;
            }
            try {
                JsonNode carta = cliente.obtenerCarta(resumen.path("id").asText());
                destino.add(new Coincidencia(carta.path("id").asText(), carta.path("localId").asText(),
                        carta.path("name").asText(), carta.path("rarity").asText(""),
                        carta.path("illustrator").asText(""),
                        carta.hasNonNull("image") ? carta.path("image").asText() + "/high.webp" : "", idioma));
            } catch (IOException | InterruptedException e) {
                p.problemas.add(resumen.path("id").asText() + ": " + e.getMessage());
            }
        }
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
        o.put("producto", c.path("producto").asText());
        o.put("tipoIlustracion", c.path("tipoIlustracion").asText());
        o.put("verificacion", "confirmada (número, producto e ilustración contrastados en varias fuentes; ver promociones.json)");

        String esperado = c.path("ilustradorEsperado").asText("");
        if (!esperado.isEmpty() && !elegida.ilustrador().toLowerCase().contains(esperado.toLowerCase())) {
            avisos.add(elegida.id() + ": TCGdex da el ilustrador '" + elegida.ilustrador()
                    + "' y las fuentes decían '" + esperado + "'. Compruébalo mirando la imagen.");
        }
        elegirImagen(o, c, elegida);
        // Se conserva siempre (la selección está aprobada); el estado de la imagen va en la propia ficha.
        confirmadas.add(o);
    }

    /**
     * Busca una imagen que de verdad cargue, preferiendo español. Orden de prueba:
     * 1) la que da TCGdex; 2) el patrón documentado de TCGdex (assets.tcgdex.net/{idioma}/sv/svp/{número}/high.webp)
     * en español e inglés; 3) 'imagenAlternativa' de promociones.json (solo si la pones tú).
     * Solo se acepta lo que responde HTTP 200 con tipo image/*. No se inventa nada: si nada carga, queda sin imagen.
     */
    private void elegirImagen(ObjectNode o, JsonNode c, Coincidencia elegida) {
        record Candidata(String url, String idioma, String origen) {
        }
        List<Candidata> candidatas = new ArrayList<>();
        if (!elegida.imagen().isEmpty()) {
            candidatas.add(new Candidata(elegida.imagen(), Imagenes.idiomaDe(elegida.imagen()), "TCGdex (campo image)"));
        }
        String patron = "https://assets.tcgdex.net/%s/sv/svp/" + elegida.numero() + "/high.webp";
        candidatas.add(new Candidata(patron.formatted("es"), "es", "patrón documentado de TCGdex, comprobado"));
        candidatas.add(new Candidata(patron.formatted("en"), "en", "patrón documentado de TCGdex, comprobado"));
        JsonNode alt = c.path("imagenAlternativa");
        if (alt.hasNonNull("url")) {
            candidatas.add(new Candidata(alt.path("url").asText(), alt.path("idioma").asText(""),
                    "alternativa aportada: " + alt.path("fuente").asText("sin fuente indicada")));
        }

        Candidata mejor = null;
        Imagenes.Comprobacion mejorComprobacion = null;
        Imagenes.Comprobacion ultimo = new Imagenes.Comprobacion(false, "sin candidatas");
        java.util.Set<String> vistas = new java.util.HashSet<>();
        for (Candidata cand : candidatas) {
            if (!vistas.add(cand.url())) {
                continue;
            }
            Imagenes.Comprobacion r = Imagenes.comprobar(cand.url());
            ultimo = r;
            if (!r.carga()) {
                continue;
            }
            if (cand.idioma().equals("es")) {
                mejor = cand;
                mejorComprobacion = r;
                break;
            }
            if (mejor == null) {
                mejor = cand;
                mejorComprobacion = r;
            }
        }
        if (mejor == null) {
            o.put("imagen", "");
            Imagenes.anotar(o, "", new Imagenes.Comprobacion(false,
                    "ninguna URL candidata carga (último intento: " + ultimo.motivo() + ")"), "ninguno");
        } else {
            o.put("imagen", mejor.url());
            Imagenes.anotar(o, mejor.idioma(), mejorComprobacion, mejor.origen());
        }
    }

    private static JsonNode intentar(TcgdexCliente cliente, String id) {
        try {
            return cliente.obtenerExpansion(id);
        } catch (IOException | InterruptedException e) {
            return null;
        }
    }
}
