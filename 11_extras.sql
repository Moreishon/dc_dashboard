-- =============================================================================
-- 11 · Los extras que van dentro del platillo
-- =============================================================================
--
-- Corre este archivo después de 07 y 09. Se puede volver a correr.
--
-- Qué problema resuelve
-- ---------------------
-- Hay dos cosas que se llaman "extra" y solo una es un producto:
--
--   Extra que es producto      Salsa Roja, Pieza Tortilla de Maíz, Aguacate
--                              Extra. Se cobra como renglón, tiene su propio
--                              ingreso y ya sale en el tablero como cualquier
--                              producto.
--
--   Extra que es modificador   Bistec, Queso, Frijoles, Huevo Revuelto,
--                              Relleno de Guisados. Va DENTRO del precio del
--                              platillo. No tiene renglón propio ni ingreso
--                              propio, así que hasta hoy solo se podía contar.
--
-- Este archivo calcula, para los segundos, dos cosas que sí se pueden saber:
-- cuántas porciones se pidieron y CUÁNTO SE COBRÓ POR ELLAS.
--
-- De dónde sale el precio, si nadie lo guardó
-- -------------------------------------------
-- De la diferencia. Un renglón que lleva UN extra y una sola porción se compara
-- contra el precio de lista de ese mismo producto en ese mismo mes: lo que
-- sobra es lo que costó el extra.
--
-- El precio de lista sale de dc_m_precios, que ya usa la regla correcta —el
-- nivel de precio más bajo que concentre al menos 10% de las unidades— y hay
-- que usar esa misma regla aquí, por la misma razón:
--
--   EN EL RESTAURANTE Y EN LAS PLATAFORMAS DE REPARTO LOS PRECIOS SON
--   DISTINTOS, Y LOS DOS HAN SUBIDO CON EL TIEMPO.
--
-- La exportación de Poster no dice por qué canal entró cada venta, así que los
-- dos niveles vienen revueltos. No importa: el sobreprecio de plataforma SOLO
-- SUMA, nunca resta, así que el nivel más bajo con presencia real es el del
-- mostrador. Tomar la moda sería un error — en un mes donde las plataformas
-- muevan más volumen, la moda ES el precio de plataforma.
--
-- Qué tan confiable es
-- --------------------
-- Se comprobó contra algo independiente: varios de estos extras existen TAMBIÉN
-- como producto en el catálogo, con su precio real. Coinciden.
--
--   Huevo Revuelto 2 pzas.     producto $35    extra estimado $35
--   Huevo Estrellado 2 pzas.   producto $28    extra estimado $28 → 32 → 35
--   Bistec 1 Pza.              producto $74    extra estimado $74 → 85 → 102
--   Porción Frijol con Queso   producto  $5    extra estimado  $3 → 4 → 5
--
-- Aun así es una ESTIMACIÓN, no un dato capturado, y la app lo dice. Por eso
-- cada renglón trae su 'confianza': qué proporción de los casos cayó en el
-- nivel elegido. Arriba de 0.9 el número es tan bueno como un precio de lista;
-- abajo de 0.6 hay que mirarlo con cuidado.
--
-- La trampa que casi nos cuesta una conclusión falsa
-- --------------------------------------------------
-- Queso y Frijoles son GUISADO en unos productos y EXTRA en otros. La regla que
-- los desambigua dice "es extra si ya venía un guisado antes", así que en un
-- pedido mixto —2 empanadas de deshebrada y 2 de queso— el segundo GUISO se
-- marca como extra.
--
-- Eso se ve en los datos como un extra que nunca se cobra, y leído a la ligera
-- parecía una fuga de dinero. No lo es: en empanadas el queso no es un extra,
-- es el relleno.
--
--   Queso en Gorditas, Tacos, Bocoles    484 veces ·  0-2% en cero  → extra real
--   Queso en Empanadas (4 pzas.)         416 veces ·    74% en cero  → es guiso
--   Queso en 1/2 Empanadas               227 veces ·    95% en cero  → es guiso
--
-- Por eso el cálculo va por PAR extra+producto, no por extra a secas, y los
-- pares que casi nunca se cobran quedan marcados en vez de sumados. Un extra
-- que sale en cero el 95% de las veces no es un extra que no cobras: es un
-- guiso mal etiquetado.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Tres reglas de negocio que Octavio puso y los datos confirmaron
-- -----------------------------------------------------------------------------
--
-- 1 · EL GUISADO QUE PASA DE LOS INCLUIDOS SE COBRA COMO EXTRA.
--
--     Una gordita es una pieza y su precio trae UN guiso. Si lleva dos, el
--     segundo se cobra. Una orden de empanadas son cuatro piezas: ahí dos
--     guisos son dos rellenos distintos y no se cobra nada.
--
--     La migada es la excepción: su precio ya incluye DOS guisados. Eso no se
--     deduce, se sabe — lo puso Octavio. Los datos coinciden (en migada solo el
--     13-19% de los segundos guisos trae sobreprecio, contra 97.5% en los
--     clásicos), pero una regla de negocio dicha es mejor que una inferida: no
--     depende del tamaño de la muestra ni cambia sola si un mes sale raro.
--
--     Vive en dc_cat_productos.guisados_incluidos y se edita desde la app.
--
--     Los datos lo confirman sin lugar a dudas: de 408 renglones de clásicos
--     con dos guisos y sin extra cobrado aparte, el 97.5% trae sobreprecio. La
--     mediana es $5 y la escalera de precios va 4 → 5 → 6 → 8, que es
--     exactamente la forma de un precio real subiendo con los años.
--
--     Casi siempre el segundo es Frijoles con Queso: 392 de los 408.
--
--     Esas porciones no se estaban contando en ningún lado. Quedaban marcadas
--     como GUISADO, y los guisos no tienen dinero propio, así que el cobro
--     desaparecía del análisis de extras aunque sí estaba en la caja.
--
--     Los surtidos se quedan fuera solos: traen CANT_SURTIDO en el 100% de sus
--     renglones y ninguno tiene dos guisos — ahí la variedad ES el producto.
--
-- 2 · LOS TÉRMINOS DEL HUEVO ESTRELLADO SON EL MISMO EXTRA.
--
--     Medio, tierno, cocido y ciego cuestan lo mismo ($35 hoy) y se piden por
--     lo mismo. Separados, cada uno parece un extra menor de sexto o séptimo
--     lugar; juntos son de los que más se piden. Se agrupan con la columna
--     'grupo' del catálogo, y la app deja abrir el grupo para ver el término.
--
-- 3 · UN PAR CON POCOS CASOS NO SE DA POR MALO.
--
--     La versión anterior tenía un defecto: si un extra aparecía cinco veces en
--     un producto, 'es_extra_real' quedaba nulo —no alcanza para opinar— y el
--     código lo trataba como "no es extra". Así, Huevo Revuelto (p/relleno),
--     que se cobra el 100% de las veces, salía con una porción marcada como
--     guiso.
--
--     Ahora, cuando el par no tiene suficientes casos, se usa cómo se comporta
--     ese extra EN GENERAL. No saber no es lo mismo que saber que no.
-- -----------------------------------------------------------------------------


