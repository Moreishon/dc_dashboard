-- =============================================================================
-- 10 · Categorías del menú
-- =============================================================================
--
-- Corre este archivo después de 02 y 08. Se puede volver a correr las veces que
-- haga falta.
--
-- Qué agrega
-- ----------
-- Una segunda forma de agrupar los productos, además de 'familia': la sección
-- del menú, como tú la lees. Clásicos, Antojitos, Platillos, Postres, Bebidas,
-- Extras, Combos y Servicio.
--
-- Las dos clasificaciones conviven porque contestan cosas distintas. 'familia'
-- dice qué es (una Gordita de Azúcar es familia Gordita); 'categoria' dice
-- dónde va en el menú (esa misma Gordita de Azúcar es un Postre). Agrupar los
-- postres por familia los desparramaría entre gorditas y "otros".
--
-- La semilla NO pisa lo que tú cambies
-- ------------------------------------
-- Los 82 productos de hoy salen ya clasificados, pero la asignación es una
-- propuesta: la decides tú desde la pantalla de Catálogo. Por eso cada insert
-- lleva 'where categoria is null' — vuelve a poner categoría solo a lo que no
-- tiene. Si moviste Migadas a Platillos y corres este archivo otra vez, se
-- quedan en Platillos.
--
-- Los productos que aparezcan después, cuando agregues algo al menú, entran sin
-- categoría y la pantalla de Catálogo los marca para que no se te pasen.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Las secciones, en el orden en que salen en pantalla
-- -----------------------------------------------------------------------------

insert into dc_cat_categorias (categoria, orden) values
  ('Clásicos', 1),
  ('Antojitos', 2),
  ('Platillos', 3),
  ('Postres', 4),
  ('Bebidas', 5),
  ('Extras', 6),
  ('Combos', 7),
  ('Eventos', 8),
  ('Servicio', 9)
on conflict (categoria) do update set orden = excluded.orden;


-- -----------------------------------------------------------------------------
-- La propuesta de clasificación de los 92 productos del catálogo
--
-- Extras son SOLO los que se cobran como renglón: salsas, tortillas, porciones,
-- piezas sueltas. Los extras que van dentro del precio de un platillo —Queso,
-- Frijoles, Bistec, Huevo Revuelto— no son productos, son modificadores: viven
-- en dc_ventas_modificadores, no tienen dinero propio y se cuentan en la
-- pantalla de Guisados. Mezclarlos daría un total que no significa nada.
--
-- 'Eventos' no estaba en la lista original y se agregó porque el catálogo ya la
-- pedía: hay tres productos con familia 'Evento' y dos aguas de 5 y 10 litros.
-- El catering vende otro volumen, a otro precio y con otra logística; metido
-- entre las bebidas de mesa, desaparece. Si prefieres que las aguas grandes
-- cuenten como Bebidas, son dos clics en la pantalla de Catálogo.
-- -----------------------------------------------------------------------------

-- Clásicos · 4 productos
insert into dc_cat_productos (producto, familia, categoria)
select v.p, 'Otros', 'Clásicos' from (values
  ('Bocoles'),
  ('Gorditas'),
  ('Tacos de Harina'),
  ('Tacos de Maiz')
) as v(p)
on conflict (producto) do update set categoria = excluded.categoria
  where dc_cat_productos.categoria is null;

-- Antojitos · 20 productos
insert into dc_cat_productos (producto, familia, categoria)
select v.p, 'Otros', 'Antojitos' from (values
  ('1/2 Empanadas (2 pzas.)'),
  ('1/2 Enchiladas Mixtas (4 Piezas)'),
  ('1/2 Enchiladas Picositas'),
  ('1/2 Enchiladas Rojas'),
  ('1/2 Encremadas'),
  ('1/2 Enfrijoladas'),
  ('1/2 Enmoladas'),
  ('1/2 Entomatadas'),
  ('1/2 Quesadillas (2 pzas.)'),
  ('Empanadas (4 pzas.)'),
  ('Enchiladas Mixtas'),
  ('Enchiladas Picositas'),
  ('Enchiladas Rojas'),
  ('Encremadas'),
  ('Enfrijoladas'),
  ('Enmoladas'),
  ('Entomatadas'),
  ('Migada Guisado Normal'),
  ('Migada Guisado de Carne'),
  ('Quesadillas (4 pzas.)')
) as v(p)
on conflict (producto) do update set categoria = excluded.categoria
  where dc_cat_productos.categoria is null;

