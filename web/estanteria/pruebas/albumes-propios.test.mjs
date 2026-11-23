// 3.37 — álbumes creados en la app: funciones PURAS (sin red ni IndexedDB).
import test from 'node:test';
import assert from 'node:assert/strict';
import { idNuevo, nombreBonito, nombrePropuesto, registroDe, esPropio } from '../../js/albumes-propios.js';
import { variantes, categoria, precio, cartasPortada } from '../../js/generador-album.js';
import { validarAlbum, conCifras } from '../js/albumes.js';
import { filtrar, plano } from '../js/creador.js';

test('buscador: sin tildes ni mayúsculas, primero lo que empieza por lo escrito', () => {
  assert.equal(plano('  Expansión '), 'expansion');
  const l = ['Llamas Obsidianas', 'Fábula Sombría', 'Destinos de Paldea', 'Evoluciones en Paldea'];
  assert.deepEqual(filtrar(l, 'paldea'), ['Destinos de Paldea', 'Evoluciones en Paldea']);
  assert.deepEqual(filtrar(l, 'FABULA'), ['Fábula Sombría']);
  assert.deepEqual(filtrar(['Evoluciones en Paldea', 'Paldea Evolved'], 'pal'), ['Paldea Evolved', 'Evoluciones en Paldea'], 'empieza antes que contiene');
});

test('ids y nombres: «mio-» + texto + 4 al azar; «AKIRA EGAWA» → «Akira Egawa»', () => {
  assert.equal(idNuevo('Llamas Obsidianas', () => 0.5), 'mio-llamas-obsidianas-' + Math.floor(0.5 * 36 ** 4).toString(36));
  assert.match(idNuevo('¡Pokémon 151!'), /^mio-pokemon-151-[a-z0-9]{4}$/);
  assert.ok(esPropio(idNuevo('x')) && !esPropio('teselia'));
  assert.equal(nombreBonito('AKIRA EGAWA'), 'Akira Egawa'); assert.equal(nombreBonito('osare'), 'osare'); assert.equal(nombreBonito('Mitsuhiro Arita'), 'Mitsuhiro Arita');
  assert.equal(nombrePropuesto({ tipo: 'pokemon', pokemon: 'Pikachu' }, [{ nombre: 'Pikachu' }, { nombre: 'Pikachu' }, { nombre: 'Pikachu ex' }]), 'Pikachu');
});

test('generador: misma lógica que generar.py (categorías, variantes con el reverse de Sol y Luna, precios, portada)', () => {
  assert.equal(categoria('Special illustration rare'), 'sir'); assert.equal(categoria('Rare Holo'), 'rara'); assert.equal(categoria('Hyper rare'), 'otra');
  assert.deepEqual(variantes({ set: { id: 'sm7' }, variants: { normal: true } }, 'comun').map((v) => v.id), ['normal', 'reverse'], 'Sol y Luna: reverse deducido');
  assert.deepEqual(variantes({ set: { id: 'sv03' }, variants: { normal: true } }, 'comun').map((v) => v.id), ['normal'], 'fuera de Sol y Luna, no');
  assert.equal(variantes({ set: { id: 'x' }, variants_detailed: [{ type: 'holo', stamp: ['30th-anniversary'] }] }, 'otra')[0].nombre, 'Holo · sello 30.º aniversario');
  assert.deepEqual(precio({ pricing: { cardmarket: { trend: 2, low: 1, updated: 'u' } } }), { tendencia: 2, bajo: 1, actualizado: 'u' });
  assert.equal(precio({}), null);
  const cs = [{ id: 'a', categoriaColeccion: 'comun', imagen: 'A' }, { id: 'b', categoriaColeccion: 'sir', imagen: 'B' }, { id: 'c', categoriaColeccion: 'ir', imagen: null }, { id: 'd', categoriaColeccion: 'rara', imagen: 'D' }];
  assert.deepEqual(cartasPortada(cs, { d: { tendencia: 9 } }), ['B', 'D'], 'la SIR y la rara más cara; nunca una sin imagen');
});

