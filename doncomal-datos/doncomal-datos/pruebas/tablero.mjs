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
  const cardCat = await pag.$('h3:has-text("De dónde sale el dinero")');
  if (cardCat) await (await cardCat.evaluateHandle((h) => h.parentElement))
    .asElement().screenshot({ path: '/tmp/dc_categorias.png' });

  // ─── categorías ──
  //
  // Lo único que puede estar mal aquí de forma peligrosa es que las categorías
  // no sumen el total: si un producto se cae del corte por no estar
  // clasificado, la pantalla enseña un reparto que no cuadra con la cifra de
  // arriba y nadie lo nota. Por eso se comprueba la suma, no que "aparezca".
  console.log('\nCategorías');
  const cat = await pag.evaluate(() => {
    const t = document.body.innerText;
    return {
      hayReparto: /De dónde sale el dinero/.test(t),
      secciones: ['Clásicos', 'Antojitos', 'Platillos', 'Postres', 'Bebidas', 'Extras']
        .filter((c) => t.includes(c)),
      sinClasificar: /Sin categoría/.test(t),
    };
  });
  ok(cat.hayReparto, 'está el reparto por sección del menú');
  ok(cat.secciones.length === 6,
     `están las seis secciones (${cat.secciones.join(', ')})`);
  ok(!cat.sinClasificar, 'ningún producto quedó sin clasificar');

  // Ningún color repetido entre secciones: dos barras iguales se leen como la
  // misma cosa. Con más secciones que colores, las de más van en gris.
  const colores = await pag.evaluate(() => {
    const h = [...document.querySelectorAll('h3')]
      .find((x) => x.textContent === 'De dónde sale el dinero');
    return [...h.parentElement.querySelectorAll('div[style*="width"]')]
      .map((d) => getComputedStyle(d).backgroundColor)
      .filter((c) => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'rgb(243, 237, 232)');
  });
  const repes = colores.filter((c, i) => colores.indexOf(c) !== i && c !== 'rgb(188, 173, 162)');
  ok(repes.length === 0,
     `los ${colores.length} colores de sección son distintos${repes.length ? ' — repetido: ' + repes[0] : ''}`);

  // La suma de las secciones tiene que dar el total del periodo. La tabla
  // viene cerrada, así que primero hay que abrirla — igual que haría Octavio.
  await pag.evaluate(() => {
    const h = [...document.querySelectorAll('h3')]
      .find((x) => x.textContent === 'De dónde sale el dinero');
    h?.parentElement?.querySelector('button')?.click();
  });
  await pag.waitForTimeout(300);

  const cuadra = await pag.evaluate(() => {
    const num = (t) => +String(t).replace(/[^0-9.-]/g, '');
    const h = [...document.querySelectorAll('h3')]
      .find((x) => x.textContent === 'De dónde sale el dinero');
    const tabla = h?.parentElement?.querySelector('table');
    if (!tabla) return null;
    const cols = [...tabla.querySelectorAll('thead th')].map((t) => t.textContent.trim());
    const i = cols.indexOf('Ingresos');
    const suma = [...tabla.querySelectorAll('tbody tr')]
      .reduce((s, tr) => s + num(tr.children[i].textContent), 0);
    // El total del periodo es la cifra grande rotulada 'Ingresos' de arriba.
    const et = [...document.querySelectorAll('div')]
      .find((d) => d.textContent.trim() === 'Ingresos' && d.children.length === 0);
    const total = num(et?.nextElementSibling?.textContent || 0);
    return { suma: Math.round(suma), total: Math.round(total), secciones: cols.length };
  });
  ok(cuadra && cuadra.total > 0 && Math.abs(cuadra.suma - cuadra.total) <= 1,
     cuadra ? `las secciones suman $${cuadra.suma.toLocaleString()} y el periodo $${cuadra.total.toLocaleString()}`
            : 'no se encontró la tabla de categorías');

  // Filtrar por una sección recorta la lista completa.
  await pag.click('button:has-text("Bebidas")');
  await pag.waitForTimeout(500);
  const tb = await pag.locator('body').innerText();
  ok(/Bebidas · \d+ productos/.test(tb), 'el filtro recorta a una sección');
  ok(/Café con Leche/.test(tb) && !/Gorditas\b/.test(tb.split('Bebidas ·')[1] || ''),
     'y solo enseña productos de esa sección');
  await pag.click('button:has-text("Todo el menú")');
  await pag.waitForTimeout(400);
  const tt = await pag.locator('body').innerText();
  ok(/Todos los productos \(\d+\)/.test(tt), 'y se puede volver al menú completo');

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

  // ─── extras que van dentro del platillo ──
  //
  // Lo peligroso aquí no es que no salga: es que salga MAL y parezca bien.
  // Dos cosas se comprueban por eso:
  //
  //   · Que el dinero de los extras NO se sume al reparto por sección. Ya está
  //     contado dentro del platillo; sumarlo sería contarlo dos veces y el
  //     total del periodo dejaría de cuadrar sin que nada lo dijera.
  //   · Que el queso de las empanadas quede apartado. Queso y Frijoles son
  //     guisado en unos productos y extra en otros; cuando la regla los
  //     etiqueta mal salen como "nunca se cobra", y leído a la ligera eso
  //     parece dinero que no cobraste. No lo es.
  console.log('\nExtras dentro del platillo');
  await pag.click('#tab-productos');
  await pag.waitForTimeout(400);
  await pag.click('button:has-text("Todo el menú")');
  await pag.waitForTimeout(1400);

  const tx = await pag.locator('body').innerText();
  ok(/Extras que van dentro del platillo/.test(tx), 'está la tarjeta de extras');
  ok(/Bistec/.test(tx), 'aparece el extra más pedido');
  ok(/no se suma a tus ventas/i.test(tx),
     'dice explícitamente que ese dinero ya está contado');
  // innerText devuelve el texto YA transformado por CSS, y estos rótulos van en
  // versalitas: en pantalla dicen "COBRADO (ESTIMADO)". Sin la 'i' la prueba
  // falla por mayúsculas y parece que falta la cifra.
  ok(/Porciones/i.test(tx) && /Cobrado \(estimado\)/i.test(tx),
     'trae porciones y el cobro estimado');

  // El precio estimado tiene que ser el real, no cualquier número.
  //
  // Se lee del RENGLÓN, no de una expresión regular sobre todo el texto: la
  // primera versión buscaba "Bistec ... $N c/u" en el innerText completo y,
  // cuando cambió la maqueta, se trajo el precio del renglón de abajo. Una
  // prueba que agarra el dato equivocado es peor que ninguna.
  const bistec = await pag.evaluate(() => {
    const h = [...document.querySelectorAll('h3')]
      .find((x) => x.textContent === 'Extras que van dentro del platillo');
    if (!h) return null;
    for (const fila of h.parentElement.children) {
      const nombre = fila.querySelector?.('span')?.textContent || '';
      if (!nombre.startsWith('Bistec (1 pza.)')) continue;
      // El precio puede venir como rango ("$5–8 c/u") cuando el mismo extra
      // cuesta distinto según el platillo. Aquí se espera uno solo.
      const m = fila.textContent.match(/\$([\d,]+)(–[\d,]+)? c\/u/);
      if (m && m[2]) return `rango ${m[0]}`;
      return m ? +m[1].replace(/,/g, '') : 'sin precio';
    }
    return 'no se encontró el renglón';
  });
  ok(bistec === 102, `el bistec sale a $${bistec} (el precio real de 2026)`);

  // El total del periodo NO puede incluir el dinero de los extras. Hay que
  // volver a abrir la tabla: cambiar de pestaña desmonta el desplegable.
  await pag.evaluate(() => {
    const h = [...document.querySelectorAll('h3')]
      .find((x) => x.textContent === 'De dónde sale el dinero');
    h?.parentElement?.querySelector('button')?.click();
  });
  await pag.waitForTimeout(300);
  const sigueCuadrando = await pag.evaluate(() => {
    const num = (t) => +String(t).replace(/[^0-9.-]/g, '');
    const h = [...document.querySelectorAll('h3')]
      .find((x) => x.textContent === 'De dónde sale el dinero');
    const tabla = h?.parentElement?.querySelector('table');
    if (!tabla) return null;
    const cols = [...tabla.querySelectorAll('thead th')].map((t) => t.textContent.trim());
    const i = cols.indexOf('Ingresos');
    const suma = [...tabla.querySelectorAll('tbody tr')]
      .reduce((s, tr) => s + num(tr.children[i].textContent), 0);
    const et = [...document.querySelectorAll('div')]
      .find((d) => d.textContent.trim() === 'Ingresos' && d.children.length === 0);
    return { suma: Math.round(suma), total: Math.round(num(et?.nextElementSibling?.textContent || 0)) };
  });
  ok(sigueCuadrando && Math.abs(sigueCuadrando.suma - sigueCuadrando.total) <= 1,
     'el dinero de los extras NO se sumó al reparto por sección');

  // El queso de las empanadas: apartado, no contado como fuga.
  const queso = await pag.evaluate(() => {
    const t = document.body.innerText;
    const i = t.indexOf('parecen guiso');
    return { hayBloque: i >= 0, texto: i >= 0 ? t.slice(i, i + 400) : '' };
  });
  ok(queso.hayBloque, 'los que parecen guiso van en su propio bloque');
  ok(/Queso/.test(queso.texto),
     'y el queso mal etiquetado está ahí, no entre los extras cobrados');

  // Los cuatro términos del huevo estrellado, bajo un solo nombre y con su
  // desplegable. Separados, cada uno cae al séptimo u octavo lugar; juntos son
  // de los que más se piden, que es justo la información que se perdía.
  const huevo = await pag.evaluate(() => {
    const h = [...document.querySelectorAll('h3')]
      .find((x) => x.textContent === 'Extras que van dentro del platillo');
    for (const fila of h.parentElement.children) {
      const n = fila.querySelector?.('span')?.textContent || '';
      if (n === 'Huevo Estrellado') {
        return { texto: fila.textContent.slice(0, 160),
                 tieneBoton: /Ver los \d+ términos/.test(fila.textContent) };
      }
    }
    return null;
  });
  ok(huevo && huevo.tieneBoton,
     huevo ? 'el huevo estrellado va agrupado y se puede abrir'
           : 'no se agrupó el huevo estrellado');

  await pag.evaluate(() => {
    const h = [...document.querySelectorAll('h3')]
      .find((x) => x.textContent === 'Extras que van dentro del platillo');
    for (const fila of h.parentElement.children) {
      if ((fila.querySelector?.('span')?.textContent || '') === 'Huevo Estrellado') {
        fila.querySelector('button')?.click();
        return;
      }
    }
  });
  await pag.waitForTimeout(300);
  const terminos = await pag.locator('body').innerText();
  ok(/Huevo Estrellado (Medio|Tierno|Cocido|Ciego)/.test(terminos),
     'y adentro están los términos de cocción');

  // El guiso que pasa de los incluidos. En un clásico el segundo se cobra; en
  // una migada no, porque su precio ya trae dos — eso lo puso Octavio y los
  // datos coinciden (97.5% contra 13-19%).
  const guisoDeMas = await pag.evaluate(() => {
    const t = document.body.innerText;
    return {
      hay: /guiso de más/.test(t),
      migada: /Migada/.test(t.slice(t.indexOf('Extras que van dentro'))),
    };
  });
  ok(guisoDeMas.hay, 'el guiso que pasa de los incluidos se cuenta como extra');
  ok(!guisoDeMas.migada,
     'y la migada no aparece: su precio ya incluye dos guisados');

  await pag.screenshot({ path: '/tmp/dc_extras.png', fullPage: true });
  const cardEx = await pag.$('h3:has-text("Extras que van dentro del platillo")');
  if (cardEx) await (await cardEx.evaluateHandle((h) => h.parentElement))
    .asElement().screenshot({ path: '/tmp/dc_extras_card.png' });

  // ─── catálogo ──
  console.log('\nCatálogo');
  await pag.click('#tab-catalogo');
  await pag.waitForTimeout(800);
  const tc = await pag.locator('body').innerText();
  ok(/Cómo va repartido el menú/.test(tc), 'está el reparto del catálogo');
  // Singular Y plural: la primera versión decía /no tienen.*categoría/ y dejó
  // pasar "1 producto no tiene categoría" — el aviso estaba en pantalla, en
  // rojo, y la prueba dijo que todo bien. Un producto sin clasificar era real.
  ok(!/no (tiene|tienen) .*categoría/.test(tc),
     'no hay aviso de productos sin clasificar');

  const menus = await pag.locator('select').count();
  ok(menus > 50, `${menus} productos con su menú de categoría`);

  // Reclasificar: cambiar un producto y ver que se guarda y que el cambio
  // llega al tablero.
  //
  // El nombre se compara EXACTO contra el primer renglón de la fila. Buscar por
  // 'empieza con Gorditas' encontraría 'Gorditas de Azúcar', que ya es Postres,
  // y la prueba pasaría sin haber cambiado nada — una prueba que se engaña sola
  // es peor que no tenerla.
  await pag.addScriptTag({ content: `
    window.__menuDe = (nombre) => [...document.querySelectorAll('select')]
      .find((s) => s.parentElement.firstElementChild
                    ?.firstElementChild?.textContent === nombre);
  ` });

  const catAntes = await pag.evaluate(() => window.__menuDe('Gorditas')?.value ?? null);
  await pag.evaluate(() => {
    const s = window.__menuDe('Gorditas');
    s.value = 'Postres';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await pag.waitForTimeout(600);
  const catDespues = await pag.evaluate(() => window.__menuDe('Gorditas')?.value ?? null);
  ok(catAntes === 'Clásicos' && catDespues === 'Postres',
     `reclasificar guarda (${catAntes} → ${catDespues})`);

  // Y lo que de verdad importa: el cambio llega al tablero de inmediato, sin
  // volver a importar. Filtrando Productos por Postres tiene que salir ahí.
  await pag.click('#tab-productos');
  await pag.waitForTimeout(1200);
  await pag.click('button:has-text("Postres")');
  await pag.waitForTimeout(500);
  const enPostres = await pag.locator('body').innerText();
  ok(/Postres · \d+ productos/.test(enPostres) && /Gorditas/.test(enPostres),
     'y el tablero ya las cuenta en Postres, sin volver a importar nada');

  // Se dejan como estaban, para no ensuciar lo que sigue.
  await pag.click('#tab-catalogo');
  await pag.waitForTimeout(800);
  await pag.addScriptTag({ content: `
    window.__menuDe = (nombre) => [...document.querySelectorAll('select')]
      .find((s) => s.parentElement.firstElementChild
                    ?.firstElementChild?.textContent === nombre);
  ` });
  await pag.evaluate(() => {
    const s = window.__menuDe('Gorditas');
    s.value = 'Clásicos';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await pag.waitForTimeout(500);
  await pag.screenshot({ path: '/tmp/dc_catalogo.png', fullPage: true });

  // ─── cambiar de periodo ──
  console.log('\nCambiar de periodo');
  await pag.click('#tab-resumen');
  await pag.waitForTimeout(400);
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