-- La migada incluye dos guisados en su precio. Solo donde siga en el valor por
-- omisión: si lo cambias a mano, esto no lo pisa.
update dc_cat_productos
   set guisados_incluidos = 2
 where producto like 'Migada%' and guisados_incluidos = 1;


-- Los términos del huevo estrellado, bajo un solo nombre. Solo donde no haya
-- grupo puesto: si mañana lo cambias a mano, esto no lo pisa.
update dc_cat_modificadores
   set grupo = 'Huevo Estrellado'
 where grupo is null
   and tipo = 'EXTRA'
   and valor_normalizado like 'Huevo Estrellado%';


-- -----------------------------------------------------------------------------
-- Un renglón por extra EFECTIVO
--
-- "Efectivo" quiere decir: lo que el cliente pagó de más, sin importar con qué
-- etiqueta quedó guardado. Son dos cosas distintas unidas:
--
--   · los modificadores que el catálogo marca como EXTRA
--   · el segundo guisado en adelante, cuando el producto es de una sola pieza
--
-- El segundo guiso se guarda con su nombre y el sufijo "(2° guiso)". Separado
-- a propósito: 'Frijoles' puede ser un extra de verdad Y un segundo guiso, y
-- son dos cosas con precios distintos. Juntarlos revolvería los dos precios en
-- una sola estimación.
-- -----------------------------------------------------------------------------

