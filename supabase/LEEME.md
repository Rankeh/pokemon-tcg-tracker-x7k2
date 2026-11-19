# Supabase

Proyecto `pokemon-tcg-tracker` (región eu-west-3). La web solo usa la **clave publicable**; la seguridad la dan las políticas RLS.

| Migración | Qué hace |
|---|---|
| `20261117122005_crear_perfiles.sql` | Tabla `perfiles` (nombre de usuario), creada sola al registrarse |
| `20261119181116_crear_copias_sincronizadas.sql` | Tabla `copias`: la colección de cada cuenta, para verla igual en el móvil y en el ordenador |

`copias`: cada cuenta solo lee y cambia sus filas; nadie puede borrar filas desde la web (una carta quitada queda con cantidad 0, así la baja
llega a los demás dispositivos). Un disparador hace que gane siempre el cambio más reciente: una escritura más vieja no pisa la guardada.
El cliente está en `web/js/sincronizacion.js`.

En **Authentication → URL Configuration** del panel de Supabase, la *Site URL* y las *Redirect URLs* deben incluir
`https://rankeh.github.io/pokemon-tcg-tracker-x7k2/**`, para que el enlace de confirmación del correo vuelva a la web.
