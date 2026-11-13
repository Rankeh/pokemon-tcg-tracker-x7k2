// Lee el GLB real (cabecera, JSON, accesorios) y monta un árbol de objetos como lo haría GLTFLoader (nombre, extras → userData).
import { Object3D, Mesh } from './three-doble.mjs';
export class GLTFLoader {
  parse(buf, _ruta, ok, mal) {
    try {
      const dv = new DataView(buf);
      if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('no es GLB');
      const lj = dv.getUint32(12, true);
      const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, lj)));
      const geos = json.meshes.map((m) => { const p = m.primitives[0], idx = json.accessors[p.indices], pos = json.accessors[p.attributes.POSITION];
        return { index: { count: idx.count }, attributes: { position: { count: pos.count } }, nombre: m.name }; });
      const crea = (i) => {
        const d = json.nodes[i];
        const o = d.mesh !== undefined ? new Mesh(geos[d.mesh], { nombre: 'material-glb' }) : new Object3D();
        o.name = d.name; o.userData = { ...(d.extras || {}) };
        if (d.translation) [o.position.x, o.position.y, o.position.z] = d.translation;
        (d.children || []).forEach((c) => o.add(crea(c)));
        return o;
      };
      ok({ scene: crea(json.scenes[0].nodes[0]) });
    } catch (e) { mal(e); }
  }
}
