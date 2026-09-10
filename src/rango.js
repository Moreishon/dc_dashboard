// =============================================================================
// Periodos
// =============================================================================
//
// Todo el tablero trabaja sobre un rango de fechas, no sobre un mes. Aquí viven
// los atajos —esta semana, este mes, últimos 3 meses— y, más importante, la
// regla de contra qué se compara cada uno.
//
// Los atajos se anclan al último día CON DATOS, no a hoy
// -----------------------------------------------------
// Si hoy es 10 de septiembre pero el último dato es del 5, "esta semana"
// anclada a hoy saldría vacía y el tablero parecería roto. Anclada al último
// dato enseña la última semana que sí existe. Cada atajo dice qué fechas
// abarca, para que no haya que adivinar.
//
// Contra qué se compara
// ---------------------
// Depende del atajo, y la diferencia importa:
//
//   Un mes            contra el MISMO TRAMO del mes anterior. Si el mes va a
//                     la mitad, del 1 al 5 contra del 1 al 5 — nunca cinco
//                     días contra treinta y uno.
//   Cualquier otro    contra la ventana inmediata anterior del mismo tamaño.
//                     Esta semana contra la pasada; los últimos 90 días contra
//                     los 90 de antes.
//
// Y siempre, además, contra el mismo periodo del año anterior.
// =============================================================================

const DIA = 86400000;

/** 'AAAA-MM-DD' -> Date local. Nunca desde la cadena completa: en UTC−6,
 *  new Date('2026-08-31') se interpreta como UTC y cae un día antes. */
function aFecha(iso) {
  const [a, m, d] = String(iso).split('-').map(Number);
  return new Date(a, m - 1, d);
}

