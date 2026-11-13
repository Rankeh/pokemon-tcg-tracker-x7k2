// node web/pruebas/node-album.mjs -> pruebas del álbum que no necesitan navegador
import { ejecutar } from "./pruebas-album.js";
process.exit((await ejecutar((e, t) => console.log(e.padEnd(8), t))) ? 0 : 1);
