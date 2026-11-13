// Caché de texturas con presupuesto de memoria, recuento de usos, cola con prioridad y límite de cargas simultáneas. PURA respecto a Three.js:
// solo llama a textura.dispose() y recibe de un "productor" {textura, bytes}. Una textura se libera de la GPU solo cuando nadie la usa Y falta presupuesto.
export class CacheTexturas {
  constructor({ presupuestoBytes = 32 * 1048576, concurrencia = 4 } = {}) {
    this.presupuesto = presupuestoBytes;
    this.concurrencia = concurrencia;
    this.entradas = new Map();      // clave -> {estado, promesa, textura, bytes, refs, uso}
    this.cola = [];                 // {clave, productor, prioridad, seq}
    this.activas = 0;
    this.seq = 0;
    this.reloj = 0;
    this.contadores = { producidas: 0, aciertos: 0, descartadas: 0, canceladas: 0, errores: 0 };
  }

  /** Pide una textura. Devuelve {textura, error}. Cada adquirir() debe acabar con un liberar() de la misma clave. */
  adquirir(clave, productor, prioridad = 0) {
    let e = this.entradas.get(clave);
    if (e) {
      e.refs++; e.uso = ++this.reloj;
      if (e.estado === 'lista') this.contadores.aciertos++;
      const t = this.cola.find((x) => x.clave === clave); if (t && prioridad < t.prioridad) t.prioridad = prioridad;
      return e.promesa;
    }
    e = { estado: 'cola', textura: null, bytes: 0, refs: 1, uso: ++this.reloj, error: null };
    e.promesa = new Promise((ok) => { e.resolver = ok; });
    this.entradas.set(clave, e);
    this.cola.push({ clave, productor, prioridad, seq: this.seq++ });
    this._bombear();
    return e.promesa;
  }

  liberar(clave) {
    const e = this.entradas.get(clave);
    if (!e || e.refs <= 0) return;
    e.refs--; e.uso = ++this.reloj;
    if (e.refs === 0 && e.estado === 'error') this.entradas.delete(clave);        // un error no se queda: se podrá reintentar
    this._recortar();
  }

  _bombear() {
    while (this.activas < this.concurrencia && this.cola.length) {
      this.cola.sort((a, b) => a.prioridad - b.prioridad || a.seq - b.seq);
      const t = this.cola.shift(), e = this.entradas.get(t.clave);
      if (!e) continue;
      if (e.refs === 0) {                                  // nadie la espera ya (navegación rápida): no se carga
        this.entradas.delete(t.clave); this.contadores.canceladas++; e.resolver({ textura: null, error: new Error('cancelada') }); continue;
      }
      e.estado = 'cargando'; this.activas++;
      Promise.resolve().then(() => t.productor()).then((r) => {
        e.textura = r.textura; e.bytes = r.bytes; e.estado = 'lista'; this.contadores.producidas++;
        e.resolver({ textura: r.textura, error: null });
      }, (err) => {
        e.estado = 'error'; e.error = err; this.contadores.errores++; e.resolver({ textura: null, error: err });
        if (e.refs === 0) this.entradas.delete(t.clave);
      }).finally(() => { this.activas--; this._recortar(); this._bombear(); });
    }
  }

  get bytes() { let n = 0; for (const e of this.entradas.values()) if (e.estado === 'lista') n += e.bytes; return n; }

  /** Libera (dispose) las inactivas menos recientes hasta caber en el presupuesto. Las que están en uso nunca se tocan. */
  _recortar() {
    if (this.bytes <= this.presupuesto) return;
    const inactivas = [...this.entradas.entries()].filter(([, e]) => e.refs === 0 && e.estado === 'lista').sort((a, b) => a[1].uso - b[1].uso);
    for (const [clave, e] of inactivas) {
      if (this.bytes <= this.presupuesto) break;
      e.textura.dispose(); this.entradas.delete(clave); this.contadores.descartadas++;
    }
  }

  estadisticas() {
    let activas = 0, inactivas = 0;
    for (const e of this.entradas.values()) if (e.estado === 'lista') e.refs > 0 ? activas++ : inactivas++;
    return { texturas: activas + inactivas, activas, inactivas, bytes: this.bytes, enCola: this.cola.length, cargando: this.activas, ...this.contadores };
  }

  vaciar() {
    for (const e of this.entradas.values()) if (e.textura) e.textura.dispose();
    this.entradas.clear(); this.cola = [];
  }
}
