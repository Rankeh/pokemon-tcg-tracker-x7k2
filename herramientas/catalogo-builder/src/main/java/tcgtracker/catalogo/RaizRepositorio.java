package tcgtracker.catalogo;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Encuentra la raíz del repositorio, ejecutes el programa desde donde lo ejecutes.
 *
 * La raíz es la carpeta que contiene herramientas/catalogo-builder/pom.xml.
 * Se busca subiendo por las carpetas padre, primero desde donde están las clases compiladas
 * y, si eso no funciona, desde la carpeta de trabajo actual.
 */
public final class RaizRepositorio {

    private RaizRepositorio() {
    }

    public static Path encontrar() {
        // 1) Desde las clases compiladas (target/classes): no depende de la carpeta de trabajo.
        try {
            Path clases = Path.of(RaizRepositorio.class.getProtectionDomain()
                    .getCodeSource().getLocation().toURI());
            Path raiz = subirHastaLaRaiz(clases);
            if (raiz != null) {
                return raiz;
            }
        } catch (Exception e) {
            // Si no se puede averiguar dónde están las clases, probamos con la carpeta actual.
        }

        // 2) Desde la carpeta de trabajo actual.
        Path actual = Path.of("").toAbsolutePath().normalize();
        Path raiz = subirHastaLaRaiz(actual);
        if (raiz != null) {
            return raiz;
        }

        throw new IllegalStateException("No encuentro la raíz del repositorio (la carpeta que contiene "
                + "herramientas/catalogo-builder/pom.xml) subiendo desde " + actual
                + ". Abre el proyecto dentro de la carpeta del repositorio y ejecuta de nuevo.");
    }

    private static Path subirHastaLaRaiz(Path inicio) {
        Path carpeta = inicio.toAbsolutePath().normalize();
        while (carpeta != null) {
            if (Files.exists(carpeta.resolve("herramientas").resolve("catalogo-builder").resolve("pom.xml"))) {
                return carpeta;
            }
            carpeta = carpeta.getParent();
        }
        return null;
    }
}
