-- =============================================================================
-- 01 · Seguridad y usuarios
-- =============================================================================
--
-- Este proyecto de Supabase pertenece a UN restaurante. Si mañana otro dueño
-- quiere la app, crea su propio proyecto y corre estos mismos archivos: sus
-- datos nunca tocan los tuyos.
--
-- Qué resuelve
-- ------------
-- Hoy la app funciona con la llave anónima de Supabase y sin que nadie inicie
-- sesión. Esa llave viaja dentro del código que corre en el navegador —está
-- diseñada para ser pública— así que lo único que separa tus datos del mundo
-- son las políticas de RLS. Sin ellas, cualquiera que vea el código puede leer
-- y escribir todo: compras, gastos y nómina.
--
-- El PIN que ya tiene la app decide qué pantalla se muestra. No decide qué
-- puede leer la base de datos. Son cosas distintas y esta es la segunda.
--
-- Los tres roles
-- --------------
--   admin     todo, incluyendo nómina y gastos fijos
--   gerente   opera ventas y compras; no ve nómina
--   lectura   solo consulta los tableros
--
-- ORDEN DE APLICACIÓN
-- -------------------
-- Activar RLS antes de que la app tenga login la deja sin acceso a los datos.
-- La secuencia segura está al final del archivo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Usuarios y roles
--
-- auth.users la administra Supabase (Authentication → Users). Esta tabla solo
-- le agrega el rol y el nombre para mostrar.
-- -----------------------------------------------------------------------------

do $$ begin
  create type dc_rol as enum ('admin', 'gerente', 'lectura');
exception when duplicate_object then null;
end $$;

create table if not exists dc_usuarios (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  nombre    text,
  rol       dc_rol not null default 'lectura',
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Funciones de apoyo
--
-- Van como SECURITY DEFINER a propósito. Si consultaran dc_usuarios con los
-- permisos del usuario, la política de dc_usuarios se llamaría a sí misma y
-- Postgres entraría en recursión infinita. Al ser DEFINER leen la tabla sin
-- pasar por RLS y cortan el ciclo.
--
-- El search_path fijo evita que alguien cree otra tabla llamada 'dc_usuarios'
-- en un esquema distinto y secuestre la función.
-- -----------------------------------------------------------------------------

create or replace function dc_mi_rol()
returns dc_rol
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rol from dc_usuarios where user_id = auth.uid() and activo;
$$;

create or replace function dc_es(variadic p_roles dc_rol[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select dc_mi_rol() = any(p_roles);
$$;

revoke all on function dc_mi_rol() from public;
revoke all on function dc_es(dc_rol[]) from public;
grant execute on function dc_mi_rol() to authenticated;
grant execute on function dc_es(dc_rol[]) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS sobre dc_usuarios
-- -----------------------------------------------------------------------------

alter table dc_usuarios enable row level security;

drop policy if exists p_usuarios_ver on dc_usuarios;
create policy p_usuarios_ver on dc_usuarios
  for select to authenticated
  using (user_id = auth.uid() or dc_es('admin'));

drop policy if exists p_usuarios_admin on dc_usuarios;
create policy p_usuarios_admin on dc_usuarios
  for all to authenticated
  using (dc_es('admin'))
  with check (dc_es('admin'));

-- -----------------------------------------------------------------------------
-- app_data — la tabla de la app de compras que ya está en producción
--
-- Guarda cada conjunto (dc_items, dc_gastos, dc_nomina…) como un JSON en
-- texto. Ese patrón se queda igual; lo que se agrega son las reglas de quién
-- puede tocar qué.
--
-- Un efecto útil del patrón llave-valor: como cada conjunto vive en su propio
-- renglón, se puede restringir por llave. Nómina, gastos y perfiles quedan
-- solo para administradores SIN cambiar una línea de la app.
-- -----------------------------------------------------------------------------

create table if not exists app_data (
  key        text primary key,
  value      text,
  updated_at timestamptz default now()
);

create or replace function dc_llave_sensible(p_key text)
returns boolean
language sql
immutable
as $$
  select p_key in ('dc_gastos', 'dc_gasto_cats', 'dc_nomina', 'dc_profiles');
$$;

alter table app_data enable row level security;

drop policy if exists p_app_data_leer on app_data;
create policy p_app_data_leer on app_data
  for select to authenticated
  using (
    dc_mi_rol() is not null
    and (not dc_llave_sensible(key) or dc_es('admin'))
  );

drop policy if exists p_app_data_escribir on app_data;
create policy p_app_data_escribir on app_data
  for all to authenticated
  using (
    case when dc_llave_sensible(key) then dc_es('admin')
         else dc_es('admin', 'gerente') end
  )
  with check (
    case when dc_llave_sensible(key) then dc_es('admin')
         else dc_es('admin', 'gerente') end
  );

grant select, insert, update, delete on app_data to authenticated;
grant select, insert, update, delete on dc_usuarios to authenticated;

-- =============================================================================
-- MIGRACIÓN DE LA APP QUE YA ESTÁ EN PRODUCCIÓN — el orden importa
-- =============================================================================
--
-- La app hoy escribe sin login. Si activas RLS antes de que tenga sesión, deja
-- de guardar. Esta secuencia no rompe nada y cada paso es reversible.
--
--   1. Corre este archivo COMPLETO. Crear tablas y funciones no afecta a la
--      app viva, y las políticas quedan listas pero sin efecto mientras la
--      llave anónima siga teniendo permiso (paso 5).
--
--   2. Crea tu usuario en Supabase: Authentication → Users → Add user.
--      Usa tu correo y una contraseña.
--
--   3. Date de alta como administrador:
--
--        insert into dc_usuarios (user_id, nombre, rol)
--        select id, 'Octavio', 'admin' from auth.users where email = 'TU_CORREO'
--        on conflict (user_id) do update set rol = 'admin';
--
--   4. AGREGA EL LOGIN A LA APP y publícalo. Mientras el rol anónimo conserve
--      permiso, la app funciona con o sin sesión, así que puedes probar sin
--      prisa y sin dejar a nadie fuera.
--
--   5. Cuando el login ya funcione en producción, cierra la puerta:
--
--        revoke all on app_data   from anon;
--        revoke all on dc_usuarios from anon;
--
--      A partir de aquí la llave pública del navegador ya no sirve sin sesión.
--
--   6. Si algo falla y necesitas volver atrás en un segundo:
--
--        alter table app_data disable row level security;
--        grant select, insert, update, delete on app_data to anon;
--
-- =============================================================================
