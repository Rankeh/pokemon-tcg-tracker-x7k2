// Pruebas de la biblioteca (carrusel editorial): partes puras, sin Three.js ni navegador.
// Uso: node --test web/estanteria/pruebas/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIBRO } from '../js/disposicion.js';
import { poses, mover, elementos, series, altoVisible, CARRUSEL } from '../js/carrusel.js';
import { listarAlbumes, validarAlbum, normalizarAlbumes, albumPorId, conCifras } from '../js/albumes.js';
import { readFile, access } from 'node:fs/promises';
import { validarCatalogo } from '../../js/coleccion.js';
import { crearMapa } from '../../prueba-3d/js/adaptador-coleccion.js';
const raiz = new URL('../../../', import.meta.url);
const leerJson = async (ruta) => JSON.parse(await readFile(new URL(ruta, raiz), 'utf8'));

test('el libro tiene las medidas del álbum 3D (GLB: 258 + 10 mm de ancho, 322 mm de alto, 46,5 mm de grosor)', () => {
  assert.deepEqual(LIBRO, { grueso: 0.0465, alto: 0.322, fondo: 0.268 });
});

test('poses: el elegido queda en el centro, de cara (giro −90°), adelantado y algo levantado; el resto de lomo', () => {
  const p = poses(5, 2);
  assert.equal(p[2].x, 0); assert.equal(p[2].giro, -Math.PI / 2);
  assert.ok(p[2].z > 0 && p[2].y > LIBRO.alto / 2, 'sale hacia la cámara y sube un poco');
  for (const i of [0, 1, 3, 4]) { assert.equal(p[i].giro, 0); assert.equal(p[i].z, 0); assert.equal(p[i].y, LIBRO.alto / 2); }
  assert.ok(p[1].x < 0 && p[3].x > 0, 'anteriores a la izquierda, siguientes a la derecha');
  assert.ok(Math.abs(p[1].x + p[3].x) < 1e-12, 'simétrico');
});

test('poses: nadie se solapa con la portada abierta ni entre sí', () => {
  for (const n of [1, 2, 6, 20]) for (let s = 0; s < n; s++) {
    const p = poses(n, s), mitadPortada = LIBRO.fondo / 2;
    p.forEach((q, i) => { if (i !== s) assert.ok(Math.abs(q.x) - LIBRO.grueso / 2 >= mitadPortada + CARRUSEL.aire - 1e-9, `n=${n} s=${s} i=${i}`); });
    const xs = p.filter((_, i) => i !== s).map((q) => q.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= LIBRO.grueso - 1e-9, 'lomos sin solaparse');
  }
});

test('mover: se queda en los extremos (sin dar la vuelta); selección fuera de rango se acota', () => {
  assert.equal(mover(3, 0, -1), 0); assert.equal(mover(3, 2, 1), 2); assert.equal(mover(3, 1, 1), 2);
  assert.equal(poses(2, 9)[1].giro, -Math.PI / 2, 'índice acotado al último');
});

test('elementos: álbumes reales (filtrables por serie) y siempre «Nuevo álbum» al final; sin libros de relleno', () => {
  const a = [{ id: 'a', serie: 'sv' }, { id: 'b', serie: 'swsh' }];
  assert.deepEqual(elementos(a).map((e) => e.id), ['a', 'b', 'nuevo']);
  assert.deepEqual(elementos(a, 'swsh').map((e) => e.id), ['b', 'nuevo']);
  assert.deepEqual(elementos([]).map((e) => e.tipo), ['nuevo']);
  assert.deepEqual(series([{ serie: 'sv', nombreSerie: 'Escarlata y Púrpura' }, { serie: 'sv' }, { serie: 'swsh' }]), [{ id: 'sv', nombre: 'Escarlata y Púrpura' }, { id: 'swsh', nombre: 'swsh' }]);
});

test('encuadre: el libro de cara ocupa ~la mitad del alto; en vertical caben la portada y algo de los vecinos', () => {
  assert.ok(Math.abs(LIBRO.alto / altoVisible(16 / 9) - 0.5) < 1e-9, 'escritorio: medio alto');
  const iphone = 390 / 844, ancho = altoVisible(iphone) * iphone;
  assert.ok(ancho > LIBRO.fondo + 2 * CARRUSEL.aire, `iPhone: caben portada y aire (${ancho.toFixed(3)} m)`);
  assert.ok(LIBRO.alto / altoVisible(iphone) > 0.3, 'iPhone: el libro no queda diminuto');
});

test('álbumes: Teselia (primero, ruta de siempre), Asako Ito y osare (?album=<id>)', async () => {
  const lista = await listarAlbumes();
  assert.deepEqual(lista.map((a) => a.id), ['teselia', 'asako-ito', 'osare']);
  assert.equal(albumPorId('osare').ruta, 'web/prueba-3d/index.html?album=osare');
  assert.equal(lista[1].ruta, 'web/prueba-3d/index.html?album=asako-ito');
  assert.equal(albumPorId('asako-ito').nombre, 'Asako Ito');
  assert.equal(albumPorId('no-existe').id, 'teselia', 'id desconocido → Teselia (los enlaces viejos siguen funcionando)');
  assert.equal(albumPorId(null).id, 'teselia');
  assert.equal(lista[0].ruta, 'web/prueba-3d/index.html');
  assert.equal(lista[0].serie, 'sv'); assert.equal(lista[0].cartas, 158);
  assert.deepEqual(validarAlbum(lista[0]), []);
  lista[0].nombre = 'cambiado';
  assert.equal((await listarAlbumes())[0].nombre, 'Teselia', 'devuelve copias: nadie modifica el registro por accidente');
});

