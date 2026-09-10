// =============================================================================
// Prueba: ¿el parser del navegador da exactamente lo mismo que el de Python?
//
// No basta con que corra sin errores. Lo que hay que demostrar es que los
// 138,762 renglones y los 159,026 modificadores que ya están en Supabase se
// reproducen renglón por renglón desde el mismo xlsx.
//
// Si esto no pasa, la importación mensual metería datos que no cuadran con el
// histórico y nadie se daría cuenta hasta meses después.
// =============================================================================

import XLSX from 'xlsx';
import fs from 'node:fs';
import { armarCatalogos, procesar } from './poster.js';

const BASE = '/home/claude/doncomal';

// ─── catálogos, tal como los tiene Supabase ──────────────────────────────────

function leerCSV(ruta) {
  const texto = fs.readFileSync(ruta, 'utf-8');
  const filas = [];
  let campo = '', fila = [], entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else entreComillas = false;
      } else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  const cols = filas.shift();
  return filas.filter((f) => f.length === cols.length)
    .map((f) => Object.fromEntries(cols.map((c, i) => [c, f[i]])));
}

const filasMods = leerCSV(`${BASE}/supabase_csv/dc_cat_modificadores.csv`)
  .map((r) => ({ ...r, activo: r.activo === 'true' }));
const filasProds = leerCSV(`${BASE}/supabase_csv/dc_cat_productos.csv`)
  .map((r) => ({ ...r, activo: r.activo === 'true' }))
  // El catálogo dice 'Servicio' para el producto de envío, pero los 757
  // renglones que ya están cargados dicen 'Servicio a domicilio': el pipeline
  // de Python lo sobreescribía a mano. En vez de arrastrar ese caso especial
  // dentro del parser, se corrige el catálogo — es un UPDATE de un renglón.
  // Esto simula ese UPDATE para poder comparar.
  .map((r) => (r.producto === 'Servicio a Dom.'
    ? { ...r, familia: 'Servicio a domicilio' } : r));
const catalogos = armarCatalogos(filasMods, filasProds);

console.log(`Catálogos: ${Object.keys(catalogos.mods).length} modificadores, ` +
            `${Object.keys(catalogos.prods).length} productos\n`);

// ─── se procesan los cuatro años, igual que el pipeline ──────────────────────

