// Texto para comparar nombres (buscadores, «Buscar carta», ?buscar= del visor…): sin tildes, sin mayúsculas y sin espacios de más.
// Uno solo para toda la web: así la biblioteca, el selector de cartas y el visor coinciden siempre en qué es «la misma carta».
export const plano = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
