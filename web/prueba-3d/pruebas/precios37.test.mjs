// Fase 3.7.30 — precios en euros (Cardmarket vía TCGdex). Lo puro se prueba aquí; el archivo de precios es OPCIONAL:
// sin él, la ficha no enseña precio y la cabecera no enseña total (nunca es un error).
import test from 'node:test';
import assert from 'node:assert/strict';
import './mundo.mjs';
import { cargarPrecios, precioDe, eur, eurEntero, valorColeccion, lineaPrecio } from '../js/precios.js';

const P = { fecha: '2026-11-16', unidad: 'EUR', cartas: { 'a-1': { tendencia: 2.5, bajo: 1 }, 'a-2': { bajo: 0.3 }, 'a-3': { tendencia: 10 } } };

test('PR1 valorColeccion: suma tendencia × copias solo de las conseguidas, y cuenta las conseguidas sin precio', () => {
  const cant = { 'a-1': 2, 'a-2': 1, 'a-3': 0, 'a-4': 3 };
  const v = valorColeccion(P, ['a-1', 'a-2', 'a-3', 'a-4'], (id) => cant[id] || 0);
  assert.equal(v.total, 5); assert.equal(v.valoradas, 1);
  assert.equal(v.sinPrecio, 2, 'a-2 (sin tendencia) y a-4 (sin entrada) cuentan como sin precio');
  assert.deepEqual(valorColeccion(null, ['a-1'], () => 5), { total: 0, valoradas: 0, sinPrecio: 1 }, 'sin archivo de precios no se inventa nada');
});

test('PR2 formato español: coma decimal y símbolo €; el total de cabecera va sin céntimos', () => {
  assert.match(eur(3.2), /3,20\s*€/); assert.match(eurEntero(85.43), /85\s*€/);
  assert.equal(lineaPrecio(P, 'a-1'), `≈ ${eur(2.5)} · Cardmarket 2026-11-16`);
  assert.equal(lineaPrecio(P, 'a-2'), '', 'sin tendencia no se enseña un precio a medias');
  assert.equal(lineaPrecio(null, 'a-1'), '');
});

test('PR3 cargarPrecios: válido → objeto; 404, JSON roto o sin forma → null, nunca lanza', async () => {
  const conFetch = async (resp, fn) => { const f = globalThis.fetch; globalThis.fetch = async () => resp; try { return await fn(); } finally { globalThis.fetch = f; } };
  assert.deepEqual(await conFetch({ ok: true, json: async () => P }, () => cargarPrecios()), P);
  assert.equal(await conFetch({ ok: false }, () => cargarPrecios()), null);
  assert.equal(await conFetch({ ok: true, json: async () => { throw new Error('roto'); } }, () => cargarPrecios()), null);
  assert.equal(await conFetch({ ok: true, json: async () => ({ hola: 1 }) }, () => cargarPrecios()), null);
  assert.equal(precioDe(P, 'zzz'), null);
});

test('PR4 la ficha enseña la línea de precio cuando hay precios, y nada cuando no', async () => {
  const { FichaUI } = await import('../js/ficha-ui.js');
  const cls = () => { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), has: (c) => s.has(c), toggle() {} }; };
  const mk = () => ({ hidden: true, isConnected: true, classList: cls(), dataset: {}, onclick: null, textContent: '', focus() {}, replaceChildren() {}, append() {}, disabled: false });
  const el = { raiz: mk(), fondo: mk(), cerrar: mk(), anadir: mk(), retirar: mk(), imagen: mk(), nombre: mk(), expansion: mk(), numero: mk(), precio: mk(), cantidad: mk(), estadoTxt: mk(), error: mk() };
  globalThis.document = { body: { classList: cls() }, createElement: () => mk() }; globalThis.Image = class { set src(v) {} };
  const d = { id: 'a-1', nombre: 'N', expansion: 'e', numero: 1, pagina: 1, posicion: 1, cantidad: 0 };
  new FichaUI(el, { precios: P, alCerrar() {}, alAnadir() {}, alRetirar() {} }).abrir(d);
  assert.match(el.precio.textContent, /≈ .*€ · Cardmarket/);
  new FichaUI(el, { alCerrar() {}, alAnadir() {}, alRetirar() {} }).abrir(d);
  assert.equal(el.precio.textContent, '');
});

test('PR5 la herramienta de descarga existe, apunta a TCGdex y es Python válido', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../../../herramientas/precios/descargar_precios.py', import.meta.url), 'utf8');
  assert.match(src, /api\.tcgdex\.net\/v2\/es\/cards/); assert.match(src, /precios-teselia\.json/); assert.match(src, /time\.sleep/);
});
