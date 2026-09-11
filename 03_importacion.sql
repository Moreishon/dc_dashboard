-- =============================================================================
-- 03 · Importación mensual
-- =============================================================================
--
-- Corre este archivo UNA vez, después de 01 y 02. Agrega la función que usa el
-- tablero para guardar un mes de ventas.
--
-- Por qué una función y no inserts desde el navegador
-- ---------------------------------------------------
-- Un mes son unos 4,000 renglones de venta y 5,000 modificadores, y cada
-- modificador tiene que apuntar al renglón que le corresponde. Si eso se hace
-- desde el navegador en varias llamadas y una falla a la mitad, el mes queda
-- partido y nadie se entera.
--
-- Aquí entra todo en una sola transacción: o queda el mes completo, o no queda
-- nada. Si se cae la conexión a media carga, la base se queda exactamente como
-- estaba.
--
-- Reimportar el mismo mes no duplica: lo primero que hace es borrar lo que
-- hubiera de ese periodo.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Reservar un bloque de id
--
-- Los modificadores necesitan el id del renglón padre ANTES de insertarlos, y
-- el navegador no puede inventarlos. Esto aparta un tramo contiguo de la
-- secuencia y devuelve el primero: de ahí en adelante son nuestros.
--
-- nextval y setval son atómicos, así que dos importaciones simultáneas se
-- reparten tramos distintos en vez de pisarse.
-- -----------------------------------------------------------------------------

create or replace function dc_reservar_ids(p_tabla regclass, p_n int)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seq  text;
  v_desde bigint;
begin
  if p_n <= 0 then return 0; end if;
  v_seq := pg_get_serial_sequence(p_tabla::text, 'id');
  if v_seq is null then
    raise exception 'La tabla % no tiene secuencia en la columna id', p_tabla;
  end if;
  v_desde := nextval(v_seq);
  if p_n > 1 then
    perform setval(v_seq, v_desde + p_n - 1, true);
  end if;
  return v_desde;
end;
$$;

revoke all on function dc_reservar_ids(regclass, int) from public;


-- -----------------------------------------------------------------------------
-- Guardar un mes
--
-- Recibe los renglones ya procesados por el navegador. Cada renglón de detalle
-- trae una llave temporal `_k` (su posición dentro del mes) y cada modificador
-- apunta a esa llave con `_d`. Aquí las dos se traducen a los id reales.
--
-- No clasifica ni interpreta nada: esa parte vive en el navegador, donde se
-- probó contra el pipeline. Esto solo guarda.
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
  v_imp    bigint;
  v_base   bigint;
  v_n      int;
  v_det    int;
  v_mod    int;
  v_dia    int;
  v_antes  int;
begin
  -- Solo quien opera puede importar. La función es SECURITY DEFINER —corre con
  -- permisos elevados— así que el permiso se comprueba a mano, aquí dentro.
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

  -- Cuánto había antes, para poder reportar el cambio.
  select count(*) into v_antes from dc_ventas_detalle where periodo = p_periodo;

  -- Fuera lo viejo. El borrado en dc_ventas_detalle arrastra sus modificadores
  -- por la llave foránea (on delete cascade).
  delete from dc_ventas_detalle where periodo = p_periodo;
  delete from dc_ventas_dia
    where fecha >= (p_periodo || '-01')::date
      and fecha <  ((p_periodo || '-01')::date + interval '1 month');

  -- El registro de la importación.
  insert into dc_importaciones (archivo, tipo, periodo_min, periodo_max,
                                renglones, estado, qa, creada_por)
  values (p_archivo, 'PRODUCTOS',
          (p_periodo || '-01')::date,
          ((p_periodo || '-01')::date + interval '1 month - 1 day')::date,
          v_n, 'OK', p_qa, auth.uid())
  returning id into v_imp;

  -- El tramo de id que le toca a este mes.
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
    'renglones_antes', v_antes,
    'renglones',      v_det,
    'modificadores',  v_mod,
    'dias',           v_dia,
    'ingresos', (select coalesce(sum(ingresos), 0) from dc_ventas_detalle
                  where periodo = p_periodo and not es_servicio_envio),
    'unidades', (select coalesce(sum(cantidad), 0) from dc_ventas_detalle
                  where periodo = p_periodo and not es_servicio_envio)
  );
end;
$$;

revoke all on function dc_importar_mes(text, text, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function dc_importar_mes(text, text, jsonb, jsonb, jsonb, jsonb) to authenticated;


-- -----------------------------------------------------------------------------
-- Qué periodos hay cargados
--
-- Lo consulta la pantalla de importación para avisar "septiembre ya está, si
-- sigues lo vas a reemplazar".
-- -----------------------------------------------------------------------------

create or replace view dc_v_periodos with (security_invoker = true) as
select
  periodo,
  count(*)                                              as renglones,
  sum(cantidad) filter (where not es_servicio_envio)    as unidades,
  sum(ingresos) filter (where not es_servicio_envio)    as ingresos,
  min(fecha)                                            as desde,
  max(fecha)                                            as hasta
from dc_ventas_detalle
group by periodo;

revoke all on dc_v_periodos from anon;


-- =============================================================================
-- CORRECCIÓN AL CATÁLOGO
--
-- El producto con el que se cobraba el envío quedó en el catálogo con familia
-- 'Servicio', pero los 757 renglones ya cargados dicen 'Servicio a domicilio'
-- porque el pipeline lo sobreescribía a mano.
--
-- Se corrige el catálogo en vez de arrastrar ese caso especial dentro del
-- código: así el catálogo es la única fuente y no hay excepciones escondidas.
-- =============================================================================

update dc_cat_productos
   set familia = 'Servicio a domicilio'
 where producto = 'Servicio a Dom.'
   and familia <> 'Servicio a domicilio';
