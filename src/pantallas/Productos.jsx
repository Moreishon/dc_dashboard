// =============================================================================
// Productos
// =============================================================================
//
// Dos listas de "los que más venden" —por dinero y por volumen— porque no son
// la misma lista y sirven para cosas distintas: el volumen dice carga de
// cocina, el dinero dice de qué vives.
//
// Y dos listas de movimiento: los que subieron y los que bajaron CONTRA SÍ
// MISMOS. "El que menos vende" siempre es el mismo producto chiquito y no dice
// nada; el que cayó 40% contra su propio periodo anterior sí.
//
// Todo se agrega en el servidor, para el rango que esté puesto arriba. Bajar
// al navegador un agregado por producto y día serían 43,304 renglones; el
// servidor los agrega en milisegundos gracias al índice por fecha.
// =============================================================================

import { useMemo, useState, useEffect } from 'react';
import { comparaciones, cuantosDias } from '../rango.js';
import { traerProductosRango } from '../datos.js';
import { Barras, Numeros, Delta, SERIES } from '../graficas.jsx';
import {
  C, tarjeta, tituloTarjeta, nota, rejilla, pastilla,
  pesos, pesosExactos, numero, rangoLegible,
} from '../estilo.js';

function Tarjeta({ titulo, sub, children }) {
  return (
    <div style={tarjeta()}>
      <h3 style={tituloTarjeta}>{titulo}</h3>
      {sub && <p style={{ fontSize: '13px', color: C.tinta3, margin: '4px 0 14px',
                          lineHeight: 1.5 }}>{sub}</p>}
      {!sub && <div style={{ height: '14px' }} />}
      {children}
    </div>
  );
}