create or replace view dc_v_extras_detalle with (security_invoker = true) as
with grupos as (
  select valor_normalizado as valor, max(grupo) as grupo
  from dc_cat_modificadores
  where grupo is not null
  group by valor_normalizado
),
marcados as (
  select m.detalle_id, m.fecha, m.periodo, m.producto,
         m.valor                   as extra,
         m.multiplicador           as porciones,
         false                     as es_segundo_guiso
  from dc_ventas_modificadores m
  where m.tipo = 'EXTRA'
),
guisos as (
  select m.detalle_id, m.fecha, m.periodo, m.producto, m.valor, m.multiplicador,
         row_number() over (partition by m.detalle_id
                            order by m.posicion, m.id) as n
  from dc_ventas_modificadores m
  where m.tipo = 'GUISADO'
),
segundos as (
  select g.detalle_id, g.fecha, g.periodo, g.producto,
         g.valor || ' (guiso extra)' as extra,
         g.multiplicador             as porciones,
         true                        as es_segundo_guiso
  from guisos g
  join dc_cat_productos c on c.producto = g.producto
  where g.n > c.guisados_incluidos
    and c.unidad_venta = 'PIEZA'
    -- En un surtido la variedad es el producto, no un cobro aparte.
    and not exists (
      select 1 from dc_ventas_modificadores s
      where s.detalle_id = g.detalle_id and s.tipo = 'CANT_SURTIDO')
),
todo as (
  select * from marcados
  union all
  select * from segundos
)
select
  t.detalle_id, t.fecha, t.periodo, t.producto, t.extra, t.porciones,
  t.es_segundo_guiso,
  g.grupo,
  coalesce(g.grupo, t.extra) as agrupado
from todo t
left join grupos g on g.valor = t.extra;

grant select on dc_v_extras_detalle to authenticated;
revoke all on dc_v_extras_detalle from anon;


-- -----------------------------------------------------------------------------
-- Par extra + producto: ¿de verdad se cobra aquí?
-- -----------------------------------------------------------------------------

drop materialized view if exists dc_m_extra_producto cascade;
create materialized view dc_m_extra_producto as
with solos as (
  -- Renglones con EXACTAMENTE un extra efectivo y una sola porción. Con dos no
  -- se puede repartir la diferencia entre ellos.
  select detalle_id, min(extra) as extra
  from dc_v_extras_detalle
  group by detalle_id
  having count(*) = 1 and sum(porciones) = 1
),
medidos as (
  select s.extra, d.producto,
         round(d.ingresos / d.cantidad - p.precio_lista, 2) as sobreprecio
  from solos s
  join dc_ventas_detalle d on d.id = s.detalle_id
  join dc_m_precios p on p.periodo = d.periodo and p.producto = d.producto
  where not d.es_servicio_envio and d.cantidad > 0
),
por_par as (
  select extra, producto, count(*) as veces,
         count(*) filter (where sobreprecio > 0.5) as cobrado
  from medidos group by extra, producto
),
-- Cómo se comporta el extra en general, para cuando el par no alcanza.
global as (
  select extra, sum(veces) as veces, sum(cobrado) as cobrado
  from por_par group by extra
)
select
  p.extra,
  p.producto,
  p.veces,
  p.cobrado                                              as veces_cobrado,
  round(p.cobrado::numeric / nullif(p.veces, 0), 3)      as pct_cobrado,
  -- Con 10 casos o más manda el par. Con menos, manda cómo se comporta ese
  -- extra en general: no saber no es saber que no.
  case
    when p.veces >= 10
      then p.cobrado::numeric / nullif(p.veces, 0) >= 0.5
    when g.veces >= 10
      then g.cobrado::numeric / nullif(g.veces, 0) >= 0.5
    else true
  end                                                    as es_extra_real,
  p.veces < 10                                           as decidido_por_el_global
