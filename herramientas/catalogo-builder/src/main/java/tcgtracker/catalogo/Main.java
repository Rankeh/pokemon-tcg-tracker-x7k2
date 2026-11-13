package tcgtracker.catalogo;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public class Main {

    public static void main(String[] args) throws Exception {
        // La raíz se busca sola, ejecutes el programa desde VS Code o desde la carpeta que sea.
        Path raizRepositorio = RaizRepositorio.encontrar();
        System.out.println("Raíz del repositorio: " + raizRepositorio);

        Path carpetaCrudo = raizRepositorio.resolve("datos").resolve("crudo").resolve("es");
        Path archivoCatalogo = raizRepositorio.resolve("datos").resolve("catalogo").resolve("catalogo.json");

        TcgdexCliente cliente = new TcgdexCliente("es", carpetaCrudo);
        List<String> idsExpansiones = List.of("sv10.5b", "sv10.5w");

        List<JsonNode> expansiones = new ArrayList<>();
        List<JsonNode> todasLasCartas = new ArrayList<>();
        List<String> fallos = new ArrayList<>();

        for (String idExpansion : idsExpansiones) {
            System.out.println("Descargando " + idExpansion + "...");

            JsonNode expansion;
            try {
                expansion = cliente.obtenerExpansion(idExpansion);
            } catch (IOException e) {
                fallos.add(idExpansion + ": " + e.getMessage());
                continue;
            }

            List<JsonNode> cartas = new ArrayList<>();
            for (JsonNode resumen : expansion.path("cards")) {
                String idCarta = resumen.path("id").asText();
                try {
                    cartas.add(cliente.obtenerCarta(idCarta));
                } catch (IOException e) {
                    fallos.add(idCarta + ": " + e.getMessage());
                }
            }

            Auditoria.informe(expansion, cartas, carpetaCrudo);
            expansiones.add(expansion);
            todasLasCartas.addAll(cartas);
        }

        System.out.println();
        System.out.println(cliente.resumen());

        // Un catálogo incompleto es peor que ninguno: si algo falló, no se genera.
        if (!fallos.isEmpty()) {
            System.out.println();
            System.out.println("NO se genera el catálogo: han fallado " + fallos.size() + " peticiones:");
            fallos.forEach(fallo -> System.out.println("  " + fallo));
            System.out.println("Vuelve a ejecutar el programa: lo ya descargado se lee de disco y solo "
                    + "se piden las fichas que faltan.");
            return;
        }

        Auditoria.informeGlobal(todasLasCartas, carpetaCrudo);

        try {
            GeneradorCatalogo.generar(expansiones, todasLasCartas, archivoCatalogo);
        } catch (IOException e) {
            System.out.println();
            System.out.println("NO se ha guardado el catálogo: " + e.getMessage());
        }
    }
}
