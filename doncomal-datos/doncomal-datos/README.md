# Don Comal · Datos

Tablero de ventas para un restaurante que usa Poster POS. Lee el reporte
mensual que exporta Poster, lo normaliza y lo guarda en tu propia base de
datos, donde ya se puede analizar de verdad.

Cinco pantallas: **Resumen** (cómo va el mes, con la comparación corregida por
calendario), **Productos** (el reparto por sección del menú, los que más dejan,
los que más se venden, los que se enfriaron, y la lista completa),
**Guisados** (participación y cómo se mueve), **Catálogo** (en qué sección va
cada producto) e **Importar**.

## Lo que resuelve

Poster exporta las ventas con los modificadores metidos todos en una sola
celda de texto: `Deshebrada, Queso &times 2, Sin Crema`. Ahí adentro conviven
el guisado, los extras y las peticiones del cliente, revueltos y sin marcar.
Contarlos a mano no se puede, y contarlos mal es peor que no contarlos.

Esta app separa cada pedazo, lo clasifica contra un catálogo que tú controlas,
y guarda un renglón por modificador **sin columnas de dinero**, para que un
pedido con tres guisados no se cuente tres veces.

Lo que no reconoce, lo detiene y te pregunta. Nunca adivina.

## Cada cuánto subir

Cuando quieras. Se reemplazan **solo los días que trae el archivo**, así que
puedes subir una semana el lunes y otra el siguiente sin borrar lo anterior, o
esperar a fin de mes y subirlo completo. Repetir la misma carga tampoco duplica
nada.

Lo único que no puedes hacer es subir un archivo que cruce el cambio de mes y
esperar que se guarde de una sola vez: la app lo parte en dos y guarda cada mes
por separado. El resultado es el mismo.

La app muestra siempre, arriba, hasta qué día llegan los datos. Esa fecha sale
del rango que cubrieron las importaciones, no de la última venta: si cerraste el
lunes, los datos siguen llegando al lunes aunque la última venta sea del
domingo.

## Montar tu propia copia

Cada restaurante tiene su propio proyecto de Supabase y su propio despliegue.
Nadie aloja los datos de nadie.

### 1 · La base de datos

