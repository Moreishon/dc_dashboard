// =============================================================================
// Lector de las exportaciones de Poster
// =============================================================================
//
// Este archivo hace en el navegador lo mismo que hacía el pipeline de Python:
// leer el xlsx tal como lo escupe Poster, clasificar los modificadores contra
// el catálogo y devolver los renglones listos para guardar.
//
// No habla con la base de datos. No sabe qué es Supabase. Recibe un archivo y
// devuelve objetos — así se puede probar en Node contra el resultado de Python,
// que es exactamente lo que se hizo antes de darlo por bueno.
//
// Las rarezas de Poster que hay que respetar
// ------------------------------------------
//   · El encabezado no empieza en A1: hay una fila y una columna en blanco.
//     Pero al copiar y pegar eso se corre, así que se busca en vez de asumirlo.
//   · La cantidad viene como '1 pzs.', texto.
//   · El multiplicador de un modificador es '&times 4' — entidad HTML sin punto
//     y coma, escrita literal.
//   · La misma etiqueta aparece con y sin acento ('Requeson' / 'Requesón').
//   · Ingresos a veces llega como texto '0'.
//
// Sobre las fechas
// ----------------
// Nunca se usa toISOString(). Tampoco se construye un Date a partir de un
// serial de Excel con la hora local. Un serial se convierte con aritmética y se
// lee con métodos UTC; un texto se parte con expresión regular. Cualquier otro
// camino corre los días en UTC-6 y arruina el análisis de fin de semana.
// =============================================================================

export const ESQUEMA_PRODUCTOS = [
  'Fecha', 'Producto', 'Nombre de modificación del producto',
  'Cantidad', 'Ventas brutas', 'Ingresos', 'Precio promedio',
];

export const ESQUEMA_VENTAS = [
  'Fecha', 'Ingresos', 'Ganancias', 'Recibos', 'Clientes', 'Ticket promedio',
];

export const TIPOS_VALIDOS = [
  'GUISADO', 'EXTRA', 'PETICION', 'VARIANTE',
  'COMPOSICION', 'CANT_SURTIDO', 'AMBIGUO',
];

// Nombres del producto con el que se cobraba el envío antes de que Poster
// habilitara su propio campo de datos de envío.
const PRODUCTOS_ENVIO = ['servicio a dom.', 'servicio a domicilio', 'servicio dom.'];

const SUCURSAL = 'Principal';

// ─── utilidad ────────────────────────────────────────────────────────────────

