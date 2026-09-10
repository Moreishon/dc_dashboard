// =============================================================================
// Prueba visual del tablero
// =============================================================================
//
// Monta las tres pantallas con los datos reales de los tres años, en un
// Chromium de verdad, y comprueba lo que solo se ve al pintarlo: que no truene,
// que no se desborde, que las cifras que salen en pantalla sean las del
// informe, y que las gráficas tengan marcas de verdad y no estén vacías.
//
// Deja capturas en /tmp para poder mirarlas.
// =============================================================================

import { chromium } from 'playwright';
import { createServer } from 'vite';

const RAIZ = new URL('..', import.meta.url).pathname;

// Se cambia el módulo de datos por uno falso: el banco no habla con Supabase,
// pero las pantallas sí piden agregados por rango, así que se simulan.
const vite = await createServer({
  root: RAIZ,
  server: { port: 4325 },
  logLevel: 'error',
  resolve: {
    alias: [{
      find: /^\.\.\/datos\.js$/,
      replacement: RAIZ + 'pruebas/datos_falsos.js',
    }],
  },
});
await vite.listen();

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let fallas = 0;
const ok = (b, t) => { console.log(`  ${b ? '✓' : '✗'} ${t}`); if (!b) fallas++; };

// Un cambio porcentual pintado de gris es un cambio que no se lee. Esta función
// no busca el código: busca el color que el navegador acabó aplicando, que es
// lo único que el ojo ve. La pantalla de guisados llevaba semanas en gris y
// ninguna prueba lo notaba, porque ninguna miraba el píxel.
const VERDE = 'rgb(30, 122, 80)';
const ROJO  = 'rgb(221, 60, 38)';
// Los mismos dos, calibrados para la tarjeta negra: ahí el verde de marca no
// se lee y Delta cambia a estos. Siguen siendo verde-sube y rojo-baja.
const VERDE_OSCURO = 'rgb(123, 224, 174)';
const ROJO_OSCURO  = 'rgb(255, 174, 155)';

async function cambiosPintados(pag) {
  return pag.evaluate(({ buenos }) => {
    const conSigno = /^\s*[↑↓+-]?\s*[\d,.]+\s*(%|pts)\s*$/;
    let total = 0, coloreados = 0, grises = [];
    for (const el of document.querySelectorAll('span, td, div')) {
      // Solo hojas: si un nodo tiene hijos, el texto es de ellos.
      if (el.children.length) continue;
      const t = el.textContent;
      if (!conSigno.test(t)) continue;
      if (/^\s*[\d,.]+\s*%\s*$/.test(t)) continue;   // un nivel, no un cambio
      total++;
      const c = getComputedStyle(el).color;
      if (buenos.includes(c)) coloreados++;
      else grises.push(t.trim() + ' → ' + c);
    }
    return { total, coloreados, grises: grises.slice(0, 4) };
  }, { buenos: [VERDE, ROJO, VERDE_OSCURO, ROJO_OSCURO] });
}

const ruido = (t) =>
  /fonts\.googleapis|fonts\.gstatic|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(t);

async function abrir(ancho, alto) {
  const pag = await navegador.newPage({ viewport: { width: ancho, height: alto } });
  const errores = [];
  pag.on('pageerror', (e) => errores.push(e.message));
  pag.on('console', (m) => {
    if (m.type() === 'error' && !ruido(m.text())) errores.push(m.text());
  });
  await pag.goto('http://localhost:4325/pruebas/vista.html', { waitUntil: 'networkidle' });
  await pag.waitForSelector('#tab-resumen', { timeout: 15000 });
  await pag.waitForTimeout(500);
  return { pag, errores };
}

