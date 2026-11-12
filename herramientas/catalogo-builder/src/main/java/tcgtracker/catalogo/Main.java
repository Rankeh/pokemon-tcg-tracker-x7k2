package tcgtracker.catalogo;

import com.fasterxml.jackson.databind.JsonNode;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public class Main {

    public static void main(String[] args) throws Exception {
        // Desde catalogo-builder/, "../.." es la raíz del repositorio.
        Path carpetaDatos = Path.of("..", "..", "datos", "crudo", "es");
        TcgdexCliente cliente = new TcgdexCliente("es", carpetaDatos);

        List<String> expansiones = List.of("sv10.5b", "sv10.5w");

        for (String idExpansion : expansiones) {
            System.out.println("Descargando " + idExpansion + "...");
            JsonNode expansion = cliente.obtenerExpansion(idExpansion);

            List<JsonNode> cartas = new ArrayList<>();
            for (JsonNode resumen : expansion.path("cards")) {
                cartas.add(cliente.obtenerCarta(resumen.path("id").asText()));
            }

            Auditoria.informe(expansion, cartas, carpetaDatos);
        }
    }
}
