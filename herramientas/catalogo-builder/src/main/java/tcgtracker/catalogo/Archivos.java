package tcgtracker.catalogo;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/** Utilidades para guardar archivos sin dejar nunca uno a medias. */
public final class Archivos {

    private Archivos() {
    }

    /**
     * Escribe primero en un archivo temporal y, cuando está completo, lo mueve a su sitio.
     * Así, si el programa se corta a mitad de la escritura, el archivo anterior sigue intacto.
     */
    public static void guardarSinRiesgo(Path archivo, String contenido) throws IOException {
        Path destino = archivo.toAbsolutePath().normalize();
        Files.createDirectories(destino.getParent());

        Path temporal = destino.resolveSibling(destino.getFileName() + ".tmp");
        Files.writeString(temporal, contenido);

        try {
            Files.move(temporal, destino, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(temporal, destino, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
