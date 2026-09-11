// =============================================================================
// Cálculo del tablero
// =============================================================================
//
// Funciones puras: reciben arreglos, devuelven arreglos. No saben qué es React
// ni qué es Supabase. Por eso se pueden probar en Node contra las cifras del
// informe anual, que es lo único que decide si los números están bien.
//
// La corrección de calendario
// ---------------------------
// Comparar el total de un mes contra el del anterior está contaminado por el
// calendario: los meses tienen de 28 a 31 días, y los viernes-a-domingo —que
// son los que más venden— van de 12 a 15. Entre enero y febrero de 2026 el
// total dice que cayó 3.6% y el promedio diario dice que subió 3.2%. El signo
// se invierte, y el promedio diario es el que tiene razón.
//
// Por eso cada comparación devuelve las dos cifras, y la app enseña la
// corregida primero.
// =============================================================================

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles',
                     'jueves', 'viernes', 'sábado'];

// Viernes, sábado y domingo. En un restaurante son otro negocio.
const FUERTES = new Set([5, 6, 0]);

/**
 * Día de la semana de 'AAAA-MM-DD'. Se construye el Date con partes locales
 * —nunca desde la cadena completa— porque en UTC−6 `new Date('2026-08-31')`
 * se interpreta como UTC y cae un día antes.
 */
export function diaSemana(iso) {
  const [a, m, d] = String(iso).split('-').map(Number);
  return new Date(a, m - 1, d).getDay();
}

export const nombreDia = (dow) => DIAS_SEMANA[dow];
export const esFuerte = (iso) => FUERTES.has(diaSemana(iso));

const n2 = (x) => Math.round((x || 0) * 100) / 100;
const num = (x) => (x === null || x === undefined || x === '' ? 0 : +x);

/** Suma una lista de días en un solo objeto de totales. */
export function totalizar(dias) {
  const t = {
    dias: 0, fuertes: 0,
    ingresos: 0, ingresos_productos: 0, ingreso_envio: 0,
    recibos: 0, clientes: 0, unidades: 0, piezas: 0, renglones: 0,
  };
  for (const d of dias) {
    t.dias++;
    if (esFuerte(d.fecha)) t.fuertes++;
    t.ingresos += num(d.ingresos_totales);
    t.ingresos_productos += num(d.ingresos_productos);
    t.ingreso_envio += num(d.ingreso_envio);
    t.recibos += num(d.recibos);
    t.clientes += num(d.clientes);
    t.unidades += num(d.unidades);
    t.piezas += num(d.piezas);
    t.renglones += num(d.renglones);
  }
  t.ingresos = n2(t.ingresos);
  t.ingresos_productos = n2(t.ingresos_productos);
  t.ingreso_envio = n2(t.ingreso_envio);
  t.unidades = n2(t.unidades);

  // El ticket se recalcula sobre los totales. Promediar los tickets diarios
  // daría otro número: le pesaría igual un martes flojo que un sábado lleno.
  t.ticket = t.recibos ? n2(t.ingresos / t.recibos) : 0;
  t.promedioDia = t.dias ? n2(t.ingresos / t.dias) : 0;

  // Ingreso de los días fuertes, aparte.
  return t;
}

/** Reparte los ingresos entre días fuertes y el resto. */
export function porTipoDeDia(dias) {
  let fuerte = 0, normal = 0, nf = 0, nn = 0;
  for (const d of dias) {
    if (esFuerte(d.fecha)) { fuerte += num(d.ingresos_totales); nf++; }
    else { normal += num(d.ingresos_totales); nn++; }
  }
  const total = fuerte + normal;
  return {
    fuerte: n2(fuerte), normal: n2(normal),
    diasFuertes: nf, diasNormales: nn,
    promedioFuerte: nf ? n2(fuerte / nf) : 0,
    promedioNormal: nn ? n2(normal / nn) : 0,
    participacionFuerte: total ? n2((fuerte / total) * 100) : 0,
  };
}

