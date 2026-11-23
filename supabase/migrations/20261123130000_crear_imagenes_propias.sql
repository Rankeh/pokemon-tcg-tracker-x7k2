-- 3.43 · Imágenes propias de cartas («Usar mi imagen» en la ficha): para cartas sin imagen en ninguna fuente, o si prefieres tu foto.
-- imagen = data URL JPEG (~60 KB; la app la reduce antes de subirla). borrado = se quitó (vuelve la imagen de siempre).
create table public.imagenes_propias (
  usuario uuid not null default auth.uid() references auth.users (id) on delete cascade,
  carta text not null check (char_length(carta) between 1 and 64),
  imagen text check (imagen is null or (imagen like 'data:image/%' and char_length(imagen) < 600000)),
  borrado boolean not null default false,
  actualizado timestamptz not null,
  servidor timestamptz not null default now(),
  primary key (usuario, carta),
  check (borrado or imagen is not null)
);
create index imagenes_propias_usuario_servidor on public.imagenes_propias (usuario, servidor);

alter table public.imagenes_propias enable row level security;
create policy "leer mis imagenes" on public.imagenes_propias for select to authenticated using (usuario = (select auth.uid()));
create policy "crear mis imagenes" on public.imagenes_propias for insert to authenticated with check (usuario = (select auth.uid()));
create policy "cambiar mis imagenes" on public.imagenes_propias for update to authenticated
  using (usuario = (select auth.uid())) with check (usuario = (select auth.uid()));

-- gana el cambio más reciente y la hora de llegada la pone el servidor (el mismo disparador que copias y albumes)
create trigger imagenes_propias_antes_de_guardar before insert or update on public.imagenes_propias
  for each row execute function public.copias_antes_de_guardar();

revoke all on public.imagenes_propias from anon;
grant select, insert, update on public.imagenes_propias to authenticated;