from por_par p
join global g using (extra);

create unique index if not exists ix_m_extra_producto
  on dc_m_extra_producto(extra, producto);


-- -----------------------------------------------------------------------------
-- El precio de cada extra, POR PRODUCTO y por mes
--
-- Por qué por producto y no por extra a secas: porque no es el mismo precio.
--
--   Bistec (1 pza.)                 $102 en los dieciséis productos donde va
--   Frijoles con Queso (2° guiso)   $8 en gorditas · $5 en bocoles y tacos
--                                   · $43 en migada
--   Queso                           $8 en gorditas · $5 en tacos y bocoles
--
-- La primera versión estimaba un precio por extra, y para el bistec daba
-- exactamente lo mismo. Para los agregados chicos no: promediaba $5 y $8 en un
-- solo número, y la confianza se caía a 0.16 — que era la manera en que los
-- datos avisaban que la pregunta estaba mal hecha. Separado por producto, la
-- misma cifra sube a 0.9 y pico.
-- -----------------------------------------------------------------------------

drop materialized view if exists dc_m_extra_precio cascade;
create materialized view dc_m_extra_precio as
with solos as (
  select detalle_id, min(extra) as extra
  from dc_v_extras_detalle
  group by detalle_id
  having count(*) = 1 and sum(porciones) = 1
),
medidos as (
  select s.extra, d.producto, d.periodo,
         round(d.ingresos / d.cantidad - p.precio_lista, 2) as sobreprecio
  from solos s
  join dc_ventas_detalle d on d.id = s.detalle_id
  join dc_m_precios p on p.periodo = d.periodo and p.producto = d.producto
  join dc_m_extra_producto ep on ep.extra = s.extra and ep.producto = d.producto
  where not d.es_servicio_envio and d.cantidad > 0
    and ep.es_extra_real
),
niveles as (
  select extra, producto, periodo, sobreprecio as precio, count(*) as veces
  from medidos where sobreprecio > 0.5
  group by extra, producto, periodo, sobreprecio
),
totales as (
  select extra, producto, periodo, sum(veces) as total
  from niveles group by extra, producto, periodo
),
elegible as (
  select n.*, t.total,
         row_number() over (partition by n.extra, n.producto, n.periodo
                            order by n.precio) as orden
  from niveles n join totales t using (extra, producto, periodo)
  where t.total > 0 and n.veces::numeric / t.total >= 0.10
)
-- Debajo de 5 casos no hay estimación, hay ruido. El mínimo baja de 10 a 5
-- respecto de la versión por extra porque al partir por producto las muestras
-- se reparten; a cambio, cada una mide una sola cosa.
select extra, producto, periodo,
       precio                           as precio_estimado,
       round(veces::numeric / total, 3) as confianza,
       total                            as casos_medidos
from elegible where orden = 1 and total >= 5;

create unique index if not exists ix_m_extra_precio
  on dc_m_extra_precio(extra, producto, periodo);


