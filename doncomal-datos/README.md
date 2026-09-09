# Don Comal · Datos

Tablero de ventas para un restaurante que usa Poster POS. Lee el reporte
mensual que exporta Poster, lo normaliza y lo guarda en tu propia base de
datos, donde ya se puede analizar de verdad.

Ahora mismo hace una sola cosa —importar— y la hace bien. El tablero se
construye encima.

## Lo que resuelve

Poster exporta las ventas con los modificadores metidos todos en una sola
celda de texto: `Deshebrada, Queso &times 2, Sin Crema`. Ahí adentro conviven
el guisado, los extras y las peticiones del cliente, revueltos y sin marcar.
Contarlos a mano no se puede, y contarlos mal es peor que no contarlos.

Esta app separa cada pedazo, lo clasifica contra un catálogo que tú controlas,
y guarda un renglón por modificador **sin columnas de dinero**, para que un
pedido con tres guisados no se cuente tres veces.

Lo que no reconoce, lo detiene y te pregunta. Nunca adivina.

## Montar tu propia copia

Cada restaurante tiene su propio proyecto de Supabase y su propio despliegue.
Nadie aloja los datos de nadie.

### 1 · La base de datos

En [supabase.com](https://supabase.com), proyecto nuevo. En el SQL Editor,
corre en orden los tres archivos de la carpeta `sql/`:

| Archivo | Qué hace |
|---|---|
| `01_seguridad.sql` | Usuarios, roles y reglas de acceso |
| `02_ventas.sql` | Las tablas de ventas y las vistas del tablero |
| `03_importacion.sql` | La función que guarda un mes |

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
  datos.js           Todo lo que habla con Supabase. Lo único que sabe de HTTP.
  estilo.js          Colores, tipografías y formas. Los mismos que la app de compras.
  App.jsx            Sesión, rol y qué pantalla se muestra.
  pantallas/
    Entrar.jsx       Login.
    Importar.jsx     El camino completo de una importación.
pruebas/
  navegador.mjs      Prueba la app en un Chromium de verdad.
```

`poster.js` está aparte a propósito: no depende del navegador ni de la base, y
por eso se puede probar en Node contra el resultado del pipeline original. Esa
prueba es la que decide si el código sirve.

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

El parser se validó además contra el pipeline original de Python: 138,762
renglones y 159,026 modificadores, campo por campo. Si lo modificas, vuelve a
correr esa comparación antes de subir nada.

## Qué falta

- El tablero: KPIs, tendencia mensual, comparación contra el año anterior,
  preferencias de guisado y elasticidad de precio.
- `piezas_por_orden` está incompleto en el catálogo: solo 6 de 92 productos
  tienen el número real. No afecta a nada de lo que hay hoy, pero sí a un
  futuro costo por pieza.
