-- =============================================================================
-- 09 · Cerrar las funciones — CORRE ESTE ARCHIVO CUANTO ANTES
-- =============================================================================
--
-- Esto arregla un agujero real, no una precaución teórica. Se comprobó
-- reproduciéndolo: un usuario anónimo, sin iniciar sesión, podía llamar a
-- dc_importar_mes y BORRAR Y REEMPLAZAR ventas.
--
-- No cambia datos. Solo cambia una función y quita permisos.
--
--
-- Cómo se abrió el agujero: dos errores que por separado no hacían nada
-- ------------------------------------------------------------------------
--
-- PRIMERO — la comprobación de permiso no detenía nada.
--
--   dc_es() devuelve  dc_mi_rol() = any(p_roles).  Sin sesión, dc_mi_rol() es
--   NULL, y NULL = cualquier cosa da NULL — no 'false', NULL.
--
--   La función abría con:
--
--       if not dc_es('admin','gerente') then
--         raise exception 'No tienes permiso...';
--       end if;
--
--   'not NULL' también es NULL, y en PL/pgSQL un 'if NULL then' NO entra en la
--   rama. Así que la excepción nunca se lanzaba y la función seguía corriendo
--   como si el permiso estuviera bien.
--
--   Lo traicionero es que el código se LEE correcto. Solo falla cuando el rol
--   es nulo, que es justo el caso que se quería bloquear.
--
-- SEGUNDO — el rol anónimo podía llamarla.
--
--   Los archivos anteriores hacían 'revoke all on function ... from public'.
--   Eso alcanza en un Postgres normal, pero Supabase concede EXECUTE a 'anon'
--   y 'authenticated' automáticamente sobre cada función nueva del esquema
--   public, con ALTER DEFAULT PRIVILEGES. Ese permiso va directo al rol, no a
--   'public', así que el revoke no lo tocaba.
--
--   Por eso no salió en las pruebas locales: una base de Postgres sin la
--   configuración de Supabase no reparte esos permisos, y ahí el revoke sí
--   bastaba. El agujero solo existía en producción.
--
-- Y por qué se pudo llegar hasta los datos: las funciones son SECURITY
-- DEFINER, o sea que corren con los permisos de quien las creó. Eso se salta
-- el RLS por diseño — es lo que las hace útiles y lo que las vuelve
-- peligrosas si la comprobación de permiso falla.
--
-- Las políticas de RLS de las tablas NO tenían este problema: cuando una
-- política da NULL, Postgres niega el acceso. Solo el 'if' de PL/pgSQL
-- interpreta el NULL como "sigue adelante".
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 · Que dc_es() nunca devuelva NULL
--
-- coalesce lo convierte en 'false'. Con eso, 'not dc_es(...)' da 'true' cuando
-- no hay rol, y la excepción sí se lanza.
-- -----------------------------------------------------------------------------

