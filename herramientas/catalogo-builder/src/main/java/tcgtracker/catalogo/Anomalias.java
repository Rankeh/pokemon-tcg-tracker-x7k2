package tcgtracker.catalogo;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Recoge las anomalías del catálogo y escribe un informe breve (sin precios ni JSON enormes). */
public final class Anomalias {

    private final List<String> errores = new ArrayList<>();
    private final List<String> avisos = new ArrayList<>();

    /** Algo que impide generar un catálogo fiable (colisión sin decisión, ancla no encontrada...). */
    public void error(String texto) {
        errores.add(texto);
    }

    /** Algo que conviene saber pero que no impide generar el catálogo. */
    public void aviso(String texto) {
        avisos.add(texto);
    }

    public boolean hayErrores() {
        return !errores.isEmpty();
    }

    public List<String> errores() {
        return errores;
    }

    public void guardar(Path archivo, int entradas, int coleccionables) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("INFORME DE ANOMALÍAS DEL CATÁLOGO\n\n");
        sb.append("Entradas de variantes en TCGdex: ").append(entradas).append("\n");
        sb.append("Variantes coleccionables tras resolver anomalías: ").append(coleccionables).append("\n\n");
        sb.append("ERRORES (impiden generar el catálogo): ").append(errores.size()).append("\n");
        errores.forEach(e -> sb.append("  - ").append(e).append("\n"));
        sb.append("\nAVISOS: ").append(avisos.size()).append("\n");
        avisos.forEach(a -> sb.append("  - ").append(a).append("\n"));
        Archivos.guardarSinRiesgo(archivo, sb.toString());
    }

    public void imprimir() {
        System.out.println("Anomalías: " + errores.size() + " errores, " + avisos.size() + " avisos");
        errores.forEach(e -> System.out.println("  ERROR: " + e));
        avisos.forEach(a -> System.out.println("  aviso: " + a));
    }
}
