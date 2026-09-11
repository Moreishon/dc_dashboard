-- =============================================================================
-- 05 · Permisos de lectura que faltaban
-- =============================================================================
--
-- Corre este archivo UNA vez. No cambia datos ni estructura: solo permisos.
--
-- Qué se rompió
-- -------------
-- Las vistas nuevas de los archivos 03 y 04 (dc_v_periodos, dc_v_cobertura y
-- dc_v_dias) se crearon quitándole el acceso al rol anónimo, pero sin dárselo
-- al rol de los usuarios con sesión. Resultado: la app las consulta y la base
-- contesta que no hay nada, sin error visible.
--
-- Se notaba así: la fecha de "Datos hasta" no aparecía y la tarjeta de lo ya
-- cargado salía vacía.
--
-- Cómo se evita a futuro
-- ----------------------
-- En vez de nombrar las vistas una por una —que es donde se olvidó alguna—,
-- esto recorre TODAS las que empiezan con dc_v_ y les aplica la misma regla.
-- Si mañana se agrega otra vista, basta con volver a correr este archivo.
-- =============================================================================

do $$
declare
  v record;
begin
  for v in
    select table_name
    from information_schema.views
    where table_schema = 'public'
      and table_name like 'dc\_v\_%'
  loop
    execute format('grant select on public.%I to authenticated', v.table_name);
    execute format('revoke all on public.%I from anon', v.table_name);
    raise notice 'permisos aplicados a %', v.table_name;
  end loop;
end $$;


-- -----------------------------------------------------------------------------
-- Comprobación
--
-- Las once vistas tienen que salir con 'puede_leer' en true. Si alguna sale en
-- false, el bloque de arriba no la alcanzó.
-- -----------------------------------------------------------------------------

select
  table_name as vista,
  has_table_privilege('authenticated', 'public.' || table_name, 'SELECT') as puede_leer,
  has_table_privilege('anon', 'public.' || table_name, 'SELECT') as anonimo_puede
from information_schema.views
where table_schema = 'public'
  and table_name like 'dc\_v\_%'
order by 1;
