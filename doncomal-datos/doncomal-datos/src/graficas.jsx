// =============================================================================
// Gráficas
// =============================================================================
//
// SVG a mano, sin librería. Son cuatro formas y ninguna necesita medio megabyte
// de dependencia; además así el estilo es el mismo que el resto de la app.
//
// Las reglas que se siguen, y por qué
// -----------------------------------
//   · Un solo eje. Nunca dos escalas en la misma gráfica: es la forma más
//     fácil de hacer que dos series no comparables parezcan comparables.
//   · Marcas delgadas, rejilla tenue. El dato es lo único que puede gritar.
//   · El texto nunca lleva el color de la serie. La identidad la carga el
//     punto o la barra de al lado; los colores claros son ilegibles como letra.
//   · Etiquetas selectivas. Un número sobre cada punto no se lee.
//   · Con dos o más series siempre hay leyenda, para que el color no sea el
//     único canal.
//
// La paleta categórica pasó el validador de daltonismo con la terracota de la
// marca en el primer lugar.
// =============================================================================

import { useState, useRef } from 'react';
import { C, pesos, numero } from './estilo.js';

// Arranca con el naranja de la marca y sigue con hues que ningún ojo confunde
// entre sí. El dorado es más oscuro que el #FCCA3D de la marca a propósito: ese
// es demasiado claro para verse como línea sobre blanco.
export const SERIES = ['#ED6B1F', '#2a78d6', '#1baf7a', '#D9A21A', '#4a3aa7', '#e87ba4'];
const REJILLA = '#EDE4DC';
const APAGADO = '#D8CABF';

// ─── utilidades ──────────────────────────────────────────────────────────────

/** Marcas del eje en números redondos. */
function escalaY(max, cuantas = 4) {
  if (!max || !isFinite(max)) return { tope: 1, marcas: [0, 1] };
  const bruto = max / cuantas;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const paso = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= bruto) || mag * 10;
  const tope = Math.ceil(max / paso) * paso;
  const marcas = [];
  for (let v = 0; v <= tope + 1e-9; v += paso) marcas.push(v);
  return { tope, marcas };
}

const corto = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(n));
};

function Globo({ x, y, ancho, children }) {
  const izquierda = x > ancho / 2;
  return (
    <div style={{
      position: 'absolute',
      left: izquierda ? undefined : `${x + 12}px`,
      right: izquierda ? `${ancho - x + 12}px` : undefined,
      top: `${Math.max(0, y - 10)}px`,
      background: C.negro, color: C.papel,
      borderRadius: '8px', padding: '8px 11px',
      fontSize: '12.5px', lineHeight: 1.45,
      pointerEvents: 'none', zIndex: 5, whiteSpace: 'nowrap',
      boxShadow: '0 4px 14px rgba(0,0,0,.18)',
    }}>{children}</div>
  );
}

function Leyenda({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px',
                  marginTop: '10px' }}>
      {items.map((it) => (
        <span key={it.nombre} style={{ display: 'inline-flex', alignItems: 'center',
                                       gap: '6px', fontSize: '12.5px', color: C.tinta3 }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '3px',
                         background: it.color, flex: 'none' }} />
          {it.nombre}
        </span>
      ))}
    </div>
  );
}

/**
 * La tabla de números que acompaña a cada gráfica.
 *
 * No es un extra de accesibilidad: una gráfica contesta "¿cómo viene?" y una
 * tabla contesta "¿cuánto exactamente?". Las dos preguntas se hacen todos los
 * días y la segunda no se puede contestar mirando una barra.
 */
