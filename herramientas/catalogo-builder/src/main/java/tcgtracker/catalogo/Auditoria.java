package tcgtracker.catalogo;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/** Revisa las fichas descargadas y genera informes y CSV para comprobar los datos a mano. */
public class Auditoria {

    /** Informe de una expansión: lo que hay y lo que parece raro. */
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
        int sinDetalle = 0;            // cartas sin variants_detailed
        int sinVariantId = 0;
        int totalVariantes = 0;
        int variantIdYaVistos = 0;     // variantId que ya había aparecido en otra variante de la expansión
        List<String> cartasConIdDuplicado = new ArrayList<>();
        List<String> cartasConVariantesIguales = new ArrayList<>();
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
            String etiquetaCarta = texto(carta, "localId", "?") + " " + nombre;

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

            List<String> firmas = new ArrayList<>();
            Set<String> idsDeLaCarta = new HashSet<>();
            boolean idDuplicado = false;
            boolean firmaDuplicada = false;

            for (JsonNode variante : variantes) {
                totalVariantes++;
                String firma = ClavesDeVariante.firma(variante);
                if (firmas.contains(firma)) {
                    firmaDuplicada = true;
                }
                firmas.add(firma);
                tiposDeVariante.merge(firma, 1, Integer::sum);

                Iterator<String> campos = variante.fieldNames();
                while (campos.hasNext()) {
                    camposDeVariante.add(campos.next());
                }

                String variantId = texto(variante, "variantId", "");
                if (variantId.isBlank()) {
                    sinVariantId++;
                } else {
                    if (!idsDeLaCarta.add(variantId)) {
                        idDuplicado = true;
                    }
                    if (!idsVistos.add(variantId)) {
                        variantIdYaVistos++;
                    }
                }
            }

            if (idDuplicado) cartasConIdDuplicado.add(etiquetaCarta);
            if (firmaDuplicada) cartasConVariantesIguales.add(etiquetaCarta);
            variantesPorCarta.merge(firmas.size(), 1, Integer::sum);
            ejemplos.putIfAbsent(categoria + " / " + rareza, carta);

            csv.append(String.join(";",
                    limpiar(texto(carta, "id", "")),
                    limpiar(texto(carta, "localId", "")),
                    limpiar(nombre),
                    limpiar(categoria),
                    limpiar(rareza),
                    limpiar(Traducciones.rareza(rareza)),
                    imagen.isBlank() ? "NO" : "si",
                    String.valueOf(firmas.size()),
                    limpiar(String.join(" | ", firmas)))).append("\n");
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
        System.out.println("  Variantes: " + totalVariantes + " | variantId distintos: " + idsVistos.size()
                + " | variantes cuyo variantId ya había salido antes en la expansión: " + variantIdYaVistos);
        System.out.println("  Cartas sin variantes detalladas: " + sinDetalle + " | variantes sin variantId: " + sinVariantId);
        System.out.println("  Cartas con el mismo variantId dos veces: " + cartasConIdDuplicado.size()
                + ejemplosDe(cartasConIdDuplicado));
        System.out.println("  Cartas con dos variantes idénticas (mismos campos salvo el variantId): "
                + cartasConVariantesIguales.size() + ejemplosDe(cartasConVariantesIguales));
        System.out.println("  Campos que aparecen en las variantes: " + camposDeVariante);
        System.out.println("  Cartas según su número de variantes:");
        variantesPorCarta.forEach((n, cuantas) ->
                System.out.println("    " + n + " variantes: " + cuantas + " cartas"));
        System.out.println("  Tipos de variante y cuántas hay de cada tipo:");
        tiposDeVariante.forEach((tipo, cantidad) -> System.out.println("    " + tipo + ": " + cantidad));

        System.out.println("Una carta de ejemplo por categoría y rareza:");
        ejemplos.forEach((clave, carta) -> System.out.println("  " + clave + " -> "
                + texto(carta, "localId", "?") + " " + texto(carta, "name", "?")
                + " [" + String.join(" | ", firmasDe(carta)) + "]"));

