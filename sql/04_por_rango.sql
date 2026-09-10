-- =============================================================================
-- 04 · Importar por rango de fechas, no por mes completo
-- =============================================================================
--
-- Corre este archivo UNA vez, después de 03. Reemplaza la función de
-- importación y agrega una vista.
--
-- Qué cambia y por qué
-- --------------------
-- La versión anterior borraba el MES ENTERO antes de meter lo que traía el
-- archivo. Eso está bien si siempre subes meses completos, pero se vuelve
-- peligroso en cuanto subes por semana: un archivo con los días 8 al 14
-- borraría también del 1 al 7, sin avisar.
--
-- Ahora borra solo el rango de días que el archivo realmente cubre. Sube lo
-- que quieras —una semana, un mes, un año— y solo se toca eso.
--
-- Lo demás no cambia: sigue siendo una sola transacción (o entra completo o no
-- entra nada) y sigue sin duplicar si repites la misma carga.
-- =============================================================================

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
  v_imp    bigint;
  v_base   bigint;
  v_n      int;
  v_det    int;
  v_mod    int;
  v_dia    int;
  v_antes  int;
  v_desde  date;
  v_hasta  date;
begin
  if not dc_es('admin', 'gerente') then
    raise exception 'No tienes permiso para importar ventas.'
      using errcode = '42501';
  end if;

  if p_periodo !~ '^\d{4}-\d{2}$' then
    raise exception 'El periodo debe venir como AAAA-MM, llegó "%"', p_periodo;
  end if;

  v_n := coalesce(jsonb_array_length(p_detalle), 0);
  if v_n = 0 then
    raise exception 'El periodo % no trae renglones.', p_periodo;
  end if;

  -- El rango que el archivo realmente cubre. Esto es lo que se reemplaza.
  select min(x.fecha), max(x.fecha) into v_desde, v_hasta
  from jsonb_to_recordset(p_detalle) as x(fecha date);

  if v_desde is null then
    raise exception 'Ningún renglón del periodo % trae fecha.', p_periodo;
  end if;

  -- Todas las fechas tienen que caer dentro del periodo declarado. Si no, algo
  -- se armó mal del lado de la app y es mejor detenerse que borrar de más.
  if to_char(v_desde, 'YYYY-MM') <> p_periodo
     or to_char(v_hasta, 'YYYY-MM') <> p_periodo then
    raise exception 'El periodo declarado es % pero las fechas van de % a %.',
      p_periodo, v_desde, v_hasta;
  end if;

  select count(*) into v_antes
  from dc_ventas_detalle
  where fecha between v_desde and v_hasta;

  -- Fuera lo viejo, solo dentro del rango. El borrado en dc_ventas_detalle
  -- arrastra sus modificadores por la llave foránea (on delete cascade).
  delete from dc_ventas_detalle where fecha between v_desde and v_hasta;
  delete from dc_ventas_dia      where fecha between v_desde and v_hasta;

  insert into dc_importaciones (archivo, tipo, periodo_min, periodo_max,
                                renglones, estado, qa, creada_por)
  values (p_archivo, 'PRODUCTOS', v_desde, v_hasta,
          v_n, 'OK', p_qa, auth.uid())
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
    'importacion_id', v_imp,
    'periodo',        p_periodo,
    'desde',          v_desde,
    'hasta',          v_hasta,
    'renglones_antes', v_antes,
    'renglones',      v_det,
    'modificadores',  v_mod,
    'dias',           v_dia,
    'ingresos', (select coalesce(sum(ingresos), 0) from dc_ventas_detalle
                  where fecha between v_desde and v_hasta
                    and not es_servicio_envio),
    'unidades', (select coalesce(sum(cantidad), 0) from dc_ventas_detalle
                  where fecha between v_desde and v_hasta
                    and not es_servicio_envio)
  );
end;
$$;

revoke all on function dc_importar_mes(text, text, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function dc_importar_mes(text, text, jsonb, jsonb, jsonb, jsonb) to authenticated;


-- =============================================================================
-- NOTA SOBRE LAS VISTAS
--
-- Una versión anterior de este archivo también creaba dc_v_cobertura y
-- dc_v_dias. Se quitaron de aquí a propósito.
--
-- El problema no era que estuvieran mal, sino que estaban definidas en DOS
-- archivos: aquí y en 06/07, con definiciones distintas. Volver a correr este
-- archivo después de aquellos reintroducía la versión vieja de dc_v_cobertura
-- —la que se pasaba del tiempo límite— sin ningún error a la vista.
--
-- Regla que vale para todo el esquema: cada objeto se define en UN solo
-- archivo. Así los archivos se pueden volver a correr en cualquier orden sin
-- deshacerse entre ellos.
--
--   dc_v_cobertura  vive en 06_cobertura_rapida.sql
--   dc_v_dias       vive en 07_agregados.sql
-- =============================================================================