/**
 * Compara dos conjuntos de días.
 *
 * `crudo` es la diferencia de totales, que es lo que enseña cualquier reporte.
 * `porDia` es la diferencia de promedios diarios, que es la que no miente
 * cuando los dos periodos tienen distinto número de días.
 *
 * `advertencia` se llena cuando las dos difieren lo bastante como para contar
 * historias distintas — ahí conviene enseñarle al usuario por qué.
 */
export function comparar(diasA, diasB) {
  const a = totalizar(diasA), b = totalizar(diasB);
  const pct = (x, y) => (y ? n2(((x - y) / y) * 100) : null);

  // Comparación día-con-día: martes contra martes, sábado contra sábado.
  //
  // Dos semanas del mismo largo tampoco son comparables si una trae domingo y
  // la otra lunes. Pasó de verdad: la semana del 31 de agosto de 2026 salía
  // −21% contra la anterior, y casi todo era que la anterior tenía un domingo
  // de 35,000 y esta un lunes de 14,700. Mirando solo los días que existen en
  // las dos, la caída real era del 9%.
  //
  // Solo se comparan los días de la semana presentes en AMBOS periodos. Los
  // que no tienen pareja se reportan aparte, nunca se rellenan.
  const porDow = (lista) => {
    const m = new Map();
    for (const d of lista) {
      const k = diaSemana(d.fecha);
      if (!m.has(k)) m.set(k, { total: 0, n: 0 });
      const x = m.get(k);
      x.total += num(d.ingresos_totales);
      x.n++;
    }
    return m;
  };
  const dowA = porDow(diasA), dowB = porDow(diasB);
  let sumaA = 0, sumaB = 0;
  const emparejados = [], sinPareja = [];
  for (const [k, x] of dowA) {
    const y = dowB.get(k);
    if (!y || !y.n) { sinPareja.push(DIAS_SEMANA[k]); continue; }
    sumaA += x.total / x.n;
    sumaB += y.total / y.n;
    emparejados.push(DIAS_SEMANA[k]);
  }
  for (const [k] of dowB) if (!dowA.has(k)) sinPareja.push(DIAS_SEMANA[k]);

  const mismosDias = {
    pct: sumaB ? n2(((sumaA - sumaB) / sumaB) * 100) : null,
    emparejados, sinPareja,
    // Solo vale la pena enseñarla cuando la composición difiere de verdad.
    aplica: sinPareja.length > 0,
  };

  const crudo = pct(a.ingresos, b.ingresos);
  const porDia = pct(a.promedioDia, b.promedioDia);

  let advertencia = null;
  if (crudo !== null && porDia !== null) {
    if (Math.sign(crudo) !== Math.sign(porDia) && crudo !== 0 && porDia !== 0) {
      advertencia = 'signo';        // uno sube y el otro baja
    } else if (Math.abs(crudo - porDia) >= 3) {
      advertencia = 'magnitud';     // la misma dirección pero muy distinto tamaño
    }
  }

  return {
    a, b,
    ingresos: { crudo, porDia },
    recibos: { crudo: pct(a.recibos, b.recibos),
               porDia: pct(a.dias ? a.recibos / a.dias : 0, b.dias ? b.recibos / b.dias : 0) },
    unidades: { crudo: pct(a.unidades, b.unidades),
                porDia: pct(a.dias ? a.unidades / a.dias : 0, b.dias ? b.unidades / b.dias : 0) },
    ticket: { crudo: pct(a.ticket, b.ticket) },
    mismosDias,
    diferenciaDias: a.dias - b.dias,
    diferenciaFuertes: a.fuertes - b.fuertes,
    advertencia,
  };
}

