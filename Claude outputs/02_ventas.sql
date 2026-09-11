-- =============================================================================
-- 02 · Módulo de ventas
-- =============================================================================
--
-- Una instalación por restaurante: este proyecto de Supabase tiene los datos
-- de uno solo. Por eso no hay columna de "restaurante" en ninguna tabla — no
-- hace falta separar lo que nunca convive.
--
-- Sí hay columna 'sucursal', con valor 'Principal' por omisión. Hoy no estorba
-- y el día que abras la segunda ubicación ya está el lugar para distinguirlas,
-- sin migrar nada.
--
-- Por qué no se repite el patrón de app_data
-- ------------------------------------------
-- La app de compras guarda cada conjunto como un JSON en un solo renglón. Para
-- unos cientos de compras funciona. Aquí son 138,762 renglones de venta: con
-- ese patrón, abrir el tablero descargaría los tres años completos al teléfono
-- y todo el filtrado ocurriría ahí. Con tablas reales, pedir un mes trae un mes.
--
-- Los agregados son VISTAS, no tablas
-- -----------------------------------
-- En Google Sheets tuve que precalcular los agregados porque la hoja no
-- aguanta el detalle. Postgres sí, así que los agregados se calculan al
-- momento. Eso elimina el problema de mantenerlos sincronizados: no pueden
-- quedar desfasados del detalle porque se derivan de él.
--
-- TODAS llevan "security_invoker = true". Sin eso, una vista se ejecuta con
-- los permisos de quien la creó y NO aplica el RLS de las tablas base: el
-- tablero de un restaurante mostraría los datos de todos. Se detectó
-- probando el esquema, no leyéndolo.
--
-- Reglas de negocio que viven aquí
-- --------------------------------
--   · El envío nunca entra en análisis de producto. Durante parte de la
--     historia se cobró como un producto del menú y durante el resto no, así
--     que incluirlo haría incomparables los periodos.
--   · Un renglón puede traer varios guisados. La cantidad se reparte entre
--     ellos para que las sumas cuadren con el total real.
--   · El precio de lista es el nivel de precio más bajo que concentre al menos
--     10% de las unidades del mes. Los extras y el sobreprecio de plataformas
--     solo suman, nunca restan, así que el nivel más bajo con presencia real
--     es el precio de menú.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Catálogos
-- -----------------------------------------------------------------------------

create table if not exists dc_cat_productos (
  producto         text not null,
  familia          text not null default 'Otros',
  unidad_venta     text not null default 'ORDEN'
                     check (unidad_venta in ('PIEZA','ORDEN')),
  piezas_por_orden int  not null default 1 check (piezas_por_orden > 0),
  lleva_guisado    boolean not null default false,
  activo           boolean not null default true,
  primary key (producto)
);

create table if not exists dc_cat_modificadores (
  modificador_original text not null,
  valor_normalizado    text not null,
  tipo                 text not null
                         check (tipo in ('GUISADO','EXTRA','PETICION','VARIANTE',
                                         'COMPOSICION','CANT_SURTIDO','AMBIGUO')),
  activo               boolean not null default true,
  nota                 text,
  primary key (modificador_original)
);

-- -----------------------------------------------------------------------------
-- Bitácora de importaciones
--
-- Cada carga queda registrada con sus controles de calidad. Sirve para saber
-- qué se cargó, cuándo y con qué resultado, y para poder deshacer una carga
-- completa borrando por importacion_id.
-- -----------------------------------------------------------------------------

create table if not exists dc_importaciones (
  id           bigint generated always as identity primary key,
  sucursal     text not null default 'Principal',
  archivo      text,
  tipo         text not null check (tipo in ('PRODUCTOS','VENTAS')),
  periodo_min  date,
  periodo_max  date,
  renglones    int,
  estado       text not null default 'OK' check (estado in ('OK','REVISAR','BLOQUEADA')),
  qa           jsonb,
  creada_por   uuid references auth.users(id),
  creada_en    timestamptz not null default now()
);

create index if not exists ix_importaciones_fecha on dc_importaciones(creada_en desc);

