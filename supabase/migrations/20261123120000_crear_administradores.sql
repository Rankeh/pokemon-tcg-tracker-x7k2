-- Quién es administrador de la web (ve los álbumes de la web: Teselia, artistas, Pikachu 30…). Nadie puede añadirse ni quitarse desde
-- la web: sin políticas de escritura. Cada cuenta solo puede consultar SU fila (saber si ella es admin), nunca la lista.
create table public.administradores (
  usuario uuid primary key references auth.users (id) on delete cascade,
  desde timestamptz not null default now()
);
alter table public.administradores enable row level security;
create policy "saber si soy admin" on public.administradores for select to authenticated using (usuario = (select auth.uid()));
revoke all on public.administradores from anon;
grant select on public.administradores to authenticated;

-- la única cuenta que existe al crear la tabla: la del dueño de la web (Google, «Rankeh»)
insert into public.administradores (usuario) values ('deddda54-a8a9-4d25-be98-f98dc9e566c5');
