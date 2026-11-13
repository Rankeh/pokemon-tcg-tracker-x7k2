// Panel de métricas REALES. Todo lo que muestra se mide o se cuenta en el dispositivo donde se abre la página; lo que es estimación se rotula así.
import { MedidorFps } from './logica.js';

export class Metricas {
  constructor(panel, renderer, album) {
    this.panel = panel; this.renderer = renderer; this.album = album;
    this.fps = new MedidorFps();
    this.tiempos = {};
    this.ultimo = 0;
    this.sucio = true;
    this.bench = null;
  }

  tiempo(nombre, ms) { this.tiempos[nombre] = Math.round(ms); }

  /** Llamar al final de cada frame dibujado. */
  frame(ahora) {
    if (this.ultimo) this.fps.marca(ahora - this.ultimo);
    this.ultimo = ahora;
    if (this.bench) this.bench.dts.push(this.fps.dts[this.fps.dts.length - 1] ?? 0);
  }

  /** Tras una pausa sin dibujar no cuenta el hueco como un frame lento. */
  pausa() { this.ultimo = 0; }

  gl() {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      version: gl.getParameter(gl.VERSION),
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '(el navegador oculta la GPU)',
      maxTextura: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    };
  }

  instantanea() {
    const info = this.renderer.info, a = this.album;
    const total = a.contarEscena({ soloVisibles: false }), vis = a.contarEscena({ soloVisibles: true });
    const mem = a.memoriaTexturasEstimada();
    const f = this.fps.resumen();
    return {
      fecha: new Date().toISOString(),
      navegador: navigator.userAgent,
      pantalla: { css: [innerWidth, innerHeight], pixelRatioDispositivo: devicePixelRatio, pixelRatioUsado: this.renderer.getPixelRatio() },
      webgl: this.gl(),
      camara: window.__album3d ? { near: window.__album3d.camara.near, far: window.__album3d.camara.far, aspect: window.__album3d.camara.aspect, radio: window.__album3d.orbita.radio } : null,
      carga: { ...a.carga, ...this.tiempos },
      fps: { media: +f.fps.toFixed(1), minimo: +f.fpsMin.toFixed(1), p95_ms: +f.p95Ms.toFixed(1), muestras: f.muestras },
      ultimoFrame: { llamadasDibujo: info.render.calls, triangulosDibujados: info.render.triangles },
      escenaEstatica: { triangulosTotales: total.triangulos, mallasTotales: total.mallas, triangulosVisibles: vis.triangulos, mallasVisibles: vis.mallas },
      memoriaRenderer: { geometrias: info.memory.geometries, texturas: info.memory.textures },
      texturasEstimadas: { cantidad: mem.texturas, tamano: '256x358 RGBA + mipmaps', megabytes: +(mem.bytes / 1048576).toFixed(2), nota: 'ESTIMACIÓN: el navegador no expone la memoria de GPU real' },
      bench: this.bench && this.bench.resultado ? this.bench.resultado : null,
    };
  }

  pintar() {
    const s = this.instantanea();
    this.panel.textContent =
      `FPS ${s.fps.media} (mín ${s.fps.minimo}, p95 ${s.fps.p95_ms} ms) · ${s.fps.muestras} muestras\n` +
      `Dibujo: ${s.ultimoFrame.llamadasDibujo} llamadas · ${s.ultimoFrame.triangulosDibujados} triáng.\n` +
      `Escena: ${s.escenaEstatica.triangulosVisibles}/${s.escenaEstatica.triangulosTotales} triáng. visibles/total · ${s.escenaEstatica.mallasVisibles}/${s.escenaEstatica.mallasTotales} mallas\n` +
      `GPU: ${s.memoriaRenderer.geometrias} geom. · ${s.memoriaRenderer.texturas} text. (≈${s.texturasEstimadas.megabytes} MB estimados)\n` +
      `Carga: GLB ${(s.carga.bytes / 1024).toFixed(0)} KB · red ${s.carga.descargaMs} ms · proceso ${s.carga.procesoMs} ms · 1.er frame ${s.carga.primerFrameMs ?? '…'} ms`;
  }

  iniciarBench() { this.fps.reiniciar(); this.bench = { dts: [], resultado: null, t0: performance.now() }; }

  terminarBench() {
    const d = this.bench.dts.filter((x) => x > 0);
    const ord = [...d].sort((a, b) => a - b);
    const media = d.reduce((a, b) => a + b, 0) / (d.length || 1);
    this.bench.resultado = { duracionS: +((performance.now() - this.bench.t0) / 1000).toFixed(1), frames: d.length, fpsMedio: +(1000 / media).toFixed(1),
      fpsMinimo: +(1000 / (ord[ord.length - 1] || 1)).toFixed(1), p95_ms: +(ord[Math.floor(ord.length * 0.95)] || 0).toFixed(1) };
    return this.bench.resultado;
  }
}
