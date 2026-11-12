package tcgtracker.catalogo;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Revisa los datos descargados de una expansión y genera un informe y un CSV. */
public class Auditoria {

    public static void informe(JsonNode expansion, List<JsonNode> cartas, Path carpeta) throws IOException {
        String id = texto(expansion, "id", "?");
        System.out.println();
        System.out.println("=== " + texto(expansion, "name", "(sin nombre)") + " [" + id + "] ===");
        System.out.println("Cartas descargadas: " + cartas.size());
        System.out.println("Según TCGdex -> oficiales: "
                + expansion.path("cardCount").path("official").asText("?")
                + ", total: " + expansion.path("cardCount").path("total").asText("?"));

        int sinNombre = 0;
        int sinImagen = 0;
        int conNormal = 0;
        int conReverse = 0;
        int conHolo = 0;
        Map<String, Integer> rarezas = new TreeMap<>();
        StringBuilder csv = new StringBuilder("id;numero;nombre;rareza;categoria;imagen;normal;reverse;holo\n");

        for (JsonNode carta : cartas) {
            String nombre = texto(carta, "name", "");
            String rareza = texto(carta, "rarity", "(sin rareza)");
            boolean hayImagen = carta.hasNonNull("image");
            boolean normal = carta.path("variants").path("normal").asBoolean(false);
            boolean reverse = carta.path("variants").path("reverse").asBoolean(false);
            boolean holo = carta.path("variants").path("holo").asBoolean(false);

            if (nombre.isBlank()) sinNombre++;
            if (!hayImagen) sinImagen++;
            if (normal) conNormal++;
            if (reverse) conReverse++;
            if (holo) conHolo++;
            rarezas.merge(rareza, 1, Integer::sum);

            csv.append(String.join(";",
                    limpiar(texto(carta, "id", "")),
                    limpiar(texto(carta, "localId", "")),
                    limpiar(nombre),
                    limpiar(rareza),
                    limpiar(texto(carta, "category", "")),
                    hayImagen ? "si" : "NO",
                    normal ? "si" : "no",
                    reverse ? "si" : "no",
                    holo ? "si" : "no")).append("\n");
        }

        System.out.println("Sin nombre: " + sinNombre + " | Sin imagen: " + sinImagen);
        System.out.println("Variantes marcadas por TCGdex -> normal: " + conNormal
                + ", reverse: " + conReverse + ", holo: " + conHolo);
        System.out.println("Rarezas:");
        rarezas.forEach((rareza, cantidad) -> System.out.println("  " + rareza + ": " + cantidad));

        System.out.println("Primeras cartas:");
        for (int i = 0; i < Math.min(5, cartas.size()); i++) {
            System.out.println("  " + texto(cartas.get(i), "localId", "?") + " " + texto(cartas.get(i), "name", "?"));
        }

        Files.createDirectories(carpeta);
        Path archivoCsv = carpeta.resolve("auditoria-" + id + ".csv");
        // El carácter ﻿ hace que Excel lea bien las tildes.
        Files.writeString(archivoCsv, "﻿" + csv);
        System.out.println("CSV guardado en: " + archivoCsv.toAbsolutePath().normalize());
    }

    /** Devuelve el texto de un campo, o un valor por defecto si no existe o es null. */
    private static String texto(JsonNode nodo, String campo, String porDefecto) {
        JsonNode valor = nodo.get(campo);
        return (valor == null || valor.isNull()) ? porDefecto : valor.asText();
    }

    /** Evita que un ';' dentro de un nombre rompa las columnas del CSV. */
    private static String limpiar(String texto) {
        return texto.replace(";", ",");
    }
}
