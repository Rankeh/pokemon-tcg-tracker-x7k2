// Redirige 'three' y el cargador GLTF a un doble de prueba (en este entorno no se puede descargar Three.js).
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: new URL('./three-doble.mjs', import.meta.url).href, shortCircuit: true };
  if (spec === 'three/addons/loaders/GLTFLoader.js') return { url: new URL('./gltfloader-doble.mjs', import.meta.url).href, shortCircuit: true };
  return next(spec, ctx);
}
