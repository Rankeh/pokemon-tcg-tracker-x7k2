package tcgtracker.catalogo;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/** Revisa las fichas descargadas de una expansión y genera un informe y un CSV. */
public class Auditoria {

    public static void informe(JsonNode expansion, List<JsonNode> cartas, Path carpeta) throws IOException {
        String id = texto(expansion, "id", "?");
        int oficiales = expansion.path("cardCount").path("official").asInt(-1);
        int total = expansion.path("cardCount").path("total").asInt(-1);

        System.out.println();
        System.out.println("=== " + texto(expansion, "name", "(sin nombre)") + " [" + id + "] ===");
        System.out.println("Cartas descargadas: " + cartas.size()
                + " (TCGdex dice: oficiales " + oficiales + ", total " + total + ")");
        if (cartas.size() != total) {
            System.out.println("ATENCIÓN: faltan o sobran cartas respecto al total que indica TCGdex.");
        }

        int sinNombre = 0;
        int sinImagen = 0;
        int imagenNoEspanola = 0;
        int sinDetalle = 0;          // cartas sin variants_detailed
        int sinVariantId = 0;
        int variantIdRepetidos = 0;
        Map<String, Integer> categorias = new TreeMap<>();
        Map<String, Integer> rarezas = new TreeMap<>();
        Map<Integer, Integer> variantesPorCarta = new TreeMap<>();
        Map<String, Integer> tiposDeVariante = new TreeMap<>();
        Set<String> camposDeVariante = new TreeSet<>();
        Set<String> idsVistos = new HashSet<>();
        Map<String, JsonNode> ejemplos = new LinkedHashMap<>();
        StringBuilder csv = new StringBuilder(
                "id;numero;nombre;categoria;rareza;rareza_es;imagen;n_variantes;variantes\n");

        for (JsonNode carta : cartas) {
            String nombre = texto(carta, "name", "");
            String categoria = texto(carta, "category", "(sin categoría)");
            String rareza = texto(carta, "rarity", "(sin rareza)");
            String imagen = texto(carta, "image", "");
            JsonNode variantes = carta.path("variants_detailed");

            if (nombre.isBlank()) sinNombre++;
            if (imagen.isBlank()) {
                sinImagen++;
            } else if (!imagen.contains("/es/")) {
                imagenNoEspanola++;
            }
            categorias.merge(categoria, 1, Integer::sum);
            rarezas.merge(rareza, 1, Integer::sum);

            if (!variantes.isArray() || variantes.size() == 0) {
                sinDetalle++;
            }
            for (JsonNode variante : variantes) {
                tiposDeVariante.merge(etiqueta(variante), 1, Integer::sum);

                Iterator<String> campos = variante.fieldNames();
                while (campos.hasNext()) {
                    camposDeVariante.add(campos.next());
                }

                String variantId = texto(variante, "variantId", "");
                if (variantId.isBlank()) {
                    sinVariantId++;
                } else if (!idsVistos.add(variantId)) {
                    variantIdRepetidos++;
                }
            }
            List<String> etiquetas = etiquetasDe(carta);
            variantesPorCarta.merge(etiquetas.size(), 1, Integer::sum);
            ejemplos.putIfAbsent(categoria + " / " + rareza, carta);

            csv.append(String.join(";",
                    limpiar(texto(carta, "id", "")),
                    limpiar(texto(carta, "localId", "")),
                    limpiar(nombre),
                    limpiar(categoria),
                    limpiar(rareza),
                    limpiar(Traducciones.rareza(rareza)),
                    imagen.isBlank() ? "NO" : "si",
                    String.valueOf(etiquetas.size()),
                    limpiar(String.join(" | ", etiquetas)))).append("\n");
        }

        System.out.println("Sin nombre: " + sinNombre + " | Sin imagen: " + sinImagen
                + " | Imagen que no es de la versión española: " + imagenNoEspanola);

        System.out.println("Categorías:");
        categorias.forEach((categoria, cantidad) -> System.out.println("  " + categoria + ": " + cantidad));

        System.out.println("Rarezas:");
        rarezas.forEach((original, cantidad) -> {
            String traducida = Traducciones.rareza(original);
            String nota = "";
            if (!traducida.equals(original)) {
                nota = " -> " + traducida + " (traducida por nosotros)";
            }
            if (!Traducciones.esRarezaConocida(traducida)) {
                nota += "  ATENCIÓN: rareza desconocida, revisar";
            }
            System.out.println("  " + original + ": " + cantidad + nota);
        });

        System.out.println("Variantes (campo variants_detailed):");
        System.out.println("  Cartas sin variantes detalladas: " + sinDetalle);
        System.out.println("  Variantes sin variantId: " + sinVariantId
                + " | variantId repetidos: " + variantIdRepetidos);
        System.out.println("  Campos que aparecen en las variantes: " + camposDeVariante);
        System.out.println("  Cartas según su número de variantes:");
        variantesPorCarta.forEach((n, cuantas) ->
                System.out.println("    " + n + " variantes: " + cuantas + " cartas"));
        System.out.println("  Tipos de variante y cuántas hay de cada tipo:");
        tiposDeVariante.forEach((tipo, cantidad) -> System.out.println("    " + tipo + ": " + cantidad));

        System.out.println("Una carta de ejemplo por categoría y rareza:");
        ejemplos.forEach((clave, carta) -> System.out.println("  " + clave + " -> "
                + texto(carta, "localId", "?") + " " + texto(carta, "name", "?")
                + " [" + String.join(" | ", etiquetasDe(carta)) + "]"));

        Files.createDirectories(carpeta);
        Path archivoCsv = carpeta.resolve("auditoria-" + id + ".csv");
        // El carácter ﻿ hace que Excel lea bien las tildes.
        Files.writeString(archivoCsv, "﻿" + csv);
        System.out.println("CSV guardado en: " + archivoCsv.toAbsolutePath().normalize());
    }

    /** Una etiqueta legible por variante, por ejemplo: type=reverse, foil=..., size=standard. */
    private static String etiqueta(JsonNode variante) {
        return "type=" + texto(variante, "type", "-")
                + ", foil=" + texto(variante, "foil", "-")
                + ", size=" + texto(variante, "size", "-");
    }

    private static List<String> etiquetasDe(JsonNode carta) {
        List<String> etiquetas = new ArrayList<>();
        for (JsonNode variante : carta.path("variants_detailed")) {
            etiquetas.add(etiqueta(variante));
        }
        return etiquetas;
    }

    /** Devuelve el valor de un campo como texto, o un valor por defecto si no existe o es null. */
    private static String texto(JsonNode nodo, String campo, String porDefecto) {
        JsonNode valor = nodo.get(campo);
        if (valor == null || valor.isNull()) {
            return porDefecto;
        }
        return valor.isValueNode() ? valor.asText() : valor.toString();
    }

    /** Evita que un ';' dentro de un texto rompa las columnas del CSV. */
    private static String limpiar(String texto) {
        return texto.replace(";", ",");
    }
}
