// Pruebas de la biblioteca (carrusel editorial): partes puras, sin Three.js ni navegador.
// Uso: node --test web/estanteria/pruebas/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIBRO } from '../js/disposicion.js';
import { poses, mover, elementos, series, altoVisible, CARRUSEL } from '../js/carrusel.js';
import { listarAlbumes, validarAlbum, normalizarAlbumes } from '../js/albumes.js';

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

test('álbumes: el actual (Teselia) está, con serie y nº de cartas, y apunta a la ruta existente del visor 3D', async () => {
  const lista = await listarAlbumes();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, 'teselia');
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