// ─── escritorio ──────────────────────────────────────────────────────────────
{
  const { pag, errores } = await abrir(1440, 1000);
  console.log('\nResumen · escritorio 1440×1000');

  const texto = await pag.locator('body').innerText();

  // Arranca en la semana en curso, anclada al último día CON DATOS (5 de
  // septiembre), no a la fecha real de hoy.
  ok(/31 de agosto al 5 de septiembre 2026/.test(texto),
     'arranca en la semana del último dato');
  ok(/Esta semana/.test(texto) && /Mes pasado/.test(texto) &&
     /Últimos 3 meses/.test(texto) && /Otro periodo/.test(texto),
     'están los atajos de periodo');
  ok(/2026/.test(texto) && /2023/.test(texto), 'están los años con datos');

  // La cifra grande: promedio diario de los últimos 30 días.
  const heroe = await pag.evaluate(() => {
    const el = [...document.querySelectorAll('div')]
      .find((d) => parseFloat(getComputedStyle(d).fontSize) >= 48);
    return el ? el.textContent.trim() : null;
  });
  ok(/^\$[\d,]+$/.test(heroe || ''), `hay una cifra grande y es dinero: ${heroe}`);
  // El texto se ve en mayúsculas por CSS, así que innerText las devuelve así.
  ok(/PROMEDIO POR DÍA · ÚLTIMOS 30 DÍAS/i.test(texto), 'y dice de qué es');
  ok(/contra los 30 días anteriores/.test(texto), 'y contra qué se compara');

  ok(/Cómo viene el promedio diario/.test(texto), 'está la tabla de tendencia');
  ok(/Ver los números/.test(texto), 'las gráficas traen su tabla de números');

  // Los números tienen que estar en la tabla, no solo en la gráfica.
  const antes = await pag.locator('table').count();
  const cuantos = await pag.locator('button:has-text("Ver los números")').count();
  for (let i = 0; i < cuantos; i++) {
    // Siempre el primero: al abrirse cambia su texto y sale de la lista.
    await pag.locator('button:has-text("Ver los números")').first().click();
    await pag.waitForTimeout(120);
  }
  const despues = await pag.locator('table').count();
  ok(despues > antes,
     `abrir los ${cuantos} desplegables agrega ${despues - antes} tablas de números`);

  const desborde = await pag.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  ok(!desborde, 'no se desborda a lo ancho');

  // Las gráficas tienen que tener marcas de verdad.
  const marcas = await pag.evaluate(() => ({
    svgs: document.querySelectorAll('svg').length,
    barras: document.querySelectorAll('svg rect[rx="4"]').length,
    lineas: document.querySelectorAll('svg polyline').length,
  }));
  ok(marcas.svgs >= 3, `${marcas.svgs} gráficas dibujadas`);
  ok(marcas.barras > 20, `${marcas.barras} columnas con datos`);
  ok(marcas.lineas >= 2, `${marcas.lineas} líneas (el día y su promedio)`);

  // El texto nunca lleva el color de la serie.
  const textoColoreado = await pag.evaluate(() => {
    const serie = ['rgb(196, 98, 45)', 'rgb(42, 120, 214)', 'rgb(27, 175, 122)'];
    return [...document.querySelectorAll('svg text')]
      .filter((t) => serie.includes(getComputedStyle(t).fill)).length;
  });
  ok(textoColoreado === 0, 'ninguna etiqueta usa el color de la serie');

  const cr = await cambiosPintados(pag);
  ok(cr.total > 0 && cr.coloreados === cr.total,
     `los ${cr.total} cambios van en verde o rojo${cr.grises.length ? ' — grises: ' + cr.grises.join(' | ') : ''}`);

  ok(errores.length === 0, `sin errores${errores.length ? ': ' + errores[0] : ''}`);
  await pag.screenshot({ path: '/tmp/dc_resumen.png', fullPage: true });

  // ─── productos ──
  console.log('\nProductos');
  await pag.click('#tab-productos');
  await pag.waitForTimeout(400);
  await pag.waitForTimeout(900);   // pide los agregados del rango
  const tp = await pag.locator('body').innerText();
  ok(/Gorditas/.test(tp), 'aparece el producto más vendido');
  ok(/dinero dejan/i.test(tp) && /más se venden/i.test(tp), 'están las dos listas');
  ok(/enfriaron/i.test(tp) && /calentaron/i.test(tp), 'están los que suben y los que bajan');
  ok(/Ver los números/.test(tp), 'también traen tabla de números');
  ok(!/Cargando/.test(tp), 'terminó de cargar');
  const cp = await cambiosPintados(pag);
  ok(cp.total > 0 && cp.coloreados === cp.total,
     `los ${cp.total} cambios van en verde o rojo${cp.grises.length ? ' — grises: ' + cp.grises.join(' | ') : ''}`);
  await pag.screenshot({ path: '/tmp/dc_productos.png', fullPage: true });

  // ─── guisados ──
  console.log('\nGuisados');
  await pag.click('#tab-guisados');
  await pag.waitForTimeout(400);
  await pag.waitForTimeout(900);
  const tg = await pag.locator('body').innerText();
  ok(/Deshebrada/.test(tg), 'aparece el guisado principal');
  ok(/Participación/i.test(tg), 'está la participación del periodo');
  ok(!/Cargando/.test(tg), 'terminó de cargar');
  const series = await pag.evaluate(() =>
    document.querySelectorAll('svg polyline').length);
  ok(series >= 5, `${series} series en la gráfica de movimiento`);
  ok(/pts/.test(tg), 'el movimiento de participación se mide en puntos, no en %');
  const cg = await cambiosPintados(pag);
  ok(cg.total > 0 && cg.coloreados === cg.total,
     `los ${cg.total} cambios van en verde o rojo${cg.grises.length ? ' — grises: ' + cg.grises.join(' | ') : ''}`);
  ok(errores.length === 0, `sin errores${errores.length ? ': ' + errores[0] : ''}`);
  await pag.screenshot({ path: '/tmp/dc_guisados.png', fullPage: true });

  // ─── cambiar de periodo ──
  console.log('\nCambiar de periodo');
  await pag.click('#tab-resumen');
  await pag.waitForTimeout(300);
  await pag.click('button:has-text("Mes pasado")');
  await pag.waitForTimeout(500);
  const tm = await pag.locator('body').innerText();
  ok(/1 al 31 de agosto 2026/.test(tm), 'el mes pasado va del 1 al 31 de agosto');
  ok(/\$677,313|\$678,993/.test(tm), 'y sus ingresos son los del histórico');
  ok(!/va a la mitad/.test(tm), 'un mes cerrado no se marca como en curso');

  await pag.click('button:has-text("Últimos 3 meses")');
  await pag.waitForTimeout(500);
  const t3 = await pag.locator('body').innerText();
  ok(/90 días/.test(t3), 'tres meses son 90 días');
  ok(/periodo anterior/i.test(t3), 'se compara contra los 90 días anteriores');

  await pag.screenshot({ path: '/tmp/dc_trimestre.png', fullPage: true });
  await pag.close();
}

// ─── celular ─────────────────────────────────────────────────────────────────
{
  const { pag, errores } = await abrir(390, 844);
  console.log('\nCelular 390×844');

  const desborde = await pag.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  ok(!desborde, 'no se desborda a lo ancho');

  // Las gráficas tienen que encoger, no cortarse.
  const anchoSvg = await pag.evaluate(() => {
    const s = document.querySelector('svg');
    return s ? s.getBoundingClientRect().width : 0;
  });
  ok(anchoSvg > 0 && anchoSvg <= 390,
     `la gráfica mide ${Math.round(anchoSvg)}px y cabe en la pantalla`);

  ok(errores.length === 0, `sin errores${errores.length ? ': ' + errores[0] : ''}`);
  await pag.screenshot({ path: '/tmp/dc_celular.png', fullPage: true });
  await pag.close();
}

await navegador.close();
await vite.close();
console.log(fallas ? `\n✗ ${fallas} fallas` : '\n✓ el tablero pinta bien');
process.exit(fallas ? 1 : 0);
