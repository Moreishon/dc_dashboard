-- =============================================================================
-- Don Comal — Base multi-restaurante y seguridad
-- =============================================================================
--
-- Qué resuelve este archivo
-- -------------------------
-- Hoy la app funciona con la llave anónima de Supabase y sin que nadie inicie
-- sesión. Esa llave viaja en el código del navegador — está diseñada para ser
-- pública — así que lo único que separa tus datos del mundo son las políticas
-- de RLS (Row Level Security). Sin ellas, cualquiera que tenga la llave puede
-- leer y escribir todo.
--
-- Y si el esqueleto se le vende a otros restaurantes, el problema crece: sin
-- aislamiento, cada restaurante vería las ventas de los demás. Por eso el
-- aislamiento va en el esquema desde el inicio y no como un parche.
--
-- El modelo
-- ---------
--   dc_tenants      un renglón por restaurante
--   dc_membresias   qué usuario pertenece a qué restaurante y con qué rol
--   RLS             cada tabla filtra por los restaurantes del usuario
--
-- Roles:
--   admin     todo, incluyendo nómina y gastos
--   gerente   opera ventas y compras; no ve nómina
--   lectura   solo consulta los tableros
--
-- ORDEN DE APLICACIÓN — importante
-- --------------------------------
-- Activar RLS antes de que la app tenga login la deja sin acceso a los datos.
-- La secuencia segura está al final del archivo, en la sección MIGRACIÓN.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Restaurantes y membresías
-- -----------------------------------------------------------------------------