function matriz(ruta) {
  const wb = XLSX.readFile(ruta, { raw: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
}

const inicio = Date.now();
const todoDetalle = [], todoMods = [];
const sinClasificar = {}, productosNuevos = {};

for (const anio of [2023, 2024, 2025, 2026]) {
  const r = procesar({
    matrizProductos: matriz(`${BASE}/entrada/productos/productos_${anio}.xlsx`),
    matrizVentas: null,
    catalogos,
    archivo: `productos_${anio}.xlsx`,
  });
  if (r.error) { console.error(`${anio}: ${r.error}`); process.exit(1); }
  // `_k` se reinicia en cada mes, porque el servidor reserva un bloque de id
  // por llamada. Aquí se juntan todos los meses, así que hay que reetiquetar
  // para que la llave sea única en el conjunto completo.
  for (const mes of r.meses) {
    const base = todoDetalle.length;
    for (const d of mes.detalle) todoDetalle.push({ ...d, _k: base + d._k });
    for (const m of mes.mods) todoMods.push({ ...m, _d: base + m._d });
  }
  for (const [k, v] of Object.entries(r.sinClasificar))
    sinClasificar[k] = (sinClasificar[k] || 0) + v;
  for (const [k, v] of Object.entries(r.productosNuevos))
    productosNuevos[k] = (productosNuevos[k] || 0) + v;
  console.log(`  ${anio}: ${r.totales.renglones.toLocaleString('es-MX')} renglones, ` +
              `${r.meses.length} meses`);
}
const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
console.log(`\nProcesado en ${segundos} s\n`);

// ─── contra lo que produjo Python ────────────────────────────────────────────

const espDetalle = leerCSV(`${BASE}/supabase_csv/dc_ventas_detalle.csv`);
const espMods = leerCSV(`${BASE}/supabase_csv/dc_ventas_modificadores.csv`);

let fallas = 0;
function comprobar(etiqueta, obtenido, esperado) {
  const ok = String(obtenido) === String(esperado);
  if (!ok) fallas++;
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta.padEnd(34)} ${
    String(obtenido).padStart(14)}   esperado ${String(esperado).padStart(14)}`);
}

const n = (x) => Math.round(x * 100) / 100;
const suma = (arr, f) => n(arr.reduce((s, r) => s + f(r), 0));

console.log('Totales');
comprobar('renglones de detalle', todoDetalle.length, espDetalle.length);
comprobar('modificadores', todoMods.length, espMods.length);
comprobar('unidades', suma(todoDetalle, (r) => r.cantidad),
                      suma(espDetalle, (r) => +r.cantidad));
comprobar('ingresos', suma(todoDetalle, (r) => r.ingresos),
                      suma(espDetalle, (r) => +r.ingresos));
comprobar('ventas brutas', suma(todoDetalle, (r) => r.ventas_brutas),
                           suma(espDetalle, (r) => +r.ventas_brutas));
comprobar('piezas equivalentes', suma(todoDetalle, (r) => r.piezas_equivalentes),
                                 suma(espDetalle, (r) => +r.piezas_equivalentes));

console.log('\nModificadores por tipo');
const porTipo = (arr) => arr.reduce((a, r) => (a[r.tipo] = (a[r.tipo] || 0) + 1, a), {});
const tipoObt = porTipo(todoMods), tipoEsp = porTipo(espMods);
for (const t of [...new Set([...Object.keys(tipoObt), ...Object.keys(tipoEsp)])].sort())
  comprobar(t, tipoObt[t] || 0, tipoEsp[t] || 0);

// ─── comparación renglón por renglón ─────────────────────────────────────────
//
// Los totales pueden cuadrar por casualidad compensándose entre sí. Esto
// compara cada renglón en el mismo orden, campo por campo.

// El orden no tiene por qué coincidir: el parser agrupa por mes y Python
// conservaba el orden del archivo, que Poster entrega del día más reciente
// hacia atrás. Lo que sí tiene que coincidir es el CONJUNTO de renglones, con
// sus repeticiones — (fecha, producto, modificación) no es llave única: hay 66
// renglones que se repiten de verdad. Por eso se compara como multiconjunto:
// cada renglón completo se serializa y se cuentan las apariciones.

console.log('\nRenglón por renglón (como multiconjunto)');
const CAMPOS = ['fecha', 'periodo', 'producto', 'familia', 'unidad_venta',
                'modificacion_original', 'cantidad', 'piezas_equivalentes',
                'ventas_brutas', 'ingresos', 'precio_unitario',
                'n_guisados', 'n_extras', 'n_peticiones'];

const CAMPOS_MOD = ['fecha', 'periodo', 'producto', 'tipo', 'valor',
                    'token_original', 'multiplicador', 'posicion'];

/** Serializa un renglón a texto, normalizando los números para que 19 y 19.00 sean iguales. */
function serializar(r, campos) {
  return campos.map((c) => {
    const v = r[c];
    if (v === null || v === undefined || v === '') return '';
    const num = typeof v === 'number' ? v : (/^-?\d*\.?\d+$/.test(String(v).trim()) ? +v : null);
    return num === null ? String(v) : String(n(num));
  }).join('');
}

function multiconjunto(arr, campos) {
  const m = new Map();
  for (const r of arr) {
    const k = serializar(r, campos);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function compararConjuntos(etiqueta, obtenidos, esperados, campos) {
  const a = multiconjunto(obtenidos, campos);
  const b = multiconjunto(esperados, campos);
  let sobran = 0, faltan = 0;
  const ejemplos = [];
  for (const [k, c] of a) {
    const d = c - (b.get(k) || 0);
    if (d > 0) {
      sobran += d;
      if (ejemplos.length < 3) ejemplos.push(`    sobra  ${k.split('').join(' · ')}`);
    }
  }
  for (const [k, c] of b) {
    const d = c - (a.get(k) || 0);
    if (d > 0) {
      faltan += d;
      if (ejemplos.length < 6) ejemplos.push(`    falta  ${k.split('').join(' · ')}`);
    }
  }
  comprobar(etiqueta, `${sobran} sobran / ${faltan} faltan`, '0 sobran / 0 faltan');
  ejemplos.forEach((e) => console.log(e));
}

compararConjuntos('detalle', todoDetalle, espDetalle, CAMPOS);
compararConjuntos('modificadores', todoMods, espMods, CAMPOS_MOD);

// Los modificadores tienen que seguir colgando del renglón correcto. Se
// comprueba comparando, para cada renglón, la lista de tokens que le tocó.
console.log('\nAmarre modificador → renglón');
function firmaPorRenglon(detalle, mods, llaveDetalle, llavePadre) {
  const porD = new Map();
  for (const m of mods) {
    const k = m[llavePadre];
    if (!porD.has(k)) porD.set(k, []);
    porD.get(k).push(`${m.tipo}:${m.valor}:${m.multiplicador}:${m.posicion}`);
  }
  const m = new Map();
  for (const d of detalle) {
    const tokens = (porD.get(d[llaveDetalle]) || []).slice().sort().join('|');
    const k = `${d.fecha}${d.producto}${n(d.cantidad ?? +d.cantidad)}${tokens}`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}
const firmaObt = firmaPorRenglon(todoDetalle, todoMods, '_k', '_d');
const firmaEsp = firmaPorRenglon(espDetalle, espMods, 'id', 'detalle_id');
let malAmarrados = 0;
const ejAmarre = [];
for (const [k, c] of firmaEsp) {
  const d = c - (firmaObt.get(k) || 0);
  if (d > 0) {
    malAmarrados += d;
    if (ejAmarre.length < 3) ejAmarre.push(`    ${k.split('').join(' · ')}`);
  }
}
comprobar('renglones con sus tokens correctos',
          espDetalle.length - malAmarrados, espDetalle.length);
ejAmarre.forEach((e) => console.log(e));

// ─── lo que no se clasificó ──────────────────────────────────────────────────

console.log('\nSin clasificar');
const nSin = Object.keys(sinClasificar).length;
const nNuevos = Object.keys(productosNuevos).length;
console.log(`  modificadores desconocidos: ${nSin}`);
console.log(`  productos fuera del catálogo: ${nNuevos}`);
if (nSin) console.log('  ' + Object.entries(sinClasificar).slice(0, 10)
  .map(([k, v]) => `${k} (${v})`).join(', '));
if (nNuevos) console.log('  ' + Object.entries(productosNuevos).slice(0, 10)
  .map(([k, v]) => `${k} (${v})`).join(', '));

console.log(fallas === 0
  ? '\n✓ El parser del navegador reproduce el pipeline de Python.'
  : `\n✗ ${fallas} comprobaciones fallaron. No subir nada hasta arreglarlo.`);
process.exit(fallas === 0 ? 0 : 1);
