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
import { traerProductosRango, traerExtrasRango } from '../datos.js';
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

/**
 * La lista completa, sin recortar.
 *
 * Las tarjetas de arriba enseñan diez porque un ranking de 82 no se lee. Pero
 * "no se lee de corrido" no es lo mismo que "no se necesita": para saber si el
 * producto 40 vendió algo esta semana hay que poder llegar a él. Por eso aquí
 * están todos, y por eso esta tabla se puede ordenar.
 *
 * Va como tabla y no como gráfica a propósito. Una barra contesta "¿cómo
 * viene?"; esto contesta "¿cuánto exactamente, y dónde está el que busco?".
 */
function TablaCompleta({ filas, total, dias }) {
  const [orden, setOrden] = useState('ingresos');
  const ordenadas = useMemo(() => [...filas].sort((a, b) => {
    if (orden === 'producto') return a.producto.localeCompare(b.producto, 'es');
    return (+b[orden] || 0) - (+a[orden] || 0);
  }), [filas, orden]);

  if (!filas.length) {
    return <p style={{ fontSize: '13.5px', color: C.tinta3 }}>
      No se vendió nada de esta sección en el periodo.
    </p>;
  }

  const COLS = [
    ['producto', 'Producto', 'left'],
    ['unidades', 'Unidades', 'right'],
    ['ingresos', 'Ingresos', 'right'],
    ['porDia',   'Por día',  'right'],
    ['parte',    '% ventas', 'right'],
  ];

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
        <thead>
          <tr>
            {COLS.map(([k, t, al]) => {
              const ordenable = k === 'producto' || k === 'unidades' || k === 'ingresos';
              return (
                <th key={k}
                    onClick={ordenable ? () => setOrden(k) : undefined}
                    style={{
                      textAlign: al, padding: '7px 10px 7px 0', whiteSpace: 'nowrap',
                      fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      color: orden === k ? C.naranja : C.tinta4,
                      cursor: ordenable ? 'pointer' : 'default',
                      borderBottom: `1px solid ${C.lineaFuerte}`,
                    }}>
                  {t}{orden === k ? ' ▾' : ''}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f) => (
            <tr key={f.producto}>
              <td style={{ padding: '7px 10px 7px 0', color: C.tinta,
                           borderBottom: `1px solid ${C.linea}` }}>
                {f.producto}
                {!f.categoria && (
                  <span style={{ color: C.rojo, fontSize: '11px', marginLeft: '7px' }}>
                    sin categoría
                  </span>
                )}
              </td>
              {[numero(f.unidades),
                pesosExactos(f.ingresos),
                // Por día, con un decimal: para comparar periodos de distinto
                // largo sin pensarle. Redondeado a entero, todo lo que vende
                // menos de una unidad al día saldría en cero — que es la mitad
                // del catálogo y justo lo que uno quiere ver aquí.
                dias ? ((+f.unidades || 0) / dias).toFixed(1) : '—',
                `${total ? ((f.ingresos / total) * 100).toFixed(1) : 0}%`,
              ].map((v, i) => (
                <td key={i} style={{ textAlign: 'right', padding: '7px 10px 7px 0',
                                     color: C.tinta2, whiteSpace: 'nowrap',
                                     fontVariantNumeric: 'tabular-nums',
                                     borderBottom: `1px solid ${C.linea}` }}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Los extras que van DENTRO del platillo.
 *
 * Bistec, Queso, Frijoles, Huevo Revuelto, Relleno de Guisados. No son
 * productos: no tienen renglón propio ni ingreso propio, van sumados al precio
 * del platillo al que se los pusieron.
 *
 * Tres cosas que esta tarjeta hace y ninguna es obvia
 * --------------------------------------------------
 * **El dinero NO se suma al total.** Ya está contado dentro del platillo. Lo
 * que se enseña es un desglose —"de lo que vendiste, tanto vino de extras"—, no
 * un ingreso aparte. Sumarlo al reparto por sección sería contarlo dos veces, y
 * por eso vive en su propia tarjeta y no en la gráfica de arriba.
 *
 * **El precio es estimado, y se dice cuánto.** Nadie lo capturó: sale de
 * comparar un renglón que lleva ese extra contra el precio de lista del mismo
 * producto en el mismo mes. La confianza es qué proporción de los casos cayó en
 * el valor elegido; abajo de 0.8 el número se marca.
 *
 * **Lo que no es un extra, se aparta.** Queso y Frijoles son guisado en unos
 * productos y extra en otros. Cuando la regla los etiqueta mal —el queso de las
 * empanadas es el relleno, no un extra— sale como "nunca se cobra". Esos van
 * en su propio bloque, en vez de arrastrar el promedio a cero.
 */
/**
 * Lo que más deja cada sección, todo a la vista.
 *
 * Es la otra mitad del filtro de arriba. El filtro sirve para meterse en una
 * sección; esto sirve para lo contrario: ver las nueve de un jalón y notar que
 * Antojitos deja más dinero que Clásicos con la quinta parte de las unidades.
 * Esa comparación no se puede hacer entrando y saliendo de un filtro.
 *
 * Tres por sección y no diez: aquí la pregunta es "¿quién manda en cada una?",
 * no "¿cuál es el ranking completo?". Para eso está la tabla de abajo.
 */
function TopPorCategoria({ categorias, esAncho, alElegir }) {
  if (!categorias.length) return null;
  return (
    <div style={{ display: 'grid', gap: '14px',
                  gridTemplateColumns: esAncho
                    ? 'repeat(auto-fit, minmax(260px, 1fr))' : '1fr' }}>
      {categorias.map((c, i) => (
        <div key={c.categoria} style={{
          border: `1px solid ${C.linea}`, borderRadius: '12px', padding: '13px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px',
                        marginBottom: '9px' }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '3px',
                           flex: 'none',
                           background: i < SERIES.length ? SERIES[i] : '#BCADA2' }} />
            <button onClick={() => alElegir(c.categoria)}
              style={{ background: 'none', border: 'none', padding: 0,
                       cursor: 'pointer', fontFamily: 'inherit',
                       fontSize: '14.5px', fontWeight: 700, color: C.tinta,
                       textDecoration: 'underline', textDecorationColor: C.linea,
                       textUnderlineOffset: '3px' }}>
              {c.categoria}
            </button>
            <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 600,
                           fontVariantNumeric: 'tabular-nums' }}>
              {pesos(c.ingresos)}
            </span>
          </div>
          {c.top.map((p, j) => (
            <div key={p.producto} style={{ display: 'flex', gap: '8px',
                                           alignItems: 'baseline',
                                           padding: '4px 0', fontSize: '13px' }}>
              <span style={{ color: C.tinta4, flex: 'none', width: '14px' }}>
                {j + 1}
              </span>
              <span style={{ flex: 1, minWidth: 0, color: C.tinta2,
                             overflow: 'hidden', textOverflow: 'ellipsis',
                             whiteSpace: 'nowrap' }}>{p.producto}</span>
              <span style={{ flex: 'none', color: C.tinta3,
                             fontVariantNumeric: 'tabular-nums' }}>
                {numero(p.unidades)} u.
              </span>
              <span style={{ flex: 'none', fontWeight: 600, width: '72px',
                             textAlign: 'right',
                             fontVariantNumeric: 'tabular-nums' }}>
                {pesos(p.ingresos)}
              </span>
            </div>
          ))}
          {c.top.length === 0 && (
            <div style={{ fontSize: '13px', color: C.tinta4 }}>
              Sin ventas en el periodo.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Un precio, o un rango cuando el mismo extra cuesta distinto según el
 * platillo. El rango no es un defecto del cálculo: el guiso de más cuesta $8 en
 * gorditas y $5 en bocoles, y aplanarlo a un promedio inventaría un precio que
 * no existe en ningún lado.
 */
function precioDeExtra(f) {
  if (f.precio_min == null) return null;
  const a = +f.precio_min, b = +f.precio_max;
  return a === b ? `$${a.toFixed(0)}` : `$${a.toFixed(0)}–${b.toFixed(0)}`;
}

/**
 * Un extra, con su desglose si es un grupo.
 *
 * Va FUERA de ExtrasDelPlatillo, como todos los componentes de este proyecto.
 * Definido adentro, React lo trataría como un componente distinto en cada
 * render y desmontaría el desplegable justo al abrirlo.
 */
function RenglonExtra({ f, dentro, miembros, abierto, alternar }) {
  const hijos = miembros.get(f.extra) || [];
  const esGrupo = f.es_grupo && hijos.length > 0;
  const p = precioDeExtra(f);
  return (
    <div style={{
      padding: dentro ? '7px 0 7px 20px' : '10px 0',
      borderBottom: dentro ? 'none' : `1px solid ${C.linea}`,
      borderLeft: dentro ? `2px solid ${C.linea}` : 'none',
      marginLeft: dentro ? '8px' : 0,
    }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: dentro ? '13px' : '14.5px',
                       color: dentro ? C.tinta2 : C.tinta,
                       fontWeight: dentro ? 400 : 500 }}>
          {f.extra}
          {f.es_segundo_guiso && (
            <span style={{ fontSize: '11px', color: C.naranjaHondo,
                           marginLeft: '7px', fontWeight: 600 }}>
              guiso de más
            </span>
          )}
        </span>
        <span style={{ flex: 'none', fontSize: dentro ? '13px' : '14px',
                       fontWeight: dentro ? 400 : 700,
                       fontVariantNumeric: 'tabular-nums' }}>
          {numero(f.porciones)}
        </span>
      </div>
      <div style={{ fontSize: '11.5px', color: C.tinta4, marginTop: '2px' }}>
        en {numero(f.pedidos)} {+f.pedidos === 1 ? 'pedido' : 'pedidos'}
        {+f.porciones_cobrables < +f.porciones && (
          <> · {numero(f.porciones_cobrables)} como extra,
             {' '}{numero(+f.porciones - +f.porciones_cobrables)} como guiso</>
        )}
        {p
          ? <> · {p} c/u ≈ {pesos(f.ingreso_estimado)}
              {+f.confianza < 0.8 && (
                <span style={{ color: C.aviso, fontWeight: 600 }}>
                  {' '}· precio poco firme
                </span>)}
            </>
          : <span> · sin precio estimable</span>}
      </div>
      {esGrupo && (
        <button onClick={() => alternar(f.extra)}
          style={{ background: 'none', border: 'none', cursor: 'pointer',
                   fontFamily: 'inherit', fontSize: '12px', fontWeight: 600,
                   color: C.tinta3, padding: '5px 0 2px', display: 'flex',
                   alignItems: 'center', gap: '5px' }}>
          <span style={{ fontSize: '9px' }}>{abierto[f.extra] ? '▼' : '▶'}</span>
          {abierto[f.extra] ? 'Ocultar' : `Ver los ${hijos.length} términos`}
        </button>
      )}
      {esGrupo && abierto[f.extra] && hijos.map((h) => (
        <RenglonExtra key={h.extra} f={h} dentro miembros={miembros}
                      abierto={abierto} alternar={alternar} />
      ))}
    </div>
  );
}

function ExtrasDelPlatillo({ rango, ingresosDelPeriodo }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState({});

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = await traerExtrasRango(rango.desde, rango.hasta);
        if (vivo) { setFilas(d); setError(''); }
      } catch (e) {
        if (vivo) setError([e.message, e.detalle].filter(Boolean).join(' — '));
      }
    })();
    return () => { vivo = false; };
  }, [rango.desde, rango.hasta]);

  const calc = useMemo(() => {
    if (!filas) return null;
    const n = (x) => +x || 0;
    // La consulta trae dos niveles en la misma respuesta: lo que se enseña
    // (pertenece_a nulo) y el desglose de adentro de cada grupo. Traerlos
    // juntos evita ir a la red otra vez solo para abrir un desplegable.
    const visibles = filas.filter((f) => !f.pertenece_a)
                          .sort((a, b) => n(b.porciones) - n(a.porciones));
    const miembros = new Map();
    for (const f of filas.filter((x) => x.pertenece_a)) {
      const l = miembros.get(f.pertenece_a) || [];
      l.push(f);
      miembros.set(f.pertenece_a, l);
    }
    for (const l of miembros.values()) l.sort((a, b) => n(b.porciones) - n(a.porciones));

    const reales = visibles.filter((f) => !f.es_guiso_mal_etiquetado);
    const dudosos = visibles.filter((f) => f.es_guiso_mal_etiquetado);
    return {
      reales, dudosos, miembros,
      porciones: reales.reduce((s, f) => s + n(f.porciones), 0),
      pedidos: reales.reduce((s, f) => s + n(f.pedidos), 0),
      ingreso: reales.reduce((s, f) => s + n(f.ingreso_estimado), 0),
      sinPrecio: reales.filter((f) => f.precio_min == null).length,
      hayGuisoExtra: reales.some((f) => f.es_segundo_guiso),
    };
  }, [filas]);

  if (error) return <div style={nota('error')}>{error}</div>;
  if (!calc) {
    return <div style={{ ...tarjeta(), color: C.tinta3, fontSize: '14px' }}>
      Cargando los extras del periodo…
    </div>;
  }
  if (!calc.reales.length && !calc.dudosos.length) {
    return <Tarjeta titulo="Extras que van dentro del platillo"
                    sub="No se registró ninguno en este periodo.">{null}</Tarjeta>;
  }

  const parte = ingresosDelPeriodo ? (calc.ingreso / ingresosDelPeriodo) * 100 : 0;

  return (
    <>
      <Tarjeta
        titulo="Extras que van dentro del platillo"
        sub="Bistec, huevos, relleno, queso, frijoles, y el guiso que pasa de los incluidos. No son productos: van sumados al precio del platillo, así que no tienen renglón propio. Aquí sí se pueden contar.">

        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap',
                      alignItems: 'baseline', marginBottom: '14px' }}>
          {[['Porciones', numero(calc.porciones)],
            ['En pedidos', numero(calc.pedidos)],
            ['Cobrado (estimado)', pesos(calc.ingreso)]].map(([et, v]) => (
            <div key={et}>
              <div style={{ fontSize: '10.5px', color: C.tinta4,
                            textTransform: 'uppercase', letterSpacing: '0.09em',
                            fontWeight: 700, marginBottom: '5px' }}>{et}</div>
              <div style={{ fontSize: '24px', fontWeight: 700,
                            letterSpacing: '-0.02em' }}>{v}</div>
            </div>
          ))}
        </div>

        {calc.reales.map((f) => (
          <RenglonExtra key={f.extra} f={f} miembros={calc.miembros}
                        abierto={abierto}
                        alternar={(k) => setAbierto((a) => ({ ...a, [k]: !a[k] }))} />
        ))}

        <Numeros filas={calc.reales} columnas={[
          { titulo: 'Extra', valor: (f) => f.extra },
          { titulo: 'Porciones', valor: (f) => numero(f.porciones) },
          { titulo: 'Pedidos', valor: (f) => numero(f.pedidos) },
          { titulo: 'Cobrables', valor: (f) => numero(f.porciones_cobrables) },
          { titulo: 'Precio est.', valor: (f) => precioDeExtra(f) || '—' },
          { titulo: 'Confianza', valor: (f) => f.confianza != null
              ? (+f.confianza).toFixed(2) : '—' },
          { titulo: 'Cobrado est.', valor: (f) => f.ingreso_estimado != null
              ? pesosExactos(f.ingreso_estimado) : '—' },
        ]} />
      </Tarjeta>

      <div style={nota('aviso')}>
        <b>Ese dinero no se suma a tus ventas: ya está adentro.</b> El cobro del
        extra viaja en el precio del platillo al que se le puso, así que
        {ingresosDelPeriodo > 0 && <>
          {' '}los <b>{pesos(calc.ingreso)}</b> de arriba son
          {' '}<b>{parte.toFixed(1)}%</b> de los {pesos(ingresosDelPeriodo)} del
          periodo, no algo aparte.</>}
        {' '}Por eso no aparecen en el reparto por sección: ahí se contarían dos
        veces.
        {' '}El precio es <b>estimado</b> —nadie lo captura— y sale de comparar
        un platillo con ese extra contra el mismo platillo sin él, en el mismo
        mes. Cuando ves un rango como <i>$5–8</i> es porque cuesta distinto según
        el platillo, no porque el cálculo dude.
        {calc.hayGuisoExtra && <>
          {' '}Lo marcado como <b>guiso de más</b> es el guisado que pasa de los
          que trae el precio: en una gordita, el segundo; en una migada, el
          tercero, porque su precio ya incluye dos. Eso se configura en Catálogo.</>}
        {calc.sinPrecio > 0 && <>
          {' '}De {calc.sinPrecio} no se pudo estimar precio: se cuentan las
          porciones y se deja el dinero en blanco, en vez de inventarlo.</>}
      </div>

      {calc.dudosos.length > 0 && (
        <Tarjeta
          titulo="Estos salen como extra pero parecen guiso"
          sub="En estos productos nunca se cobran, y eso casi siempre quiere decir que no son un extra sino el relleno.">
          {calc.dudosos.map((f) => (
            <div key={f.extra} style={{ display: 'flex', gap: '12px',
                                        alignItems: 'baseline', padding: '9px 0',
                                        borderBottom: `1px solid ${C.linea}` }}>
              <span style={{ flex: 1, fontSize: '14.5px', color: C.tinta }}>
                {f.extra}
              </span>
              <span style={{ fontSize: '13px', color: C.tinta3,
                             fontVariantNumeric: 'tabular-nums' }}>
                {numero(f.porciones)}{' '}
                {+f.porciones === 1 ? 'porción' : 'porciones'} · sin cobrar
              </span>
            </div>
          ))}
          <p style={{ fontSize: '13px', color: C.tinta3, marginTop: '12px',
                      lineHeight: 1.55 }}>
            Pasa porque el mismo nombre es guisado en unos productos y extra en
            otros. La regla que los separa dice "es extra si ya venía un guisado
            antes", así que en un pedido mixto —dos empanadas de deshebrada y dos
            de queso— el segundo <b>guiso</b> queda marcado como extra. No es
            dinero que dejaste de cobrar: es una etiqueta que no aplica ahí. Se
            apartan para que no jalen el promedio a cero.
          </p>
        </Tarjeta>
      )}
    </>
  );
}

export default function Productos({ rango, esAncho }) {
  const [contra, setContra] = useState('anterior');
  const [categoria, setCategoria] = useState('todas');
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

    // El reparto por categoría se calcula SIEMPRE sobre todo el periodo, no
    // sobre lo filtrado: si se recalculara con el filtro puesto, la categoría
    // elegida saldría siempre con el 100% y el reparto dejaría de decir nada.
    const porCategoria = new Map();
    let totalPeriodo = 0;
    for (const f of datos.ahora) {
      const k = f.categoria || 'Sin categoría';
      const a = porCategoria.get(k) || { categoria: k, productos: 0, unidades: 0, ingresos: 0 };
      a.productos++;
      a.unidades += +f.unidades || 0;
      a.ingresos += +f.ingresos || 0;
      porCategoria.set(k, a);
      totalPeriodo += +f.ingresos || 0;
    }
    const categorias = [...porCategoria.values()].sort((a, b) => b.ingresos - a.ingresos);
    const hayCategorias = datos.ahora.some((f) => f.categoria);

    // Dos estados que se ven IGUAL en pantalla y significan cosas opuestas:
    //
    //   · la base devuelve 'categoria' y viene nula  → faltan clasificar
    //   · la base NO devuelve la columna 'categoria' → falta correr 08_rangos
    //
    // Sin distinguirlos, el segundo caso se lee como "todo está sin clasificar"
    // aunque el catálogo esté completo, y uno se vuelve loco buscando en el
    // lugar equivocado. Pasó. La diferencia se nota preguntando si la LLAVE
    // existe, no si el valor es nulo.
    const baseVieja = datos.ahora.length > 0
      && !Object.prototype.hasOwnProperty.call(datos.ahora[0], 'categoria');

    // Los tres que más dejan en cada sección, para tenerlos todos a la mano sin
    // ir cambiando de filtro. Se calcula sobre TODO el periodo, no sobre lo
    // filtrado, por la misma razón que el reparto de arriba.
    const topPorCategoria = categorias
      .filter((c) => c.categoria !== 'Sin categoría')
      .map((c) => ({
        ...c,
        top: datos.ahora
          .filter((f) => (f.categoria || 'Sin categoría') === c.categoria)
          .sort((a, b) => (+b.ingresos || 0) - (+a.ingresos || 0))
          .slice(0, 3),
      }));

    const de = (filas) => categoria === 'todas' ? filas
      : filas.filter((f) => (f.categoria || 'Sin categoría') === categoria);

    const ahora = de(datos.ahora);
    const antes = de(datos.antes);
    const total = ahora.reduce((s, f) => s + (+f.ingresos || 0), 0);
    const unidades = ahora.reduce((s, f) => s + (+f.unidades || 0), 0);

    const porDinero = [...ahora].sort((a, b) => b.ingresos - a.ingresos).slice(0, 12);
    const porVolumen = [...ahora].sort((a, b) => b.unidades - a.unidades).slice(0, 12);
    const completo = [...ahora].sort((a, b) => b.ingresos - a.ingresos);

    const diasA = cuantosDias(rango.desde, rango.hasta);
    const diasB = cuantosDias(base.desde, base.hasta);
    const normaliza = diasA !== diasB;

    return {
      total, unidades, cuantos: ahora.length, diasA, diasB, normaliza,
      porDinero, porVolumen, completo,
      categorias, hayCategorias, baseVieja, totalPeriodo,
      topPorCategoria,
      ...movimiento(ahora, antes, { diasA, diasB }),
      hayBase: antes.length > 0,
    };
  }, [datos, rango, base, categoria]);

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

          {calc.hayCategorias && (
            <Tarjeta titulo="De dónde sale el dinero"
                     sub="Las secciones del menú en el periodo. Es el reparto completo — no cambia cuando filtras abajo, para que siempre se pueda ver contra el total.">
              {/* Nunca se repite un color. La paleta tiene seis y las secciones
                  pueden ser más: de la séptima en adelante van en gris, que es
                  honesto —"esta no tiene identidad propia"— mientras que volver
                  a empezar la paleta haría que Extras se viera igual que
                  Antojitos y se leyeran como lo mismo. */}
              <Barras datos={calc.categorias.map((c, i) => ({
                etiqueta: c.categoria,
                valor: c.ingresos,
                color: c.categoria === 'Sin categoría' ? C.rojo
                     : i < SERIES.length ? SERIES[i] : '#BCADA2',
                nota: `${numero(c.unidades)} unidades · ${c.productos} productos · ${
                  calc.totalPeriodo ? Math.round((c.ingresos / calc.totalPeriodo) * 100) : 0}% de las ventas`,
              }))} formato={pesos} />
              <Numeros filas={calc.categorias} columnas={[
                { titulo: 'Categoría', valor: (f) => f.categoria },
                { titulo: 'Productos', valor: (f) => numero(f.productos) },
                { titulo: 'Unidades', valor: (f) => numero(f.unidades) },
                { titulo: 'Ingresos', valor: (f) => pesosExactos(f.ingresos) },
                { titulo: '% ventas', valor: (f) => `${calc.totalPeriodo
                  ? ((f.ingresos / calc.totalPeriodo) * 100).toFixed(1) : 0}%` },
              ]} />
            </Tarjeta>
          )}

          {calc.hayCategorias && calc.topPorCategoria.length > 0 && (
            <Tarjeta titulo="Lo que más deja cada sección"
                     sub="Los tres primeros de cada una, para verlas todas juntas. Toca el nombre de una sección para meterte solo en ella.">
              <TopPorCategoria categorias={calc.topPorCategoria} esAncho={esAncho}
                               alElegir={setCategoria} />
            </Tarjeta>
          )}

          {calc.hayCategorias && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px',
                          margin: '0 0 14px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12.5px', color: C.tinta4 }}>Ver solo</span>
              <button onClick={() => setCategoria('todas')}
                      style={pastilla(categoria === 'todas')}>Todo el menú</button>
              {calc.categorias.map((c) => (
                <button key={c.categoria} onClick={() => setCategoria(c.categoria)}
                        style={pastilla(categoria === c.categoria,
                          c.categoria === 'Sin categoría' && categoria !== c.categoria
                            ? { color: C.rojo } : undefined)}>
                  {c.categoria}
                </button>
              ))}
            </div>
          )}

          {calc.baseVieja && (
            <div style={nota('error')}>
              <b>La base todavía no manda las categorías a esta pantalla.</b> No es
              que falte clasificar: el catálogo puede estar completo y aquí se
              vería igual de vacío. Lo que falta es correr{' '}
              <b>08_rangos.sql</b> en Supabase — ese archivo es el que hace que
              la consulta de productos traiga la sección de cada uno.
              <div style={{ marginTop: '8px' }}>
                Se corre las veces que haga falta y no toca datos: solo redefine
                la consulta. Después, el botón <b>Refrescar</b> de arriba.
              </div>
            </div>
          )}

          {!calc.baseVieja && !calc.hayCategorias && (
            <div style={nota('aviso')}>
              Todavía no hay categorías puestas. En la pestaña <b>Catálogo</b> se
              clasifica cada producto por sección del menú, y en cuanto lo hagas
              este corte aparece solo — sin volver a importar nada.
            </div>
          )}

          <div style={rejilla(esAncho, '330px')}>
            <Tarjeta titulo={categoria === 'todas'
                       ? 'Los que más dinero dejan'
                       : `${categoria} · los que más dinero dejan`}
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

            <Tarjeta titulo={categoria === 'todas'
                       ? 'Los que más se venden'
                       : `${categoria} · los que más se venden`}
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

          <Tarjeta
            titulo={categoria === 'todas'
              ? `Todos los productos (${calc.cuantos})`
              : `${categoria} · ${calc.cuantos} ${calc.cuantos === 1 ? 'producto' : 'productos'}`}
            sub="La lista completa del periodo, de mayor a menor ingreso. Las de arriba son los primeros diez; esta no recorta nada.">
            <TablaCompleta filas={calc.completo} total={calc.total} dias={calc.diasA} />
          </Tarjeta>

          {/* Los extras que van dentro del platillo. Se enseñan con el menú
              completo y al filtrar por Extras, que es donde se buscan; con
              Bebidas o Postres puestos serían ruido. */}
          {(categoria === 'todas' || categoria === 'Extras') && (
            <ExtrasDelPlatillo rango={rango} ingresosDelPeriodo={calc.totalPeriodo} />
          )}
        </>
      )}
    </div>
  );
}
