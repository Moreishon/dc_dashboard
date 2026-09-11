-- =============================================================================
-- 06 · La vista de cobertura, ahora barata
-- =============================================================================
--
-- Corre este archivo UNA vez. Solo reemplaza una vista y agrega dos índices.
-- No toca datos.
--
-- Qué estaba mal
-- --------------
-- dc_v_cobertura sacaba sus cinco números recorriendo dc_ventas_detalle —
-- 138,762 renglones— cinco veces seguidas. Supabase corta cualquier consulta
-- que pase de unos segundos, así que la cancelaba y devolvía el error 57014.
-- La app se quedaba sin la fecha.
--
-- El detalle importante: los mismos cinco números ya están en dc_ventas_dia,
-- que tiene 1,106 renglones en vez de 138,762. Un renglón por día, con sus
-- totales ya sumados. Preguntarle a la tabla chica es cien veces más rápido y
-- da exactamente lo mismo.
--
-- La lección, para no repetirla en el tablero: cuando exista el grano diario,
-- preguntarle a él. La tabla de detalle es para desglosar, no para contar.
-- =============================================================================

create or replace view dc_v_cobertura with (security_invoker = true) as
select
  greatest(
    (select max(periodo_max) from dc_importaciones where estado = 'OK'),
    (select max(fecha) from dc_ventas_dia)
  )                                                   as datos_hasta,
  (select max(fecha) from dc_ventas_dia)              as ultima_venta,
  (select min(fecha) from dc_ventas_dia)              as desde,
  (select count(*) from dc_ventas_dia)                as dias_con_ventas,
  (select coalesce(sum(renglones), 0) from dc_ventas_dia) as renglones;

grant select on dc_v_cobertura to authenticated;
revoke all on dc_v_cobertura from anon;


-- -----------------------------------------------------------------------------
-- Índices por fecha
--
-- No hacen falta para la vista de arriba, pero sí para todo lo que viene:
-- cualquier consulta del tablero que filtre por rango de fechas, y el borrado
-- por rango que hace la importación, que hoy recorre la tabla entera.
-- -----------------------------------------------------------------------------

create index if not exists ix_detalle_fecha on dc_ventas_detalle(fecha);
create index if not exists ix_mods_fecha    on dc_ventas_modificadores(fecha);

analyze dc_ventas_detalle;
analyze dc_ventas_modificadores;
analyze dc_ventas_dia;


-- -----------------------------------------------------------------------------
-- Comprobación: los números tienen que ser los mismos de antes
-- -----------------------------------------------------------------------------

select * from dc_v_cobertura;