        Files.createDirectories(carpeta);
        Path archivoCsv = carpeta.resolve("auditoria-" + id + ".csv");
        // El carácter ﻿ hace que Excel lea bien las tildes.
        Files.writeString(archivoCsv, "﻿" + csv);
        System.out.println("CSV guardado en: " + archivoCsv.toAbsolutePath().normalize());
    }

    /**
     * Informe de todas las variantes de todas las expansiones juntas.
     * Responde a: ¿qué representa cada variantId?, ¿qué valores toman type/foil/size/...?,
     * ¿qué combinaciones de variantes tiene cada tipo de carta?, ¿es única la clave idCarta|variantId?
     * No elimina ni modifica nada: solo describe lo que hay.
     */
    public static void informeGlobal(List<JsonNode> cartas, Path carpeta) throws IOException {
        List<String> lineas = new ArrayList<>();
        Map<String, Set<String>> firmasPorId = new TreeMap<>();
        Map<String, Set<String>> expansionesPorId = new TreeMap<>();
        Map<String, Integer> usosPorId = new TreeMap<>();
        Map<String, Map<String, Integer>> valoresPorCampo = new TreeMap<>();
        Map<String, Map<String, Integer>> perfiles = new TreeMap<>();
        Set<String> claves = new HashSet<>();
        List<String> clavesRepetidas = new ArrayList<>();
        int totalVariantes = 0;
        StringBuilder csv = new StringBuilder(
                "clave;carta;expansion;numero;nombre;categoria;rareza;variantId;firma\n");

        for (JsonNode carta : cartas) {
            String idCarta = texto(carta, "id", "?");
            String expansion = carta.path("set").path("id").asText("?");
            String categoria = texto(carta, "category", "(sin categoría)");
            String rareza = Traducciones.rareza(texto(carta, "rarity", "(sin rareza)"));
            List<String> firmasDeLaCarta = new ArrayList<>();

            for (JsonNode variante : carta.path("variants_detailed")) {
                totalVariantes++;
                String variantId = texto(variante, "variantId", "(sin variantId)");
                String firma = ClavesDeVariante.firma(variante);
                String clave = ClavesDeVariante.clave(idCarta, variante);

                firmasPorId.computeIfAbsent(variantId, k -> new TreeSet<>()).add(firma);
                expansionesPorId.computeIfAbsent(variantId, k -> new TreeSet<>()).add(expansion);
                usosPorId.merge(variantId, 1, Integer::sum);

                Iterator<String> campos = variante.fieldNames();
                while (campos.hasNext()) {
                    String campo = campos.next();
                    if (!campo.equals("variantId")) {
                        valoresPorCampo.computeIfAbsent(campo, k -> new TreeMap<>())
                                .merge(texto(variante, campo, "null"), 1, Integer::sum);
                    }
                }

                if (!claves.add(clave)) {
                    clavesRepetidas.add(clave);
                }
                firmasDeLaCarta.add(firma);

                csv.append(String.join(";",
                        limpiar(clave), limpiar(idCarta), limpiar(expansion),
                        limpiar(texto(carta, "localId", "")), limpiar(texto(carta, "name", "")),
                        limpiar(categoria), limpiar(rareza), limpiar(variantId), limpiar(firma))).append("\n");
            }

            Collections.sort(firmasDeLaCarta);
            String perfil = firmasDeLaCarta.isEmpty() ? "(sin variantes)" : String.join(" | ", firmasDeLaCarta);
            perfiles.computeIfAbsent(categoria + " / " + rareza, k -> new TreeMap<>()).merge(perfil, 1, Integer::sum);
        }

        lineas.add("=== INFORME GLOBAL DE VARIANTES ===");
        lineas.add("Cartas: " + cartas.size() + " | Variantes: " + totalVariantes
                + " | variantId distintos: " + firmasPorId.size());

        lineas.add("");
        lineas.add("1) Qué representa cada variantId");
        lineas.add("   (si un mismo variantId aparece en muchas cartas, identifica un TIPO de variante y no una carta)");
        List<Map.Entry<String, Integer>> ordenados = new ArrayList<>(usosPorId.entrySet());
        ordenados.sort((a, b) -> b.getValue() - a.getValue());
        int mostrados = 0;
        for (Map.Entry<String, Integer> uso : ordenados) {
            if (mostrados++ >= 60) {
                lineas.add("   ... y " + (ordenados.size() - 60) + " variantId más (están en el CSV)");
                break;
            }
            String variantId = uso.getKey();
            Set<String> firmas = firmasPorId.get(variantId);
            lineas.add("   " + variantId + " -> usado " + uso.getValue() + " veces, expansiones "
                    + expansionesPorId.get(variantId) + ", " + firmas);
            if (firmas.size() > 1) {
                lineas.add("      ATENCIÓN: este variantId aparece con descripciones distintas");
            }
        }

        lineas.add("");
        lineas.add("2) Valores de cada campo de las variantes (sin contar variantId)");
        for (Map.Entry<String, Map<String, Integer>> campo : valoresPorCampo.entrySet()) {
            StringBuilder valores = new StringBuilder();
            int n = 0;
            for (Map.Entry<String, Integer> valor : campo.getValue().entrySet()) {
                if (n++ >= 15) {
                    valores.append(", ... (" + (campo.getValue().size() - 15) + " valores más)");
                    break;
                }
                if (valores.length() > 0) valores.append(", ");
                valores.append(valor.getKey()).append(" (").append(valor.getValue()).append(")");
            }
            lineas.add("   " + campo.getKey() + ": " + valores);
        }

        lineas.add("");
        lineas.add("3) Combinaciones de variantes por categoría y rareza (cuántas cartas tienen cada combinación)");
        for (Map.Entry<String, Map<String, Integer>> grupo : perfiles.entrySet()) {
            lineas.add("   " + grupo.getKey() + ":");
            List<Map.Entry<String, Integer>> combinaciones = new ArrayList<>(grupo.getValue().entrySet());
            combinaciones.sort((a, b) -> b.getValue() - a.getValue());
            for (Map.Entry<String, Integer> combinacion : combinaciones) {
                lineas.add("      " + combinacion.getValue() + " cartas -> " + combinacion.getKey());
            }
        }

        lineas.add("");
        lineas.add("4) Clave única de cada variante: idCarta|variantId");
        lineas.add("   Claves distintas: " + claves.size() + " de " + totalVariantes + " variantes | repetidas: "
                + clavesRepetidas.size() + ejemplosDe(clavesRepetidas));
        lineas.add("   (el CSV auditoria-variantes.csv tiene una fila por variante)");

        System.out.println();
        lineas.forEach(System.out::println);

        Files.createDirectories(carpeta);
        Files.write(carpeta.resolve("informe-variantes.txt"), lineas);
        Files.writeString(carpeta.resolve("auditoria-variantes.csv"), "﻿" + csv);
        System.out.println();
        System.out.println("Informe guardado en: " + carpeta.resolve("informe-variantes.txt").toAbsolutePath().normalize());
    }

    private static List<String> firmasDe(JsonNode carta) {
        List<String> firmas = new ArrayList<>();
        for (JsonNode variante : carta.path("variants_detailed")) {
            firmas.add(ClavesDeVariante.firma(variante));
        }
        return firmas;
    }

    /** Texto con los primeros ejemplos de una lista, para no llenar la pantalla. */
    private static String ejemplosDe(List<String> elementos) {
        if (elementos.isEmpty()) {
            return "";
        }
        List<String> primeros = elementos.subList(0, Math.min(10, elementos.size()));
        return " (por ejemplo: " + String.join("; ", primeros) + ")";
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
