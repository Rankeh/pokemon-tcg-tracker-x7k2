// Lee el GLB real (cabecera, JSON, accesorios) y monta un árbol de objetos como lo haría GLTFLoader (nombre, extras → userData).
import { Object3D, Mesh, MeshStandardMaterial } from './three-doble.mjs';
export class GLTFLoader {
  parse(buf, _ruta, ok, mal) {
    try {
      const dv = new DataView(buf);
      if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('no es GLB');
      const lj = dv.getUint32(12, true);
      const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, lj)));
      const base = 20 + lj + 8;                                  // inicio de los datos del trozo BIN
      const atributo = (i) => { const a = json.accessors[i], v = json.bufferViews[a.bufferView], n = a.type === 'VEC3' ? 3 : 2, f = new Float32Array(buf.slice(base + (v.byteOffset || 0) + (a.byteOffset || 0), base + (v.byteOffset || 0) + (a.byteOffset || 0) + a.count * n * 4));
        return { count: a.count, array: f, getX: (k) => f[k * n], getY: (k) => f[k * n + 1], getZ: (k) => f[k * n + 2] }; };
      const mats = (json.materials || []).map((d) => { const m = new MeshStandardMaterial({ color: d.pbrMetallicRoughness.baseColorFactor, roughness: d.pbrMetallicRoughness.roughnessFactor }); m.name = d.name; m.opacity = d.pbrMetallicRoughness.baseColorFactor[3]; m.transparent = d.alphaMode === 'BLEND'; return m; });
      const geos = json.meshes.map((m) => { const p = m.primitives[0], idx = json.accessors[p.indices], pos = json.accessors[p.attributes.POSITION];
        const [mn, mx] = [pos.min || [0, 0, 0], pos.max || [0, 0, 0]];
        return { index: { count: idx.count }, attributes: { position: atributo(p.attributes.POSITION), normal: atributo(p.attributes.NORMAL), uv: atributo(p.attributes.TEXCOORD_0) }, setAttribute(n, a) { this.attributes[n] = a; }, materialIdx: p.material, nombre: m.name, boundingBox: { min: { x: mn[0], y: mn[1], z: mn[2] }, max: { x: mx[0], y: mx[1], z: mx[2] } }, computeBoundingBox() {} }; });
      const crea = (i) => {
        const d = json.nodes[i];
        const o = d.mesh !== undefined ? new Mesh(geos[d.mesh], mats[geos[d.mesh].materialIdx]) : new Object3D();
        o.name = d.name; o.userData = { ...(d.extras || {}) };
        if (d.translation) [o.position.x, o.position.y, o.position.z] = d.translation;
        (d.children || []).forEach((c) => o.add(crea(c)));
        return o;
      };
      ok({ scene: crea(json.scenes[0].nodes[0]) });
    } catch (e) { mal(e); }
  }
}
