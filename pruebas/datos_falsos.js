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

export async function traerProductosRango(desde, hasta) {
  const { prodDia } = await esperar();
  return agrupar(
    prodDia.filter((f) => enRango(f, desde, hasta)),
    ['producto'],
    ['unidades', 'ingresos', 'renglones', 'extras', 'peticiones', 'piezas'],
    { familia: (f) => f.familia, unidad_venta: (f) => f.unidad_venta },
  );
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