-- -----------------------------------------------------------------------------
-- El precio del extra SIN partir por producto, como respaldo
--
-- Partir por producto gana precisión y pierde muestra: un par con tres casos en
-- el mes no da precio, y arrastrar el último que tuvo puede traerse uno de hace
-- dos años. Eso se vio en cuanto se probó — el bistec, que hoy cuesta $102 en
-- los dieciséis productos donde va, salía entre $74 y $102 porque algunos pares
-- se habían quedado anclados a 2023.
--
-- Así que hay dos niveles y se usan en este orden:
--
--   1. el precio del par, si es de los últimos seis meses
--   2. el del extra en general, que junta todos los productos y casi siempre
--      tiene muestra de sobra
--   3. el del par aunque esté viejo, como último recurso
--
-- Un precio de hace seis meses todavía sirve; uno de hace dos años es de otra
-- era de precios y miente más de lo que ayuda.
-- -----------------------------------------------------------------------------

drop materialized view if exists dc_m_extra_precio_gral cascade;
create materialized view dc_m_extra_precio_gral as
with solos as (
  select detalle_id, min(extra) as extra
  from dc_v_extras_detalle
  group by detalle_id
  having count(*) = 1 and sum(porciones) = 1
),
medidos as (
  select s.extra, d.periodo,
         round(d.ingresos / d.cantidad - p.precio_lista, 2) as sobreprecio
  from solos s
  join dc_ventas_detalle d on d.id = s.detalle_id
  join dc_m_precios p on p.periodo = d.periodo and p.producto = d.producto
  join dc_m_extra_producto ep on ep.extra = s.extra and ep.producto = d.producto
  where not d.es_servicio_envio and d.cantidad > 0 and ep.es_extra_real
),
niveles as (
  select extra, periodo, sobreprecio as precio, count(*) as veces
  from medidos where sobreprecio > 0.5
  group by extra, periodo, sobreprecio
),
totales as (
  select extra, periodo, sum(veces) as total from niveles group by extra, periodo
),
elegible as (
  select n.*, t.total,
         row_number() over (partition by n.extra, n.periodo order by n.precio) as orden
  from niveles n join totales t using (extra, periodo)
  where t.total > 0 and n.veces::numeric / t.total >= 0.10
)
select extra, periodo, precio as precio_estimado,
       round(veces::numeric / total, 3) as confianza,
       total as casos_medidos
from elegible where orden = 1 and total >= 10;

create unique index if not exists ix_m_extra_precio_gral
  on dc_m_extra_precio_gral(extra, periodo);


-- -----------------------------------------------------------------------------
-- El precio que se usa, con los tres niveles ya resueltos
--
-- Esto era una función y dejó de serlo, por una razón que costó un error en
-- producción y que vale la pena dejar escrita:
--
--   POSTGRES NO REGISTRA LA DEPENDENCIA ENTRE EL CUERPO DE UNA FUNCIÓN SQL Y
--   LAS TABLAS QUE ESA FUNCIÓN USA.
--
-- Una vista materializada que consulta otra queda amarrada: tirar la primera
-- con 'cascade' tira también la segunda, y al recrearlas en orden todo vuelve a
-- su lugar. Pero si en medio hay una función, el amarre se corta. La función
-- sobrevive a cualquier 'drop cascade' apuntando a una tabla que ya no existe,
-- y lo que la llama truena con un mensaje que no dice nada útil:
--
--   ERROR: relation "dc_m_extra_precio" does not exist
--   CONTEXT: SQL function "dc_precio_extra" during inlining
--
-- Siendo una vista materializada, Postgres conoce todas las ligas y las cuida
-- él. La clase entera de error deja de ser posible — no se evita con cuidado al
-- ordenar los archivos, deja de existir.
--
-- Resolver la cascada para cada par y cada mes cuesta poco: son unos pocos
-- miles de renglones, y se calculan una vez al refrescar en vez de una vez por
-- renglón consultado.
-- -----------------------------------------------------------------------------

drop function if exists dc_precio_extra(text, text, text);

