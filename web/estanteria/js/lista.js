// 3.38 · Respaldo de la biblioteca SIN 3D (navegador sin WebGL, o si Three.js no carga): la lista de álbumes como enlaces y el botón para
// crear uno. Mismas reglas que la estantería: los álbumes de la web solo para el administrador. No usa Three.js.
import { listarTodos } from '../../js/albumes-propios.js';
import { Almacen } from '../../js/almacen.js';
import { adminGuardado, comprobarAdmin } from '../../js/admin.js';
import { montarCreador } from './creador.js';

export async function pintarListaSin3D() {
  const params = new URLSearchParams(location.search), ul = document.getElementById('lista-albumes');
  let almacen = null;
  try { almacen = await Almacen.abrir(params.get('bd') || undefined); } catch { /* sin almacenamiento: solo los de la web */ }
  const enPruebas = navigator.webdriver && !params.has('visitante');
  const pintar = async (fijos) => {
    const albumes = await listarTodos(almacen, { fijos });
    const items = albumes.map((a) => { const li = document.createElement('li'), enl = document.createElement('a'); enl.href = a.ruta; enl.textContent = `${a.nombre} — ${a.subtitulo}`; li.append(enl); return li; });
    if (almacen) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'e-caja'; b.textContent = 'Nuevo álbum';
      b.onclick = () => creador.abrir(); li.append(b); items.push(li);
    }
    ul.replaceChildren(...items);
  };
  const creador = montarCreador({ almacen, alCrear: () => pintar(verFijos) });
  let verFijos = adminGuardado() || enPruebas;
  await pintar(verFijos);
  comprobarAdmin().then((si) => { if ((si || enPruebas) !== verFijos) { verFijos = si || enPruebas; pintar(verFijos); } });
}
