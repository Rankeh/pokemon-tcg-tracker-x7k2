# Three.js local (opcional)

La prueba `web/prueba-3d/` carga Three.js 0.160.0 desde jsDelivr. Para usarla **sin internet** (o fijar la copia en el repo), descarga estos 3 archivos conservando las rutas (PowerShell, desde la raíz del repositorio):

    $v="https://cdn.jsdelivr.net/npm/three@0.160.0"
    New-Item -ItemType Directory -Force web/vendor/three/build, web/vendor/three/examples/jsm/loaders, web/vendor/three/examples/jsm/utils | Out-Null
    iwr "$v/build/three.module.js" -OutFile web/vendor/three/build/three.module.js
    iwr "$v/examples/jsm/loaders/GLTFLoader.js" -OutFile web/vendor/three/examples/jsm/loaders/GLTFLoader.js
    iwr "$v/examples/jsm/utils/BufferGeometryUtils.js" -OutFile web/vendor/three/examples/jsm/utils/BufferGeometryUtils.js

Si `web/vendor/three/build/three.module.js` existe, la página lo usa automáticamente.
