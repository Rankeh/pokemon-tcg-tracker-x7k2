// Pruebas de la estantería (Fase 1): partes puras, sin Three.js ni navegador.
// Uso: node --test web/estanteria/pruebas/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIBRO, PASO, MUEBLE, ALTO_HUECO, huecosPorBalda, disponer, medidasMueble, posicionLibro, ySueloBalda } from '../js/disposicion.js';
import { listarAlbumes, validarAlbum, normalizarAlbumes } from '../js/albumes.js';

test('el libro tiene las medidas del álbum 3D (GLB: 258 + 10 mm de ancho, 322 mm de alto, 46,5 mm de grosor)', () => {
  assert.equal(LIBRO.alto, 0.322);
  assert.equal(LIBRO.fondo, 0.268);
  assert.equal(LIBRO.grueso, 0.0465);
  assert.ok(ALTO_HUECO > LIBRO.alto, 'el libro cabe de pie en el hueco');
  assert.ok(MUEBLE.fondo > LIBRO.fondo + MUEBLE.retranqueo, 'y en profundidad');
});

test('huecos por balda: pocos en iPhone vertical, más en escritorio, siempre entre 4 y 18', () => {
  const iphone = huecosPorBalda(390 / 844), pc = huecosPorBalda(1440 / 900), ultra = huecosPorBalda(5);
  assert.ok(iphone >= 4 && iphone <= 6, `iPhone: ${iphone}`);
  assert.ok(pc > iphone, `PC (${pc}) > iPhone (${iphone})`);
  assert.equal(ultra, 18);
  assert.equal(huecosPorBalda(0), 6);
});

test('disposición con el álbum actual: álbum, sujetalibros, «Nuevo álbum» y el resto vacío (sin libros de relleno)', () => {
  const d = disponer({ albumes: [{ id: 'teselia' }], huecos: 5, minBaldas: 3 });
  assert.deepEqual(d.elementos, [
    { tipo: 'album', id: 'teselia', balda: 0, hueco: 0 },
    { tipo: 'nuevo', id: 'nuevo', balda: 0, hueco: 2 },
  ]);
  assert.deepEqual(d.sujetalibros, { balda: 0, hueco: 1 });
  assert.equal(d.baldas, 3);
  assert.equal(d.vacios, 15 - 3);
  assert.equal(d.elementos.filter((e) => e.tipo === 'album').length, 1, 'solo los álbumes reales');
});

test('la estantería crece: siempre queda sitio libre detrás del «Nuevo álbum»', () => {
  for (const huecos of [4, 5, 12]) for (let n = 0; n <= 40; n++) {
    const d = disponer({ albumes: Array.from({ length: n }, (_, i) => ({ id: 'a' + i })), huecos, minBaldas: 3 });
    const nuevo = d.elementos.find((e) => e.tipo === 'nuevo');
    assert.ok(d.vacios >= 1, `${n} álbumes / ${huecos} huecos: sin hueco libre`);
    assert.ok(nuevo.balda < d.baldas && nuevo.hueco < huecos);
    const claves = d.elementos.map((e) => `${e.balda}:${e.hueco}`).concat(d.sujetalibros ? [`${d.sujetalibros.balda}:${d.sujetalibros.hueco}`] : []);
    assert.equal(new Set(claves).size, claves.length, 'nunca dos cosas en el mismo hueco');
  }
});

test('sin álbumes no hay sujetalibros y «Nuevo álbum» va primero', () => {
  const d = disponer({ albumes: [], huecos: 6 });
  assert.equal(d.sujetalibros, null);
  assert.deepEqual(d.elementos, [{ tipo: 'nuevo', id: 'nuevo', balda: 0, hueco: 0 }]);
});

test('posiciones: los libros apoyan en su balda, quedan dentro del mueble y no se solapan', () => {
  const huecos = 6, baldas = 3, { interior } = medidasMueble(huecos, baldas);
  for (let b = 0; b < baldas; b++) for (let h = 0; h < huecos; h++) {
    const p = posicionLibro({ balda: b, hueco: h }, huecos, baldas);
    assert.ok(Math.abs(p.y - LIBRO.alto / 2 - ySueloBalda(b, baldas)) < 1e-9, 'apoyado en la balda');
    assert.ok(p.x - LIBRO.grueso / 2 >= -interior / 2 && p.x + LIBRO.grueso / 2 <= interior / 2, 'dentro de los laterales');
    if (h > 0) assert.ok(p.x - posicionLibro({ balda: b, hueco: h - 1 }, huecos, baldas).x >= LIBRO.grueso, 'sin solaparse');
  }
  assert.ok(ySueloBalda(0, baldas) > ySueloBalda(1, baldas), 'la balda 0 es la de arriba');
  assert.ok(PASO > LIBRO.grueso);
});

test('álbumes: el actual (Teselia) está y apunta a la ruta existente del visor 3D', async () => {
  const lista = await listarAlbumes();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, 'teselia');
  assert.equal(lista[0].ruta, 'web/prueba-3d/index.html');
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