function ListaMovimiento({ filas, vacio }) {
  if (!filas.length) {
    return <p style={{ fontSize: '13.5px', color: C.tinta3 }}>{vacio}</p>;
  }
  return (
    <div>
      {filas.map((f) => (
        <div key={f.producto} style={{ display: 'flex', gap: '12px',
                                       alignItems: 'center', padding: '10px 0',
                                       borderBottom: `1px solid ${C.linea}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14.5px', color: C.tinta, fontWeight: 500,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap' }}>{f.producto}</div>
            <div style={{ fontSize: '12px', color: C.tinta4,
                          fontVariantNumeric: 'tabular-nums' }}>
              {numero(f.unidadesBase)} → {numero(f.unidades)} unidades
              {f.estado === 'sin ventas' && ' · no se vendió'}
            </div>
          </div>
          <div style={{ flex: 'none', fontSize: '14px' }}>
            <Delta valor={f.cambio} decimales={0} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Compara dos cortes de productos, normalizando por día. */
function movimiento(ahora, base, { diasA, diasB, minimo = 20 }) {
  const factor = (diasA && diasB) ? (diasB / diasA) : 1;
  const mapaBase = new Map(base.map((f) => [f.producto, f]));
  const mapaAhora = new Map(ahora.map((f) => [f.producto, f]));
  const frios = [], calientes = [];

  for (const [producto, b] of mapaBase) {
    const unidadesBase = +b.unidades || 0;
    if (unidadesBase < minimo) continue;
    const a = mapaAhora.get(producto);
    const unidades = a ? +a.unidades || 0 : 0;
    const cambio = Math.round((((unidades * factor) - unidadesBase) / unidadesBase) * 1000) / 10;
    const fila = {
      producto, familia: b.familia, unidadesBase, unidades,
      ingresos: a ? +a.ingresos || 0 : 0,
      cambio,
      estado: unidades === 0 ? 'sin ventas' : (cambio > 0 ? 'al alza' : 'a la baja'),
    };
    if (cambio < 0) frios.push(fila);
    else if (cambio > 0) calientes.push(fila);
  }
  return {
    frios: frios.sort((x, y) => x.cambio - y.cambio).slice(0, 12),
    calientes: calientes.sort((x, y) => y.cambio - x.cambio).slice(0, 12),
  };
}

export default function Productos({ rango, esAncho }) {
  const [contra, setContra] = useState('anterior');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cmp = useMemo(() => comparaciones(rango), [rango]);
  const base = contra === 'anterior' ? cmp.anterior : cmp.anioPasado;

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    (async () => {
      try {
        const [ahora, antes] = await Promise.all([
          traerProductosRango(rango.desde, rango.hasta),
          traerProductosRango(base.desde, base.hasta),
        ]);
        if (!vivo) return;
        setDatos({ ahora, antes });
        setError('');
      } catch (e) {
        if (vivo) setError([e.message, e.detalle].filter(Boolean).join(' — '));
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [rango.desde, rango.hasta, base.desde, base.hasta]);

  const calc = useMemo(() => {
    if (!datos) return null;
    const { ahora, antes } = datos;
    const total = ahora.reduce((s, f) => s + (+f.ingresos || 0), 0);
    const unidades = ahora.reduce((s, f) => s + (+f.unidades || 0), 0);

    const porDinero = [...ahora].sort((a, b) => b.ingresos - a.ingresos).slice(0, 12);
    const porVolumen = [...ahora].sort((a, b) => b.unidades - a.unidades).slice(0, 12);

    const diasA = cuantosDias(rango.desde, rango.hasta);
    const diasB = cuantosDias(base.desde, base.hasta);
    const normaliza = diasA !== diasB;

    return {
      total, unidades, cuantos: ahora.length, diasA, diasB, normaliza,
      porDinero, porVolumen,
      ...movimiento(ahora, antes, { diasA, diasB }),
      hayBase: antes.length > 0,
    };
  }, [datos, rango, base]);

  return (
    <div style={{ padding: '18px',
                  paddingBottom: 'calc(44px + env(safe-area-inset-bottom))' }}>

      {error && <div style={nota('error')}>{error}</div>}

      {cargando && !calc && (
        <div style={{ padding: '30px 0', color: C.tinta3, fontSize: '14px' }}>
          Cargando los productos del periodo…
        </div>
      )}

      {calc && (
        <>
          <div style={{ ...tarjeta(), display: 'flex', gap: '24px',
                        flexWrap: 'wrap', alignItems: 'baseline' }}>
            {[['Productos', numero(calc.cuantos)],
              ['Unidades', numero(calc.unidades)],
              ['Ingresos', pesos(calc.total)]].map(([et, v]) => (
              <div key={et}>
                <div style={{ fontSize: '10.5px', color: C.tinta4,
                              textTransform: 'uppercase', letterSpacing: '0.09em',
                              fontWeight: 700, marginBottom: '5px' }}>{et}</div>
                <div style={{ fontSize: '24px', fontWeight: 700,
                              letterSpacing: '-0.02em' }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={rejilla(esAncho, '330px')}>
            <Tarjeta titulo="Los que más dinero dejan"
                     sub="Por ingreso del periodo.">
              <Barras datos={calc.porDinero.slice(0, 10).map((p) => ({
                etiqueta: p.producto, valor: +p.ingresos,
                nota: `${numero(p.unidades)} unidades · ${calc.total
                  ? Math.round((p.ingresos / calc.total) * 100) : 0}% de las ventas`,
              }))} formato={pesos} />
              <Numeros filas={calc.porDinero} columnas={[
                { titulo: 'Producto', valor: (f) => f.producto },
                { titulo: 'Unidades', valor: (f) => numero(f.unidades) },
                { titulo: 'Ingresos', valor: (f) => pesosExactos(f.ingresos) },
                { titulo: '% ventas', valor: (f) => `${calc.total
                  ? ((f.ingresos / calc.total) * 100).toFixed(1) : 0}%` },
              ]} />
            </Tarjeta>

            <Tarjeta titulo="Los que más se venden"
                     sub="Por unidades. No es la misma lista que la de arriba, y esa diferencia es la información.">
              <Barras datos={calc.porVolumen.slice(0, 10).map((p) => ({
                etiqueta: p.producto, valor: +p.unidades, color: SERIES[1],
                nota: pesos(p.ingresos),
              }))} formato={numero} />
              <Numeros filas={calc.porVolumen} columnas={[
                { titulo: 'Producto', valor: (f) => f.producto },
                { titulo: 'Unidades', valor: (f) => numero(f.unidades) },
                { titulo: 'Ingresos', valor: (f) => pesosExactos(f.ingresos) },
                { titulo: 'Por unidad', valor: (f) => pesosExactos(
                  f.unidades ? f.ingresos / f.unidades : 0) },
              ]} />
            </Tarjeta>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px',
                        margin: '4px 0 14px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12.5px', color: C.tinta4 }}>Comparar contra</span>
            <button onClick={() => setContra('anterior')}
                    style={pastilla(contra === 'anterior')}>
              {cmp.anterior.nombre}
            </button>
            <button onClick={() => setContra('anio')}
                    style={pastilla(contra === 'anio')}>
              {cmp.anioPasado.nombre}
            </button>
            <span style={{ fontSize: '12.5px', color: C.tinta4 }}>
              {rangoLegible(base.desde, base.hasta)}
            </span>
          </div>

          {!calc.hayBase ? (
            <div style={nota('aviso')}>
              No hay datos de {rangoLegible(base.desde, base.hasta)},
              así que no se puede comparar.
            </div>
          ) : (
            <>
              <div style={nota('aviso')}>
                Se comparan <b>unidades, no dinero</b>, para que un cambio de
                precio no se confunda con un cambio de demanda. Se ignoran los
                productos que en el periodo base vendieron menos de 20 unidades:
                pasar de 3 a 1 es un −67% que no significa nada.
                {calc.normaliza && (
                  <>
                    {' '}Los dos periodos tienen distinto largo ({calc.diasA} días
                    contra {calc.diasB}), así que la comparación es{' '}
                    <b>por día vendido</b>. Es una aproximación: la primera parte
                    de un mes no se vende igual que la última.
                  </>
                )}
              </div>

              <div style={rejilla(esAncho, '330px')}>
                <Tarjeta titulo="Se enfriaron"
                         sub="Los que más cayeron contra sí mismos. Uno puede aparecer aquí porque lo quitaste del menú — en los datos se ve igual y significa otra cosa.">
                  <ListaMovimiento filas={calc.frios.slice(0, 10)}
                                   vacio="Ningún producto cayó en este periodo." />
                  <Numeros filas={calc.frios} columnas={[
                    { titulo: 'Producto', valor: (f) => f.producto },
                    { titulo: 'Antes', valor: (f) => numero(f.unidadesBase) },
                    { titulo: 'Ahora', valor: (f) => numero(f.unidades) },
                    { titulo: 'Cambio', valor: (f) => <Delta valor={f.cambio} /> },
                  ]} />
                </Tarjeta>

                <Tarjeta titulo="Se calentaron"
                         sub="Los que más crecieron. Sirve para saber qué está jalando solo.">
                  <ListaMovimiento filas={calc.calientes.slice(0, 10)}
                                   vacio="Ningún producto creció en este periodo." />
                  <Numeros filas={calc.calientes} columnas={[
                    { titulo: 'Producto', valor: (f) => f.producto },
                    { titulo: 'Antes', valor: (f) => numero(f.unidadesBase) },
                    { titulo: 'Ahora', valor: (f) => numero(f.unidades) },
                    { titulo: 'Cambio', valor: (f) => <Delta valor={f.cambio} /> },
                  ]} />
                </Tarjeta>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
