-- Perfil público mínimo de cada cuenta (nombre de usuario). Se crea solo al registrarse (disparador sobre auth.users).
create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre_usuario text unique check (char_length(nombre_usuario) between 3 and 30),
  creado_en timestamptz not null default now()
);

alter table public.perfiles enable row level security;

create policy "Cada usuario ve su perfil" on public.perfiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Cada usuario edita su perfil" on public.perfiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre_usuario)
  values (new.id, nullif(new.raw_user_meta_data ->> 'nombre_usuario', ''));
  return new;
end;
$$;

revoke execute on function public.crear_perfil_nuevo_usuario() from public, anon, authenticated;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();