/** Agrupa los días por mes. */
export function porMes(dias) {
  const m = new Map();
  for (const d of dias) {
    const p = d.fecha.slice(0, 7);
    if (!m.has(p)) m.set(p, []);
    m.get(p).push(d);
  }
  return [...m.entries()]
    .sort((x, y) => (x[0] < y[0] ? -1 : 1))
    .map(([periodo, ds]) => ({ periodo, ...totalizar(ds), ...porTipoDeDia(ds) }));
}

/** Promedio de los ingresos de cada día de la semana. */
export function porDiaDeSemana(dias) {
  const acc = Array.from({ length: 7 }, () => ({ total: 0, n: 0 }));
  for (const d of dias) {
    const x = acc[diaSemana(d.fecha)];
    x.total += num(d.ingresos_totales);
    x.n++;
  }
  return acc.map((x, dow) => ({
    dow, nombre: DIAS_SEMANA[dow],
    total: n2(x.total), dias: x.n,
    promedio: x.n ? n2(x.total / x.n) : 0,
  }));
}

/**
 * Media móvil sobre la serie diaria. Suaviza el ruido del día a día sin
 * inventar nada: cada punto es el promedio de los N días anteriores.
 * Los primeros N−1 días no tienen suficiente historia y salen en null, que es
 * más honesto que rellenarlos con un promedio parcial.
 */
export function mediaMovil(dias, ventana = 30) {
  const orden = [...dias].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const salida = [];
  let suma = 0;
  for (let i = 0; i < orden.length; i++) {
    suma += num(orden[i].ingresos_totales);
    if (i >= ventana) suma -= num(orden[i - ventana].ingresos_totales);
    salida.push({
      fecha: orden[i].fecha,
      valor: num(orden[i].ingresos_totales),
      media: i >= ventana - 1 ? n2(suma / ventana) : null,
    });
  }
  return salida;
}

// ─── productos ───────────────────────────────────────────────────────────────

/** Los que más venden en un periodo, por dinero o por volumen. */
export function topProductos(filas, periodo, medida = 'ingresos', cuantos = 10) {
  return filas
    .filter((f) => f.periodo === periodo)
    .map((f) => ({ ...f, ingresos: num(f.ingresos), unidades: num(f.unidades) }))
    .sort((a, b) => b[medida] - a[medida])
    .slice(0, cuantos);
}

/**
 * Los que se enfriaron.
 *
 * No es "el que menos vende" — ese siempre es el mismo producto chico y no
 * dice nada. Es el que más cayó CONTRA SÍ MISMO.
 *
 * Se separan dos casos que en los datos se ven igual y significan lo opuesto:
 *   · bajó      se sigue vendiendo, pero mucho menos
 *   · se dejó de vender   cero ventas este periodo, y antes sí tenía
 *
 * Se ignoran los productos con muy poco volumen en el periodo base: pasar de
 * 3 unidades a 1 es un −67% que no significa nada.
 *
 * `diasA` y `diasB` corrigen el calendario. Si no se pasan, se comparan los
 * totales tal cual. Si se pasan, se comparan unidades POR DÍA — que es lo
 * único que tiene sentido cuando el mes va a la mitad: si no, cinco días
 * contra treinta y uno dan caídas del 90% en todo el menú, y la lista deja de
 * significar nada.
 */
export function productosFrios(filas, periodo, periodoBase, {
  minimoBase = 20, cuantos = 10, diasA = null, diasB = null,
} = {}) {
  const factor = (diasA && diasB) ? (diasB / diasA) : 1;
  const base = new Map();
  for (const f of filas) if (f.periodo === periodoBase) base.set(f.producto, f);
  const ahora = new Map();
  for (const f of filas) if (f.periodo === periodo) ahora.set(f.producto, f);

  const salida = [];
  for (const [producto, b] of base) {
    const unidadesBase = num(b.unidades);
    if (unidadesBase < minimoBase) continue;
    const a = ahora.get(producto);
    const unidades = a ? num(a.unidades) : 0;
    // Se escala el periodo actual al tamaño del base antes de comparar.
    const cambio = n2((((unidades * factor) - unidadesBase) / unidadesBase) * 100);
    if (cambio >= 0) continue;
    salida.push({
      producto,
      familia: b.familia,
      unidadesBase, unidades,
      ingresosBase: n2(num(b.ingresos)),
      ingresos: a ? n2(num(a.ingresos)) : 0,
      cambio,
      estado: unidades === 0 ? 'sin ventas' : 'a la baja',
    });
  }
  return salida.sort((x, y) => x.cambio - y.cambio).slice(0, cuantos);
}