-- Platillos · 8 productos
insert into dc_cat_productos (producto, familia, categoria)
select v.p, 'Otros', 'Platillos' from (values
  ('Guisado Infantil'),
  ('Huevos Rancheros'),
  ('Huevos a la Mexicana'),
  ('Huevos con Deshebrada'),
  ('Orden Huevos Estrellados'),
  ('Orden Huevos Revueltos'),
  ('Orden de Guisado Normal'),
  ('Orden de Guisado de Carne')
) as v(p)
on conflict (producto) do update set categoria = excluded.categoria
  where dc_cat_productos.categoria is null;

-- Postres · 7 productos
insert into dc_cat_productos (producto, familia, categoria)
select v.p, 'Otros', 'Postres' from (values
  ('Besitos de Nuez'),
  ('Bisquet'),
  ('Brownie Oreo'),
  ('Gorditas de Azúcar'),
  ('Panqué de Elote'),
  ('Pieza de Pan Dulce'),
  ('Plátano Frito')
) as v(p)
on conflict (producto) do update set categoria = excluded.categoria
  where dc_cat_productos.categoria is null;

-- Bebidas · 16 productos
insert into dc_cat_productos (producto, familia, categoria)
select v.p, 'Otros', 'Bebidas' from (values
  ('Café Negro'),
  ('Café con Leche'),
  ('Ciel 600 ml.'),
  ('Fuze Tea'),
  ('Horchata 1 Litro'),
  ('Horchata Vaso'),
  ('Jamaica 1 Litro'),
  ('Jamaica Vaso'),
  ('Jugo Naranja 1 Litro'),
  ('Jugo Naranja Vaso'),
  ('Limón 1 Litro'),
  ('Limón Vaso'),
  ('Refresco 355 ml.'),
  ('Refresco 600 ml.'),
  ('Topo Chico 600 ml.'),
  ('Té de Manzanilla')
) as v(p)
on conflict (producto) do update set categoria = excluded.categoria
  where dc_cat_productos.categoria is null;

-- Extras · 26 productos
insert into dc_cat_productos (producto, familia, categoria)
select v.p, 'Otros', 'Extras' from (values
  ('Aguacate Extra'),
  ('Bistec 1 Pza.'),
  ('Huevo Estrellado 2 pzas.'),
  ('Huevo Revuelto 2 pzas.'),
  ('Pieza Enchilada Picosa'),
  ('Pieza Enchilada Roja'),
  ('Pieza Encremada'),
  ('Pieza Enfrijolada'),
  ('Pieza Enmolada'),
  ('Pieza Entomatada'),
  ('Pieza Extra Empanada'),
  ('Pieza Extra Quesadilla'),
  ('Pieza Huevo Estrellado Ciego'),
  ('Pieza Huevo Estrellado Cocido'),
  ('Pieza Huevo Estrellado Medio'),
  ('Pieza Huevo Estrellado Tierno'),
  ('Pieza Tortilla de Harina'),
  ('Pieza Tortilla de Maíz'),
  ('Pieza de Pan'),
  ('Porción Ensalada'),
  ('Porción Frijol con Queso'),
  ('Porción Leche'),
  ('Salsa Habanera'),
  ('Salsa Roja'),
  ('Salsa Verde'),
  ('Zanahorias p/llevar')
) as v(p)
on conflict (producto) do update set categoria = excluded.categoria
  where dc_cat_productos.categoria is null;

-- Combos · 5 productos
insert into dc_cat_productos (producto, familia, categoria)
select v.p, 'Otros', 'Combos' from (values
  ('Bocoles Surtidos'),
  ('Gorditas Surtidas'),
  ('PROMO 6 surtidas'),
  ('Tacos Harina Surtidos'),
  ('Tacos Maíz Surtidos')
) as v(p)
on conflict (producto) do update set categoria = excluded.categoria
  where dc_cat_productos.categoria is null;

