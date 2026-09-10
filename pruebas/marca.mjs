// =============================================================================
// Prueba de la marca
// =============================================================================
//
// Comprueba lo único que puede fallar de un logo puesto por archivo: que el
// archivo exista, que el navegador lo haya decodificado, y que no se haya
// deformado. Un <img> con una ruta mala no truena — se queda en blanco, y en
// una pantalla negra eso no se nota hasta que alguien la abre.
// =============================================================================

import { chromium } from 'playwright';
import { createServer } from 'vite';

const RAIZ = new URL('..', import.meta.url).pathname;
const vite = await createServer({ root: RAIZ, server: { port: 4327 }, logLevel: 'error' });
await vite.listen();

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let fallas = 0;
const ok = (b, t) => { console.log(`  ${b ? '✓' : '✗'} ${t}`); if (!b) fallas++; };

const pag = await navegador.newPage({ viewport: { width: 1100, height: 1400 } });
await pag.goto('http://localhost:4327/pruebas/marca.html', { waitUntil: 'networkidle' });
await pag.waitForTimeout(600);

const imgs = await pag.evaluate(() =>
  [...document.querySelectorAll('img')].map((i) => ({
    src: new URL(i.src).pathname,
    ok: i.complete && i.naturalWidth > 0,
    // Deformado = la proporción en pantalla no es la del archivo.
    deforme: Math.abs(
      (i.getBoundingClientRect().width / i.getBoundingClientRect().height) -
      (i.naturalWidth / i.naturalHeight)) > 0.02,
    alto: Math.round(i.getBoundingClientRect().height),
  })));

console.log('\nLos archivos');
ok(imgs.length >= 4, `${imgs.length} logos en las cuatro superficies`);
for (const i of imgs) {
  ok(i.ok, `${i.src} cargó (${i.alto}px de alto)`);
  ok(!i.deforme, `${i.src} conserva su proporción`);
}
ok(imgs.some((i) => i.src.includes('isotipo')), 'el isotipo va en el encabezado angosto');
ok(imgs.some((i) => i.src.includes('imagotipo.png')), 'el imagotipo va en el ancho');
ok(imgs.filter((i) => i.src.includes('vertical')).length === 2,
   'el vertical va en carga y en entrada');

// Que quepa: el encabezado de celular no puede desbordarse por meterle un logo.
const desborde = await pag.evaluate(() => {
  const c = document.querySelector('#cab-angosta');
  return c ? c.scrollWidth > c.clientWidth + 1 : true;
});
ok(!desborde, 'el encabezado de celular no se desborda con el isotipo');

await pag.screenshot({ path: '/tmp/dc_marca.png', fullPage: true });

// El encabezado de celular, a su ancho real y recortado, para poder mirarlo.
const angosta = await pag.$('#cab-angosta');
if (angosta) await angosta.screenshot({ path: '/tmp/dc_cab_celular.png' });
await navegador.close();
await vite.close();
console.log(fallas ? `\n✗ ${fallas} fallas` : '\n✓ la marca se ve donde debe');
process.exit(fallas ? 1 : 0);