test('un álbum creado pasa la misma validación que los de la web y sus cifras se rellenan solas', () => {
  const cat = { cartas: [{ id: 'x1-001', nombre: 'Charmander', nombreExpansion: 'Expansión de Prueba', imagen: 'https://assets.tcgdex.net/es/sv/x1/001/high.webp', categoriaColeccion: 'comun' }] };
  for (const def of [{ tipo: 'expansion', expansion: 'x1' }, { tipo: 'ilustrador', ilustrador: 'Alguien' }, { tipo: 'pokemon', pokemon: 'Charmander', expansion: 'x1' }]) {
    const r = registroDe('mio-prueba-ab12', def, 'Mi álbum', cat, { cartas: {} });
    assert.deepEqual(validarAlbum(r), [], def.tipo);
    assert.equal(r.serie, 'propios'); assert.equal(r.ruta, 'web/prueba-3d/index.html?album=mio-prueba-ab12');
    const c = conCifras(r, 1);
    assert.ok(c.portada.pie.includes('1 cartas') && c.lomo.cifra === '1' && c.meta.includes('1 cartas'));
  }
  assert.equal(registroDe('mio-a-0000', { tipo: 'pokemon', pokemon: 'Charmander', expansion: 'x1' }, 'X', cat, { cartas: {} }).subtitulo, 'Expansión de Prueba', 'Pokémon de una expansión: la expansión como subtítulo');
});

test('3.40 · selección propia: el nombre propuesto sigue siendo el del Pokémon aunque se añadan otras cartas; etiquetas de «Mi selección»', () => {
  const cartas = [{ nombre: 'Pikachu' }, { nombre: 'Charizard ex' }];
  assert.equal(nombrePropuesto({ tipo: 'lista', ids: ['a', 'b'], origen: { tipo: 'pokemon', pokemon: 'pikachu' } }, cartas), 'Pikachu');
  assert.equal(nombrePropuesto({ tipo: 'lista', ids: ['a'] }, cartas), 'Mi álbum');
  const cat = { cartas: [{ id: 'x1-001', nombre: 'Charmander', imagen: null, imagenAlternativa: 'https://x/y?ruta=z', categoriaColeccion: 'comun' }] };
  const r = registroDe('mio-a-0000', { tipo: 'lista', ids: ['x1-001'] }, 'Mía', cat, { cartas: {} });
  assert.deepEqual(validarAlbum(r), []); assert.equal(r.subtitulo, 'Mi selección'); assert.deepEqual(r.portada.cartas, ['https://x/y?ruta=z'], 'portada con la imagen de limitlesstcg si TCGdex no la tiene');
  const r2 = registroDe('mio-a-0000', { tipo: 'lista', ids: ['x1-001'], origen: { tipo: 'ilustrador', ilustrador: 'Alguien' } }, 'Mía', cat, { cartas: {} });
  assert.equal(r2.subtitulo, 'Colección de artista', 'con origen: las etiquetas del origen');
});

test('3.41/3.42 · Pokémon: da igual mayúsculas o tildes, y con todas sus variantes por palabra completa (no «Gengarito»)', async () => {
  const { generarCatalogo, plano } = await import('../../js/generador-album.js');
  assert.equal(plano('  FLABÉBÉ  '), 'flabebe');
  const lista = [{ id: 's1-1', name: 'Gengar' }, { id: 's1-2', name: 'Gengar ex' }, { id: 's1-3', name: 'M-Gengar EX' }, { id: 's2-9', name: 'GENGAR' }, { id: 's3-1', name: 'Gengarito' }];
  const pedidas = [], original = globalThis.fetch;
  globalThis.fetch = async (u) => {
    const p = decodeURIComponent(String(u)).replace('https://api.tcgdex.net/v2/', ''); pedidas.push(p);
    const r = (d) => ({ ok: true, status: 200, json: async () => d });
    if (/cards\?name=/.test(p)) return r(lista);
    const c = /^en\/cards\/(.+)$/.exec(p); if (c) return r({ id: c[1], localId: '1', name: lista.find((x) => x.id === c[1]).name, set: { id: c[1].split('-')[0] }, image: 'https://assets.tcgdex.net/x' });
    if (/sets\//.test(p)) return r({ serie: { id: 'sv' }, cards: [] });
    return { ok: false, status: 404, json: async () => null };
  };
  try {
    const { catalogo } = await generarCatalogo({ tipo: 'pokemon', pokemon: 'gengar' });
    assert.deepEqual(catalogo.cartas.map((x) => x.id).sort(), ['s1-1', 's1-2', 's1-3', 's2-9']);
    assert.ok(pedidas.some((p) => p.endsWith('cards?name=gengar')) && !pedidas.some((p) => p.includes('eq:')), 'búsqueda «contiene» (sin «eq:», que sí distingue mayúsculas)');
  } finally { globalThis.fetch = original; }
});
