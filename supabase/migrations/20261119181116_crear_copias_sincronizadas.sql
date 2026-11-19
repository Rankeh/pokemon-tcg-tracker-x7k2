-- Colección sincronizada entre dispositivos: una fila por (usuario, carta).
-- cantidad 0 = carta quitada (se guarda para que la baja llegue a los demás dispositivos; nunca se borran filas desde el cliente).
create table public.copias (
  usuario uuid not null default auth.uid() references auth.users (id) on delete cascade,
  carta text not null check (char_length(carta) between 1 and 64),
  cantidad integer not null check (cantidad between 0 and 999),
  variantes jsonb not null default '{}'::jsonb check (jsonb_typeof(variantes) = 'object'),
  mostrar text check (mostrar is null or char_length(mostrar) between 1 and 32),
  actualizado timestamptz not null,               -- momento del cambio en el dispositivo: decide qué versión gana
  servidor timestamptz not null default now(),    -- cuándo llegó al servidor: los dispositivos leen solo lo nuevo desde su última lectura
  primary key (usuario, carta)
);
create index copias_usuario_servidor on public.copias (usuario, servidor);

alter table public.copias enable row level security;
create policy "leer mis copias" on public.copias for select to authenticated using (usuario = (select auth.uid()));
create policy "crear mis copias" on public.copias for insert to authenticated with check (usuario = (select auth.uid()));
create policy "cambiar mis copias" on public.copias for update to authenticated
  using (usuario = (select auth.uid())) with check (usuario = (select auth.uid()));
-- sin política de borrado: desde la web no se puede borrar ninguna fila

-- Gana el cambio más reciente: una escritura más antigua que la guardada no la pisa. Y la hora de llegada la pone siempre el servidor.
create or replace function public.copias_antes_de_guardar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.actualizado < old.actualizado then
    return old;
  end if;
  new.servidor := now();
  return new;
end $$;
create trigger copias_antes_de_guardar before insert or update on public.copias
  for each row execute function public.copias_antes_de_guardar();

revoke all on public.copias from anon;
grant select, insert, update on public.copias to authenticated;