export function texto(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

/** Clave de comparación: sin acentos ni mayúsculas. */
export function clave(v) {
  return texto(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Devuelve 'YYYY-MM-DD' o null. Acepta las tres formas en que puede llegar una
 * fecha desde un xlsx, sin que ninguna pase por la zona horaria local.
 */
export function aFechaISO(v) {
  if (v instanceof Date) {
    // Ya es un Date: se lee con los métodos locales, que es como lo construyó
    // quien lo creó. Nunca toISOString().
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === 'number' && isFinite(v)) {
    // Serial de Excel. 25569 son los días entre 1899-12-30 y 1970-01-01.
    // Se lee con métodos UTC para que la conversión sea pura aritmética.
    const d = new Date(Math.round((v - 25569) * 86400000));
    if (isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = texto(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return null;
}

function pad(n) { return String(n).padStart(2, '0'); }

/** Extrae un número. Poster manda '3 pzs.' y a veces '0' como texto. */
export function aNumero(v) {
  if (typeof v === 'number') return v;
  const m = texto(v).replace(/,/g, '').match(/-?\d*\.?\d+/);
  return m ? parseFloat(m[0]) : null;
}

export function redondear(n, d = 2) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

/**
 * Redondeo idéntico al de Python, que es el que produjo los 138,762 renglones
 * que ya están en Supabase.
 *
 * Python redondea al par en los empates exactos: round(31.125, 2) da 31.12, no
 * 31.13. Y decide sobre el valor binario real, no sobre lo que se ve escrito:
 * 31.135 en realidad vale 31.1350000000000015…, que está por encima del empate,
 * así que da 31.14.
 *
 * Math.round() de JavaScript redondea siempre hacia arriba en los empates. Sin
 * esto, 146 de los renglones quedaban un centavo arriba y un mes reimportado
 * no coincidiría con sus vecinos.
 *
 * El truco: toFixed() con muchos decimales expone el valor binario exacto, y
 * sobre esa cadena el redondeo se hace con aritmética decimal, sin más error.
 */
export function redondearComoPython(x, d = 2) {
  if (!isFinite(x)) return x;
  const negativo = x < 0;
  const s = Math.abs(x).toFixed(d + 18);   // expansión exacta
  const punto = s.indexOf('.');
  const enteros = s.slice(0, punto);
  const decimales = s.slice(punto + 1);

  const conservados = decimales.slice(0, d);
  const resto = decimales.slice(d);
  let digitos = (enteros + conservados).replace(/^0+(?=\d)/, '');

  // ¿Hay que subir? Solo si lo que sobra pasa de la mitad, o si es exactamente
  // la mitad y el último dígito conservado es impar.
  const primero = resto.charCodeAt(0) - 48;
  let subir;
  if (primero > 5) subir = true;
  else if (primero < 5) subir = false;
  else {
    const hayMas = /[1-9]/.test(resto.slice(1));
    subir = hayMas || ((digitos.charCodeAt(digitos.length - 1) - 48) % 2 === 1);
  }

  if (subir) digitos = String(BigInt(digitos) + 1n);
  const valor = Number(digitos) / Math.pow(10, d);
  return negativo ? -valor : valor;
}

// ─── lectura de la hoja ──────────────────────────────────────────────────────

/**
 * Busca dónde empieza realmente el encabezado. Poster deja una fila y una
 * columna en blanco, pero eso se corre al copiar y pegar, así que se busca en
 * las primeras 8 filas y 6 columnas en vez de dar por hecho la posición.
 */
export function localizarEncabezado(matriz, esquema) {
  for (let i = 0; i < Math.min(matriz.length, 8); i++) {
    const fila = matriz[i] || [];
    for (let j = 0; j < Math.min(fila.length, 6); j++) {
      let coincide = true;
      for (let k = 0; k < esquema.length; k++) {
        if (clave(fila[j + k]) !== clave(esquema[k])) { coincide = false; break; }
      }
      if (coincide) return { fila: i, col: j };
    }
  }
  return null;
}

/**
 * Saca los renglones de datos de una matriz de celdas.
 * Una hoja vacía no es un error: significa que esta vez no se exportó ese
 * reporte. Solo se rechaza cuando hay contenido y no cuadra con el esquema.
 */
export function leerMatriz(matriz, esquema, nombre) {
  const vacia = !matriz.length ||
    matriz.every((f) => (f || []).every((c) => texto(c) === ''));
  if (vacia) return { filas: [], vacia: true, error: null };

  const pos = localizarEncabezado(matriz, esquema);
  if (!pos) {
    return {
      filas: [], vacia: false,
      error: `El archivo de ${nombre} no trae el encabezado esperado. ` +
             `Debe tener, en una misma fila: ${esquema.join(' | ')}. ` +
             `Exporta el reporte completo desde Poster, con los títulos de columna.`,
    };
  }

  const filas = [];
  for (let i = pos.fila + 1; i < matriz.length; i++) {
    const recorte = (matriz[i] || []).slice(pos.col, pos.col + esquema.length);
    if (recorte.every((c) => texto(c) === '')) continue;
    filas.push({ n: i + 1, v: recorte });
  }
  return { filas, vacia: false, error: null };
}

// ─── modificadores ───────────────────────────────────────────────────────────

/** 'Chicharrón &times 4, Sin Crema' -> [{token:'Chicharrón',mult:4},{token:'Sin Crema',mult:1}] */
export function tokenizar(cadena) {
  const salida = [];
  for (const parte of texto(cadena).split(',')) {
    const p = parte.trim();
    if (!p) continue;
    const m = p.match(/&times\s*(\d+)/);
    const token = texto(p.replace(/&times\s*\d+/, ''));
    if (token) salida.push({ token, mult: m ? parseInt(m[1], 10) : 1 });
  }
  return salida;
}

/**
 * Le pone tipo a cada token contra el catálogo.
 *
 * La regla de los ambiguos: hay etiquetas que son guiso o extra según dónde
 * caigan. 'Frijoles' es el guiso cuando no hay otro guiso antes en la lista, y
 * un extra cuando sí. Se verificó contra el precio: cuando aparece en segundo
 * lugar, el renglón cobra el sobreprecio de extra.
 */
export function clasificar(tokens, catalogoMods) {
  const salida = [];
  let guisadoVisto = false;
  tokens.forEach((t, i) => {
    const entrada = catalogoMods[clave(t.token)];
    let tipo, valor;
    if (entrada) {
      tipo = entrada.tipo;
      valor = entrada.valor;
    } else {
      tipo = /^\d+$/.test(t.token) ? 'CANT_SURTIDO' : 'SIN_CLASIFICAR';
      valor = t.token;
    }
    if (tipo === 'AMBIGUO') tipo = guisadoVisto ? 'EXTRA' : 'GUISADO';
    if (tipo === 'GUISADO') guisadoVisto = true;
    salida.push({ token: t.token, valor, tipo, mult: t.mult, posicion: i + 1 });
  });
  return salida;
}

// ─── catálogos ───────────────────────────────────────────────────────────────

/** Convierte las filas de dc_cat_* en los índices que usa el clasificador. */
export function armarCatalogos(filasMods, filasProds) {
  const mods = {}, prods = {};

  for (const r of filasMods || []) {
    const original = texto(r.modificador_original);
    if (!original) continue;
    if (r.activo === false) continue;
    const tipo = texto(r.tipo).toUpperCase();
    mods[clave(original)] = {
      valor: texto(r.valor_normalizado) || original,
      tipo: TIPOS_VALIDOS.includes(tipo) ? tipo : 'SIN_CLASIFICAR',
    };
  }

  for (const r of filasProds || []) {
    const nombre = texto(r.producto);
    if (!nombre) continue;
    prods[clave(nombre)] = {
      producto: nombre,
      familia: texto(r.familia) || 'Otros',
      unidad_venta: (texto(r.unidad_venta) || 'ORDEN').toUpperCase(),
      piezas_por_orden: aNumero(r.piezas_por_orden) || 1,
    };
  }

  return { mods, prods };
}

// ─── transformación ──────────────────────────────────────────────────────────

/**
 * Convierte los renglones crudos del reporte de productos en los objetos que
 * van a dc_ventas_detalle y dc_ventas_modificadores.
 *
 * Cada renglón de detalle lleva una llave temporal `_k` (su posición). Los
 * modificadores apuntan a esa llave con `_d`. Del lado del servidor esas dos
 * llaves se traducen a los id reales; aquí no se inventa ningún id.
 *
 * Los modificadores NO llevan columnas de dinero, a propósito: un renglón con
 * tres guisos generaría tres copias del ingreso y todo se contaría 1.15 veces.
 */
export function transformarProductos(filas, cat) {
  const detalle = [], mods = [];
  const sinClasificar = {}, productosNuevos = {};
  const incidencias = { textoEnIngresos: 0, sinFecha: 0, sinNumero: 0 };
  const periodos = new Set();
  let totalUnidades = 0, totalIngresos = 0;

  for (const fila of filas) {
    const v = fila.v;
    const fecha = aFechaISO(v[0]);
    const producto = texto(v[1]);
    const cantidad = aNumero(v[3]);
    const brutas = aNumero(v[4]);
    let ingresos = aNumero(v[5]);

    if (!fecha) { incidencias.sinFecha++; continue; }
    if (cantidad === null || brutas === null) { incidencias.sinNumero++; continue; }
    if (typeof v[5] !== 'number' && texto(v[5]) !== '') incidencias.textoEnIngresos++;
    if (ingresos === null) ingresos = 0;

    let info = cat.prods[clave(producto)];
    if (!info) {
      productosNuevos[producto] = (productosNuevos[producto] || 0) + 1;
      info = { familia: 'Otros', unidad_venta: 'ORDEN', piezas_por_orden: 1 };
    }

    const tokens = clasificar(tokenizar(v[2]), cat.mods);
    let extras = 0, peticiones = 0, nGuisados = 0, piezasSurtido = null;

    for (const m of tokens) {
      if (m.tipo === 'SIN_CLASIFICAR') {
        sinClasificar[m.token] = (sinClasificar[m.token] || 0) + 1;
      } else if (m.tipo === 'GUISADO') {
        nGuisados++;
      } else if (m.tipo === 'EXTRA') {
        // Se cuentan ETIQUETAS, no porciones: 'Molida &times 2' suma 1, no 2.
        // Así están los 138,762 renglones que ya viven en Supabase, y un mes
        // reimportado tiene que quedar igual que sus vecinos.
        //
        // Para porciones se usa dc_ventas_modificadores, que guarda el
        // multiplicador de cada token. Esta columna es un resumen; el dato
        // bueno está en la tabla puente.
        extras++;
      } else if (m.tipo === 'PETICION') {
        peticiones++;
      } else if (m.tipo === 'CANT_SURTIDO' && /^\d+$/.test(m.valor)) {
        // Las surtidas traen el número de piezas en el modificador: la
        // cantidad dice 1 pero son de 3 a 10 piezas.
        piezasSurtido = m.mult * parseInt(m.valor, 10);
      }
    }

    const esEnvio = PRODUCTOS_ENVIO.includes(clave(producto));
    const periodo = fecha.substring(0, 7);
    periodos.add(periodo);
    if (!esEnvio) { totalUnidades += cantidad; totalIngresos += ingresos; }

    const k = detalle.length;
    detalle.push({
      _k: k,
      sucursal: SUCURSAL,
      fecha, periodo,
      producto,
      familia: info.familia,
      unidad_venta: info.unidad_venta,
      modificacion_original: texto(v[2]),
      cantidad,
      piezas_equivalentes: cantidad * (piezasSurtido || info.piezas_por_orden),
      ventas_brutas: brutas,
      ingresos,
      // Dos pasos, igual que el pipeline: a 4 decimales y luego a 2. Redondear
      // directo a 2 daría un centavo distinto en algunos renglones.
      precio_unitario: cantidad
        ? redondearComoPython(redondearComoPython(brutas / cantidad, 4), 2)
        : 0,
      es_servicio_envio: esEnvio,
      n_guisados: nGuisados,
      n_extras: extras,
      n_peticiones: peticiones,
    });

    // Un renglón por token. Los SIN_CLASIFICAR no se guardan: se reportan.
    for (const m of tokens) {
      if (m.tipo === 'SIN_CLASIFICAR') continue;
      mods.push({
        _d: k,
        sucursal: SUCURSAL,
        fecha, periodo, producto,
        tipo: m.tipo,
        valor: m.valor,
        token_original: m.token,
        multiplicador: m.mult,
        posicion: m.posicion,
      });
    }
  }

  return {
    detalle, mods,
    periodos: [...periodos].sort(),
    sinClasificar, productosNuevos, incidencias,
    totalUnidades: redondear(totalUnidades, 2),
    totalIngresos: redondear(totalIngresos, 2),
  };
}

/**
 * Une el grano diario. El reporte de Ventas trae el total del día tal como lo
 * cuenta Poster; el de Productos trae el desglose. La diferencia entre los dos
 * es el envío cobrado por el campo nativo, que no aparece como producto.
 *
 * El reporte de Ventas es opcional: sin él se arma el día con lo que se pueda
 * sacar del detalle, y las columnas de recibos y clientes quedan vacías.
 */
export function transformarDias(filasVentas, detalle) {
  const porDia = new Map();

  for (const d of detalle) {
    let x = porDia.get(d.fecha);
    if (!x) {
      x = { fecha: d.fecha, ingresos_productos: 0, ingreso_envio: 0,
            unidades: 0, piezas: 0, renglones: 0 };
      porDia.set(d.fecha, x);
    }
    if (d.es_servicio_envio) {
      // El envío no es un platillo: no cuenta como renglón de venta ni suma
      // unidades. Solo aporta su ingreso, por separado.
      x.ingreso_envio += d.ingresos;
    } else {
      x.renglones++;
      x.ingresos_productos += d.ingresos;
      x.unidades += d.cantidad;
      // Las piezas solo cuentan para lo que de verdad se vende por pieza:
      // gorditas, bocoles, migadas, tacos. Las quesadillas y las enchiladas
      // se venden por orden, y sumar sus 'piezas equivalentes' aquí daría un
      // número que no significa nada.
      if (d.unidad_venta === 'PIEZA') x.piezas += d.piezas_equivalentes;
    }
  }

  // El reporte de Ventas solo ENRIQUECE días que ya existen en el detalle;
  // nunca crea uno nuevo.
  //
  // Los dos reportes se exportan por separado y es normal que no terminen el
  // mismo día. Si el de ventas llega más lejos, esos días traen el total del
  // día pero ningún producto. Crearlos daría un día con cero platillos y todo
  // el dinero atribuido a envío — un número inventado. Mejor no guardarlos y
  // avisar que los dos archivos no coinciden.
  const diasSoloVentas = [];
  for (const fila of filasVentas || []) {
    const v = fila.v;
    const fecha = aFechaISO(v[0]);
    if (!fecha) continue;
    const x = porDia.get(fecha);
    if (!x) { diasSoloVentas.push(fecha); continue; }
    x.ingresos_totales = aNumero(v[1]);
    x.recibos = aNumero(v[3]);
    x.clientes = aNumero(v[4]);
    x.ticket_promedio = aNumero(v[5]);
  }
  diasSoloVentas.sort();

  const salida = [];
  for (const x of porDia.values()) {
    const productos = redondear(x.ingresos_productos, 2);
    const envioItem = redondear(x.ingreso_envio, 2);
    const totales = x.ingresos_totales !== undefined && x.ingresos_totales !== null
      ? redondear(x.ingresos_totales, 2)
      : redondear(productos + envioItem, 2);

    // El envío es lo que sobra del total del día una vez descontados los
    // productos. Da igual si se cobró como item del menú o por el campo
    // nativo de Poster: los dos mecanismos caben en esa resta, y no hay forma
    // de separarlos más que por diferencia.
    //
    // Es una identidad, no una estimación: se comprobó contra los 1,106 días
    // del histórico y cuadra en todos.
    const envio = redondear(totales - productos, 2);

    salida.push({
      sucursal: SUCURSAL,
      fecha: x.fecha,
      ingresos_totales: totales,
      ingresos_productos: productos,
      ingreso_envio: envio,
      recibos: x.recibos ?? null,
      clientes: x.clientes ?? null,
      ticket_promedio: x.ticket_promedio ?? null,
      unidades: redondear(x.unidades, 2),
      piezas: redondear(x.piezas, 2),
      renglones: x.renglones,
    });
  }
  salida.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  return { dias: salida, diasSoloVentas };
}

// ─── entrada principal ───────────────────────────────────────────────────────

/**
 * Procesa un archivo ya leído (matriz de celdas) contra los catálogos.
 * `matrizVentas` es opcional.
 *
 * Devuelve todo agrupado por periodo, porque cada mes se guarda por separado:
 * si un mes falla, los otros ya quedaron.
 */
export function procesar({ matrizProductos, matrizVentas, catalogos, archivo }) {
  const prod = leerMatriz(matrizProductos, ESQUEMA_PRODUCTOS, 'productos');
  if (prod.error) return { error: prod.error };
  if (prod.vacia || !prod.filas.length) {
    return { error: 'El archivo de productos no trae ningún renglón de venta.' };
  }

  let filasVentas = [];
  if (matrizVentas) {
    const ven = leerMatriz(matrizVentas, ESQUEMA_VENTAS, 'ventas');
    if (ven.error) return { error: ven.error };
    filasVentas = ven.filas;
  }

  const t = transformarProductos(prod.filas, catalogos);
  const { dias, diasSoloVentas } = transformarDias(filasVentas, t.detalle);

  // Se parte por mes. Reindexar `_k` dentro de cada mes es necesario porque
  // el servidor reserva un bloque de id por llamada.
  const meses = t.periodos.map((periodo) => {
    const mapa = new Map();
    const detalle = [];
    for (const d of t.detalle) {
      if (d.periodo !== periodo) continue;
      const nuevo = { ...d, _k: detalle.length };
      mapa.set(d._k, nuevo._k);
      detalle.push(nuevo);
    }
    const mods = [];
    for (const m of t.mods) {
      if (m.periodo !== periodo) continue;
      const d = mapa.get(m._d);
      if (d === undefined) continue;
      mods.push({ ...m, _d: d });
    }
    const dia = dias.filter((x) => x.fecha.substring(0, 7) === periodo);
    return {
      periodo, detalle, mods, dia,
      unidades: redondear(detalle.filter((d) => !d.es_servicio_envio)
        .reduce((s, d) => s + d.cantidad, 0), 2),
      ingresos: redondear(detalle.filter((d) => !d.es_servicio_envio)
        .reduce((s, d) => s + d.ingresos, 0), 2),
    };
  });

  return {
    error: null,
    archivo: archivo || null,
    meses,
    periodos: t.periodos,
    sinClasificar: t.sinClasificar,
    productosNuevos: t.productosNuevos,
    incidencias: t.incidencias,
    diasSoloVentas,
    totales: {
      renglones: t.detalle.length,
      modificadores: t.mods.length,
      dias: dias.length,
      unidades: t.totalUnidades,
      ingresos: t.totalIngresos,
    },
  };
}