drop materialized view if exists dc_m_extra_precio_usado cascade;
create materialized view dc_m_extra_precio_usado as
with pares as (
  select distinct extra, producto from dc_m_extra_producto
),
meses as (
  select distinct periodo from dc_ventas_detalle
),
combos as (
  select p.extra, p.producto, m.periodo from pares p cross join meses m
)
select
  c.extra,
  c.producto,
  c.periodo,
  coalesce(par.precio, gral.precio, viejo.precio)             as precio,
  coalesce(par.confianza, gral.confianza, viejo.confianza)    as confianza,
  case when par.precio   is not null then 'par'
       when gral.precio  is not null then 'general'
       when viejo.precio is not null then 'par viejo'
  end                                                          as origen
from combos c
-- 1 · el par, si es de los últimos seis meses y el nivel concentra la mitad.
--     Un mes a medias no manda: con la regla del 10%, catorce casos permiten
--     que dos renglones fijen un nivel, y septiembre de 2026 —con cinco días—
--     decía que el bistec costaba $67 cuando llevaba tres meses en $102.
left join lateral (
  select p.precio_estimado as precio, p.confianza
  from dc_m_extra_precio p
  where p.extra = c.extra and p.producto = c.producto
    and p.periodo <= c.periodo
    and p.periodo >= to_char((to_date(c.periodo, 'YYYY-MM') - interval '6 months'),
                             'YYYY-MM')
    and p.confianza >= 0.5
  order by p.periodo desc limit 1
) par on true
-- 2 · el extra juntando todos los productos, que casi siempre tiene muestra
left join lateral (
  select g.precio_estimado as precio, g.confianza
  from dc_m_extra_precio_gral g
  where g.extra = c.extra and g.periodo <= c.periodo
    and g.casos_medidos >= 20 and g.confianza >= 0.5
  order by g.periodo desc limit 1
) gral on true
-- 3 · el par aunque esté viejo, como último recurso
left join lateral (
  select p.precio_estimado as precio, p.confianza
  from dc_m_extra_precio p
  where p.extra = c.extra and p.producto = c.producto and p.periodo <= c.periodo
  order by p.periodo desc limit 1
) viejo on true
where coalesce(par.precio, gral.precio, viejo.precio) is not null;

create unique index if not exists ix_m_extra_precio_usado
  on dc_m_extra_precio_usado(extra, producto, periodo);


-- -----------------------------------------------------------------------------
-- Extra por mes: porciones, y el dinero armado precio por precio
-- -----------------------------------------------------------------------------

drop materialized view if exists dc_m_extras_mes cascade;
create materialized view dc_m_extras_mes as
with base as (
  select e.extra, e.periodo, e.agrupado, e.es_segundo_guiso,
         d.producto, e.porciones, e.detalle_id, d.cantidad,
         coalesce(ep.es_extra_real, true) as real
  from dc_v_extras_detalle e
  join dc_ventas_detalle d on d.id = e.detalle_id
  left join dc_m_extra_producto ep on ep.extra = e.extra and ep.producto = d.producto
  where not d.es_servicio_envio
    and not (e.es_segundo_guiso and coalesce(ep.es_extra_real, false) = false)
),
-- El precio vigente de cada par, hasta cada mes: si este mes no alcanzó para
-- medirlo, vale el último que sí. Un precio no desaparece porque un mes tuvo
-- poco movimiento.
con_precio as (
  select b.*, u.precio, u.confianza
  from base b
  left join dc_m_extra_precio_usado u
         on u.extra = b.extra and u.producto = b.producto and u.periodo = b.periodo
)
select
  periodo,
  extra,
  max(agrupado)                                            as agrupado,
  bool_or(es_segundo_guiso)                                as es_segundo_guiso,
  sum(porciones)::bigint                                   as porciones,
  count(distinct detalle_id)                               as pedidos,
  sum(cantidad)                                            as unidades_afectadas,
  coalesce(sum(porciones) filter (where real), 0)::bigint  as porciones_cobrables,
  min(precio) filter (where real)                          as precio_min,
  max(precio) filter (where real)                          as precio_max,
  round(min(confianza) filter (where real), 3)             as confianza,
  -- El dinero se arma sumando porciones × su propio precio, no multiplicando
  -- un total por un precio promedio. Con $8 en gorditas y $5 en bocoles, el
  -- promedio no es el precio de nada.
  case when count(*) filter (where real and precio is not null) = 0 then null
       else round(sum(porciones * precio) filter (where real), 2) end
                                                           as ingreso_estimado,
  count(*) filter (where real and precio is null)          as porciones_sin_precio
