package tcgtracker.catalogo;

import java.util.Map;
import java.util.Set;

/**
 * Correcciones para textos que TCGdex todavía no tiene traducidos al español.
 * Solo se añade aquí lo que hemos comprobado: "Uncommon" aparece sin traducir y en
 * español se llama "Infrecuente" (así figura en WikiDex).
 */
public final class Traducciones {

    private static final Map<String, String> RAREZAS = Map.of(
            "Uncommon", "Infrecuente");

    /** Rarezas en español que hemos visto en Fulgor Negro y Llama Blanca. */
    private static final Set<String> RAREZAS_CONOCIDAS = Set.of(
            "Común",
            "Infrecuente",
            "Rara",
            "Rara Doble",
            "Rara Ilustración",
            "Rara Ilustración Especial",
            "Ultra Rara",
            "Rara Blanca y Negra");

    private Traducciones() {
    }

    public static String rareza(String original) {
        return RAREZAS.getOrDefault(original, original);
    }

    public static boolean esRarezaConocida(String rarezaEnEspanol) {
        return RAREZAS_CONOCIDAS.contains(rarezaEnEspanol);
    }
}