test('álbumes: se descartan inválidos, ids repetidos y rutas absolutas; se ordenan por `orden`', () => {
  const base = { nombre: 'X', ruta: 'a.html', lomo: { diseno: 'liso', material: 'tela' } };
  const r = normalizarAlbumes([
    { ...base, id: 'b', orden: 2 }, { ...base, id: 'a', orden: 1 }, { ...base, id: 'a', orden: 3, nombre: 'duplicado' },
    { ...base, id: 'Mal Id' }, { ...base, id: 'c', ruta: 'https://otro.sitio/x' }, { ...base, id: 'd', lomo: { diseno: '??', material: 'tela' } },
  ]);
  assert.deepEqual(r.map((a) => a.id), ['a', 'b']);
  assert.notEqual(r[0].nombre, 'duplicado');
});

test('cada álbum: su catálogo existe, es válido, cabe en su modelo 3D, coincide con el nº de cartas y sus cartas de portada están en el catálogo', async () => {
  for (const a of await listarAlbumes()) {
    const cat = await leerJson(a.catalogo);
    assert.ok(validarCatalogo(cat).ok, a.id + ': catálogo válido');
    const c = conCifras(a, cat.cartas.length);                                                // las cifras salen del catálogo, no del registro
    assert.ok(!JSON.stringify(c).includes('{n}'), a.id + ': no quedan marcas {n} sin rellenar');
    assert.equal(c.cartas, cat.cartas.length);
    const mapa = crearMapa(cat), modelo = mapa.hojas === 9 ? 'album.glb' : `album-${mapa.hojas}h.glb`;
    await access(new URL('web/prueba-3d/modelo/' + modelo, raiz));                         // el visor elige este modelo por nº de hojas
    for (const id of a.portada.cartas) assert.ok(cat.cartas.some((c) => c.id === id), `${a.id}: carta de portada ${id} en el catálogo`);
    await access(new URL(a.precios, raiz));
  }
});

test('Asako Ito: todas las cartas son suyas (coincidencia exacta), físicas (sin TCG Pocket), sin repetidos y con nº de Pokédex', async () => {
  const cat = await leerJson('datos/catalogo/coleccion-asako-ito.json');
  assert.equal(cat.ilustrador, 'Asako Ito');
  for (const c of cat.cartas) {
    assert.equal(c.ilustrador, 'Asako Ito', c.id);
    assert.notEqual(c.serie, 'tcgp', c.id + ' es de TCG Pocket');
    assert.ok(Array.isArray(c.dexId) && Number.isInteger(c.dexId[0]), c.id + ': dexId para el orden por Pokédex');
  }
  assert.equal(new Set(cat.cartas.map((c) => c.id)).size, cat.cartas.length);
  assert.ok(cat.totales.excluidas.every((e) => /Pocket/.test(e.motivo)), 'solo se excluye TCG Pocket');
});

test('conCifras: un álbum que crece cambia sus cifras sin tocar el registro (portada, lomo y ficha)', () => {
  const a = albumPorId('asako-ito'), c = conCifras(a, 41);
  assert.equal(c.lomo.cifra, '41'); assert.ok(c.portada.pie.includes('41 cartas')); assert.ok(c.meta.includes('41 cartas'));
  assert.equal(a.lomo.cifra, '{n}', 'no modifica el registro original');
});

test('actualización automática: configuración de artistas coherente con el registro y workflow semanal presente', async () => {
  const artistas = await leerJson('datos/albumes-artista.json');
  for (const x of artistas) {
    const a = albumPorId(x.id);
    assert.equal(a.id, x.id, x.id + ' está en el registro de álbumes');
    assert.equal((await leerJson(a.catalogo)).ilustrador, x.ilustrador);
  }
  const wf = await readFile(new URL('.github/workflows/actualizar-artistas.yml', raiz), 'utf8');
  assert.ok(/schedule:/.test(wf) && /workflow_dispatch:/.test(wf) && /actualizar\.py/.test(wf) && /contents: write/.test(wf));
});

import { ANATOMIA, hojasPara, grosorAlbum } from '../js/disposicion.js';
test('3.20 · grosor real de cada álbum = el de su modelo 3D (2 tapas + hojas); el carrusel no solapa lomos de grosores distintos', () => {
  assert.equal(hojasPara(158), 9); assert.equal(hojasPara(37), 3); assert.equal(hojasPara(19), 2);
  assert.ok(Math.abs(grosorAlbum(158) - 0.0435) < 1e-9, 'Teselia: 43,5 mm como el lomo de album.glb');
  assert.ok(grosorAlbum(19) < grosorAlbum(37) && grosorAlbum(37) < grosorAlbum(158));
  const g = [grosorAlbum(158), grosorAlbum(37), grosorAlbum(19), LIBRO.grueso];
  for (let s = 0; s < 4; s++) {
    const p = poses(4, s, g), lados = p.map((q, i) => ({ i, x0: q.x - g[i] / 2, x1: q.x + g[i] / 2 })).filter((o) => o.i !== s).sort((a, b) => a.x0 - b.x0);
    for (let k = 1; k < lados.length; k++) assert.ok(lados[k].x0 >= lados[k - 1].x1 - 1e-12, `sel ${s}: lomos ${lados[k - 1].i} y ${lados[k].i} se solapan`);
    for (const o of lados) assert.ok(Math.min(Math.abs(o.x0), Math.abs(o.x1)) >= LIBRO.fondo / 2 + CARRUSEL.aire - 1e-12, 'ninguno pisa la portada abierta');
  }
  assert.ok(ANATOMIA.anchoTapa + ANATOMIA.lomo === LIBRO.fondo);
});