from con_precio
group by periodo, extra;

create unique index if not exists ix_m_extras_mes on dc_m_extras_mes(periodo, extra);


-- -----------------------------------------------------------------------------
-- Las vistas que lee la app
-- -----------------------------------------------------------------------------

create or replace view dc_v_t_extras_mes as
  select * from dc_m_extras_mes where dc_mi_rol() is not null;

create or replace view dc_v_t_extra_producto as
  select * from dc_m_extra_producto where dc_mi_rol() is not null;

revoke all on dc_m_extras_mes, dc_m_extra_producto from anon, authenticated;
grant select on dc_v_t_extras_mes, dc_v_t_extra_producto to authenticated;
revoke all on dc_v_t_extras_mes, dc_v_t_extra_producto from anon;


-- -----------------------------------------------------------------------------
-- Extras en un rango de fechas
--
-- Devuelve DOS niveles en la misma consulta:
--
--   grupo = true    el renglón que se enseña por omisión. Para el huevo
--                   estrellado es la suma de los cuatro términos; para todo lo
--                   demás es el extra tal cual.
--   grupo = false   el detalle de adentro de un grupo, que la app despliega
--                   cuando se le pide. Solo existe para los que están
--                   agrupados; lo demás no se duplica.
--
-- Traerlos juntos evita una segunda llamada a la red para abrir un desplegable.
-- -----------------------------------------------------------------------------

-- Cambian las columnas que devuelve, y eso 'create or replace' no lo permite:
-- hay que tirarla primero.
drop function if exists dc_extras_rango(date, date);