-- -----------------------------------------------------------------------------
-- Grano diario — del reporte de Ventas de Poster
-- -----------------------------------------------------------------------------

create table if not exists dc_ventas_dia (
  sucursal           text not null default 'Principal',
  fecha              date not null,
  ingresos_totales   numeric(12,2),
  ingresos_productos numeric(12,2),
  ingreso_envio      numeric(12,2) not null default 0,
  recibos            int,
  clientes           int,
  ticket_promedio    numeric(10,2),
  unidades           numeric(12,2),
  piezas             numeric(12,2),
  renglones          int,
  importacion_id     bigint references dc_importaciones(id) on delete set null,
  primary key (sucursal, fecha)
);

-- -----------------------------------------------------------------------------
-- Detalle — un renglón por día × producto × combinación de modificadores
--
-- Es la tabla grande y la que hace posible cualquier corte futuro sin rehacer
-- el pipeline.
--
-- 'periodo' se guarda como columna normal, no generada: to_char() es STABLE y
-- Postgres no la admite en columnas generadas. La llena el cargador.
-- -----------------------------------------------------------------------------

create table if not exists dc_ventas_detalle (
  id                    bigint generated always as identity primary key,
  sucursal              text not null default 'Principal',
  fecha                 date not null,
  periodo               text not null,
  producto              text not null,
  familia               text,
  unidad_venta          text,
  modificacion_original text,
  cantidad              numeric(10,2) not null,
  piezas_equivalentes   numeric(10,2),
  ventas_brutas         numeric(12,2) not null,
  ingresos              numeric(12,2) not null,
  descuento             numeric(12,2) generated always as (ventas_brutas - ingresos) stored,
  precio_unitario       numeric(10,2),
  es_servicio_envio     boolean not null default false,
  n_guisados            int not null default 0,
  n_extras              int not null default 0,
  n_peticiones          int not null default 0,
  importacion_id        bigint references dc_importaciones(id) on delete cascade
);

create index if not exists ix_detalle_fecha    on dc_ventas_detalle(sucursal, fecha);
create index if not exists ix_detalle_periodo  on dc_ventas_detalle(periodo);
create index if not exists ix_detalle_producto on dc_ventas_detalle(producto, periodo);
create index if not exists ix_detalle_import   on dc_ventas_detalle(importacion_id);

-- -----------------------------------------------------------------------------
-- Modificadores por renglón — la tabla puente
--
-- SIN COLUMNAS DE DINERO, a propósito. Un renglón con tres modificadores
-- produce tres registros aquí; si se sumaran pesos desde esta tabla se
-- multiplicaría la venta. El dinero vive solo en dc_ventas_detalle.
-- -----------------------------------------------------------------------------

create table if not exists dc_ventas_modificadores (
  id             bigint generated always as identity primary key,
  detalle_id     bigint not null references dc_ventas_detalle(id) on delete cascade,
  sucursal       text not null default 'Principal',
  fecha          date not null,
  periodo        text not null,
  producto       text not null,
  tipo           text not null,
  valor          text not null,
  token_original text,
  multiplicador  int not null default 1,
  posicion       int not null default 1
);

create index if not exists ix_mods_detalle on dc_ventas_modificadores(detalle_id);
create index if not exists ix_mods_valor   on dc_ventas_modificadores(tipo, valor, periodo);

-- -----------------------------------------------------------------------------
-- RLS — mismo criterio en todas: solo los restaurantes del usuario
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'dc_cat_productos','dc_cat_modificadores','dc_importaciones',
    'dc_ventas_dia','dc_ventas_detalle','dc_ventas_modificadores'
  ] loop
    execute format('alter table %I enable row level security', t);

    -- Leer: cualquier usuario dado de alta y activo.
    execute format('drop policy if exists p_%s_leer on %I', t, t);
    execute format($f$
      create policy p_%s_leer on %I
        for select to authenticated
        using (dc_mi_rol() is not null)
    $f$, t, t);

    -- Escribir: importar ventas es operación, no consulta.
    execute format('drop policy if exists p_%s_escribir on %I', t, t);
    execute format($f$
      create policy p_%s_escribir on %I
        for all to authenticated
        using (dc_es('admin', 'gerente'))
        with check (dc_es('admin', 'gerente'))
    $f$, t, t);
  end loop;
