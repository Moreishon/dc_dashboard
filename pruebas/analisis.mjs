// =============================================================================
// Prueba del cálculo del tablero
// =============================================================================
//
// Las cifras esperadas no son inventadas: salen del informe anual que se hizo
// con el pipeline de Python, antes de que existiera nada de esta app. Si el
// tablero no las reproduce, el tablero está mal.
// =============================================================================

import fs from 'node:fs';
import {
  totalizar, porTipoDeDia, comparar, porMes, porDiaDeSemana, mediaMovil,
  topProductos, productosFrios, productosCalientes,
  participacionGuisados, evolucionGuisados, extrasDelMes,
  mesAnterior, mesAnioAnterior, diasDelMes, diaSemana,
} from '../src/analisis.js';

const BASE = '/home/claude/doncomal';

function leerCSV(ruta) {
  const t = fs.readFileSync(ruta, 'utf-8');
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

let fallas = 0;
const ok = (b, t) => { console.log(`  ${b ? '✓' : '✗'} ${t}`); if (!b) fallas++; };
const cerca = (a, b, tol = 0.51) => Math.abs(a - b) <= tol;

const dias = leerCSV(`${BASE}/supabase_csv/dc_ventas_dia.csv`);
const prodMes = leerCSV('/tmp/m_producto_mes.csv');
const guisMes = leerCSV('/tmp/m_guisado_mes.csv');
const modMes = leerCSV('/tmp/m_modificador_mes.csv');

console.log(`Datos: ${dias.length} días · ${prodMes.length} producto-mes · ` +
            `${guisMes.length} guisado-mes\n`);

// ─── el día de la semana no se corre ─────────────────────────────────────────
console.log('Fechas');
ok(diaSemana('2026-09-05') === 6, '2026-09-05 es sábado');
ok(diaSemana('2026-01-01') === 4, '2026-01-01 es jueves');
ok(diaSemana('2023-08-21') === 1, '2023-08-21 es lunes');

// ─── totales contra el informe ───────────────────────────────────────────────
console.log('\nTotales de los tres años');
const todo = totalizar(dias);
ok(cerca(todo.ingresos_productos, 18254428.07),
   `ingresos de producto ${todo.ingresos_productos.toLocaleString('es-MX')}`);
ok(cerca(todo.ingreso_envio, 69030.75),
   `ingreso de envío ${todo.ingreso_envio.toLocaleString('es-MX')}`);
ok(todo.dias === 1106, `1,106 días (dio ${todo.dias})`);
ok(cerca(todo.unidades, 539954), `539,954 unidades (dio ${todo.unidades.toLocaleString('es-MX')})`);

// ─── el año fiscal del informe: septiembre a agosto ──────────────────────────
console.log('\nFY2026 (sep-2025 a ago-2026), como en el informe');
const fy = dias.filter((d) => d.fecha >= '2025-09-01' && d.fecha <= '2026-08-31');
const tfy = totalizar(fy);
ok(cerca(tfy.ingresos_productos, 6924780, 1),
   `6,924,780 de ingresos (dio ${Math.round(tfy.ingresos_productos).toLocaleString('es-MX')})`);
ok(cerca(tfy.unidades, 186406, 1),
   `186,406 unidades (dio ${Math.round(tfy.unidades).toLocaleString('es-MX')})`);

// ─── la trampa del calendario ────────────────────────────────────────────────
console.log('\nEnero contra febrero de 2026 — la trampa del calendario');
const cmp = comparar(diasDelMes(dias, '2026-02'), diasDelMes(dias, '2026-01'));
ok(cmp.b.dias === 30 && cmp.a.dias === 28, `enero 30 días, febrero 28`);
ok(cmp.ingresos.crudo < 0, `el total dice que cayó (${cmp.ingresos.crudo}%)`);
ok(cmp.ingresos.porDia > 0, `el promedio diario dice que subió (${cmp.ingresos.porDia}%)`);
ok(cmp.advertencia === 'signo', `se marca la advertencia de signo`);
ok(cerca(cmp.b.promedioDia, 17042, 1), `promedio diario de enero ${cmp.b.promedioDia}`);
ok(cerca(cmp.a.promedioDia, 17595, 1), `promedio diario de febrero ${cmp.a.promedioDia}`);

// ─── la trampa de la composición ─────────────────────────────────────────────
console.log('\nDos semanas del mismo largo, pero con días distintos');
const semA = dias.filter((d) => d.fecha >= '2026-08-31' && d.fecha <= '2026-09-05');
const semB = dias.filter((d) => d.fecha >= '2026-08-25' && d.fecha <= '2026-08-30');
const cs = comparar(semA, semB);
ok(cs.a.dias === 6 && cs.b.dias === 6, 'las dos semanas tienen seis días');
ok(cs.ingresos.crudo === cs.ingresos.porDia,
   `mismo largo, así que total y promedio dicen lo mismo (${cs.ingresos.crudo}%)`);
ok(cs.mismosDias.aplica, 'se detecta que no traen los mismos días de la semana');
ok(cs.mismosDias.sinPareja.includes('domingo') && cs.mismosDias.sinPareja.includes('lunes'),
   `sin pareja: ${cs.mismosDias.sinPareja.join(', ')}`);
ok(Math.abs(cs.mismosDias.pct) < Math.abs(cs.ingresos.crudo),
   `día con día la caída es ${cs.mismosDias.pct}%, no ${cs.ingresos.crudo}%`);
ok(cerca(cs.mismosDias.pct, -8.6, 0.1), 'y vale −8.6%');

// ─── consistencia interna ────────────────────────────────────────────────────
console.log('\nConsistencia');
const meses = porMes(dias);
ok(meses.length === 38, `38 meses (dio ${meses.length})`);
ok(cerca(meses.reduce((s, m) => s + m.ingresos, 0), todo.ingresos, 1),
   'los meses suman el total');
const dow = porDiaDeSemana(dias);
ok(cerca(dow.reduce((s, d) => s + d.total, 0), todo.ingresos, 1),
   'los días de la semana suman el total');
ok(dow.reduce((s, d) => s + d.dias, 0) === 1106, 'los días de la semana suman 1,106');
const tipo = porTipoDeDia(dias);
ok(cerca(tipo.fuerte + tipo.normal, todo.ingresos, 1),
   `fuertes + normales = total (fin de semana: ${tipo.participacionFuerte}%)`);
ok(tipo.promedioFuerte > tipo.promedioNormal,
   `un día fuerte vende más (${Math.round(tipo.promedioFuerte).toLocaleString('es-MX')} contra ` +
   `${Math.round(tipo.promedioNormal).toLocaleString('es-MX')})`);

const mm = mediaMovil(dias, 30);
ok(mm.length === 1106, 'la media móvil cubre todos los días');
ok(mm.slice(0, 29).every((p) => p.media === null),
   'los primeros 29 días no tienen media, y salen en null');
ok(mm[29].media !== null, 'el día 30 ya tiene media');

// ─── productos ───────────────────────────────────────────────────────────────
console.log('\nProductos (agosto 2026)');
const topDinero = topProductos(prodMes, '2026-08', 'ingresos', 5);
const topVolumen = topProductos(prodMes, '2026-08', 'unidades', 5);
ok(topDinero.length === 5, `top por dinero: ${topDinero.map((p) => p.producto).join(', ')}`);
ok(topVolumen.length === 5, `top por volumen: ${topVolumen.map((p) => p.producto).join(', ')}`);
ok(topDinero[0].producto !== topVolumen[0].producto ||
   topDinero.map((p) => p.producto).join() !== topVolumen.map((p) => p.producto).join(),
   'las dos listas no son la misma');

const sumaProd = prodMes.filter((f) => f.periodo === '2026-08')
  .reduce((s, f) => s + +f.ingresos, 0);
const agosto = totalizar(diasDelMes(dias, '2026-08'));
ok(cerca(sumaProd, agosto.ingresos_productos, 1),
   `los productos de agosto suman los ingresos del mes (${Math.round(sumaProd).toLocaleString('es-MX')})`);

const frios = productosFrios(prodMes, '2026-08', '2026-07');
const calientes = productosCalientes(prodMes, '2026-08', '2026-07');
ok(frios.every((f) => f.cambio < 0), `${frios.length} fríos, todos con cambio negativo`);
ok(calientes.every((f) => f.cambio > 0), `${calientes.length} calientes, todos positivos`);
ok(frios.every((f) => f.unidadesBase >= 20),
   'se ignoran los productos con muy poco volumen base');
if (frios.length) console.log(`    el más frío: ${frios[0].producto} ${frios[0].cambio}% (${frios[0].estado})`);
if (calientes.length) console.log(`    el más caliente: ${calientes[0].producto} +${calientes[0].cambio}%`);

// ─── guisados ────────────────────────────────────────────────────────────────
console.log('\nGuisados');
const part = participacionGuisados(guisMes, '2026-08', 8);
const sumaPart = part.filas.reduce((s, f) => s + f.participacion, 0);
ok(cerca(sumaPart, 100, 0.6), `las participaciones cierran en 100% (dio ${sumaPart.toFixed(1)}%)`);
ok(part.filas[0].participacion >= part.filas[1].participacion, 'vienen ordenadas');
console.log(`    líder: ${part.filas[0].guisado} con ${part.filas[0].participacion}%`);

const fyGuis = guisMes.filter((f) => f.periodo >= '2025-09' && f.periodo <= '2026-08'
                                  && f.guisado === 'Deshebrada')
  .reduce((s, f) => s + +f.unidades_atribuidas, 0);
ok(cerca(fyGuis, 21933, 1),
   `Deshebrada FY2026: 21,933 unidades (dio ${Math.round(fyGuis).toLocaleString('es-MX')})`);

const evo = evolucionGuisados(guisMes, ['2026-06', '2026-07', '2026-08'], 5);
ok(evo.length === 3, 'la evolución cubre los tres meses');
ok(Object.keys(evo[0]).length === 7, 'trae periodo, total y cinco guisados');

// ─── extras ──────────────────────────────────────────────────────────────────
console.log('\nExtras');
const ex = extrasDelMes(modMes, '2026-08');
ok(ex.filas.length > 0, `${ex.filas.length} extras distintos, ${ex.porciones} porciones`);
ok(ex.porciones >= ex.pedidos, 'las porciones nunca son menos que los pedidos');
console.log(`    el más pedido: ${ex.filas[0]?.modificador} (${ex.filas[0]?.veces} porciones)`);

// ─── periodos ────────────────────────────────────────────────────────────────
console.log('\nPeriodos');
ok(mesAnterior('2026-01') === '2025-12', 'el mes anterior a enero es diciembre del año pasado');
ok(mesAnterior('2026-08') === '2026-07', 'el mes anterior a agosto es julio');
ok(mesAnioAnterior('2026-02') === '2025-02', 'el mismo mes del año anterior');

console.log(fallas ? `\n✗ ${fallas} fallas` : '\n✓ el cálculo reproduce el informe');
process.exit(fallas ? 1 : 0);