export function Numeros({ filas, columnas }) {
  const [abierta, setAbierta] = useState(false);
  if (!filas?.length) return null;
  return (
    <div style={{ marginTop: '12px' }}>
      <button onClick={() => setAbierta((x) => !x)}
        style={{ background: 'none', border: 'none', cursor: 'pointer',
                 fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 600,
                 color: C.tinta3, padding: '6px 0', display: 'flex',
                 alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '10px' }}>{abierta ? '▼' : '▶'}</span>
        {abierta ? 'Ocultar los números' : 'Ver los números'}
      </button>
      {abierta && (
        <div style={{ overflowX: 'auto', marginTop: '6px' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%',
                          fontSize: '13px' }}>
            <thead>
              <tr>
                {columnas.map((c, i) => (
                  <th key={c.titulo} style={{
                    textAlign: i === 0 ? 'left' : 'right',
                    fontSize: '10.5px', fontWeight: 700, color: C.tinta4,
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    padding: '7px 10px 7px 0', whiteSpace: 'nowrap',
                    borderBottom: `1px solid ${C.lineaFuerte}` }}>{c.titulo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, j) => (
                <tr key={j}>
                  {columnas.map((c, i) => (
                    <td key={c.titulo} style={{
                      textAlign: i === 0 ? 'left' : 'right',
                      padding: '7px 10px 7px 0',
                      color: i === 0 ? C.tinta : C.tinta2,
                      // Columnas de números: alineadas, así que tabular-nums.
                      fontVariantNumeric: i === 0 ? 'normal' : 'tabular-nums',
                      whiteSpace: 'nowrap',
                      borderBottom: `1px solid ${C.linea}` }}>
                      {c.valor(f)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── el cambio, con su color ─────────────────────────────────────────────────

/**
 * Un cambio con su signo y su color: verde si subió, rojo si bajó, gris si no
 * hay con qué comparar.
 *
 * Vive aquí, y no dentro de cada pantalla, porque el criterio tiene que ser el
 * mismo en todas. Cuando estaba repetido pasó justo lo que tenía que pasar: dos
 * pantallas pintaban el porcentaje y la tercera lo dejaba en gris, y nada en el
 * código lo delataba. Un componente compartido no se puede olvidar en una sola
 * pantalla.
 *
 * `unidad` no es decoración. Un cambio de ventas se mide en **por ciento**; un
 * cambio de participación se mide en **puntos**. Pasar de 20% a 22% es +2
 * puntos, no +2%: son dos cosas distintas y escribirlas igual es un error de
 * fondo, no de formato.
 *
 * `sobreOscuro` cambia los verdes y rojos por versiones claras. No es un
 * capricho: el verde de marca (#1E7A50) sobre el negro de la tarjeta grande no
 * se lee. Es el mismo componente y la misma regla —verde sube, rojo baja—, solo
 * que calibrada para el fondo en el que va.
 *
 * `fondo={false}` quita la pastilla. Sirve donde el cambio es la cifra
 * secundaria y no debe competir con la principal: sigue teniendo color, pero
 * pesa menos.
 */
const VERDE_OSCURO = '#7BE0AE';   // sobre negro
const ROJO_OSCURO  = '#FFAE9B';

export function Delta({ valor, unidad = '%', grande, decimales = 1,
                        flecha = true, fondo = true, sobreOscuro = false }) {
  if (valor === null || valor === undefined || !isFinite(valor)) {
    return <span style={{ color: sobreOscuro ? C.tinta3 : C.tinta4 }}>—</span>;
  }
  const sube = valor > 0;
  const baja = valor < 0;

  const color = sobreOscuro
    ? (sube ? VERDE_OSCURO : baja ? ROJO_OSCURO : C.durazno)
    : (sube ? C.bien : baja ? C.rojo : C.tinta3);
  const relleno = !fondo ? 'transparent'
    : sobreOscuro ? 'rgba(255,255,255,.10)'
    : (sube ? C.bienSuave : baja ? C.errorSuave : 'transparent');

  return (
    <span style={{
      display: 'inline-block',
      color,
      background: relleno,
      fontWeight: 700,
      fontSize: grande ? '15px' : 'inherit',
      padding: fondo ? (grande ? '4px 11px' : '2px 6px') : 0,
      borderRadius: '999px',
      whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
    }}>
      {flecha && (sube ? '↑ ' : baja ? '↓ ' : '')}
      {!flecha && sube ? '+' : ''}
      {Math.abs(valor).toFixed(decimales)}{unidad}
    </span>
  );
}

function Vacio({ alto }) {
  return (
    <div style={{ height: `${alto}px`, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: C.tinta4, fontSize: '13px' }}>
      Sin datos para este periodo
    </div>
  );
}

// ─── serie de tiempo, con media móvil ────────────────────────────────────────

/**
 * El día suelto va en gris claro y la media móvil en color: el ruido diario es
 * contexto, la tendencia es el dato. Es la forma de "énfasis" — una serie
 * manda y la otra acompaña.
 */
export function Tendencia({ puntos, alto = 220, etiquetaMedia = 'Promedio de 30 días' }) {
  const [activo, setActivo] = useState(null);
  const caja = useRef(null);
  if (!puntos?.length) return <Vacio alto={alto} />;

  const M = { arriba: 12, derecha: 10, abajo: 24, izquierda: 46 };
  const W = 640, H = alto;
  const w = W - M.izquierda - M.derecha;
  const h = H - M.arriba - M.abajo;

  const max = Math.max(...puntos.map((p) => Math.max(p.valor || 0, p.media || 0)));
  const { tope, marcas } = escalaY(max);
  const px = (i) => M.izquierda + (puntos.length > 1 ? (i / (puntos.length - 1)) * w : w / 2);
  const py = (v) => M.arriba + h - (v / tope) * h;

  const linea = (campo) => puntos.map((p, i) =>
    p[campo] === null || p[campo] === undefined
      ? null : `${px(i)},${py(p[campo])}`).filter(Boolean).join(' ');

  function alMover(e) {
    const r = caja.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((x - M.izquierda) / w) * (puntos.length - 1));
    setActivo(i >= 0 && i < puntos.length ? i : null);
  }

  const p = activo !== null ? puntos[activo] : null;

  return (
    <div ref={caja} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}
           onMouseMove={alMover} onMouseLeave={() => setActivo(null)}>
        {marcas.map((v) => (
          <g key={v}>
            <line x1={M.izquierda} x2={W - M.derecha} y1={py(v)} y2={py(v)}
                  stroke={REJILLA} strokeWidth="1" />
            <text x={M.izquierda - 8} y={py(v) + 4} textAnchor="end"
                  fontSize="11" fill={C.tinta4}>{corto(v)}</text>
          </g>
        ))}

        <polyline points={linea('valor')} fill="none" stroke={APAGADO} strokeWidth="1.5"
                  strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={linea('media')} fill="none" stroke={SERIES[0]} strokeWidth="2"
                  strokeLinejoin="round" strokeLinecap="round" />

        {p && (
          <>
            <line x1={px(activo)} x2={px(activo)} y1={M.arriba} y2={M.arriba + h}
                  stroke={C.tinta4} strokeWidth="1" />
            <circle cx={px(activo)} cy={py(p.valor)} r="4.5"
                    fill={APAGADO} stroke={C.tarjeta} strokeWidth="2" />
            {p.media !== null && (
              <circle cx={px(activo)} cy={py(p.media)} r="4.5"
                      fill={SERIES[0]} stroke={C.tarjeta} strokeWidth="2" />
            )}
          </>
        )}

        <text x={M.izquierda} y={H - 6} fontSize="11" fill={C.tinta4}>
          {puntos[0].etiqueta || puntos[0].fecha}
        </text>
        <text x={W - M.derecha} y={H - 6} fontSize="11" fill={C.tinta4} textAnchor="end">
          {puntos[puntos.length - 1].etiqueta || puntos[puntos.length - 1].fecha}
        </text>
      </svg>

      {p && caja.current && (
        <Globo x={(px(activo) / W) * caja.current.offsetWidth}
               y={(py(p.media ?? p.valor) / H) * caja.current.offsetHeight}
               ancho={caja.current.offsetWidth}>
          <div style={{ fontWeight: 600, marginBottom: '3px' }}>
            {p.etiqueta || p.fecha}
          </div>
          <div>Ese día · {pesos(p.valor)}</div>
          {p.media !== null && <div>{etiquetaMedia} · {pesos(p.media)}</div>}
        </Globo>
      )}

      <Leyenda items={[
        { nombre: 'Cada día', color: APAGADO },
        { nombre: etiquetaMedia, color: SERIES[0] },
      ]} />
    </div>
  );
}

// ─── columnas ────────────────────────────────────────────────────────────────

/**
 * Magnitud a lo largo del tiempo. Una sola serie, un solo color: no hacen
 * falta ni leyenda ni identidad por color.
 *
 * `resaltar` pinta una columna en color y apaga el resto — sirve para señalar
 * el mes que se está viendo sin sacarlo de su contexto.
 */
export function Columnas({ datos, alto = 200, formato = pesos, resaltar = null,
                          valores = 'auto' }) {
  const [activo, setActivo] = useState(null);
  const caja = useRef(null);
  if (!datos?.length) return <Vacio alto={alto} />;

  const hayValores = valores === true || (valores === 'auto' && datos.length <= 8);
  const M = { arriba: hayValores ? 24 : 12, derecha: 10, abajo: 26, izquierda: 46 };
  const W = 640, H = alto;
  const w = W - M.izquierda - M.derecha;
  const h = H - M.arriba - M.abajo;

  const { tope, marcas } = escalaY(Math.max(...datos.map((d) => d.valor)));
  const banda = w / datos.length;
  // El número encima de cada columna solo cabe cuando son pocas. Con veinte
  // se encimarían y dejarían de leerse, que es peor que no ponerlos: para eso
  // está la tabla de abajo.
  const conValores = valores === true || (valores === 'auto' && datos.length <= 8);
  // Nunca se llena la banda: el aire que sobra es lo que deja respirar.
  const ancho = Math.min(24, banda * 0.62);
  const cx = (i) => M.izquierda + banda * i + banda / 2;
  const py = (v) => M.arriba + h - (v / tope) * h;

  return (
    <div ref={caja} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}
           onMouseLeave={() => setActivo(null)}>
        {marcas.map((v) => (
          <g key={v}>
            <line x1={M.izquierda} x2={W - M.derecha} y1={py(v)} y2={py(v)}
                  stroke={REJILLA} strokeWidth="1" />
            <text x={M.izquierda - 8} y={py(v) + 4} textAnchor="end"
                  fontSize="11" fill={C.tinta4}>{corto(v)}</text>
          </g>
        ))}

        {datos.map((d, i) => {
          const y = py(d.valor);
          const alt = Math.max(2, M.arriba + h - y);
          const esta = resaltar === null ? true : d.etiqueta === resaltar;
          return (
            <g key={d.etiqueta}
               onMouseEnter={() => setActivo(i)}>
              {/* Área de contacto más grande que la barra, para que el globo
                  no dependa de atinarle a 14 píxeles. */}
              <rect x={cx(i) - banda / 2} y={M.arriba} width={banda} height={h}
                    fill="transparent" />
              <rect x={cx(i) - ancho / 2} y={y} width={ancho} height={alt}
                    rx="4" fill={esta ? SERIES[0] : APAGADO}
                    opacity={activo === null || activo === i ? 1 : 0.55} />
            </g>
          );
        })}

        {conValores && datos.map((d, i) => (
          <text key={`v${d.etiqueta}`} x={cx(i)} y={py(d.valor) - 7}
                textAnchor="middle" fontSize="11.5" fontWeight="700"
                fill={C.tinta2}>{corto(d.valor)}</text>
        ))}

        {datos.map((d, i) => (
          (datos.length <= 14 || i % Math.ceil(datos.length / 10) === 0) && (
            <text key={d.etiqueta} x={cx(i)} y={H - 8} textAnchor="middle"
                  fontSize="10.5" fill={C.tinta4}>{d.corta || d.etiqueta}</text>
          )
        ))}
      </svg>

      {activo !== null && caja.current && (
        <Globo x={(cx(activo) / W) * caja.current.offsetWidth}
               y={(py(datos[activo].valor) / H) * caja.current.offsetHeight}
               ancho={caja.current.offsetWidth}>
          <div style={{ fontWeight: 600, marginBottom: '2px' }}>{datos[activo].etiqueta}</div>
          <div>{formato(datos[activo].valor)}</div>
          {datos[activo].nota && (
            <div style={{ color: C.tinta4, marginTop: '2px' }}>{datos[activo].nota}</div>
          )}
        </Globo>
      )}
    </div>
  );
}

// ─── barras horizontales ─────────────────────────────────────────────────────

/**
 * Para rankings. Horizontal porque los nombres de producto son largos y en
 * vertical habría que girarlos, que es peor.
 *
 * El valor va al final de la barra, no dentro: dentro se cortaría en las
 * barras chicas.
 *
 * `nota` acepta texto o un pedazo de JSX. Eso importa: la nota es donde va el
 * movimiento contra el periodo anterior, y un movimiento sin color se lee como
 * un dato más. Con JSX se le puede meter un <Delta/> adentro.
 */
export function Barras({ datos, formato = numero, alto = 20, maximo = null }) {
  if (!datos?.length) return <Vacio alto={120} />;
  const tope = maximo ?? Math.max(...datos.map((d) => d.valor));

  return (
    <div>
      {datos.map((d) => (
        <div key={d.etiqueta} style={{ marginBottom: '9px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
                        alignItems: 'baseline', gap: '10px', marginBottom: '3px' }}>
            <span style={{ fontSize: '13.5px', color: C.tinta,
                           overflow: 'hidden', textOverflow: 'ellipsis',
                           whiteSpace: 'nowrap' }}>{d.etiqueta}</span>
            <span style={{ fontSize: '13px', color: C.tinta2, flex: 'none',
                           fontVariantNumeric: 'tabular-nums' }}>
              {formato(d.valor)}
            </span>
          </div>
          <div style={{ height: `${alto * 0.4}px`, background: C.papelHondo,
                        borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              width: `${tope ? Math.max(1.5, (d.valor / tope) * 100) : 0}%`,
              height: '100%', background: d.color || SERIES[0],
              borderRadius: '4px',
            }} />
          </div>
          {d.nota && (
            <div style={{ fontSize: '11.5px', color: C.tinta4, marginTop: '2px' }}>
              {d.nota}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── líneas múltiples ────────────────────────────────────────────────────────

/**
 * Varias series comparables en la misma escala. Se usa para la participación
 * de guisados, donde todas son porcentajes del mismo total.
 *
 * Máximo seis series: más allá los colores dejan de distinguirse aunque se
 * vean distintos en pantalla, sobre todo para quien no distingue bien el rojo
 * y el verde. Lo que sobra se junta en "Otros" antes de llegar aquí.
 */
export function Lineas({ puntos, series, alto = 240, sufijo = '%' }) {
  const [activo, setActivo] = useState(null);
  const caja = useRef(null);
  if (!puntos?.length || !series?.length) return <Vacio alto={alto} />;

  const M = { arriba: 12, derecha: 10, abajo: 26, izquierda: 42 };
  const W = 640, H = alto;
  const w = W - M.izquierda - M.derecha;
  const h = H - M.arriba - M.abajo;

  const max = Math.max(...puntos.flatMap((p) => series.map((s) => p[s] || 0)));
  const { tope, marcas } = escalaY(max);
  const px = (i) => M.izquierda + (puntos.length > 1 ? (i / (puntos.length - 1)) * w : w / 2);
  const py = (v) => M.arriba + h - (v / tope) * h;

  function alMover(e) {
    const r = caja.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((x - M.izquierda) / w) * (puntos.length - 1));
    setActivo(i >= 0 && i < puntos.length ? i : null);
  }

  return (
    <div ref={caja} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}
           onMouseMove={alMover} onMouseLeave={() => setActivo(null)}>
        {marcas.map((v) => (
          <g key={v}>
            <line x1={M.izquierda} x2={W - M.derecha} y1={py(v)} y2={py(v)}
                  stroke={REJILLA} strokeWidth="1" />
            <text x={M.izquierda - 8} y={py(v) + 4} textAnchor="end"
                  fontSize="11" fill={C.tinta4}>{Math.round(v)}{sufijo}</text>
          </g>
        ))}

        {series.map((s, si) => (
          <polyline key={s}
            points={puntos.map((p, i) => `${px(i)},${py(p[s] || 0)}`).join(' ')}
            fill="none" stroke={SERIES[si % SERIES.length]} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {activo !== null && (
          <>
            <line x1={px(activo)} x2={px(activo)} y1={M.arriba} y2={M.arriba + h}
                  stroke={C.tinta4} strokeWidth="1" />
            {series.map((s, si) => (
              <circle key={s} cx={px(activo)} cy={py(puntos[activo][s] || 0)} r="4.5"
                      fill={SERIES[si % SERIES.length]} stroke={C.tarjeta} strokeWidth="2" />
            ))}
          </>
        )}

        {puntos.map((p, i) => (
          (puntos.length <= 14 || i % Math.ceil(puntos.length / 10) === 0) && (
            <text key={p.etiqueta || i} x={px(i)} y={H - 8} textAnchor="middle"
                  fontSize="10.5" fill={C.tinta4}>{p.corta || p.etiqueta}</text>
          )
        ))}
      </svg>

      {activo !== null && caja.current && (
        <Globo x={(px(activo) / W) * caja.current.offsetWidth}
               y={30} ancho={caja.current.offsetWidth}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            {puntos[activo].etiqueta}
          </div>
          {series.map((s, si) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px',
                             background: SERIES[si % SERIES.length], flex: 'none' }} />
              {s} · {puntos[activo][s]}{sufijo}
            </div>
          ))}
        </Globo>
      )}

      <Leyenda items={series.map((s, si) => ({
        nombre: s, color: SERIES[si % SERIES.length],
      }))} />
    </div>
  );
}