end $$;

-- =============================================================================
-- VISTAS — los agregados que consume el tablero
--
-- Heredan RLS de las tablas base: cada usuario ve solo lo suyo sin que la vista
-- tenga que filtrar nada.
-- =============================================================================

-- Ventas de producto, ya sin el envío.
create or replace view dc_v_producto_mes with (security_invoker = true) as
select
  d.periodo,
  d.producto,
  max(d.familia)                       as familia,
  max(d.unidad_venta)                  as unidad_venta,
  sum(d.cantidad)                      as unidades,
  sum(d.piezas_equivalentes)           as piezas,
  sum(d.ingresos)                      as ingresos,
  sum(d.ventas_brutas)                 as ventas_brutas,
  count(*)                             as renglones,
  sum(d.n_extras)                      as extras,
  sum(d.n_peticiones)                  as peticiones,
  round(sum(d.ingresos) / nullif(sum(d.cantidad),0), 2) as ingreso_por_unidad
from dc_ventas_detalle d
where not d.es_servicio_envio
group by d.periodo, d.producto;

-- Precio de lista: el nivel más bajo con al menos 10% de las unidades del mes.
-- Si ningún nivel llega al 10% (mes muy disperso), se toma el más bajo.
create or replace view dc_v_precios with (security_invoker = true) as
with niveles as (
  select d.periodo, d.producto, d.precio_unitario,
    sum(d.cantidad) as u,
    sum(sum(d.cantidad)) over (partition by d.periodo, d.producto) as u_total
  from dc_ventas_detalle d
  where not d.es_servicio_envio and d.precio_unitario is not null
  group by d.periodo, d.producto, d.precio_unitario
),
elegido as (
  select distinct on (periodo, producto) periodo, producto,
    precio_unitario as precio_lista,
    round(u / nullif(u_total,0), 3) as confianza,
    u_total as unidades
  from niveles
  where u / nullif(u_total,0) >= 0.10
  order by periodo, producto, precio_unitario asc
),
respaldo as (
  select distinct on (periodo, producto) periodo, producto,
    precio_unitario as precio_lista,
    round(u / nullif(u_total,0), 3) as confianza,
    u_total as unidades
  from niveles
  order by periodo, producto, precio_unitario asc
)
select coalesce(e.periodo,   r.periodo)     as periodo,
       coalesce(e.producto,  r.producto)    as producto,
       coalesce(e.precio_lista, r.precio_lista) as precio_lista,
       coalesce(e.confianza,  r.confianza)  as confianza,
       coalesce(e.unidades,   r.unidades)   as unidades
from respaldo r
left join elegido e using (periodo, producto);

-- Historia de precios con el escalón de cada aumento.
create or replace view dc_v_precios_cambios with (security_invoker = true) as
select
  p.*,
  lag(p.precio_lista) over w as precio_anterior,
  case when lag(p.precio_lista) over w is not null and lag(p.precio_lista) over w <> 0
       then round(100 * (p.precio_lista - lag(p.precio_lista) over w)
                      / lag(p.precio_lista) over w, 2) end as cambio_pct,
  (lag(p.precio_lista) over w is distinct from p.precio_lista
   and lag(p.precio_lista) over w is not null) as hubo_cambio
from dc_v_precios p
window w as (partition by p.producto order by p.periodo);

-- Guisados. Dos medidas porque un renglón puede traer varios:
--   unidades_atribuidas  la cantidad repartida entre los guisos del renglón; SUMA al total
--   unidades_presencia   la cantidad completa por cada guiso; NO suma, mide presencia
create or replace view dc_v_prod_guisado_mes with (security_invoker = true) as
select
  m.periodo,
  m.producto,
  m.valor as guisado,
  sum(d.cantidad / g.n_guisos) as unidades_atribuidas,
  sum(d.cantidad)              as unidades_presencia,
  count(*)                     as renglones
