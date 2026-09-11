// =============================================================================
// El módulo de datos, falso
// =============================================================================
//
// Reemplaza a src/datos.js dentro del banco de pruebas. Hace en el navegador el
// mismo cálculo que hacen las funciones de Postgres, pero sobre fixtures por
// día en vez de contra Supabase.
//
// Así las pantallas se prueban tal cual son —sin tocarlas para "hacerlas
// probables"— y lo único simulado es de dónde vienen los números.
// =============================================================================

const SEP = '';

/** Espera a que el banco publique los fixtures. */
const esperar = async () => {
  for (let i = 0; i < 200 && !window.__falso; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  return window.__falso || { prodDia: [], guisDia: [], modDia: [] };
};

function agrupar(filas, llaves, sumas, extras = {}) {
  const m = new Map();
  for (const f of filas) {
    const k = llaves.map((l) => f[l]).join(SEP);
    if (!m.has(k)) {
      const base = {};
      for (const l of llaves) base[l] = f[l];
      for (const s of sumas) base[s] = 0;
      for (const [k2, fn] of Object.entries(extras)) base[k2] = fn(f);
      m.set(k, base);
    }
    const o = m.get(k);
    for (const s of sumas) o[s] += +f[s] || 0;
  }
  return [...m.values()];
}

const enRango = (f, desde, hasta) => f.fecha >= desde && f.fecha <= hasta;

// La categoría se pega al consultar, igual que el left join de
// dc_productos_rango contra el catálogo. Se hace así y no metiéndola en el
// fixture por día justamente para reproducir esa parte: un producto sin
// clasificar tiene que seguir apareciendo, con categoría nula.
const categoriaDe = () => new Map(
  (window.__falso?.categorias || []).map((c) => [c.producto, c.categoria]));

export async function traerProductosRango(desde, hasta) {
  const { prodDia } = await esperar();
  const cat = categoriaDe();
  return agrupar(
    prodDia.filter((f) => enRango(f, desde, hasta)),
    ['producto'],
    ['unidades', 'ingresos', 'renglones', 'extras', 'peticiones', 'piezas'],
    { familia: (f) => f.familia, unidad_venta: (f) => f.unidad_venta,
      categoria: (f) => cat.get(f.producto) ?? null },
  );
}

// ─── catálogo ────────────────────────────────────────────────────────────────

export async function traerCategorias() {
  await esperar();
  const vistas = new Map();
  for (const c of window.__falso?.categorias || []) {
    if (c.categoria) vistas.set(c.categoria, +c.orden || 99);
  }
  return [...vistas.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([categoria, orden]) => ({ categoria, orden, activa: true }));
}

export async function traerCatalogoProductos() {
  const { prodDia } = await esperar();
  const cat = categoriaDe();
  const m = new Map();
  for (const f of prodDia) {
    const o = m.get(f.producto) || {
      producto: f.producto, familia: f.familia,
      categoria: cat.get(f.producto) ?? null,
      unidad_venta: f.unidad_venta, activo: true,
      guisados_incluidos: /^Migada/.test(f.producto) ? 2 : 1,
      unidades: 0, ingresos: 0, renglones: 0,
      ultima_venta: null, primera_venta: null,
    };
    o.unidades += +f.unidades || 0;
    o.ingresos += +f.ingresos || 0;
    o.renglones += +f.renglones || 0;
    if (!o.ultima_venta || f.fecha > o.ultima_venta) o.ultima_venta = f.fecha;
    if (!o.primera_venta || f.fecha < o.primera_venta) o.primera_venta = f.fecha;
    m.set(f.producto, o);
  }
  const salida = [...m.values()].sort((a, b) => b.unidades - a.unidades);
  window.__falso.catalogo = salida;
  return salida;
}

// ─── extras que van dentro del platillo ──────────────────────────────────────
//
// Reproduce dc_extras_rango. El precio ya viene resuelto en el fixture, igual
// que en dc_m_extra_precio_usado: la cascada de tres niveles —par reciente,
// extra en general, par viejo— se calcula al refrescar, no al consultar.
//
// Eso dejó de ser una función en la base por una razón concreta: Postgres no
// registra la dependencia entre el cuerpo de una función SQL y las tablas que
// usa, así que un 'drop cascade' la dejaba apuntando a una vista que ya no
// existía. Siendo vista materializada, Postgres cuida todas las ligas.
export async function traerExtrasRango(desde, hasta) {
  const { extraDia, extraPrecio } = await esperar();
  const mes = hasta.slice(0, 7);

  const precios = new Map();
  for (const r of extraPrecio || []) {
    if (r.periodo > mes) continue;
    const k = `${r.extra}\u0000${r.producto}`;
    const y = precios.get(k);
    if (!y || r.periodo > y.periodo) precios.set(k, r);
  }

  const acum = new Map();
  const mete = (llave, campos, f, precio) => {
    const o = acum.get(llave) || {
      extra: campos.extra, es_grupo: false, pertenece_a: campos.pertenece_a,
      es_segundo_guiso: false, porciones: 0, pedidos: 0, unidades_afectadas: 0,
      porciones_cobrables: 0, precio_min: null, precio_max: null,
      confianza: null, ingreso_estimado: null, porciones_sin_precio: 0,
      es_guiso_mal_etiquetado: true, _hijos: new Set(),
    };
    const real = f.real === 'true' || f.real === 't' || f.real === true;
    const po = +f.porciones || 0;
    o.porciones += po;
    o.pedidos += +f.pedidos || 0;
    o.unidades_afectadas += +f.unidades || 0;
    if (f.es_segundo_guiso === 'true' || f.es_segundo_guiso === 't') o.es_segundo_guiso = true;
    if (real) {
      o.es_guiso_mal_etiquetado = false;
      o.porciones_cobrables += po;
      if (precio) {
        const v = +precio.precio_estimado;
        o.precio_min = o.precio_min == null ? v : Math.min(o.precio_min, v);
        o.precio_max = o.precio_max == null ? v : Math.max(o.precio_max, v);
        o.confianza = o.confianza == null
          ? +precio.confianza : Math.min(o.confianza, +precio.confianza);
        o.ingreso_estimado = (o.ingreso_estimado || 0) + po * v;
      } else {
        o.porciones_sin_precio += po;
      }
    }
    o._hijos.add(f.extra);
    acum.set(llave, o);
  };

  for (const f of extraDia || []) {
    if (f.fecha < desde || f.fecha > hasta) continue;
    const precio = precios.get(`${f.extra}\u0000${f.producto}`);
    mete(`G\u0000${f.agrupado}`, { extra: f.agrupado, pertenece_a: null }, f, precio);
    if (f.grupo) {
      mete(`M\u0000${f.extra}`, { extra: f.extra, pertenece_a: f.grupo }, f, precio);
    }
  }

  return [...acum.values()].map((o) => {
    const { _hijos, ...r } = o;
    return {
      ...r,
      es_grupo: r.pertenece_a === null && _hijos.size > 1,
      ingreso_estimado: r.ingreso_estimado == null
        ? null : Math.round(r.ingreso_estimado * 100) / 100,
    };
  });
}

export async function guardarGuisadosIncluidos(producto, cuantos) {
  const f = (window.__falso.catalogo || []).find((x) => x.producto === producto);
  if (f) f.guisados_incluidos = cuantos;
}

export async function guardarCategoria(producto, categoria) {
  const filas = window.__falso.categorias;
  const i = filas.findIndex((c) => c.producto === producto);
  if (i >= 0) filas[i] = { ...filas[i], categoria: categoria || null };
  else filas.push({ producto, categoria: categoria || null, orden: 99 });
}

export async function traerGuisadosRango(desde, hasta) {
  const { guisDia } = await esperar();
  return agrupar(
    guisDia.filter((f) => enRango(f, desde, hasta)),
    ['guisado'],
    ['unidades_atribuidas', 'unidades_presencia', 'renglones'],
  );
}

export async function traerModificadoresRango(desde, hasta) {
  const { modDia } = await esperar();
  return agrupar(
    modDia.filter((f) => enRango(f, desde, hasta)),
    ['tipo', 'modificador'],
    ['veces', 'renglones', 'unidades_afectadas'],
  );
}

export const faltaConfiguracion = false;
export const sb = null;
