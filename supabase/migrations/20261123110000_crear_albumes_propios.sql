-- Álbumes creados en la app (por expansión, ilustrador o Pokémon), para tenerlos en todos los dispositivos de la cuenta.
-- datos = { registro (portada, lomo, nombre…), datos: { catalogo, precios }, creado }. borrado = el álbum se quitó (las cartas marcadas NO se tocan).
create table public.albumes (
  usuario uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (id ~ '^mio-[a-z0-9-]{1,60}$'),
  datos jsonb check (datos is null or jsonb_typeof(datos) = 'object'),
  borrado boolean not null default false,
  actualizado timestamptz not null,
  servidor timestamptz not null default now(),
  primary key (usuario, id),
  check (borrado or datos is not null),
  check (pg_column_size(datos) < 2000000)            -- un álbum de 360 cartas ocupa unos 300 KB
);
create index albumes_usuario_servidor on public.albumes (usuario, servidor);

alter table public.albumes enable row level security;
create policy "leer mis albumes" on public.albumes for select to authenticated using (usuario = (select auth.uid()));
create policy "crear mis albumes" on public.albumes for insert to authenticated with check (usuario = (select auth.uid()));
create policy "cambiar mis albumes" on public.albumes for update to authenticated
  using (usuario = (select auth.uid())) with check (usuario = (select auth.uid()));
-- sin política de borrado: un álbum quitado se queda con borrado = true para que la baja llegue a los demás dispositivos

-- mismo disparador que copias: gana el cambio más reciente y la hora de llegada la pone el servidor
create trigger albumes_antes_de_guardar before insert or update on public.albumes
  for each row execute function public.copias_antes_de_guardar();

revoke all on public.albumes from anon;
grant select, insert, update on public.albumes to authenticated;