create or replace function dc_extras_rango(p_desde date, p_hasta date)
returns table (
  extra text, es_grupo boolean, pertenece_a text, es_segundo_guiso boolean,
  porciones bigint, pedidos bigint, unidades_afectadas numeric,
  porciones_cobrables bigint, precio_min numeric, precio_max numeric,
  confianza numeric, ingreso_estimado numeric, porciones_sin_precio bigint,
  es_guiso_mal_etiquetado boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with mes as (select to_char(p_hasta, 'YYYY-MM') as hasta),
  en_rango as (
    select e.extra, e.agrupado, e.grupo, e.es_segundo_guiso,
           e.porciones, e.detalle_id, d.producto, d.cantidad,
           coalesce(ep.es_extra_real, true) as real
    from dc_v_extras_detalle e
    join dc_ventas_detalle d on d.id = e.detalle_id
    left join dc_m_extra_producto ep
           on ep.extra = e.extra and ep.producto = d.producto
    where e.fecha between p_desde and p_hasta
      and not d.es_servicio_envio
      -- Un segundo guiso que no se cobra es un plato mixto, no un extra: ya
      -- está contado en Guisados y aquí solo sería ruido.
      and not (e.es_segundo_guiso and coalesce(ep.es_extra_real, false) = false)
  ),
  -- El precio vigente de cada par extra+producto: el del último mes que dé un
  -- número CREÍBLE, no el del último mes a secas.
  --
  -- Esto costó una prueba fallada. Si el rango cae en los primeros días de un
  -- mes, ese mes trae un puñado de casos y con la regla del 10% dos renglones
  -- alcanzan para fijar un nivel: septiembre de 2026, con cinco días, decía que
  -- el bistec costaba $67 cuando llevaba tres meses en $102.
  con_precio as (
    select r.*, u.precio, u.confianza as conf
    from en_rango r, mes
    left join lateral (
      select p.precio, p.confianza
      from dc_m_extra_precio_usado p
      where p.extra = r.extra and p.producto = r.producto and p.periodo <= mes.hasta
      order by p.periodo desc limit 1
    ) u on true
  ),
  -- Nivel 1: lo que se enseña. Un grupo suma a sus miembros.
  grupos as (
    select
      agrupado                                                as extra,
      count(distinct extra) > 1                               as es_grupo,
      null::text                                              as pertenece_a,
      bool_or(es_segundo_guiso)                               as es_segundo_guiso,
      sum(porciones)::bigint                                  as porciones,
      count(distinct detalle_id)::bigint                      as pedidos,
      sum(cantidad)                                           as unidades_afectadas,
      coalesce(sum(porciones) filter (where real), 0)::bigint as porciones_cobrables,
      min(precio) filter (where real)                         as precio_min,
      max(precio) filter (where real)                         as precio_max,
      round(min(conf) filter (where real), 3)                 as confianza,
      case when count(*) filter (where real and precio is not null) = 0 then null
           else round(sum(porciones * precio) filter (where real), 2) end
                                                              as ingreso_estimado,
      coalesce(sum(porciones) filter (where real and precio is null), 0)::bigint
                                                              as porciones_sin_precio,
      bool_and(not real)                                      as es_guiso_mal_etiquetado
    from con_precio
    group by agrupado
  ),
  -- Nivel 2: el desglose de adentro de un grupo, que la app despliega si se le
  -- pide. Solo existe para los agrupados; lo demás no se duplica.
  miembros as (
    select
      extra,
      false                                                   as es_grupo,
      grupo                                                   as pertenece_a,
      bool_or(es_segundo_guiso)                               as es_segundo_guiso,
      sum(porciones)::bigint                                  as porciones,
      count(distinct detalle_id)::bigint                      as pedidos,
      sum(cantidad)                                           as unidades_afectadas,
      coalesce(sum(porciones) filter (where real), 0)::bigint as porciones_cobrables,
      min(precio) filter (where real)                         as precio_min,
      max(precio) filter (where real)                         as precio_max,
      round(min(conf) filter (where real), 3)                 as confianza,
      case when count(*) filter (where real and precio is not null) = 0 then null
           else round(sum(porciones * precio) filter (where real), 2) end
                                                              as ingreso_estimado,
      coalesce(sum(porciones) filter (where real and precio is null), 0)::bigint
                                                              as porciones_sin_precio,
      bool_and(not real)                                      as es_guiso_mal_etiquetado
    from con_precio
    where grupo is not null
    group by extra, grupo
  )
  select * from (select * from grupos union all select * from miembros) x
  where dc_mi_rol() is not null;
$$;


-- =============================================================================
-- Cambiar cuántos guisados trae un producto
--
-- Es una regla de negocio, no un dato que se deduzca: la migada incluye dos y
-- una gordita uno. Va por función y no por update directo para que la base
-- compruebe el rol y el rango — un cero o un número negativo dejarían el
-- cálculo de extras sin sentido y no darían error a la vista.
-- =============================================================================

create or replace function dc_guardar_guisados(p_producto text, p_cuantos int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform dc_exigir('admin', 'gerente');

  if p_cuantos is null or p_cuantos < 1 or p_cuantos > 9 then
    raise exception 'Los guisados incluidos van de 1 a 9, llegó %', p_cuantos
      using errcode = '22023';
  end if;

  update dc_cat_productos set guisados_incluidos = p_cuantos
   where producto = p_producto;

  if not found then
    raise exception 'El producto "%" no está en el catálogo.', p_producto
      using errcode = 'P0002';
  end if;
end;
$$;


-- =============================================================================
-- Cerrar lo nuevo. Una función recién creada nace abierta al rol anónimo.
-- =============================================================================

select dc_cerrar_funciones();


-- =============================================================================
-- Comprobación
-- =============================================================================

select extra, es_segundo_guiso, porciones, porciones_cobrables,
       precio_min, precio_max, confianza, ingreso_estimado
from dc_m_extras_mes
where periodo = (select max(periodo) from dc_m_extras_mes)
order by porciones desc;
