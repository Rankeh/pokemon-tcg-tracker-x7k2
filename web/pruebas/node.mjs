// node web/pruebas/node.mjs  -> ejecuta las pruebas de lógica (las de IndexedDB e imagen son del navegador)
import { ejecutar } from "./pruebas.js";
const ok = await ejecutar((estado, texto) => console.log(estado.padEnd(8), texto));
process.exit(ok ? 0 : 1);
