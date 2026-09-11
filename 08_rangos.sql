-- =============================================================================
-- 08 · Agregar por rango de fechas
-- =============================================================================
--
-- Corre este archivo UNA vez. Solo agrega funciones; no toca datos.
--
-- Por qué hacen falta
-- -------------------
-- El tablero pasó de "un mes" a "cualquier rango": esta semana, los últimos
-- tres meses, del 12 al 27 de marzo. Los agregados por mes ya no alcanzan para
-- eso, y bajarle al navegador un agregado por producto y día serían 43,304
-- renglones — varios megabytes cada vez que se abre la página.
--
-- La alternativa es agregar en el servidor, que con el índice por fecha es
-- barato de verdad: 7 milisegundos una semana, 265 un año entero. Eso sí cabe
-- en una llamada.
--
-- Los agregados por mes de 07 siguen sirviendo: son los que alimentan las
-- gráficas de tendencia mes a mes, donde el grano SÍ es mensual.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Productos en un rango
-- -----------------------------------------------------------------------------

-- La categoría se LEE DEL CATÁLOGO al consultar, no del renglón de venta.
--
-- Esa diferencia es todo el punto. 'familia' y 'unidad_venta' vienen estampadas
-- en el renglón desde el día que se importó, y así deben quedarse: son parte de
-- lo que pasó. La categoría, en cambio, es una decisión de Octavio que puede
-- cambiar de opinión mañana — y cuando la cambie tiene que aplicar a los tres
-- años de historia de inmediato, sin volver a importar nada.
--
-- Por eso el join. Mover 'Migadas' de Antojitos a Platillos es un UPDATE de un
-- renglón del catálogo y el tablero entero se reacomoda solo.
--
-- El left join es a propósito: un producto nuevo, sin clasificar todavía, sigue
-- apareciendo con sus ventas y con categoría nula. Desaparecer de los totales
-- por no estar clasificado sería mucho peor que salir en "Sin categoría".
drop function if exists dc_productos_rango(date, date);

create or replace function dc_productos_rango(p_desde date, p_hasta date)
returns table (
  producto text, familia text, categoria text, unidad_venta text,
  unidades numeric, piezas numeric, ingresos numeric,
  renglones bigint, extras bigint, peticiones bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    d.producto,
    max(d.familia)                as familia,
    max(c.categoria)              as categoria,
    max(d.unidad_venta)           as unidad_venta,
    sum(d.cantidad)               as unidades,
    -- Solo cuentan las piezas de lo que se vende por pieza.
    coalesce(sum(d.piezas_equivalentes)
             filter (where d.unidad_venta = 'PIEZA'), 0) as piezas,
    sum(d.ingresos)               as ingresos,
    count(*)                      as renglones,
    sum(d.n_extras)::bigint       as extras,
    sum(d.n_peticiones)::bigint   as peticiones
  from dc_ventas_detalle d
  left join dc_cat_productos c on c.producto = d.producto
  where d.fecha between p_desde and p_hasta
    and not d.es_servicio_envio
    and dc_mi_rol() is not null
  group by d.producto;
$$;


-- -----------------------------------------------------------------------------
-- Guisados en un rango
--
-- 'unidades_atribuidas' reparte el pedido entre sus guisos y suma al total, así
-- que sirve para participación. 'unidades_presencia' cuenta el pedido completo
-- por cada guiso y NO suma: contesta en cuántos pedidos apareció.
-- -----------------------------------------------------------------------------

create or replace function dc_guisados_rango(p_desde date, p_hasta date)
returns table (
  guisado text,
  unidades_atribuidas numeric,
  unidades_presencia numeric,
  renglones bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    m.valor                                      as guisado,
    sum(d.cantidad / greatest(d.n_guisados, 1))  as unidades_atribuidas,
    sum(d.cantidad)                              as unidades_presencia,
    count(*)                                     as renglones
  from dc_ventas_modificadores m
  join dc_ventas_detalle d on d.id = m.detalle_id
  where m.fecha between p_desde and p_hasta
    and m.tipo = 'GUISADO'
    and not d.es_servicio_envio
    and dc_mi_rol() is not null
  group by m.valor;
$$;


-- -----------------------------------------------------------------------------
-- Modificadores en un rango
-- -----------------------------------------------------------------------------

create or replace function dc_modificadores_rango(p_desde date, p_hasta date)
returns table (
  tipo text, modificador text,
  veces bigint, renglones bigint, unidades_afectadas numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    m.tipo,
    m.valor                          as modificador,
    sum(m.multiplicador)::bigint     as veces,
    count(distinct m.detalle_id)     as renglones,
    sum(d.cantidad)                  as unidades_afectadas
  from dc_ventas_modificadores m
  join dc_ventas_detalle d on d.id = m.detalle_id
  where m.fecha between p_desde and p_hasta
    and m.tipo in ('EXTRA', 'PETICION', 'VARIANTE')
    and not d.es_servicio_envio
    and dc_mi_rol() is not null
  group by m.tipo, m.valor;
$$;


-- -----------------------------------------------------------------------------
-- Permisos
--
-- Son SECURITY DEFINER porque leen tablas con RLS, pero cada una comprueba el
-- rol por dentro con dc_mi_rol(): sin rol activo, no devuelven nada.
-- -----------------------------------------------------------------------------

revoke all on function dc_productos_rango(date, date) from public;
revoke all on function dc_guisados_rango(date, date) from public;
revoke all on function dc_modificadores_rango(date, date) from public;

grant execute on function dc_productos_rango(date, date) to authenticated;
grant execute on function dc_guisados_rango(date, date) to authenticated;
grant execute on function dc_modificadores_rango(date, date) to authenticated;


-- =============================================================================
-- Comprobación
--
-- OJO: si corres esto en el SQL Editor de Supabase, las tres funciones te van a
-- devolver VACÍO, y está bien. El editor corre como el dueño de la base, que no
-- está dado de alta en dc_usuarios, así que dc_mi_rol() no encuentra rol y la
-- función no deja pasar nada. Es exactamente la protección que se busca.
--
-- Para probarlas de verdad hay que hacerse pasar por un usuario con sesión.
-- Cambia el correo por el tuyo y corre esto completo:
--
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims = json_build_object(
--       'sub', (select id from auth.users where email = 'TU_CORREO'))::text;
--     select count(*) as productos, round(sum(ingresos)) as ingresos
--     from dc_productos_rango('2026-08-01', '2026-08-31');
--   rollback;
--
-- Debe dar los mismos ingresos que la tabla diaria para ese mes:
-- =============================================================================

select round(sum(ingresos_productos)) as ingresos_de_agosto_segun_la_tabla_diaria
from dc_ventas_dia
where fecha between '2026-08-01' and '2026-08-31';
