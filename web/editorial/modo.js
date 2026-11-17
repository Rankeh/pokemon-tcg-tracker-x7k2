// Modo claro / oscuro común a la biblioteca y al álbum. Script clásico (no módulo) que se carga en <head>, antes del primer pintado:
// pone <html data-modo="claro|oscuro">, sin parpadeo. Por defecto sigue al sistema; si el usuario lo cambia con el botón, se recuerda
// (localStorage, compartido entre páginas y pestañas). Al cambiar emite el evento `modo` en document (detail = 'claro' | 'oscuro').
(function () {
  var CLAVE = 'tcg.modo', guardado = null;
  try { guardado = localStorage.getItem(CLAVE); } catch (e) { /* sin almacenamiento: sigue al sistema */ }
  if (guardado !== 'claro' && guardado !== 'oscuro') guardado = null;
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : { matches: false };
  function actual() { return guardado || (mq.matches ? 'claro' : 'oscuro'); }

  function pintarBotones() {
    var claro = actual() === 'claro';
    document.querySelectorAll('[data-alternar-modo]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(claro));
      b.setAttribute('aria-label', claro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
      b.title = claro ? 'Modo oscuro' : 'Modo claro';
      if (b.hasAttribute('data-con-texto')) b.textContent = claro ? 'Modo oscuro' : 'Modo claro';     // opción de menú con texto
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', claro ? '#efede8' : '#1c1c1c');
  }
  function aplicar() {
    document.documentElement.dataset.modo = actual();
    pintarBotones();
    document.dispatchEvent(new CustomEvent('modo', { detail: actual() }));
  }

  window.tcgModo = {
    actual: actual,
    alternar: function () {
      guardado = actual() === 'claro' ? 'oscuro' : 'claro';
      try { localStorage.setItem(CLAVE, guardado); } catch (e) { /* solo esta visita */ }
      aplicar();
    },
  };
  document.documentElement.dataset.modo = actual();
  if (mq.addEventListener) mq.addEventListener('change', function () { if (!guardado) aplicar(); });
  window.addEventListener('storage', function (e) { if (e.key === CLAVE) { guardado = e.newValue === 'claro' || e.newValue === 'oscuro' ? e.newValue : null; aplicar(); } });
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-alternar-modo]').forEach(function (b) { b.addEventListener('click', function () { window.tcgModo.alternar(); }); });
    pintarBotones();
  });
})();
