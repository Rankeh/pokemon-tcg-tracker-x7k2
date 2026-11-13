// Suite de integridad del adaptador. Se ejecuta en DOS entornos con el MISMO código:
//   · Node (alm. en memoria, mismas operaciones públicas que Almacen)    → node --test web/prueba-3d/pruebas/coleccion.test.mjs
//   · Chromium con IndexedDB REAL (base de datos de PRUEBA, nunca 'coleccion-teselia') → node web/prueba-3d/pruebas/ejecutar-navegador.mjs
import { crearMapa, ubicacionPagina, nombreBolsillo, paginasVisibles, clasificarTransicion, cartasPrioritarias, urlTextura, AdaptadorColeccion, hojasNecesarias } from '../js/adaptador-coleccion.js';
import { ModeloColeccion } from '../../js/album/modelo.js';
import { numeroPokedex, esEntrenador, DEX_AL_FINAL } from '../../js/album/distribucion.js';

/** `ent` = { catalogo (objeto JSON), crearAlmacen: async () => almacen, reabrir: async (almacen) => almacen nuevo sobre los MISMOS datos | null, extra?: {...} } */
export async function ejecutarSuite(ent, informar) {
  const res = [];
  const prueba = async (nombre, fn) => {
    try { await fn(); res.push({ nombre, ok: true }); informar?.('OK     ', nombre); }
    catch (e) { res.push({ nombre, ok: false, error: String(e && e.stack || e) }); informar?.('FALLO  ', nombre + ' → ' + (e && e.message || e)); }
  };
  const igual = (a, b, m) => { if (a !== b) throw new Error((m || 'distinto') + `: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
  const cierto = (c, m) => { if (!c) throw new Error(m || 'condición falsa'); };
  const mapa = crearMapa(ent.catalogo);
  const nuevo = async () => {
    const almacen = await ent.crearAlmacen();
    const modelo = new ModeloColeccion(almacen, mapa.cartas);
    const ad = new AdaptadorColeccion(mapa, modelo);
    await ad.cargar();
    return { almacen, modelo, ad };
  };

  // ---- 1-3. correspondencia con el catálogo y distribución
  await prueba('1. los 158 ids del catálogo aparecen exactamente una vez en el álbum y no sobra ninguno', () => {
    igual(ent.catalogo.cartas.length, 158, 'cartas del catálogo');
    igual(mapa.porId.size, 158, 'ids en el mapa');
    const ids = new Set(ent.catalogo.cartas.map((c) => c.id));
    for (const id of mapa.porId.keys()) cierto(ids.has(id), 'id inventado ' + id);
    for (const id of ids) cierto(mapa.porId.has(id), 'falta ' + id);
    const vistos = new Set();
    for (const p of mapa.paginas) for (const c of p.bolsillos) if (c) { cierto(!vistos.has(c.id), 'repetida ' + c.id); vistos.add(c.id); }
  });
  await prueba('2. 18 páginas de 9 bolsillos = 162 nodos únicos', () => {
    igual(mapa.totalPaginas, 18); cierto(mapa.paginas.every((p) => p.bolsillos.length === 9));
    igual(mapa.porNombre.size, 162, 'nombres de bolsillo');
    igual(mapa.hojas, 9, 'hojas necesarias'); igual(hojasNecesarias(18), 9);
  });
  await prueba('3. posiciones vacías: solo las 4 últimas de la página 18', () => {
    igual(mapa.huecos, 4);
    const p18 = mapa.paginas[17].bolsillos;
    cierto(p18.slice(0, 5).every(Boolean) && p18.slice(5).every((c) => c === null), 'los huecos son las posiciones 6-9 de la 18');
    cierto(mapa.paginas.slice(0, 17).every((p) => p.bolsillos.every(Boolean)), 'ninguna otra página tiene huecos');
    for (let k = 5; k < 9; k++) { const b = mapa.porNombre.get(nombreBolsillo(18, k + 1)); cierto(b && b.carta === null, 'hueco ' + (k + 1)); }
  });
  await prueba('3b. orden Pokédex, Victini tras los Pokémon, Entrenadores al final; versiones de una misma especie contiguas', () => {
    const lista = mapa.paginas.flatMap((p) => p.bolsillos.filter(Boolean));
    const dex = lista.filter((c) => !esEntrenador(c) && numeroPokedex(c) !== DEX_AL_FINAL).map(numeroPokedex);
    cierto(dex.every((d, i) => i === 0 || dex[i - 1] <= d), 'Pokédex no decreciente');
    const iV = lista.findIndex((c) => numeroPokedex(c) === DEX_AL_FINAL), iEnt = lista.findIndex(esEntrenador);
    cierto(iV > lista.findLastIndex((c) => !esEntrenador(c) && numeroPokedex(c) !== DEX_AL_FINAL), 'Victini después de los demás Pokémon');
    cierto(iV < iEnt && lista.slice(iEnt).every(esEntrenador) && lista.slice(iEnt).length === 2, '2 Entrenadores al final');
    igual(JSON.stringify(mapa.porId.get(lista[iV].id)), JSON.stringify({ pagina: 18, posicion: 3, nombre: 'Hoja_8_D_Bolsillo_2' }), 'Victini');
    const porEspecie = new Map(); lista.forEach((c, i) => { const d = numeroPokedex(c); if (d) { porEspecie.set(d, [...(porEspecie.get(d) || []), i]); } });
    for (const [d, idx] of porEspecie) cierto(idx.every((x, j) => j === 0 || x === idx[j - 1] + 1), 'versiones de #' + d + ' separadas');
  });
  await prueba('3c. traducción página/posición ⇄ nodo 3D: biyectiva, 9 hojas × 2 caras, lectura de libro', () => {
    const vistos = new Set();
    for (let p = 1; p <= 18; p++) { const u = ubicacionPagina(p); vistos.add(u.hoja + u.cara); }
    igual(vistos.size, 18);
    igual(JSON.stringify(ubicacionPagina(1)), JSON.stringify({ hoja: 1, cara: 'F' })); igual(JSON.stringify(ubicacionPagina(2)), JSON.stringify({ hoja: 1, cara: 'D' }));
    igual(JSON.stringify(ubicacionPagina(18)), JSON.stringify({ hoja: 9, cara: 'D' }));
    igual(nombreBolsillo(1, 1), 'Hoja_0_F_Bolsillo_0'); igual(nombreBolsillo(2, 9), 'Hoja_0_D_Bolsillo_8'); igual(nombreBolsillo(17, 5), 'Hoja_8_F_Bolsillo_4');
    for (const [id, u] of mapa.porId) igual(mapa.porNombre.get(u.nombre).carta.id, id, 'ida y vuelta de ' + id);
    // cada página se ve como derecha en un único estado (impares) o como izquierda (pares); los estados recorren 0..10
    const der = [], izq = [];
    for (let v = 0; v <= 10; v++) { const s = paginasVisibles(v, 18); if (s.derecha) der.push(s.derecha); if (s.izquierda) izq.push(s.izquierda); }
    igual(der.join(','), '1,3,5,7,9,11,13,15,17'); igual(izq.join(','), '2,4,6,8,10,12,14,16,18');
    igual(JSON.stringify(paginasVisibles(0, 18)), JSON.stringify({ izquierda: null, derecha: null }));
    igual(JSON.stringify(paginasVisibles(10, 18)), JSON.stringify({ izquierda: 18, derecha: null }));
  });
  await prueba('3d. texturas: URL real (miniatura), 5 cartas sin imagen → null (marcador), prioridad por páginas visibles', () => {
    const sin = mapa.cartas.filter((c) => urlTextura(c) === null).map((c) => c.id).sort();
    igual(sin.join(','), 'svp-208,svp-209,svp-210,svp-211,svp-212');
    cierto(/^https:\/\/assets\.tcgdex\.net\/.+\/low\.webp$/.test(urlTextura(mapa.cartas[0])), 'miniatura low.webp');
    cierto(/\/high\.webp$/.test(urlTextura(mapa.cartas[0], 'high')));
    const q = cartasPrioritarias(mapa, 3, 1);
    cierto(q.length < 158 && q.length <= 6 * 9, 'nunca las 158 a la vez (' + q.length + ')');
    cierto(q.slice(0, 18).every((x) => x.prioridad === 0), 'primero las 2 páginas visibles'); igual(q.filter((x) => x.prioridad === 0).length, 18);
    igual(cartasPrioritarias(mapa, 0, 1).map((x) => x.pagina).filter((v, i, a) => a.indexOf(v) === i).join(','), '1');
  });
  await prueba('clasificarTransicion: 0→1 insertar, 1→0 extraer, 1→2 y 2→1 solo contador', () => {
    igual(clasificarTransicion(0, 1), 'insertar'); igual(clasificarTransicion(1, 0), 'extraer');
    igual(clasificarTransicion(1, 2), 'cantidad'); igual(clasificarTransicion(2, 1), 'cantidad'); igual(clasificarTransicion(0, 0), 'nada');
  });

  // ---- 4-7. cantidades
  const A = mapa.cartas[0].id, B = mapa.cartas[1].id;
  await prueba('4. lectura de cantidades (0 por defecto) y ficha de un bolsillo con los campos que pide la ficha', async () => {
    const { almacen, ad } = await nuevo();
    igual(ad.cantidad(A), 0);
    const f = ad.fichaDe(mapa.porId.get(A).nombre);
    igual(f.id, A); cierto(f.nombre && f.nombreExpansion && f.numero && f.url && f.urlMiniatura, 'campos de ficha'); igual(f.cantidad, 0);
    igual(ad.fichaDe(nombreBolsillo(18, 9)), null, 'un hueco no tiene ficha');
    almacen.cerrar?.();
  });
  await prueba('5. añadir una copia: persiste, transición insertar y luego solo contador', async () => {
    const { almacen, ad } = await nuevo();
    const r1 = await ad.anadir(A); igual(r1.despues, 1); igual(r1.transicion, 'insertar');
    const r2 = await ad.anadir(A); igual(r2.despues, 2); igual(r2.transicion, 'cantidad');
    igual(await almacen.cantidad(A), 2, 'guardado en la base de datos');
    almacen.cerrar?.();
  });
  await prueba('6. retirar una copia: 2→1 contador, 1→0 extraer', async () => {
    const { almacen, ad } = await nuevo();
    await ad.anadir(A); await ad.anadir(A);
    igual((await ad.retirar(A)).transicion, 'cantidad'); const r = await ad.retirar(A);
    igual(r.despues, 0); igual(r.transicion, 'extraer'); igual(await almacen.cantidad(A), 0);
    almacen.cerrar?.();
  });
  await prueba('7. nunca negativo, tope 999, sin escribir cuando no hay cambio', async () => {
    const { almacen, ad } = await nuevo();
    const r = await ad.retirar(B); igual(r.despues, 0); igual(r.transicion, 'nada'); igual(await almacen.cantidad(B), 0);
    await almacen.fijar(B, 999); await ad.cargar();
    const t = await ad.anadir(B); igual(t.despues, 999); igual(t.transicion, 'nada');
    almacen.cerrar?.();
  });
  await prueba('7b. ids arbitrarios, deltas raros y huecos rechazados; la cola sigue viva después del error', async () => {
    const { almacen, ad } = await nuevo();
    for (const [id, d] of [['id-inventado', 1], [A, 2], [A, 0], [A, 1.5], ['', 1]]) {
      let fallo = false; try { await ad.cambiar(id, d); } catch { fallo = true; }
      cierto(fallo, 'debía rechazar ' + JSON.stringify([id, d]));
    }
    igual((await ad.anadir(A)).despues, 1, 'tras los errores sigue funcionando');
    cierto(!ad.puedeEditar(nombreBolsillo(18, 9)) && !ad.puedeEditar('Hoja_99_F_Bolsillo_0') && ad.puedeEditar(mapa.porId.get(A).nombre));
    almacen.cerrar?.();
  });
  await prueba('7c. toques rápidos: 25 «añadir» y 25 «retirar» a la vez terminan en 0, 20 «añadir» dan 20', async () => {
    const { almacen, ad } = await nuevo();
    await Promise.all(Array.from({ length: 20 }, () => ad.anadir(A))); igual(ad.cantidad(A), 20);
    await Promise.all(Array.from({ length: 25 }, () => ad.retirar(A))); igual(ad.cantidad(A), 0);
    almacen.cerrar?.();
  });
  await prueba('7d. si el guardado falla, la cantidad visible NO cambia y no hay evento', async () => {
    const { almacen, ad, modelo } = await nuevo();
    await ad.anadir(A);
    const original = modelo.almacen.sumar;
    modelo.almacen.sumar = async () => { throw new Error('disco lleno'); };
    let eventos = 0; ad.alCambiar(() => eventos++);
    let fallo = false; try { await ad.anadir(A); } catch { fallo = true; }
    modelo.almacen.sumar = original;
    cierto(fallo && eventos === 0 && ad.cantidad(A) === 1, 'sin cambios tras el fallo');
    igual((await ad.anadir(A)).despues, 2, 'y se recupera');
    almacen.cerrar?.();
  });

  // ---- 8-9. persistencia y sincronía con la app original (solo donde hay base de datos real)
  if (ent.reabrir) {
    await prueba('8. persistencia: tras cerrar y reabrir la base de datos las cantidades siguen y las previas no se tocan', async () => {
      const { almacen } = await nuevo();
      await almacen.fijar(B, 3);                                  // dato "existente" previo
      const m1 = new ModeloColeccion(almacen, mapa.cartas), ad = new AdaptadorColeccion(mapa, m1); await ad.cargar();
      await ad.anadir(A); await ad.anadir(A);
      const otra = await ent.reabrir(almacen);                    // equivale a recargar la página
      const m2 = new ModeloColeccion(otra, mapa.cartas); await m2.cargar();
      igual(m2.cantidad(A), 2); igual(m2.cantidad(B), 3, 'la cantidad previa se conserva');
      igual((await otra.leerTodas()).size, 2, 'no se creó ninguna otra fila');
      otra.cerrar();
    });
    await prueba('9. sincronía con la app original: ModeloColeccion «de la otra interfaz» ve mis cambios y yo veo los suyos', async () => {
      const { almacen, ad } = await nuevo();
      const otra = await ent.reabrir(almacen, true);              // segunda conexión = la otra página de la misma origin
      const app = new ModeloColeccion(otra, mapa.cartas); await app.cargar();
      await ad.anadir(A);
      await app.cargar(); igual(app.cantidad(A), 1, 'la app original ve lo del 3D');
      await app.cambiar(B, +1); await app.cambiar(B, +1);          // la app original guarda con SU código
      await ad.cargar(); igual(ad.cantidad(B), 2, 'el 3D ve lo de la app original');
      igual(app.progreso().conseguidas, 2, 'progreso calculado con las reglas originales');
      otra.cerrar(); almacen.cerrar();
    });
    if (ent.extra) await ent.extra(prueba, igual, cierto);
  }
  return res;
}