-- Eventos · 5 productos
insert into dc_cat_productos (producto, familia, categoria)
select v.p, 'Otros', 'Eventos' from (values
  ('10 Lts. Agua Fresca de Sabor'),
  ('5 Lts. Aguade Jamaica'),
  ('Agua de Jamaica - Evento'),
  ('Paq. 5 Gorditas Surtidas EVENTO'),
  ('Paquetes - Evento')
) as v(p)
on conflict (producto) do update set categoria = excluded.categoria
  where dc_cat_productos.categoria is null;

-- Servicio · 1 productos
insert into dc_cat_productos (producto, familia, categoria)
select v.p, 'Otros', 'Servicio' from (values
  ('Servicio a Dom.')
) as v(p)
on conflict (producto) do update set categoria = excluded.categoria
  where dc_cat_productos.categoria is null;


-- =============================================================================
-- La vista del catálogo
--
-- Lo que la pantalla de Catálogo necesita para que clasificar no sea a ciegas:
-- cada producto con su categoría, y al lado cuánto vendió y cuándo fue la
-- última vez. Sin eso, decidir si "Bistec 1 Pza." es Extra o Platillo es
-- adivinar; con 14 unidades en tres años, se decide solo.
--
-- Es una vista y no una función porque no necesita parámetros, y con
-- security_invoker el RLS de las tablas base sigue mandando.
-- =============================================================================

create or replace view dc_v_catalogo with (security_invoker = true) as
select
  c.producto,
  c.familia,
  c.categoria,
  c.unidad_venta,
  c.guisados_incluidos,
  c.activo,
  coalesce(v.unidades, 0)   as unidades,
  coalesce(v.ingresos, 0)   as ingresos,
  coalesce(v.renglones, 0)  as renglones,
  v.ultima_venta,
  v.primera_venta
from dc_cat_productos c
left join (
  select producto,
         sum(cantidad)  as unidades,
         sum(ingresos)  as ingresos,
         count(*)       as renglones,
         max(fecha)     as ultima_venta,
         min(fecha)     as primera_venta
  from dc_ventas_detalle
  where not es_servicio_envio
  group by producto
) v on v.producto = c.producto;

grant select on dc_v_catalogo to authenticated;
revoke all on dc_v_catalogo from anon;


-- =============================================================================
-- Guardar una clasificación
--
-- Por qué una función y no un UPDATE directo desde la app: aquí se comprueba el
-- rol y se comprueba que la categoría exista. Un UPDATE suelto desde el
-- navegador dejaría entrar un nombre mal escrito —'Postre' en vez de
-- 'Postres'— y esa categoría fantasma no daría error: simplemente aparecería
-- una sección más en el tablero con un producto adentro, y nadie sabría por qué.
-- =============================================================================

create or replace function dc_guardar_categoria(p_producto text, p_categoria text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform dc_exigir('admin', 'gerente');

  if p_categoria is not null
     and not exists (select 1 from dc_cat_categorias where categoria = p_categoria) then
    raise exception 'La categoría "%" no existe.', p_categoria using errcode = '23503';
  end if;

  update dc_cat_productos
     set categoria = p_categoria
   where producto = p_producto;

  if not found then
    raise exception 'El producto "%" no está en el catálogo.', p_producto
      using errcode = 'P0002';
  end if;
end;
$$;


-- =============================================================================
-- Cerrar lo que se acaba de crear
--
-- Supabase le concede EXECUTE al rol anónimo sobre cada función nueva del
-- esquema public. Una función recién creada nace abierta, así que este archivo
-- tiene que cerrarla él mismo: dejarlo para "la próxima vez que corra 09" es
-- exactamente el hueco que ya nos costó una vez.
--
-- dc_cerrar_funciones() vive en 09 y es la única que reparte estos permisos.
-- =============================================================================

select dc_cerrar_funciones();


-- =============================================================================
-- Comprobación
-- =============================================================================

select c.orden,
       c.categoria,
       count(p.producto)                   as productos,
       coalesce(sum(v.unidades), 0)::int   as unidades_historicas
from dc_cat_categorias c
left join dc_cat_productos p on p.categoria = c.categoria
left join (select producto, sum(cantidad) as unidades
           from dc_ventas_detalle where not es_servicio_envio
           group by producto) v on v.producto = p.producto
group by c.orden, c.categoria
union all
select 99, '— SIN CATEGORÍA —', count(*), 0
from dc_cat_productos where categoria is null
order by 1;
