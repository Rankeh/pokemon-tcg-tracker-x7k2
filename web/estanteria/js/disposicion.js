// Medidas compartidas de los libros de la biblioteca (PURO).
// Son las del álbum 3D existente (modelo/album.glb): 258 mm de tapa + 10 mm de lomo, 322 mm de alto y 46,5 mm de grosor cerrado.
export const LIBRO = { grueso: 0.0465, alto: 0.322, fondo: 0.268 };

/** 3.20 · Anatomía del álbum 3D (blender/teselia/modelo_web.py): tapas de 6 mm, hojas a 3,5 mm, 9 cartas por página y 2 páginas por hoja.
 *  Tapa 258 × 322 mm (esquinas de 16 mm por fuera), lomo de 10 mm; hojas 232 × 300 mm; banda x 12–46 mm y panel x 55–244 mm, ambos de 282 mm. */
export const ANATOMIA = { grosorTapa: 0.006, paso: 0.0035, anchoTapa: 0.258, lomo: 0.010, radioTapa: 0.016, anchoHoja: 0.232, altoHoja: 0.3,
  banda: [0.012, 0.046], panel: [0.055, 0.244], altoPieza: 0.282, radioBanda: 0.005, radioPanel: 0.014 };
/** PURO · hojas del modelo para un catálogo de `cartas` cartas (las mismas que elige el visor: album.glb = 9, album-<n>h.glb). */
export const hojasPara = (cartas) => Math.max(1, Math.ceil(Math.ceil(cartas / 9) / 2));
/** PURO · grosor del álbum cerrado (igual que el lomo del modelo): 2 tapas + hojas. Teselia (9 hojas) = 43,5 mm. */
export const grosorAlbum = (cartas) => 2 * ANATOMIA.grosorTapa + hojasPara(cartas) * ANATOMIA.paso;
