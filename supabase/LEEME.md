# Supabase

Proyecto `pokemon-tcg-tracker` (región eu-west-3). La web solo usa la **clave publicable**; la seguridad la dan las políticas RLS.

| Migración | Qué hace |
|---|---|
| `20261117122005_crear_perfiles.sql` | Tabla `perfiles` (nombre de usuario), creada sola al registrarse |
| `20261119181116_crear_copias_sincronizadas.sql` | Tabla `copias`: la colección de cada cuenta, para verla igual en el móvil y en el ordenador |
| `20261123120000_crear_administradores.sql` | Tabla `administradores`: la cuenta del dueño (solo ella ve los álbumes de la web). Nadie puede añadirse desde la web |
| `20261123110000_crear_albumes_propios.sql` | Tabla `albumes`: los álbumes creados en la app (definición y catálogo), en todos tus dispositivos |
| `20261123100000_perfil_tolerante_google.sql` | El perfil toma el nombre de Google; si choca o no cabe, se crea sin nombre (nunca bloquea el registro) |
| `20261123130000_crear_imagenes_propias.sql` | Tabla `imagenes_propias`: la imagen que eliges para una carta («Usar mi imagen»), como JPEG reducido (máx. ~600 KB), solo visible para ti |

`copias`: cada cuenta solo lee y cambia sus filas; nadie puede borrar filas desde la web (una carta quitada queda con cantidad 0, así la baja
llega a los demás dispositivos). Un disparador hace que gane siempre el cambio más reciente: una escritura más vieja no pisa la guardada.
El cliente está en `web/js/sincronizacion.js`.

En **Authentication → URL Configuration** del panel de Supabase, la *Site URL* y las *Redirect URLs* deben incluir
`https://rankeh.github.io/pokemon-tcg-tracker-x7k2/**`, para que el enlace de confirmación del correo vuelva a la web.

## Entrar con Google
La web ya tiene el botón «Continuar con Google» (`web/js/cuenta.js`); falta activarlo, y eso solo se puede hacer desde los paneles:
1. **Google Cloud Console** → APIs y servicios → Pantalla de consentimiento de OAuth (tipo «Externo», nombre de la app, tu correo).
2. **Credenciales** → Crear credenciales → ID de cliente de OAuth → «Aplicación web».
   - Orígenes autorizados de JavaScript: `https://rankeh.github.io`
   - URI de redireccionamiento autorizados: `https://untiwlxjdklqjwjbvdym.supabase.co/auth/v1/callback`
3. **Supabase** → Authentication → Sign In / Providers → **Google**: activar y pegar el *Client ID* y el *Client Secret*.
4. **Supabase** → Authentication → URL Configuration: *Site URL* `https://rankeh.github.io/pokemon-tcg-tracker-x7k2/` y, en *Redirect URLs*,
   `https://rankeh.github.io/pokemon-tcg-tracker-x7k2/**`.

Si ya tenías cuenta con el mismo correo (verificado), Supabase une las dos: es la misma cuenta y la misma colección.

## Funciones (Edge Functions)
| Función | Qué hace |
|---|---|
| `functions/imagen-limitless` | Intermediario de imágenes de cartas con CORS para el 3D. `?buscar=1&id&num[&set]` → `{ ruta }` (carpeta de limitlesstcg, cartas desde 2011) o `{ pio }` (cartas antiguas: la imagen que enseña la página de limitlesstcg o pokemontcg.io, su fuente). `?ruta=` / `?pio=` / `?tcgdex=` → la imagen (la última, porque muchas imágenes de TCGdex llevan la cabecera CORS duplicada y los navegadores las rechazan). Solo acepta rutas con la forma exacta de una imagen de carta. Sin sesión. |

`functions/imagen-limitless-sonda` fue una prueba temporal y ya no hace nada (responde 410): se puede borrar desde el panel (Edge Functions).