En [supabase.com](https://supabase.com), proyecto nuevo. En el SQL Editor,
corre **en orden** los archivos de la carpeta `sql/`:

| Archivo | Qué hace |
|---|---|
| `01_seguridad.sql` | Usuarios, roles y reglas de acceso |
| `02_ventas.sql` | Las tablas de ventas y las vistas del tablero |
| `03_importacion.sql` | La función que guarda las ventas |
| `04_por_rango.sql` | Reemplaza esa función por una que trabaja por rango de fechas |
| `05_permisos.sql` | Da permiso de lectura a las vistas. Vuelve a correrlo si agregas vistas |
| `06_cobertura_rapida.sql` | Vista de cobertura barata e índices por fecha |
| `07_agregados.sql` | Agregados precalculados del tablero |
| `08_rangos.sql` | Funciones que agregan por rango de fechas |
| `09_cerrar_funciones.sql` | Cierra las funciones al rol anónimo. **Imprescindible** |
| `10_categorias.sql` | Las secciones del menú y la clasificación de los 92 productos |
| `11_extras.sql` | Los extras que van dentro del platillo: porciones y precio estimado |

Los archivos 02, 08, 09, 10 y 11 se tocan entre ellos, así que después de
actualizar cualquiera conviene correrlos en ese orden.

Se pueden volver a correr cuantas veces haga falta, en cualquier orden: cada
objeto se define en un solo archivo, así que ninguno deshace lo que hizo otro.
Eso está probado en `pruebas/instalacion.sh`, que instala desde cero tres veces
seguidas — no es una promesa, es una prueba que se corre.

Después crea tu usuario en **Authentication → Users** y date rol de
administrador:

```sql
insert into dc_usuarios (user_id, nombre, rol)
select id, 'Tu nombre', 'admin' from auth.users where email = 'tu@correo.com'
on conflict (user_id) do update set rol = 'admin';
```

### 2 · Los catálogos

La app necesita saber qué es cada producto y qué significa cada modificador.
Si vienes de una instalación con histórico, ya están cargados. Si empiezas de
cero, quedan vacíos: la primera importación va a encontrar todo sin clasificar
y te lo va a ir preguntando uno por uno. Es tardado la primera vez y nunca más.

### 3 · La app

```bash
npm install
cp .env.example .env      # y pon la URL y la llave de tu proyecto
npm run dev
```

Para publicarla, en [Vercel](https://vercel.com): importar el repositorio,
poner las dos variables de entorno en *Settings → Environment Variables*, y
desplegar. Vite y Vercel se entienden sin configurar nada.

## Los roles

| Rol | Puede |
|---|---|
| `admin` | Todo |
| `gerente` | Importar ventas y consultar |
| `lectura` | Solo consultar |

El rol vive en la tabla `dc_usuarios` y lo aplica la base de datos, no la app.
Aunque alguien modificara el código que corre en su navegador, la base sigue
diciendo que no.

### Dos cosas que cuestan caro y no se ven leyendo el código

**Una comparación con NULL no es `false`.** `dc_mi_rol()` devuelve NULL cuando
no hay sesión, y `NULL = 'admin'` da NULL, no `false`. En PL/pgSQL un
`if not NULL then raise exception` **no entra en la rama**: la comprobación se
salta en silencio y la función sigue. Como las funciones son `SECURITY DEFINER`
—corren con permisos elevados y se saltan el RLS por diseño— eso dejaba que un
anónimo borrara ventas. Se arregló con `coalesce(..., false)` y con
`dc_exigir()`, que comprueba paso por paso y falla ruidosamente.

Las políticas de RLS **no** tienen este problema: ahí un NULL niega el acceso.
Solo el `if` de PL/pgSQL lo interpreta como "sigue adelante".

**`revoke from public` no alcanza en Supabase.** Supabase concede EXECUTE a
`anon` y `authenticated` sobre cada función nueva del esquema `public` con
`ALTER DEFAULT PRIVILEGES`. Ese permiso va al rol, no a `public`, así que
revocárselo a `public` no lo quita. Hay que revocar del rol por nombre — es lo
que hace `09_cerrar_funciones.sql`, recorriendo todas las funciones `dc_*`.

Esto no salía en las pruebas locales: un Postgres sin la configuración de
Supabase no reparte esos permisos. `pruebas/seguridad.sh` reproduce la
condición a propósito.

## Sobre la llave que ve el navegador

La llave `anon` viaja dentro del código que corre en el celular de quien usa la
app. **Es pública por diseño y no se puede esconder.** Lo que protege los datos
son dos cosas, y ninguna es esa llave: que haya sesión iniciada, y que las
políticas de RLS digan qué puede ver cada rol.

Va en `.env` y no en el código no para ocultarla, sino para que cada
restaurante ponga la suya sin tocar el repositorio.

La llave `service_role` se salta todas las reglas. Nunca va en este proyecto ni
en ningún archivo que llegue al navegador.

## Cómo está armado

```
src/
  poster.js          Lee el xlsx de Poster y clasifica. No sabe qué es Supabase.
  analisis.js        El cálculo del tablero. Funciones puras, probables en Node.
  datos.js           Todo lo que habla con Supabase. Lo único que sabe de HTTP.
  estilo.js          Colores, tipografías y formas. Los mismos que la app de compras.
  marca.jsx          El logo, en sus tres versiones y cada una en su lugar.
  graficas.jsx       SVG a mano, más el <Delta/> que colorea todos los cambios.
  usarAncho.js       Mide la ventana para el diseño responsivo.
  App.jsx            Sesión, rol, carga de datos y navegación.
  pantallas/
    Entrar.jsx       Login.
    Resumen.jsx      KPIs del mes y tendencia.
    Productos.jsx    Rankings y movimiento.
    Guisados.jsx     Participación, evolución y extras.
    Catalogo.jsx     En qué sección del menú va cada producto.
    Importar.jsx     El camino completo de una importación.
pruebas/
  instalacion.sh           Instala los nueve SQL desde cero, tres veces.
  seguridad.sh             Intenta romper el esquema y comprueba que no se deja.
  navegador.mjs            La app en un Chromium de verdad.
  tablero.mjs              Monta las tres pantallas con datos reales y las revisa.
  marca.mjs                Las cuatro superficies con logo: que cargue y no se deforme.
  analisis.mjs             El cálculo contra las cifras del informe anual.
  contra_python.mjs        El detalle contra el pipeline original.
  contra_python_dias.mjs   El grano diario contra el histórico.
  vista.html/.jsx          Banco de pruebas: las pantallas sin Supabase.
  marca.html/.jsx          Banco de la carga, la entrada y los dos encabezados.
  datos/                   Fixtures del histórico para ese banco.
public/
  logo/                    Isotipo, imagotipo y logotipo, blancos sobre transparente.
  icon.png                 El isotipo sobre el negro de marca, para el ícono de la app.
```

`poster.js` está aparte a propósito: no depende del navegador ni de la base, y
por eso se puede probar en Node contra el resultado del pipeline original. Esa
prueba es la que decide si el código sirve.

### El diseño no detecta el aparato, mide la ventana

`usarAncho.js` reacciona al ancho de la ventana, no a "si es celular o
computadora". Detectar el aparato falla seguido —una tablet, un teléfono
acostado, una ventana angosta en un monitor grande— y además no es lo que
importa: lo que importa es cuánto espacio hay ahora mismo. El corte está en
760 px. Arrastra la esquina de la ventana y verás el diseño acomodarse.

### Dos cosas que se ven raras y son a propósito

**Los componentes van fuera de `App`.** Si se definen adentro, React los trata
como un componente distinto en cada render, desmonta lo que había, y el campo
de texto en el que estabas escribiendo pierde el foco a cada letra.

**Dos clasificaciones que no se estorban.** `familia` dice la FORMA del producto
—Gordita, Bocol, Taco, Enchilada— y la pone el parser al importar: es parte de
lo que pasó y no se toca. `categoria` dice la SECCIÓN DEL MENÚ —Clásicos,
Antojitos, Platillos, Postres, Bebidas, Extras, Combos, Eventos— y la pones tú.
Unas Gorditas de Azúcar son familia Gordita y categoría Postres; agrupar los
postres por familia los desparramaría.

La categoría se lee del catálogo **al consultar**, con un join, no del renglón de
venta. Por eso mover un producto de sección aplica a los tres años de historia
en el momento, sin volver a importar nada. Un producto todavía sin clasificar
sigue apareciendo con sus ventas y con categoría nula: desaparecer de los
totales por no estar clasificado sería mucho peor que salir en "sin categoría",
y la pantalla de Catálogo lo marca en rojo hasta que se atienda.

**Extras quiere decir dos cosas y solo una tiene renglón propio.** Unos son
productos —salsas, tortillas, porciones, piezas sueltas— y se cobran como línea.
Otros son *modificadores* —Bistec, Queso, Frijoles, Huevo Revuelto, Relleno de
Guisados— y van sumados al precio del platillo.

De los segundos sí se puede saber el precio, aunque nadie lo capture: se compara
un renglón que lleva UN extra contra el precio de lista del mismo producto en el
mismo mes, y lo que sobra es lo que costó. Se validó contra algo independiente
—varios existen también como producto, con su precio real— y coinciden:
Huevo Revuelto $35, Bistec $74 → 85 → 102, Frijoles $3 → 4 → 5.

**Ese dinero NO se suma al reparto por sección.** Ya está contado dentro del
platillo al que se le puso; sumarlo sería contarlo dos veces y el total dejaría
de cuadrar. Va en su propia tarjeta, dicho explícitamente, y hay una prueba que
comprueba que las secciones sigan sumando exactamente el total del periodo.

**En el restaurante y en las plataformas los precios son distintos, y los dos
han subido.** La exportación de Poster no dice por qué canal entró cada venta,
así que los dos niveles vienen revueltos. No hace falta separarlos: el
sobreprecio de plataforma solo SUMA, nunca resta, así que el nivel más bajo con
presencia real es el del mostrador. Es la misma regla que ya usaba
`dc_v_precios` para el precio de menú. Tomar la moda sería un error — en un mes
donde las plataformas muevan más volumen, la moda ES el precio de plataforma.

**El mismo extra cuesta distinto según el platillo.** El bistec vale $102 en los
dieciséis productos donde va; el guiso de más vale $8 en gorditas, $5 en bocoles
y $43 en migada. La primera versión estimaba un precio por extra y para el
bistec daba igual, pero para los agregados chicos promediaba $5 y $8 en un solo
número — y la confianza se caía a 0.16, que era la forma en que los datos
avisaban que la pregunta estaba mal hecha. Partido por par extra + producto,
la misma cifra sube a 0.9 y pico. Cuando la pantalla enseña *$5–8* no es que el
cálculo dude: es que son dos precios distintos.

Partir por producto pierde muestra, así que el precio se resuelve en cascada:
el del par si es de los últimos seis meses, si no el del extra en general, y en
último caso el del par aunque esté viejo. Sin el segundo escalón, el bistec
salía entre $74 y $102 porque algunos pares se habían quedado anclados a 2023.

**El guisado que pasa de los incluidos se cobra.** Una gordita es una pieza y su
precio trae un guiso: si lleva dos, el segundo se paga. Los datos lo confirman
sin ambigüedad — de 408 renglones de clásicos con dos guisos, el **97.5%** trae
sobreprecio, mediana $5. Esas porciones no se contaban en ningún lado: quedaban
marcadas como GUISADO, y los guisos no tienen dinero propio.

La migada es la excepción: su precio ya incluye **dos**. Eso no se deduce, se
sabe — lo puso Octavio, y los datos coinciden (13-19% de sobreprecio contra
97.5% en los clásicos). Vive en `dc_cat_productos.guisados_incluidos` y se edita
desde la pantalla de Catálogo, porque una regla de negocio dicha es mejor que
una inferida: no depende del tamaño de la muestra ni cambia sola si un mes sale
raro. Las órdenes de varias piezas quedan fuera por definición, y los surtidos
también — ahí la variedad *es* el producto.

**Cuatro términos de cocción son un solo extra.** Huevo estrellado medio,
tierno, cocido y ciego cuestan lo mismo y se piden por lo mismo. Separados, cada
uno cae al séptimo u octavo lugar; juntos son de los que más se piden. Se
agrupan con `dc_cat_modificadores.grupo` y la pantalla deja abrir el grupo.

**No saber no es saber que no.** Un par extra+producto con menos de diez casos
no alcanza para opinar, y la primera versión trataba ese "no sé" como "no es un
extra": Huevo Revuelto (p/relleno), que se cobra el 100% de las veces, salía con
una porción marcada como guiso. Ahora, cuando el par no tiene muestra, se usa
cómo se comporta ese extra en general.

**Postgres no cuida lo que no puede ver.** Una vista materializada que consulta
otra queda amarrada: tirar la primera con `cascade` se lleva la segunda, y al
recrearlas en orden todo vuelve a su lugar. Si en medio hay una **función SQL**,
ese amarre se corta — Postgres no registra qué tablas usa el cuerpo de una
función. La función sobrevive apuntando a algo que ya no existe, y el error sale
después, en otro lado, con un mensaje que no ayuda:

```
ERROR: relation "dc_m_extra_precio" does not exist
CONTEXT: SQL function "dc_precio_extra" during inlining
```

Pasó en producción y no salía en las pruebas locales. La cascada de precios era
una función; ahora es `dc_m_extra_precio_usado`, una vista materializada más. No
es que ahora haya que tener cuidado con el orden: la clase entera de error dejó
de ser posible. `pruebas/instalacion.sh` tira el primer eslabón a propósito y
comprueba que caiga la cadena completa y que los archivos la reconstruyan.

**Un mes a medias no puede fijar un precio.** Con la regla del 10%, catorce
casos permiten que dos renglones fijen un nivel: septiembre de 2026, con cinco
días, decía que el bistec costaba $67 cuando llevaba tres meses en $102. Un mes
solo manda si trae 20 casos y el nivel concentra la mitad; si no, se usa el del
mes anterior.

**El mismo nombre es guiso en unos productos y extra en otros.** Queso y
Frijoles son las dos cosas. La regla que los separa dice "es extra si ya venía
un guisado antes", así que en un pedido mixto —dos empanadas de deshebrada y dos
de queso— el segundo *guiso* queda marcado como extra.

Eso se ve en los datos como un extra que nunca se cobra, y leído a la ligera
parece una fuga de dinero. No lo es:

| Queso marcado como extra en… | veces | en cero |
|---|---|---|
| Gorditas, Tacos, Bocoles | 484 | 0–2% |
| Empanadas (4 pzas.) | 416 | 74% |
| 1/2 Empanadas | 227 | 95% |

En empanadas el queso es el relleno. Por eso el cálculo va por par
**extra + producto**, no por extra a secas, y los pares que casi nunca se cobran
quedan apartados en vez de arrastrar el precio a cero.

**Una función recién creada nace abierta.** Supabase le concede EXECUTE a `anon`
sobre cada función nueva del esquema `public`. Por eso `dc_cerrar_funciones()`
es una función y no un bloque suelto: cualquier archivo que agregue funciones
termina con `select dc_cerrar_funciones();` y las cierra ahí mismo, en vez de
confiar en que alguien se acuerde de volver a correr 09. Esa función NO es
`security definer` a propósito — es lo único que reparte permisos en todo el
esquema, y corriendo con los permisos de quien la llama no sirve de nada desde
el navegador.

**Un solo `<Delta/>` para todos los cambios.** El porcentaje que sube va verde
y el que baja va rojo, en las tres pantallas. Eso estaba escrito tres veces —una
por pantalla— y pasó lo previsible: dos lo pintaban y la de guisados lo dejaba en
gris. Ahora es un componente en `graficas.jsx` y una prueba que mide el **color
que el navegador acabó aplicando**, no el código: si algún cambio vuelve a salir
gris, `tablero.mjs` lo dice con el número y el color que encontró.

Ese componente también sabe la diferencia entre por ciento y **puntos**. La
participación de un guisado que pasa de 18% a 16% no bajó 2%, bajó 2 puntos.

**El logo es blanco sobre transparente.** Por eso va solo en las superficies
oscuras —carga, entrada, encabezado— y sería invisible sobre el papel del
cuerpo. Si algún día hace falta sobre fondo claro, hay que pedir la versión en
negro; teñir la blanca no funciona.

**Nunca `toISOString()`.** Estamos en UTC−6: una fecha convertida así se corre
un día y el análisis de fin de semana queda mal. Siempre `getFullYear()`,
`getMonth()`, `getDate()`, o partir el texto.

## Las pruebas

```bash
node pruebas/navegador.mjs
```

Levanta un Chromium de verdad, comprueba que la pantalla de entrada funcione en
una pantalla de celular, y —lo importante— que el parser dé exactamente los
mismos números leyendo un archivo desde el navegador que desde Node.

El parser se validó contra el pipeline original de Python en dos niveles: el
detalle (138,762 renglones y 159,026 modificadores, campo por campo) y el grano
diario (los 1,106 días, con sus ingresos, unidades, piezas y renglones). Si lo
modificas, vuelve a correr las dos comparaciones antes de subir nada.

**Una consulta cara falla de forma engañosa.** Supabase cancela cualquier
consulta que pase de unos segundos y devuelve el código `57014`. Una vista que
recorra `dc_ventas_detalle` varias veces lo va a provocar. Cuando exista el
grano diario, preguntarle a él: `dc_ventas_dia` tiene 1,106 renglones contra
138,762, y para contar días, sumar ingresos o encontrar la última fecha da
exactamente lo mismo.

## Tres trampas que el tablero corrige y casi ningún reporte corrige

**El calendario.** Los meses tienen de 28 a 31 días y de 12 a 15 viernes-a-domingo.
Comparar totales mezcla "vendí más" con "tuve más días". Entre enero y febrero de
2026 el total dice −3.6% y el promedio diario dice +3.2%: el signo se invierte.
Toda comparación enseña el promedio diario primero y avisa cuando las dos cifras
cuentan historias distintas.

**El mes en curso.** Un mes con cinco días no es un mes malo, es un mes que no ha
terminado. Comparado completo daría −86%. Los atajos recortan el periodo de
comparación al mismo tramo, y cuando no se puede, normalizan por día y lo dicen.

**La composición de días.** Dos semanas del mismo largo tampoco son comparables
si una trae domingo y la otra lunes. La semana del 31 de agosto de 2026 salía
−21.4% contra la anterior; casi todo era que la anterior tenía un domingo de
35,000 y esta un lunes de 14,700. Mirando solo los días presentes en las dos,
la caída real era **−8.6%**. El tablero detecta el desajuste, avisa cuáles días
no tienen pareja y da la cifra día-con-día.

## Qué falta

- Una vista de calendario que muestre qué días tienen datos y cuáles no, para
  cachar de un vistazo una semana que se saltó.
- `piezas_por_orden` está incompleto en el catálogo: solo 6 de 92 productos
  tienen el número real. No afecta a nada de lo que hay hoy, pero sí a un
  futuro costo por pieza.