from dc_ventas_modificadores m
join dc_ventas_detalle d on d.id = m.detalle_id
join lateral (
  select greatest(count(*), 1) as n_guisos
  from dc_ventas_modificadores m2
  where m2.detalle_id = m.detalle_id and m2.tipo = 'GUISADO'
) g on true
where m.tipo = 'GUISADO' and not d.es_servicio_envio
group by m.periodo, m.producto, m.valor;

create or replace view dc_v_guisado_mes with (security_invoker = true) as
select periodo, guisado,
       sum(unidades_atribuidas) as unidades_atribuidas,
       sum(unidades_presencia)  as unidades_presencia,
       sum(renglones)           as renglones
from dc_v_prod_guisado_mes
group by periodo, guisado;

-- Extras, peticiones y variantes por mes.
create or replace view dc_v_modificador_mes with (security_invoker = true) as
select m.periodo, m.tipo, m.valor as modificador,
  sum(m.multiplicador) as veces,
  sum(d.cantidad)      as unidades_afectadas
from dc_ventas_modificadores m
join dc_ventas_detalle d on d.id = m.detalle_id
where m.tipo in ('EXTRA','PETICION','VARIANTE') and not d.es_servicio_envio
group by m.periodo, m.tipo, m.valor;

create or replace view dc_v_familia_mes with (security_invoker = true) as
select periodo, familia,
       sum(unidades) as unidades,
       sum(ingresos) as ingresos
from dc_v_producto_mes
group by periodo, familia;

-- Resumen mensual: junta el grano diario con el de producto.
create or replace view dc_v_resumen_mes with (security_invoker = true) as
select
  x.periodo,
  x.dias,
  x.ingresos_totales,
  x.ingreso_envio,
  x.recibos,
  x.clientes,
  round(x.ingresos_totales / nullif(x.recibos,0), 2) as ticket_promedio,
  p.unidades,
  p.ingresos_productos,
  round(p.unidades / nullif(x.recibos,0), 2)          as unidades_por_recibo,
  round(p.ingresos_productos / nullif(p.unidades,0), 2) as ingreso_por_unidad
from (
  select to_char(fecha,'YYYY-MM') as periodo,
         count(*) as dias,
         sum(ingresos_totales) as ingresos_totales,
         sum(ingreso_envio)    as ingreso_envio,
         sum(recibos)          as recibos,
         sum(clientes)         as clientes
  from dc_ventas_dia
  group by to_char(fecha,'YYYY-MM')
) x
left join (
  select periodo,
         sum(unidades) as unidades,
         sum(ingresos) as ingresos_productos
  from dc_v_producto_mes
  group by periodo
) p using (periodo);

-- Con security_invoker, la vista se consulta con la sesión del usuario y el
-- RLS de las tablas base sí aplica.
grant select on
  dc_v_producto_mes, dc_v_precios, dc_v_precios_cambios,
  dc_v_prod_guisado_mes, dc_v_guisado_mes, dc_v_modificador_mes,
  dc_v_familia_mes, dc_v_resumen_mes
to authenticated;

-- -----------------------------------------------------------------------------
-- Permisos explícitos
--
-- Supabase concede acceso al rol anónimo por omisión. Como toda la app va con
-- sesión iniciada, ese rol no necesita nada: quitárselo cierra la puerta que
-- deja abierta la llave pública del navegador.
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on
  dc_cat_productos, dc_cat_modificadores, dc_importaciones,
  dc_ventas_dia, dc_ventas_detalle, dc_ventas_modificadores
to authenticated;

grant usage, select on all sequences in schema public to authenticated;

revoke all on
  dc_cat_productos, dc_cat_modificadores, dc_importaciones,
  dc_ventas_dia, dc_ventas_detalle, dc_ventas_modificadores
from anon;

revoke all on
  dc_v_producto_mes, dc_v_precios, dc_v_precios_cambios,
  dc_v_prod_guisado_mes, dc_v_guisado_mes, dc_v_modificador_mes,
  dc_v_familia_mes, dc_v_resumen_mes
from anon;
