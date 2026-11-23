-- El perfil se crea al registrarse. Con Google no hay «nombre_usuario»: se usa el nombre de la cuenta de Google si cabe (3–30 caracteres).
-- Si el nombre ya existe o no es válido, el perfil se crea sin nombre: un problema con el nombre NUNCA debe impedir crear la cuenta.
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  nombre text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'nombre_usuario', new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
begin
  if nombre is not null and char_length(nombre) > 30 then nombre := trim(left(nombre, 30)); end if;
  if nombre is not null and char_length(nombre) < 3 then nombre := null; end if;
  begin
    insert into public.perfiles (id, nombre_usuario) values (new.id, nombre);
  exception when unique_violation or check_violation then
    insert into public.perfiles (id, nombre_usuario) values (new.id, null) on conflict (id) do nothing;
  end;
  return new;
end;
$$;

revoke execute on function public.crear_perfil_nuevo_usuario() from public, anon, authenticated;
