-- =============================================================================
-- 07 · Agregados precalculados para el tablero
-- =============================================================================
--
-- Corre este archivo UNA vez. Tarda unos segundos: calcula los agregados de
-- los tres años. No cambia ningún dato.
--
-- Por qué precalcular
-- -------------------
-- Las vistas del tablero recorren los 138,762 renglones cada vez que alguien
-- abre la página. Una sola tarda cerca de un segundo aquí y bastante más en
-- Supabase; varias a la vez, con la base fría, se acercan al límite de tiempo
-- que corta cualquier consulta. Ya nos pasó con la vista de cobertura.
--
-- Una vista materializada guarda el resultado. El cálculo se paga UNA vez, al
-- importar, y de ahí en adelante abrir el tablero es leer 2,677 renglones en
-- vez de agregar 138,762. La importación tarda un poco más; el tablero, que se
-- abre muchas veces al día, es instantáneo.
--
-- Sobre los permisos
-- ------------------
-- Una vista materializada no aplica RLS: es una tabla, no una consulta. Para
-- que no quede más abierta que los datos originales, no se le da acceso a
-- nadie directamente. Encima va una vista normal que comprueba el rol, y esa
-- es la que la app puede leer.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- La serie diaria, completa
--
-- La versión anterior de dc_v_dias se quedaba corta: le faltaban clientes,
-- ticket, piezas y el envío. El tablero calcula casi todo desde aquí, así que
-- necesita las columnas completas. Son 1,106 renglones: barata.
--
-- Va DROP y no CREATE OR REPLACE, y es obligatorio: "replace" solo puede
-- agregar columnas al final, nunca meter una en medio ni renombrar. Como aquí
-- 'ingreso_envio' entra donde antes estaba 'recibos', Postgres lo rechaza con
--
--     cannot change name of view column "recibos" to "ingreso_envio"
--
-- Sin cascade a propósito: si algo dependiera de esta vista, es mejor que
-- falle y lo veamos a que se borre en silencio.
-- -----------------------------------------------------------------------------

drop view if exists dc_v_dias;

create view dc_v_dias with (security_invoker = true) as
select
  fecha,
  to_char(fecha, 'YYYY-MM') as periodo,
  ingresos_totales,
  ingresos_productos,
  ingreso_envio,
  recibos,
  clientes,
  ticket_promedio,
  unidades,
  piezas,
  renglones
from dc_ventas_dia;

grant select on dc_v_dias to authenticated;
revoke all on dc_v_dias from anon;


-- -----------------------------------------------------------------------------
-- Producto por mes
-- -----------------------------------------------------------------------------

drop materialized view if exists dc_m_producto_mes cascade;
create materialized view dc_m_producto_mes as
select
  d.periodo,
  d.producto,
  max(d.familia)                        as familia,
  max(d.unidad_venta)                   as unidad_venta,
  sum(d.cantidad)                       as unidades,
  -- Las piezas solo cuentan para lo que se vende por pieza. Sumar las
  -- "piezas equivalentes" de una orden de enchiladas da un número que no
  -- significa nada.
  sum(d.piezas_equivalentes) filter (where d.unidad_venta = 'PIEZA') as piezas,
  sum(d.ingresos)                       as ingresos,
  sum(d.ventas_brutas)                  as ventas_brutas,
  count(*)                              as renglones,
  sum(d.n_extras)                       as extras,
  sum(d.n_peticiones)                   as peticiones,
  round(sum(d.ingresos) / nullif(sum(d.cantidad), 0), 2) as ingreso_por_unidad
from dc_ventas_detalle d
where not d.es_servicio_envio
group by d.periodo, d.producto;

create unique index if not exists ix_m_prod_mes on dc_m_producto_mes(periodo, producto);