create table if not exists dc_tenants (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  slug       text not null unique,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

do $$ begin
  create type dc_rol as enum ('admin', 'gerente', 'lectura');
exception when duplicate_object then null;
end $$;

create table if not exists dc_membresias (
  user_id    uuid not null references auth.users(id) on delete cascade,
  tenant_id  uuid not null references dc_tenants(id) on delete cascade,
  rol        dc_rol not null default 'lectura',
  creado_en  timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

create index if not exists ix_membresias_user on dc_membresias(user_id);

-- -----------------------------------------------------------------------------
-- Funciones de apoyo
--
-- Van como SECURITY DEFINER a propósito: si consultaran dc_membresias con los
-- permisos del usuario, la política de dc_membresias se llamaría a sí misma y
-- Postgres entraría en recursión infinita. Al ser DEFINER, la función lee la
-- tabla sin pasar por RLS y corta el ciclo.
--
-- El search_path fijo evita que alguien redefina 'dc_membresias' en otro
-- esquema y secuestre la función.
-- -----------------------------------------------------------------------------

create or replace function dc_mis_tenants()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tenant_id from dc_membresias where user_id = auth.uid();
$$;

create or replace function dc_tiene_rol(p_tenant uuid, variadic p_roles dc_rol[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from dc_membresias
    where user_id = auth.uid()
      and tenant_id = p_tenant
      and rol = any(p_roles)
  );
$$;

revoke all on function dc_mis_tenants() from public;
revoke all on function dc_tiene_rol(uuid, dc_rol[]) from public;
grant execute on function dc_mis_tenants() to authenticated;
grant execute on function dc_tiene_rol(uuid, dc_rol[]) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS sobre las tablas de control
-- -----------------------------------------------------------------------------

alter table dc_tenants    enable row level security;
alter table dc_membresias enable row level security;

drop policy if exists p_tenants_ver on dc_tenants;
create policy p_tenants_ver on dc_tenants
  for select to authenticated
  using (id in (select dc_mis_tenants()));

-- Esta política NO consulta dc_membresias, así que no hay recursión.
drop policy if exists p_membresias_propias on dc_membresias;
create policy p_membresias_propias on dc_membresias
  for select to authenticated
  using (user_id = auth.uid());

-- Un admin sí puede ver y administrar a los demás miembros de su restaurante;
-- aquí la comprobación pasa por la función DEFINER, que no recursa.
drop policy if exists p_membresias_admin_ver on dc_membresias;
create policy p_membresias_admin_ver on dc_membresias
  for select to authenticated
  using (dc_tiene_rol(tenant_id, 'admin'));

drop policy if exists p_membresias_admin_escribir on dc_membresias;
create policy p_membresias_admin_escribir on dc_membresias
  for all to authenticated
  using (dc_tiene_rol(tenant_id, 'admin'))
  with check (dc_tiene_rol(tenant_id, 'admin'));

-- -----------------------------------------------------------------------------
-- app_data — la tabla de la app de compras que ya está en producción
--
-- Guarda cada conjunto (dc_items, dc_gastos, dc_nomina…) como un JSON en texto.
-- Ese patrón se queda como está para compras; lo que se agrega es el dueño de
-- cada renglón y las reglas de quién puede tocarlo.
--
-- Un efecto secundario útil del patrón llave-valor: como cada conjunto es un
-- renglón, se puede restringir por llave. Nómina y gastos quedan solo para
-- administradores sin cambiar una línea de la app.
-- -----------------------------------------------------------------------------

create table if not exists app_data (
  key        text not null,
  value      text,
  updated_at timestamptz default now()
);

alter table app_data add column if not exists tenant_id uuid references dc_tenants(id) on delete cascade;

-- Llaves que solo un administrador puede leer o escribir.
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
    tenant_id in (select dc_mis_tenants())
    and (not dc_llave_sensible(key) or dc_tiene_rol(tenant_id, 'admin'))
  );

drop policy if exists p_app_data_escribir on app_data;
create policy p_app_data_escribir on app_data
  for all to authenticated
  using (
    tenant_id in (select dc_mis_tenants())
    and (
      case
        when dc_llave_sensible(key) then dc_tiene_rol(tenant_id, 'admin')
        else dc_tiene_rol(tenant_id, 'admin', 'gerente')
      end
    )
  )
  with check (
    tenant_id in (select dc_mis_tenants())
    and (
      case
        when dc_llave_sensible(key) then dc_tiene_rol(tenant_id, 'admin')
        else dc_tiene_rol(tenant_id, 'admin', 'gerente')
      end
    )
  );

-- =============================================================================
-- MIGRACIÓN — el orden importa
-- =============================================================================
--
-- La app en producción hoy escribe sin login. Si activas RLS antes de que
-- tenga sesión, deja de guardar. Esta es la secuencia que no rompe nada:
--
--   1. Corre este archivo HASTA la sección de app_data, sin las políticas.
--      Crear tablas y funciones no afecta a la app viva.
--
--   2. Da de alta tu restaurante y ponle dueño a los datos que ya existen:
--
--        insert into dc_tenants (nombre, slug)
--        values ('Don Comal Tampico', 'don-comal')
--        on conflict (slug) do nothing;
--
--        update app_data
--           set tenant_id = (select id from dc_tenants where slug='don-comal')
--         where tenant_id is null;
--
--   3. Crea tu usuario en Supabase (Authentication → Users) y hazlo admin:
--
--        insert into dc_membresias (user_id, tenant_id, rol)
--        select u.id, t.id, 'admin'
--          from auth.users u, dc_tenants t
--         where u.email = 'TU_CORREO' and t.slug = 'don-comal'
--        on conflict do nothing;
--
--   4. AGREGA EL LOGIN A LA APP y publícalo. Mientras RLS siga apagado la app
--      funciona igual que hoy, con o sin sesión, así que puedes probar sin prisa.
--
--   5. Cuando el login ya funcione en producción, recién entonces activa las
--      políticas de app_data (la sección de arriba) y verifica que sigue
--      guardando. Si algo falla, `alter table app_data disable row level
--      security;` te regresa al estado anterior en un segundo.
--
--   6. Al final, cierra la llave: quita el permiso al rol anónimo, para que
--      la llave pública del navegador ya no sirva sin sesión.
--
--        revoke all on app_data from anon;
--
-- =============================================================================
