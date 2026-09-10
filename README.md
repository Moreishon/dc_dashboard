# Don Comal · Datos

Tablero de ventas para un restaurante que usa Poster POS. Lee el reporte
mensual que exporta Poster, lo normaliza y lo guarda en tu propia base de
datos, donde ya se puede analizar de verdad.

Cuatro pantallas: **Resumen** (cómo va el mes, con la comparación corregida por
calendario), **Productos** (los que más dejan, los que más se venden, los que se
enfriaron), **Guisados** (participación y cómo se mueve) e **Importar**.

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
  graficas.jsx       SVG a mano. Sin librería de gráficas.
  usarAncho.js       Mide la ventana para el diseño responsivo.
  App.jsx            Sesión, rol, carga de datos y navegación.
  pantallas/
    Entrar.jsx       Login.
    Resumen.jsx      KPIs del mes y tendencia.
    Productos.jsx    Rankings y movimiento.
    Guisados.jsx     Participación, evolución y extras.
    Importar.jsx     El camino completo de una importación.
pruebas/
  instalacion.sh           Instala los ocho SQL desde cero, tres veces.
  navegador.mjs            La app en un Chromium de verdad.
  tablero.mjs              Monta las tres pantallas con datos reales y las revisa.
  analisis.mjs             El cálculo contra las cifras del informe anual.
  contra_python.mjs        El detalle contra el pipeline original.
  contra_python_dias.mjs   El grano diario contra el histórico.
  vista.html/.jsx          Banco de pruebas: las pantallas sin Supabase.
  datos/                   Fixtures del histórico para ese banco.
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

- El tablero: KPIs, tendencia mensual, comparación contra el año anterior,
  preferencias de guisado y elasticidad de precio.
- Una vista de calendario que muestre qué días tienen datos y cuáles no, para
  cachar de un vistazo una semana que se saltó.
- `piezas_por_orden` está incompleto en el catálogo: solo 6 de 92 productos
  tienen el número real. No afecta a nada de lo que hay hoy, pero sí a un
  futuro costo por pieza.