-- -----------------------------------------------------------------------------
-- Producto × guisado por mes
--
-- Dos medidas distintas y las dos hacen falta:
--
--   unidades_atribuidas  reparte la venta entre los guisos del renglón. Si un
--                        pedido de 2 lleva Deshebrada y Chicharrón, cada uno
--                        se lleva 1. Suman al total: sirven para participación.
--
--   unidades_presencia   cuenta el pedido completo para cada guiso que
--                        aparece. NO suman al total, y está bien: responden
--                        "¿en cuántos pedidos apareció?", que es otra pregunta.
--
-- El reparto usa d.n_guisados, que ya viene guardado en el renglón. La versión
-- anterior lo recontaba con una subconsulta por cada uno de los 102,394
-- modificadores de guisado. Se comprobó que los dos números coinciden en los
-- 138,762 renglones.
-- -----------------------------------------------------------------------------

drop materialized view if exists dc_m_prod_guisado_mes cascade;
create materialized view dc_m_prod_guisado_mes as
select
  m.periodo,
  m.producto,
  m.valor                                          as guisado,
  sum(d.cantidad / greatest(d.n_guisados, 1))      as unidades_atribuidas,
  sum(d.cantidad)                                  as unidades_presencia,
  count(*)                                         as renglones
from dc_ventas_modificadores m
join dc_ventas_detalle d on d.id = m.detalle_id
where m.tipo = 'GUISADO' and not d.es_servicio_envio
group by m.periodo, m.producto, m.valor;

create unique index if not exists ix_m_pg_mes
  on dc_m_prod_guisado_mes(periodo, producto, guisado);


-- -----------------------------------------------------------------------------
-- Guisado por mes
-- -----------------------------------------------------------------------------

drop materialized view if exists dc_m_guisado_mes cascade;
create materialized view dc_m_guisado_mes as
select periodo, guisado,
       sum(unidades_atribuidas) as unidades_atribuidas,
       sum(unidades_presencia)  as unidades_presencia,
       sum(renglones)           as renglones
from dc_m_prod_guisado_mes
group by periodo, guisado;

create unique index if not exists ix_m_guis_mes on dc_m_guisado_mes(periodo, guisado);


-- -----------------------------------------------------------------------------
-- Modificadores por mes
--
-- 'veces' suma el multiplicador: 'Queso &times 2' cuenta 2, porque son dos
-- porciones. Esto NO es lo mismo que las columnas n_extras del renglón, que
-- cuentan etiquetas.
-- -----------------------------------------------------------------------------

drop materialized view if exists dc_m_modificador_mes cascade;
create materialized view dc_m_modificador_mes as
select m.periodo, m.tipo, m.valor as modificador,
       sum(m.multiplicador)  as veces,
       count(distinct m.detalle_id) as renglones,
       sum(d.cantidad)       as unidades_afectadas
from dc_ventas_modificadores m
join dc_ventas_detalle d on d.id = m.detalle_id
where m.tipo in ('EXTRA', 'PETICION', 'VARIANTE') and not d.es_servicio_envio
group by m.periodo, m.tipo, m.valor;

create unique index if not exists ix_m_mod_mes
  on dc_m_modificador_mes(periodo, tipo, modificador);


-- -----------------------------------------------------------------------------
-- Precio de lista por producto y mes
--
-- No es el promedio: el promedio lo ensucian los extras y el sobreprecio de
-- las plataformas de delivery, que solo suman. Se toma el nivel de precio más
-- bajo que tenga al menos el 10% de las unidades del mes — inmune a los dos
-- problemas, porque ninguno baja el precio.
--
-- 'confianza' dice qué porción de las unidades se vendió a ese precio. Si es
-- baja, el producto se vendió a precios muy revueltos ese mes y conviene
-- desconfiar del número.
-- -----------------------------------------------------------------------------

