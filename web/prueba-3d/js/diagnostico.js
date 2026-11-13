// Modo diagnóstico (?debug=1): muestra EN PANTALLA lo que normalmente solo está en la consola (útil en iPhone sin Mac).
// Incluye un cubo de prueba: si el cubo se ve y el álbum no, el fallo está en el álbum/cámara; si tampoco, en canvas/renderer.
import * as THREE from 'three';

export class Diagnostico {
  constructor(pre, { renderer, scene, camara, orbita, getAlbum }) {
    this.pre = pre; this.renderer = renderer; this.scene = scene; this.camara = camara; this.orbita = orbita; this.getAlbum = getAlbum;
    this.estadoGlb = 'pendiente';
    this.shaderErrores = [];
    this.glErrores = new Set();
    this.contextoPerdido = false;
    this.frustum = new THREE.Frustum();
    this.m = new THREE.Matrix4();
    // Cubos de prueba delante del álbum: uno sin luces (MeshBasicMaterial) y otro iluminado (MeshStandardMaterial).
    const g = new THREE.BoxGeometry(0.03, 0.03, 0.03);
    this.cuboPlano = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff00ff }));
    this.cuboLuz = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x00e0a0, roughness: 0.5 }));
    this.cuboPlano.position.set(-0.05, 0.02, 0.23);
    this.cuboLuz.position.set(0.05, 0.02, 0.23);
    this.cuboPlano.name = this.cuboLuz.name = 'CuboDiagnostico';
    scene.add(this.cuboPlano, this.cuboLuz);
    renderer.debug.checkShaderErrors = true;
    renderer.debug.onShaderError = (gl, programa, vs, fs) => {
      this.shaderErrores.push('programa: ' + (gl.getProgramInfoLog(programa) || '').slice(0, 160) + ' | vs: ' + (gl.getShaderInfoLog(vs) || '').slice(0, 160) + ' | fs: ' + (gl.getShaderInfoLog(fs) || '').slice(0, 160));
    };
    this.pre.hidden = false;
  }

  sondaGl() {
    const gl = this.renderer.getContext();
    for (let i = 0; i < 8; i++) { const e = gl.getError(); if (!e) break; this.glErrores.add(e); }
  }

  linea(t, v) { return t + ': ' + v + '\n'; }
  f(n, d = 3) { return Number(n).toFixed(d); }

  texto() {
    const r = this.renderer, c = this.camara, album = this.getAlbum();
    const cv = r.domElement, info = r.info, gl = r.getContext();
    let s = '';
    s += this.linea('Three', 'r' + THREE.REVISION + ' · ' + (window.__origenThree || '?') + ' · ' + (gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1'));
    s += this.linea('GLB', this.estadoGlb);
    const errs = (window.__errores || []).slice(-4);
    s += this.linea('Errores JS', errs.length ? '\n  ' + errs.join('\n  ') : 'ninguno');
    s += this.linea('Shaders', this.shaderErrores.length ? this.shaderErrores.slice(-2).join(' || ') : 'sin errores de compilación');
    s += this.linea('gl.getError', this.glErrores.size ? [...this.glErrores].join(',') : 'ninguno') + (this.contextoPerdido || gl.isContextLost() ? 'CONTEXTO PERDIDO\n' : '');
    // cámara
    const dir = c.getWorldDirection(new THREE.Vector3());
    s += this.linea('Cámara pos', [c.position.x, c.position.y, c.position.z].map((x) => this.f(x)).join(', '));
    s += this.linea('Cámara dir', [dir.x, dir.y, dir.z].map((x) => this.f(x)).join(', ') + ' · fov ' + c.fov + ' · aspect ' + this.f(c.aspect));
    s += this.linea('near/far', this.f(c.near, 3) + ' / ' + this.f(c.far, 1) + ' · radio órbita ' + this.f(this.orbita.radio));
    s += this.linea('Canvas', `css ${cv.clientWidth}×${cv.clientHeight} · buffer ${cv.width}×${cv.height} · pr ${r.getPixelRatio()}`);
    // frustum y mallas
    c.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.m.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse));
    let total = 0, visibles = 0, enFrustum = 0, detras = 0, lejos = 0;
    const mats = new Set(), conMapa = new Set();
    this.scene.traverse((o) => {
      if (!o.isMesh) return;
      total++;
      for (let p = o; p; p = p.parent) if (!p.visible) return;
      visibles++;
      const mt = o.material; if (mt) { mats.add(mt); if (mt.map) conMapa.add(mt); }
      if (this.frustum.intersectsObject(o)) enFrustum++;
      const pos = o.getWorldPosition(new THREE.Vector3()), d = pos.distanceTo(c.position);
      if (d > c.far) lejos++;
      if (pos.clone().sub(c.position).dot(dir) < 0) detras++;
    });
    s += this.linea('Mallas', `${total} presentes · ${visibles} visibles · ${enFrustum} dentro del frustum · ${lejos} más allá de far · ${detras} detrás de la cámara`);
    if (album) {
      const centro = new THREE.Box3().setFromObject(album.raiz).getCenter(new THREE.Vector3());
      const ndc = centro.clone().project(c);
      s += this.linea('Centro álbum', `dist ${this.f(centro.distanceTo(c.position))} m · NDC ${this.f(ndc.x, 2)}, ${this.f(ndc.y, 2)}, ${this.f(ndc.z, 2)} (z∈[-1,1] = dentro de near/far)`);
      const e = album.estado;
      s += this.linea('Estado', `vueltas ${e.vueltas}/${album.geo.elementos} · objetivo ${e.objetivo} · animando ${e.animando} · raíz.x ${this.f(album.raiz.position.x)} · raíz.visible ${album.raiz.visible} · escena.padre ${album.escena.parent ? 'sí' : 'NO'}`);
    }
    s += this.linea('Cubos prueba', `en frustum: plano ${this.frustum.intersectsObject(this.cuboPlano)}, con luz ${this.frustum.intersectsObject(this.cuboLuz)} (deben verse magenta y verde)`);
    s += this.linea('Último frame', `${info.render.calls} llamadas · ${info.render.triangles} triáng. · ${info.memory.geometries} geom. · ${info.memory.textures} text. · ${info.programs ? info.programs.length : '?'} programas`);
    let texturasListas = 0, texturasMal = 0;
    if (album) album.texturas.forEach((t) => { if (t.textura) texturasListas++; else texturasMal++; });
    s += this.linea('Materiales', `${mats.size} activos · ${conMapa.size} con textura · texturas cargadas ${texturasListas}, pendientes/fallidas ${texturasMal}`);
    return s;
  }

  pintar() { this.sondaGl(); this.pre.textContent = this.texto(); }
}