/** Date -> 'AAAA-MM-DD', con métodos locales. Jamás toISOString(). */
function aTexto(f) {
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${
    String(f.getDate()).padStart(2, '0')}`;
}

export const sumarDias = (iso, n) => aTexto(new Date(aFecha(iso).getTime() + n * DIA));

export const cuantosDias = (desde, hasta) =>
  Math.round((aFecha(hasta) - aFecha(desde)) / DIA) + 1;

/** El lunes de la semana de esa fecha. La semana laboral empieza en lunes. */
export function lunesDe(iso) {
  const f = aFecha(iso);
  const dow = f.getDay();              // 0 domingo … 6 sábado
  const atras = dow === 0 ? 6 : dow - 1;
  return sumarDias(iso, -atras);
}

export const primerDiaDelMes = (iso) => `${iso.slice(0, 7)}-01`;

export function ultimoDiaDelMes(iso) {
  const [a, m] = iso.split('-').map(Number);
  return aTexto(new Date(a, m, 0));
}

export const mesDe = (iso) => iso.slice(0, 7);

export function restarMeses(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1 - n, 1);
  // Si el día no existe en el mes destino (31 de marzo menos un mes), se toma
  // el último del mes.
  const ultimo = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
  return aTexto(new Date(f.getFullYear(), f.getMonth(), Math.min(d, ultimo)));
}

export const restarAnios = (iso, n) => {
  const [a, m, d] = iso.split('-').map(Number);
  const ultimo = new Date(a - n, m, 0).getDate();
  return aTexto(new Date(a - n, m - 1, Math.min(d, ultimo)));
};

// ─── los atajos ──────────────────────────────────────────────────────────────

/**
 * Construye los atajos a partir del último día con datos.
 * `anios` sale de los datos, así que solo aparecen años que existen.
 */
export function atajos(ultimoDato, anios = []) {
  if (!ultimoDato) return [];
  const hoy = ultimoDato;

  const lista = [
    {
      id: 'semana',
      nombre: 'Esta semana',
      tipo: 'semana',
      desde: lunesDe(hoy),
      hasta: hoy,
    },
    {
      id: 'semana_pasada',
      nombre: 'Semana pasada',
      tipo: 'semana',
      desde: sumarDias(lunesDe(hoy), -7),
      hasta: sumarDias(lunesDe(hoy), -1),
    },
    {
      id: 'mes',
      nombre: 'Este mes',
      tipo: 'mes',
      desde: primerDiaDelMes(hoy),
      hasta: hoy,
    },
    {
      id: 'mes_pasado',
      nombre: 'Mes pasado',
      tipo: 'mes',
      desde: primerDiaDelMes(restarMeses(primerDiaDelMes(hoy), 1)),
      hasta: ultimoDiaDelMes(restarMeses(primerDiaDelMes(hoy), 1)),
    },
    {
      id: 'trimestre',
      nombre: 'Últimos 3 meses',
      tipo: 'ventana',
      desde: sumarDias(hoy, -89),
      hasta: hoy,
    },
    {
      id: 'doce',
      nombre: 'Últimos 12 meses',
      tipo: 'ventana',
      desde: sumarDias(hoy, -364),
      hasta: hoy,
    },
  ];

  for (const a of [...anios].sort((x, y) => y - x)) {
    lista.push({
      id: `anio_${a}`,
      nombre: String(a),
      tipo: 'anio',
      desde: `${a}-01-01`,
      hasta: `${a}-12-31`,
    });
  }

  return lista;
}

/** El atajo por omisión al abrir la app. */
export const atajoInicial = (ultimoDato, anios) =>
  atajos(ultimoDato, anios).find((a) => a.id === 'semana') || null;

// ─── comparaciones ───────────────────────────────────────────────────────────

/**
 * Contra qué se compara un rango.
 *
 * Devuelve dos ventanas: la anterior y la del año pasado, cada una con su
 * nombre y una nota que explica el criterio — porque un usuario que no sabe
 * cómo se hizo la comparación no puede confiar en ella.
 */
export function comparaciones(rango) {
  const { desde, hasta, tipo } = rango;
  const n = cuantosDias(desde, hasta);

  let anterior;
  if (tipo === 'mes') {
    // Mismo tramo del mes anterior: del 1 al 5 contra del 1 al 5.
    const inicioAnterior = primerDiaDelMes(restarMeses(primerDiaDelMes(desde), 1));
    const diaCorte = +hasta.slice(8, 10);
    const ultimo = ultimoDiaDelMes(inicioAnterior);
    const corte = Math.min(diaCorte, +ultimo.slice(8, 10));
    anterior = {
      desde: inicioAnterior,
      hasta: `${inicioAnterior.slice(0, 7)}-${String(corte).padStart(2, '0')}`,
      nombre: 'el mes anterior',
      nota: `Del 1 al ${corte} de los dos meses, para comparar peras con peras.`,
    };
  } else if (tipo === 'anio') {
    const a = +desde.slice(0, 4) - 1;
    anterior = {
      desde: `${a}-01-01`, hasta: `${a}-12-31`,
      nombre: 'el año anterior',
      nota: 'Año completo contra año completo.',
    };
  } else {
    anterior = {
      desde: sumarDias(desde, -n),
      hasta: sumarDias(desde, -1),
      nombre: 'el periodo anterior',
      nota: `Los ${n} días inmediatamente anteriores.`,
    };
  }

  return {
    anterior,
    anioPasado: {
      desde: restarAnios(desde, 1),
      hasta: restarAnios(hasta, 1),
      nombre: 'el año pasado',
      nota: 'Las mismas fechas, un año antes.',
    },
    dias: n,
  };
}

/** ¿El rango se corta antes de tiempo porque el mes o el año no ha terminado? */
export function estaEnCurso(rango, ultimoDato) {
  if (rango.tipo === 'mes') return rango.hasta === ultimoDato &&
    rango.hasta !== ultimoDiaDelMes(rango.desde);
  if (rango.tipo === 'anio') return rango.hasta > ultimoDato;
  if (rango.tipo === 'semana') return rango.hasta === ultimoDato &&
    cuantosDias(rango.desde, rango.hasta) < 7;
  return false;
}