drop materialized view if exists dc_m_precios cascade;
create materialized view dc_m_precios as
with niveles as (
  select periodo, producto, precio_unitario as precio, sum(cantidad) as unidades
  from dc_ventas_detalle
  where not es_servicio_envio and cantidad > 0
  group by periodo, producto, precio_unitario
),
totales as (
  select periodo, producto, sum(unidades) as total
  from niveles group by periodo, producto
),
elegible as (
  select n.periodo, n.producto, n.precio, n.unidades, t.total,
         row_number() over (partition by n.periodo, n.producto order by n.precio) as orden
  from niveles n
  join totales t using (periodo, producto)
  where t.total > 0 and n.unidades / t.total >= 0.10
)
select periodo, producto,
       precio                              as precio_lista,
       round(unidades / total, 3)          as confianza,
       total                               as unidades
from elegible
where orden = 1;

create unique index if not exists ix_m_precios on dc_m_precios(periodo, producto);


-- =============================================================================
-- Las vistas que lee la app
--
-- Cada una comprueba el rol antes de dejar pasar nada. La comprobación es una
-- función marcada como 'stable', así que Postgres la evalúa una sola vez por
-- consulta, no una vez por renglón.
--
-- Van SIN security_invoker a propósito: corren con los permisos de quien las
-- creó, que es lo único que puede leer las vistas materializadas. Así la
-- puerta de entrada es el rol, no el permiso sobre la tabla.
-- =============================================================================

create or replace view dc_v_t_producto_mes as
  select * from dc_m_producto_mes where dc_mi_rol() is not null;

create or replace view dc_v_t_prod_guisado_mes as
  select * from dc_m_prod_guisado_mes where dc_mi_rol() is not null;

create or replace view dc_v_t_guisado_mes as
  select * from dc_m_guisado_mes where dc_mi_rol() is not null;

create or replace view dc_v_t_modificador_mes as
  select * from dc_m_modificador_mes where dc_mi_rol() is not null;

create or replace view dc_v_t_precios as
  select * from dc_m_precios where dc_mi_rol() is not null;

-- Nadie toca las materializadas directamente.
revoke all on dc_m_producto_mes, dc_m_prod_guisado_mes, dc_m_guisado_mes,
              dc_m_modificador_mes, dc_m_precios
  from anon, authenticated;

grant select on dc_v_t_producto_mes, dc_v_t_prod_guisado_mes, dc_v_t_guisado_mes,
                dc_v_t_modificador_mes, dc_v_t_precios
  to authenticated;

revoke all on dc_v_t_producto_mes, dc_v_t_prod_guisado_mes, dc_v_t_guisado_mes,
              dc_v_t_modificador_mes, dc_v_t_precios
  from anon;


-- -----------------------------------------------------------------------------
-- Recalcular
--
-- La llama la importación al terminar de guardar un mes. También se puede
-- correr a mano si algo se ve raro:  select dc_refrescar_agregados();
--
-- No lleva CONCURRENTLY: bloquea la lectura unos segundos, y como corre justo
-- después de importar —cuando nadie está viendo el tablero— no vale la pena la
-- complicación.
-- -----------------------------------------------------------------------------

create or replace function dc_refrescar_agregados()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  refresh materialized view dc_m_producto_mes;
  refresh materialized view dc_m_prod_guisado_mes;
  refresh materialized view dc_m_guisado_mes;
  refresh materialized view dc_m_modificador_mes;
  refresh materialized view dc_m_precios;
end;
$$;

revoke all on function dc_refrescar_agregados() from public;
grant execute on function dc_refrescar_agregados() to authenticated;

select dc_refrescar_agregados();


-- -----------------------------------------------------------------------------
-- Comprobación
-- -----------------------------------------------------------------------------

select 'producto_mes'   as agregado, count(*) as filas from dc_m_producto_mes
union all select 'prod_guisado_mes', count(*) from dc_m_prod_guisado_mes
union all select 'guisado_mes',      count(*) from dc_m_guisado_mes
union all select 'modificador_mes',  count(*) from dc_m_modificador_mes
union all select 'precios',          count(*) from dc_m_precios;
