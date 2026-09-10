// =============================================================================
// Prueba de los periodos
// =============================================================================
//
// Las fechas son donde más fácil se cuelan errores que nadie nota: un lunes que
// en realidad es domingo, un mes anterior que se salta enero, una comparación
// de cinco días contra treinta y uno. Nada de eso da error; solo da números
// equivocados.
// =============================================================================

import {
  sumarDias, cuantosDias, lunesDe, primerDiaDelMes, ultimoDiaDelMes,
  restarMeses, restarAnios, atajos, comparaciones, estaEnCurso,
} from '../src/rango.js';

let fallas = 0;
const ok = (b, t) => { console.log(`  ${b ? '✓' : '✗'} ${t}`); if (!b) fallas++; };
const eq = (a, b, t) => ok(a === b, `${t} → ${a}${a === b ? '' : ` (esperaba ${b})`}`);

console.log('Aritmética de fechas');
eq(sumarDias('2026-09-05', 1), '2026-09-06', 'un día después del 5 de septiembre');
eq(sumarDias('2026-09-01', -1), '2026-08-31', 'un día antes del 1 de septiembre');
eq(sumarDias('2026-01-01', -1), '2025-12-31', 'cruza el año hacia atrás');
eq(sumarDias('2024-02-28', 1), '2024-02-29', 'año bisiesto');
eq(cuantosDias('2026-09-01', '2026-09-05'), 5, 'del 1 al 5 son cinco días');
eq(cuantosDias('2026-09-05', '2026-09-05'), 1, 'un solo día cuenta uno');

console.log('\nSemanas (empiezan en lunes)');
eq(lunesDe('2026-09-05'), '2026-08-31', 'el sábado 5 de septiembre pertenece a la semana del lunes 31');
eq(lunesDe('2026-08-31'), '2026-08-31', 'un lunes es su propio lunes');
eq(lunesDe('2026-09-06'), '2026-08-31', 'el domingo cierra la semana, no la abre');

console.log('\nMeses');
eq(primerDiaDelMes('2026-09-05'), '2026-09-01', 'primer día del mes');
eq(ultimoDiaDelMes('2026-09-01'), '2026-09-30', 'septiembre tiene 30');
eq(ultimoDiaDelMes('2026-02-01'), '2026-02-28', 'febrero de 2026 tiene 28');
eq(ultimoDiaDelMes('2024-02-01'), '2024-02-29', 'febrero de 2024 tiene 29');
eq(restarMeses('2026-01-15', 1), '2025-12-15', 'un mes antes de enero es diciembre');
eq(restarMeses('2026-03-31', 1), '2026-02-28', 'el 31 de marzo menos un mes cae en el último de febrero');
eq(restarAnios('2026-09-05', 1), '2025-09-05', 'un año antes');
eq(restarAnios('2024-02-29', 1), '2023-02-28', 'el 29 de febrero menos un año cae en el 28');

console.log('\nAtajos, anclados al último día con datos (2026-09-05)');
const lista = atajos('2026-09-05', [2023, 2024, 2025, 2026]);
const buscar = (id) => lista.find((a) => a.id === id);

eq(buscar('semana').desde, '2026-08-31', 'esta semana arranca el lunes');
eq(buscar('semana').hasta, '2026-09-05', 'esta semana termina en el último dato, no en hoy');
eq(buscar('semana_pasada').desde, '2026-08-24', 'la semana pasada arranca siete días antes');
eq(buscar('semana_pasada').hasta, '2026-08-30', 'y termina el domingo');
eq(buscar('mes').desde, '2026-09-01', 'este mes arranca el día 1');
eq(buscar('mes_pasado').desde, '2026-08-01', 'el mes pasado es agosto completo');
eq(buscar('mes_pasado').hasta, '2026-08-31', 'hasta el 31');
eq(cuantosDias(buscar('trimestre').desde, buscar('trimestre').hasta), 90, 'tres meses son 90 días');
eq(cuantosDias(buscar('doce').desde, buscar('doce').hasta), 365, 'doce meses son 365 días');
ok(lista.filter((a) => a.tipo === 'anio').length === 4, 'aparecen los cuatro años con datos');

console.log('\nContra qué se compara');
const cMes = comparaciones(buscar('mes'));
eq(cMes.anterior.desde, '2026-08-01', 'un mes a la mitad se compara desde el 1 del anterior');
eq(cMes.anterior.hasta, '2026-08-05', 'y hasta el mismo día de corte — no contra el mes entero');
eq(cuantosDias(cMes.anterior.desde, cMes.anterior.hasta), 5, 'cinco días contra cinco días');

const cSemana = comparaciones(buscar('semana'));
eq(cSemana.anterior.hasta, '2026-08-30', 'una semana se compara contra la ventana anterior');
eq(cuantosDias(cSemana.anterior.desde, cSemana.anterior.hasta),
   cuantosDias(buscar('semana').desde, buscar('semana').hasta),
   'la ventana anterior tiene el mismo tamaño');

const cTri = comparaciones(buscar('trimestre'));
eq(cuantosDias(cTri.anterior.desde, cTri.anterior.hasta), 90, 'los 90 días anteriores');
eq(cTri.anterior.hasta, sumarDias(buscar('trimestre').desde, -1), 'pegados, sin traslape');

const cAnio = comparaciones(buscar('anio_2026'));
eq(cAnio.anterior.desde, '2025-01-01', 'un año se compara contra el año completo anterior');
eq(cMes.anioPasado.desde, '2025-09-01', 'y siempre está el mismo periodo del año pasado');

console.log('\nPeriodos en curso');
ok(estaEnCurso(buscar('mes'), '2026-09-05'), 'este mes va a la mitad');
ok(!estaEnCurso(buscar('mes_pasado'), '2026-09-05'), 'el mes pasado ya terminó');
ok(estaEnCurso(buscar('semana'), '2026-09-05'), 'esta semana va a la mitad (falta el domingo)');
ok(!estaEnCurso(buscar('semana_pasada'), '2026-09-05'), 'la semana pasada está completa');

console.log(fallas ? `\n✗ ${fallas} fallas` : '\n✓ los periodos cuadran');
process.exit(fallas ? 1 : 0);