/** Los que más crecieron, con el mismo criterio al revés. */
export function productosCalientes(filas, periodo, periodoBase, {
  minimoBase = 20, cuantos = 10, diasA = null, diasB = null,
} = {}) {
  const factor = (diasA && diasB) ? (diasB / diasA) : 1;
  const base = new Map();
  for (const f of filas) if (f.periodo === periodoBase) base.set(f.producto, f);
  const salida = [];
  for (const f of filas) {
    if (f.periodo !== periodo) continue;
    const b = base.get(f.producto);
    const unidadesBase = b ? num(b.unidades) : 0;
    if (unidadesBase < minimoBase) continue;
    const unidades = num(f.unidades);
    const cambio = n2((((unidades * factor) - unidadesBase) / unidadesBase) * 100);
    if (cambio <= 0) continue;
    salida.push({
      producto: f.producto, familia: f.familia,
      unidadesBase, unidades,
      ingresos: n2(num(f.ingresos)),
      cambio, estado: 'al alza',
    });
  }
  return salida.sort((x, y) => y.cambio - x.cambio).slice(0, cuantos);
}

// ─── guisados ────────────────────────────────────────────────────────────────

/**
 * Participación de cada guisado en un mes.
 *
 * Se usa `unidades_atribuidas`, que reparte el pedido entre sus guisos: si un
 * pedido de 2 lleva Deshebrada y Chicharrón, cada uno se lleva 1. Esas sí
 * suman al total, así que los porcentajes cierran en 100.
 *
 * `unidades_presencia` cuenta el pedido completo para cada guiso — responde
 * "¿en cuántos pedidos apareció?" y NO suma a 100. Las dos sirven, pero no se
 * pueden mezclar en la misma gráfica.
 */
export function participacionGuisados(filas, periodo, cuantos = 8) {
  const delMes = filas.filter((f) => f.periodo === periodo)
    .map((f) => ({ guisado: f.guisado, unidades: num(f.unidades_atribuidas) }))
    .sort((a, b) => b.unidades - a.unidades);
  const total = delMes.reduce((s, f) => s + f.unidades, 0);

  const cabeza = delMes.slice(0, cuantos);
  const cola = delMes.slice(cuantos);
  const filas2 = cabeza.map((f) => ({
    ...f, unidades: n2(f.unidades),
    participacion: total ? n2((f.unidades / total) * 100) : 0,
  }));
  if (cola.length) {
    const u = cola.reduce((s, f) => s + f.unidades, 0);
    filas2.push({
      guisado: 'Otros', unidades: n2(u), otros: cola.length,
      participacion: total ? n2((u / total) * 100) : 0,
    });
  }
  return { filas: filas2, total: n2(total) };
}

/**
 * Cómo se mueve la participación de los guisados principales mes a mes.
 *
 * Que la Deshebrada sea la número uno ya se sabe. Lo que no se ve en ningún
 * lado es si está ganando o perdiendo terreno.
 */