create or replace function dc_es(variadic p_roles dc_rol[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(dc_mi_rol() = any(p_roles), false);
$$;


-- -----------------------------------------------------------------------------
-- 2 · Una comprobación que no depende de una sola función
--
-- Si mañana alguien vuelve a tocar dc_es(), esto sigue cerrando la puerta.
-- Falla ruidosamente en vez de dejar pasar.
-- -----------------------------------------------------------------------------

create or replace function dc_exigir(variadic p_roles dc_rol[])
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rol dc_rol;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesión.' using errcode = '42501';
  end if;
  v_rol := dc_mi_rol();
  if v_rol is null then
    raise exception 'Tu usuario no está dado de alta o está inactivo.'
      using errcode = '42501';
  end if;
  if not (v_rol = any(p_roles)) then
    raise exception 'Tu rol (%) no puede hacer esto.', v_rol
      using errcode = '42501';
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3 · La importación usa la comprobación nueva
-- -----------------------------------------------------------------------------

create or replace function dc_importar_mes(
  p_periodo  text,
  p_archivo  text,
  p_detalle  jsonb,
  p_mods     jsonb,
  p_dia      jsonb,
  p_qa       jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_imp bigint; v_base bigint; v_n int;
  v_det int; v_mod int; v_dia int; v_antes int;
  v_desde date; v_hasta date;
begin
  -- Lo primero, antes de tocar nada.
  perform dc_exigir('admin', 'gerente');

  if p_periodo !~ '^\d{4}-\d{2}$' then
    raise exception 'El periodo debe venir como AAAA-MM, llegó "%"', p_periodo;
  end if;

  v_n := coalesce(jsonb_array_length(p_detalle), 0);
  if v_n = 0 then
    raise exception 'El periodo % no trae renglones.', p_periodo;
  end if;

  select min(x.fecha), max(x.fecha) into v_desde, v_hasta
  from jsonb_to_recordset(p_detalle) as x(fecha date);

  if v_desde is null then
    raise exception 'Ningún renglón del periodo % trae fecha.', p_periodo;
  end if;

  if to_char(v_desde, 'YYYY-MM') <> p_periodo
     or to_char(v_hasta, 'YYYY-MM') <> p_periodo then
    raise exception 'El periodo declarado es % pero las fechas van de % a %.',
      p_periodo, v_desde, v_hasta;
  end if;

  select count(*) into v_antes
  from dc_ventas_detalle where fecha between v_desde and v_hasta;

  delete from dc_ventas_detalle where fecha between v_desde and v_hasta;
  delete from dc_ventas_dia      where fecha between v_desde and v_hasta;

  insert into dc_importaciones (archivo, tipo, periodo_min, periodo_max,
                                renglones, estado, qa, creada_por)
  values (p_archivo, 'PRODUCTOS', v_desde, v_hasta, v_n, 'OK', p_qa, auth.uid())
  returning id into v_imp;

  v_base := dc_reservar_ids('dc_ventas_detalle'::regclass, v_n);

  insert into dc_ventas_detalle (
    id, sucursal, fecha, periodo, producto, familia, unidad_venta,
    modificacion_original, cantidad, piezas_equivalentes, ventas_brutas,
    ingresos, precio_unitario, es_servicio_envio,
    n_guisados, n_extras, n_peticiones, importacion_id)
  select
    v_base + x._k, coalesce(x.sucursal, 'Principal'), x.fecha, p_periodo,
    x.producto, x.familia, x.unidad_venta, x.modificacion_original,
    x.cantidad, x.piezas_equivalentes, x.ventas_brutas, x.ingresos,
    x.precio_unitario, coalesce(x.es_servicio_envio, false),
    coalesce(x.n_guisados, 0), coalesce(x.n_extras, 0),
    coalesce(x.n_peticiones, 0), v_imp
  from jsonb_to_recordset(p_detalle) as x(
    _k int, sucursal text, fecha date, producto text, familia text,
    unidad_venta text, modificacion_original text, cantidad numeric,
    piezas_equivalentes numeric, ventas_brutas numeric, ingresos numeric,
    precio_unitario numeric, es_servicio_envio boolean,
    n_guisados int, n_extras int, n_peticiones int);
  get diagnostics v_det = row_count;

  insert into dc_ventas_modificadores (
    detalle_id, sucursal, fecha, periodo, producto,
    tipo, valor, token_original, multiplicador, posicion)
  select
    v_base + y._d, coalesce(y.sucursal, 'Principal'), y.fecha, p_periodo,
    y.producto, y.tipo, y.valor, y.token_original,
    coalesce(y.multiplicador, 1), coalesce(y.posicion, 1)
  from jsonb_to_recordset(p_mods) as y(
    _d int, sucursal text, fecha date, producto text, tipo text,
    valor text, token_original text, multiplicador int, posicion int);
  get diagnostics v_mod = row_count;

  insert into dc_ventas_dia (
    sucursal, fecha, ingresos_totales, ingresos_productos, ingreso_envio,
    recibos, clientes, ticket_promedio, unidades, piezas, renglones,
    importacion_id)
  select
    coalesce(z.sucursal, 'Principal'), z.fecha, z.ingresos_totales,
    z.ingresos_productos, coalesce(z.ingreso_envio, 0), z.recibos, z.clientes,
    z.ticket_promedio, z.unidades, z.piezas, z.renglones, v_imp
  from jsonb_to_recordset(p_dia) as z(
    sucursal text, fecha date, ingresos_totales numeric,
    ingresos_productos numeric, ingreso_envio numeric, recibos int,
    clientes int, ticket_promedio numeric, unidades numeric,
    piezas numeric, renglones int)
  where z.fecha between v_desde and v_hasta
  on conflict (sucursal, fecha) do update set
    ingresos_totales   = excluded.ingresos_totales,
    ingresos_productos = excluded.ingresos_productos,
    ingreso_envio      = excluded.ingreso_envio,
    recibos            = excluded.recibos,
    clientes           = excluded.clientes,
    ticket_promedio    = excluded.ticket_promedio,
    unidades           = excluded.unidades,
    piezas             = excluded.piezas,
    renglones          = excluded.renglones,
    importacion_id     = excluded.importacion_id;
  get diagnostics v_dia = row_count;

  return jsonb_build_object(
    'importacion_id', v_imp, 'periodo', p_periodo,
    'desde', v_desde, 'hasta', v_hasta,
    'renglones_antes', v_antes, 'renglones', v_det,
    'modificadores', v_mod, 'dias', v_dia,
    'ingresos', (select coalesce(sum(ingresos), 0) from dc_ventas_detalle
                   where fecha between v_desde and v_hasta and not es_servicio_envio),
    'unidades', (select coalesce(sum(cantidad), 0) from dc_ventas_detalle
                   where fecha between v_desde and v_hasta and not es_servicio_envio)
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- 4 · Refrescar agregados también exige rol
-- -----------------------------------------------------------------------------

create or replace function dc_refrescar_agregados()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform dc_exigir('admin', 'gerente');
  refresh materialized view dc_m_producto_mes;
  refresh materialized view dc_m_prod_guisado_mes;
  refresh materialized view dc_m_guisado_mes;
  refresh materialized view dc_m_modificador_mes;
  refresh materialized view dc_m_precios;
end;
$$;


-- =============================================================================
-- 5 · Quitarle EXECUTE al rol anónimo, función por función
--
-- 'revoke from public' NO alcanza: Supabase le concede EXECUTE directamente a
-- 'anon', y un permiso concedido al rol no se quita quitándoselo a public.
--
-- Esto recorre TODAS las funciones dc_* en vez de nombrarlas, para que ninguna
-- futura se quede fuera por olvido. Volver a correrlo cada vez que se agregue
-- una función.
-- =============================================================================

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'dc\_%'
  loop
    execute format('revoke all on function %s from anon, public', f.firma);
    -- Las que la app llama con sesión sí las necesita.
    if f.proname in ('dc_mi_rol', 'dc_es', 'dc_exigir', 'dc_importar_mes',
                     'dc_refrescar_agregados', 'dc_productos_rango',
                     'dc_guisados_rango', 'dc_modificadores_rango') then
      execute format('grant execute on function %s to authenticated', f.firma);
    end if;
    raise notice 'cerrada %', f.proname;
  end loop;
end $$;


-- =============================================================================
-- Comprobación
--
-- 'anon_puede' tiene que salir en FALSE en todas.
-- =============================================================================

select p.proname as funcion,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_puede,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as usuario_puede
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'dc\_%'
order by 1;
