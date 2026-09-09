// =============================================================================
// Prueba en un navegador de verdad
// =============================================================================
//
// Dos cosas que solo se pueden comprobar aquí y no en Node:
//
//   1. Que la app pinte sin errores en una pantalla de celular y no se
//      desborde a lo ancho.
//   2. Que el parser dé el MISMO resultado leyendo un File del navegador que
//      leyendo el archivo desde el disco. XLSX.read sobre un ArrayBuffer y
//      XLSX.readFile no son el mismo camino, y la diferencia se vería como
//      renglones perdidos en la importación real.
// =============================================================================

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname;
const DATOS = '/home/claude/doncomal';

const vite = await createServer({
  root: RAIZ,
  server: { port: 4321 },
  logLevel: 'error',
});
await vite.listen();

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let fallas = 0;
const ok = (b, t) => { console.log(`  ${b ? '✓' : '✗'} ${t}`); if (!b) fallas++; };

// Las tipografías de Google no cargan en este entorno (sale por un proxy) y
// eso no es un fallo de la app. Se ignoran esas peticiones para que el resto
// de los errores sí se vean.
const esRuidoDelEntorno = (t) =>
  /fonts\.googleapis|fonts\.gstatic|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED/.test(t) ||
  // El único recurso externo de la app son las tipografías. Si no cargan, el
  // navegador reporta un error genérico sin decir de qué recurso: como no hay
  // ningún otro, se puede dar por hecho que es ese.
  /Failed to load resource/.test(t);

// ─── 1 · la pantalla de entrada ──────────────────────────────────────────────
{
  const pag = await navegador.newPage({ viewport: { width: 390, height: 844 } });
  const errores = [];
  pag.on('pageerror', (e) => errores.push(e.message));
  pag.on('console', (m) => {
    if (m.type() === 'error' && !esRuidoDelEntorno(m.text())) errores.push(m.text());
  });

  await pag.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await pag.waitForTimeout(700);

  console.log('\nPantalla de entrada (iPhone 390×844)');
  ok(await pag.locator('h1:has-text("Don Comal")').isVisible(), 'se ve el título');
  ok(await pag.locator('input[type=email]').isVisible(), 'hay campo de correo');
  ok(await pag.locator('input[type=password]').isVisible(), 'hay campo de contraseña');
  ok(await pag.locator('button:has-text("Entrar")').isVisible(), 'hay botón de entrar');

  const desborde = await pag.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  ok(!desborde, 'no se desborda a lo ancho');

  // Los campos tienen que ser cómodos de tocar con el dedo.
  const alto = await pag.locator('input[type=email]').evaluate((e) => e.offsetHeight);
  ok(alto >= 44, `el campo mide ${alto}px de alto (mínimo cómodo: 44)`);

  await pag.locator('button:has-text("Entrar")').click();
  await pag.waitForTimeout(300);
  ok(await pag.locator('text=Faltan el correo').isVisible(), 'valida los campos vacíos');

  ok(errores.length === 0,
     `sin errores de JavaScript${errores.length ? ': ' + errores[0] : ''}`);

  await pag.screenshot({ path: '/tmp/dc_entrar.png' });
  await pag.close();
}