export function evolucionGuisados(filas, periodos, cuantos = 5) {
  const ultimo = periodos[periodos.length - 1];
  const top = participacionGuisados(filas, ultimo, cuantos).filas
    .filter((f) => f.guisado !== 'Otros')
    .map((f) => f.guisado);

  const porPeriodo = new Map();
  for (const f of filas) {
    if (!porPeriodo.has(f.periodo)) porPeriodo.set(f.periodo, []);
    porPeriodo.get(f.periodo).push(f);
  }

  return periodos.map((periodo) => {
    const delMes = porPeriodo.get(periodo) || [];
    const total = delMes.reduce((s, f) => s + num(f.unidades_atribuidas), 0);
    const punto = { periodo, total: n2(total) };
    for (const g of top) {
      const f = delMes.find((x) => x.guisado === g);
      const u = f ? num(f.unidades_atribuidas) : 0;
      punto[g] = total ? n2((u / total) * 100) : 0;
    }
    return punto;
  });
}

// ─── extras ──────────────────────────────────────────────────────────────────

/**
 * Qué tan seguido se piden extras. Es la palanca más directa sobre el ticket.
 *
 * `renglones` de dc_m_modificador_mes cuenta pedidos distintos que llevaron
 * ese extra; `veces` suma el multiplicador, o sea porciones. Son cosas
 * distintas y las dos importan: uno dice cuánta gente lo pide, el otro cuánto
 * producto sale.
 */
export function extrasDelMes(filas, periodo, cuantos = 10) {
  const delMes = filas.filter((f) => f.periodo === periodo && f.tipo === 'EXTRA')
    .map((f) => ({
      modificador: f.modificador,
      veces: num(f.veces),
      renglones: num(f.renglones),
    }))
    .sort((a, b) => b.veces - a.veces);
  return {
    filas: delMes.slice(0, cuantos),
    porciones: delMes.reduce((s, f) => s + f.veces, 0),
    pedidos: delMes.reduce((s, f) => s + f.renglones, 0),
  };
}

// ─── utilidades de periodo ───────────────────────────────────────────────────

/** El mes anterior a 'AAAA-MM'. */
export function mesAnterior(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

/** El mismo mes del año anterior. */
export function mesAnioAnterior(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  return `${a - 1}-${String(m).padStart(2, '0')}`;
}

/** Los días de un mes, de la serie diaria completa. */
export const diasDelMes = (dias, periodo) =>
  dias.filter((d) => d.fecha.startsWith(periodo));

/** Cuántos días tiene el mes en el calendario. */
export function diasEnElMes(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  return new Date(a, m, 0).getDate();
}

/**
 * ¿Es un mes en curso?
 *
 * Un mes con datos hasta el día 5 de 30 no es "un mes que vendió poco": es un
 * mes que todavía no termina. Compararlo completo contra el mes anterior da
 * caídas del 80% que no significan nada, y es la forma más fácil de que un
 * tablero pierda credibilidad el primer día que se usa.
 */
export function mesEnCurso(dias, periodo) {
  const delMes = diasDelMes(dias, periodo);
  if (!delMes.length) return null;
  const ultimo = delMes.reduce((max, d) => (d.fecha > max ? d.fecha : max), '');
  const diaCorte = +ultimo.slice(8, 10);
  const total = diasEnElMes(periodo);
  return diaCorte < total
    ? { parcial: true, hasta: ultimo, diaCorte, total, conDatos: delMes.length }
    : { parcial: false, hasta: ultimo, diaCorte, total, conDatos: delMes.length };
}

/**
 * Los mismos días del mes, en otro periodo.
 *
 * Para comparar un mes en curso contra el anterior hay que recortar el
 * anterior al mismo tramo: del 1 al 5 contra del 1 al 5. Promediar por día
 * ayuda, pero no basta — la primera semana del mes no se vende igual que la
 * última, así que comparar cinco días contra treinta seguiría comparando
 * cosas distintas.
 */
export const mismoTramo = (dias, periodo, hastaDia) =>
  diasDelMes(dias, periodo).filter((d) => +d.fecha.slice(8, 10) <= hastaDia);

/** Los días entre dos fechas, inclusivo. */
export const diasEntre = (dias, desde, hasta) =>
  dias.filter((d) => d.fecha >= desde && d.fecha <= hasta);
