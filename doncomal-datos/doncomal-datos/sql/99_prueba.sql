-- =============================================================================
-- Prueba del esquema: ¿el aislamiento entre restaurantes realmente funciona?
--
-- No basta con que el SQL corra sin errores. Lo que hay que demostrar es que un
-- usuario del restaurante A no puede leer los datos del restaurante B ni
-- aunque lo intente a propósito, y que un gerente no alcanza la nómina.
-- =============================================================================

-- --- Simulación del esquema auth de Supabase --------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- En Supabase auth.uid() sale del JWT. Aquí sale de una variable de sesión que
-- el arnés cambia para "ser" cada usuario.
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('prueba.uid', true), '')::uuid $$;

do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon;          exception when duplicate_object then null; end $$;
grant usage on schema public, auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