// ─── 2 · el parser leyendo un File del navegador ─────────────────────────────
{
  const pag = await navegador.newPage();
  const errores = [];
  pag.on('pageerror', (e) => errores.push(e.message));
  await pag.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

  console.log('\nParser dentro del navegador');

  const xlsxB64 = readFileSync(
    `${DATOS}/entrada/productos/productos_2026.xlsx`).toString('base64');
  const csvMods = readFileSync(`${DATOS}/supabase_csv/dc_cat_modificadores.csv`, 'utf-8');
  const csvProds = readFileSync(`${DATOS}/supabase_csv/dc_cat_productos.csv`, 'utf-8');

  const r = await pag.evaluate(async ({ xlsxB64, csvMods, csvProds }) => {
    const XLSX = await import('/node_modules/xlsx/xlsx.mjs');
    const { armarCatalogos, procesar } = await import('/src/poster.js');

    function leerCSV(t) {
      const filas = []; let campo = '', fila = [], q = false;
      for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (q) { if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; }
        else if (c === '"') q = true;
        else if (c === ',') { fila.push(campo); campo = ''; }
        else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
        else if (c !== '\r') campo += c;
      }
      if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
      const cols = filas.shift();
      return filas.filter((f) => f.length === cols.length)
        .map((f) => Object.fromEntries(cols.map((c, i) => [c, f[i]])));
    }

    const cat = armarCatalogos(
      leerCSV(csvMods).map((x) => ({ ...x, activo: x.activo === 'true' })),
      leerCSV(csvProds).map((x) => ({ ...x, activo: x.activo === 'true' }))
        .map((x) => (x.producto === 'Servicio a Dom.'
          ? { ...x, familia: 'Servicio a domicilio' } : x)));

    // Se arma un File igual que el que produce <input type=file>, para pasar
    // por el mismo camino que la app real: File → arrayBuffer → XLSX.read.
    const bin = atob(xlsxB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const archivo = new File([bytes], 'productos_2026.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const buffer = await archivo.arrayBuffer();
    const wb = XLSX.read(buffer, { raw: true, cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const matriz = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

    const inicio = performance.now();
    const res = procesar({ matrizProductos: matriz, matrizVentas: null,
                           catalogos: cat, archivo: 'productos_2026.xlsx' });
    const ms = Math.round(performance.now() - inicio);

    if (res.error) return { error: res.error };
    const agosto = res.meses.find((m) => m.periodo === '2026-08');
    return {
      ms,
      renglones: res.totales.renglones,
      modificadores: res.totales.modificadores,
      meses: res.meses.length,
      sinClasificar: Object.keys(res.sinClasificar).length,
      productosNuevos: Object.keys(res.productosNuevos).length,
      agostoRenglones: agosto?.detalle.length,
      agostoMods: agosto?.mods.length,
      agostoIngresos: agosto?.ingresos,
      agostoUnidades: agosto?.unidades,
      // Un renglón concreto, para ver que los campos salen bien y no solo los totales.
      muestra: agosto?.detalle.find((d) => d.producto === 'Gorditas'),
    };
  }, { xlsxB64, csvMods, csvProds });

  if (r.error) { ok(false, `el parser falló: ${r.error}`); }
  else {
    ok(r.renglones === 32458, `32,458 renglones (dio ${r.renglones?.toLocaleString('es-MX')})`);
    ok(r.meses === 9, `9 meses (dio ${r.meses})`);
    ok(r.sinClasificar === 0, `nada sin clasificar (dio ${r.sinClasificar})`);
    ok(r.productosNuevos === 0, `ningún producto fuera del catálogo (dio ${r.productosNuevos})`);
    ok(r.agostoRenglones === 4479, `agosto: 4,479 renglones (dio ${r.agostoRenglones})`);
    ok(r.agostoMods === 5533, `agosto: 5,533 modificadores (dio ${r.agostoMods})`);
    ok(r.agostoIngresos === 677313, `agosto: 677,313 de ingresos (dio ${r.agostoIngresos})`);
    ok(r.agostoUnidades === 17278, `agosto: 17,278 unidades (dio ${r.agostoUnidades})`);
    ok(!!r.muestra && r.muestra.familia === 'Gordita',
       `un renglón de Gorditas sale con familia correcta`);
    console.log(`  · el año entero se procesó en ${r.ms} ms dentro del navegador`);
  }
  ok(errores.length === 0,
     `sin errores de JavaScript${errores.length ? ': ' + errores[0] : ''}`);
  await pag.close();
}

await navegador.close();
await vite.close();
console.log(fallas ? `\n✗ ${fallas} fallas` : '\n✓ todo bien');
process.exit(fallas ? 1 : 0);
