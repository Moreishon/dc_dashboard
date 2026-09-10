// =============================================================================
// Resumen
// =============================================================================
//
// La pantalla que se abre primero. Contesta en este orden: cómo va el negocio
// hoy, contra qué se compara, y de qué está hecho el periodo.
//
// Dos decisiones de diseño que importan
// -------------------------------------
// 1. Arriba de todo va UNA cifra grande: el promedio diario de los últimos 30
//    días. No el total del periodo, porque el total depende de cuántos días
//    trae y cambia de significado cada vez que mueves el filtro. El promedio
//    diario de 30 días significa lo mismo siempre, y por eso sirve como pulso.
//
// 2. Toda comparación enseña PRIMERO el promedio diario y después el total.
//    Los meses tienen de 28 a 31 días y de 12 a 15 días fuertes, así que el
//    total mezcla "vendí más" con "tuve más días". Entre enero y febrero de
//    2026 las dos cifras dicen cosas opuestas y la del promedio tiene razón.
// =============================================================================

import { useMemo } from 'react';
import {
  totalizar, porTipoDeDia, comparar, porMes, porDiaDeSemana, mediaMovil,
  diasEntre,
} from '../analisis.js';
import { comparaciones, cuantosDias, sumarDias, estaEnCurso } from '../rango.js';
import { Tendencia, Columnas, Numeros, Delta, SERIES } from '../graficas.jsx';
import {
  C, DISPLAY, tarjeta, tituloTarjeta, nota, rejilla,
  pesos, pesosExactos, numero, porciento, nombreMes, fechaCorta, rangoLegible,
} from '../estilo.js';

// ─── piezas ──────────────────────────────────────────────────────────────────

function Tarjeta({ titulo, sub, children, extra }) {
  return (
    <div style={tarjeta(extra)}>
      <h3 style={tituloTarjeta}>{titulo}</h3>
      {sub && <p style={{ fontSize: '13px', color: C.tinta3, margin: '4px 0 14px',
                          lineHeight: 1.5 }}>{sub}</p>}
      {!sub && <div style={{ height: '14px' }} />}
      {children}
    </div>
  );
}

// Delta —el porcentaje con su color— vive en graficas.jsx, compartido con
// Productos y Guisados. Estaba aquí y se quedó aquí: las otras pantallas
// terminaron pintando los cambios en gris porque cada una lo resolvía por su
// cuenta. Un solo componente para todas es lo que impide que vuelva a pasar.

function Cifra({ etiqueta, valor, delta, pie }) {
  return (
    <div style={{ minWidth: '132px', flex: 1 }}>
      <div style={{ fontSize: '10.5px', color: C.tinta4, textTransform: 'uppercase',
                    letterSpacing: '0.09em', fontWeight: 700, marginBottom: '5px' }}>
        {etiqueta}
      </div>
      {/* Sin tabular-nums: a este tamaño separa demasiado los dígitos. */}
      <div style={{ fontSize: '26px', fontWeight: 700, lineHeight: 1.05,
                    letterSpacing: '-0.02em' }}>{valor}</div>
      {delta !== undefined && (
        <div style={{ fontSize: '12.5px', marginTop: '6px', display: 'flex',
                      alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <Delta valor={delta} />
          <span style={{ color: C.tinta4 }}>{pie}</span>
        </div>
      )}
    </div>
  );
}

// ─── pantalla ────────────────────────────────────────────────────────────────

export default function Resumen({ dias, esAncho, rango, ultimoDato }) {
  const calc = useMemo(() => {
    if (!dias?.length || !rango) return null;

    const delRango = diasEntre(dias, rango.desde, rango.hasta);
    const cmp = comparaciones(rango);
    const vsAnterior = comparar(delRango, diasEntre(dias, cmp.anterior.desde, cmp.anterior.hasta));
    const vsAnio = comparar(delRango, diasEntre(dias, cmp.anioPasado.desde, cmp.anioPasado.hasta));

    // El pulso: promedio diario de los últimos 30 días con datos, contra los
    // 30 anteriores. No depende del filtro — es el estado del negocio hoy.
    const fin = ultimoDato;
    const ultimos30 = totalizar(diasEntre(dias, sumarDias(fin, -29), fin));
    const previos30 = totalizar(diasEntre(dias, sumarDias(fin, -59), sumarDias(fin, -30)));
    const pulso = {
      promedio: ultimos30.promedioDia,
      delta: previos30.promedioDia
        ? Math.round(((ultimos30.promedioDia - previos30.promedioDia) /
                      previos30.promedioDia) * 1000) / 10
        : null,
      dias: ultimos30.dias,
      total: ultimos30.ingresos,
      ticket: ultimos30.ticket,
      recibos: ultimos30.recibos,
    };

    // La tendencia de los últimos seis meses cerrados, para leer el pulso en
    // contexto sin tener que interpretar una gráfica.
    const meses = porMes(dias);
    const tendencia = meses.slice(-7).map((m, i, arr) => {
      const previo = arr[i - 1];
      return {
        periodo: m.periodo,
        nombre: nombreMes(m.periodo),
        promedioDia: m.promedioDia,
        ingresos: m.ingresos,
        dias: m.dias,
        cambio: previo && previo.promedioDia
          ? Math.round(((m.promedioDia - previo.promedioDia) / previo.promedioDia) * 1000) / 10
          : null,
      };
    });

    const desdeSerie = meses[Math.max(0, meses.length - 6)]?.periodo;
    const recientes = dias.filter((d) => d.fecha >= `${desdeSerie}-01`);

    return {
      t: totalizar(delRango),
      tipo: porTipoDeDia(delRango),
      cmp, vsAnterior, vsAnio, pulso, tendencia,
      enCurso: estaEnCurso(rango, ultimoDato),
      mesesGrafica: meses.slice(-24).map((m) => ({
        etiqueta: nombreMes(m.periodo),
        corta: nombreMes(m.periodo).slice(0, 3),
        valor: m.ingresos,
        promedioDia: m.promedioDia,
        dias: m.dias,
        nota: `${m.dias} días · ${pesos(m.promedioDia)} por día`,
      })),
      diaria: mediaMovil(recientes, 30).map((p) => ({ ...p, etiqueta: fechaCorta(p.fecha) })),
      semana: porDiaDeSemana(delRango).filter((d) => d.dias > 0).map((d) => ({
        etiqueta: d.nombre,
        corta: d.nombre.slice(0, 3),
        valor: d.promedio,
        total: d.total,
        cuantos: d.dias,
        dow: d.dow,
        nota: `${d.dias} ${d.dias === 1 ? 'día' : 'días'} · ${pesos(d.total)} en total`,
      })),
    };
  }, [dias, rango, ultimoDato]);

  if (!calc) return <div style={{ padding: '18px', color: C.tinta3 }}>Cargando…</div>;

  const { t, tipo, pulso, vsAnterior, vsAnio, cmp } = calc;
  // La semana se lee de lunes a domingo; JavaScript numera el domingo como cero.
  const semana = [...calc.semana].sort((a, b) => ((a.dow || 7) - (b.dow || 7)));

  return (
    <div style={{ padding: '18px',
                  paddingBottom: 'calc(44px + env(safe-area-inset-bottom))' }}>

      {/* ── el pulso: una sola cifra, grande ── */}
      <div style={tarjeta({
        background: `linear-gradient(135deg, ${C.negro} 0%, ${C.cacao} 140%)`,
        border: 'none', color: '#FFF6F0', padding: '22px',
      })}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '10.5px', color: C.durazno, textTransform: 'uppercase',
                          letterSpacing: '0.09em', fontWeight: 700, marginBottom: '8px' }}>
              Promedio por día · últimos 30 días
            </div>
            <div style={{ fontSize: '52px', fontWeight: 800, lineHeight: 1,
                          letterSpacing: '-0.035em' }}>
              {pesos(pulso.promedio)}
            </div>
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center',
                          gap: '9px', flexWrap: 'wrap' }}>
              {pulso.delta !== null && (
                <span style={{ fontSize: '14px' }}>
                  <Delta valor={pulso.delta} sobreOscuro />
                </span>
              )}
              <span style={{ fontSize: '13px', color: C.durazno }}>
                contra los 30 días anteriores
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '22px', flexWrap: 'wrap' }}>
            {[['Ticket promedio', pesos(pulso.ticket)],
              ['Recibos', numero(pulso.recibos)],
              ['Total 30 días', pesos(pulso.total)]].map(([et, v]) => (
              <div key={et}>
                <div style={{ fontSize: '10px', color: C.durazno, textTransform: 'uppercase',
                              letterSpacing: '0.08em', fontWeight: 700, marginBottom: '4px',
                              opacity: 0.85 }}>{et}</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── la tendencia del pulso, en números ── */}
      <Tarjeta titulo="Cómo viene el promedio diario"
               sub="Los últimos siete meses. La columna de la derecha es contra el mes anterior, ya corregida por el número de días.">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
            <thead>
              <tr>
                {['Mes', 'Por día', 'Total', 'Días', 'Cambio'].map((h, i) => (
                  <th key={h} style={{
                    textAlign: i === 0 ? 'left' : 'right',
                    fontSize: '10.5px', fontWeight: 700, color: C.tinta4,
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    padding: '8px 12px 8px 0', whiteSpace: 'nowrap',
                    borderBottom: `1px solid ${C.lineaFuerte}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calc.tendencia.map((m, i) => (
                <tr key={m.periodo} style={{
                  background: i === calc.tendencia.length - 1 ? C.avisoSuave : 'transparent',
                }}>
                  <td style={{ padding: '9px 12px 9px 0', color: C.tinta,
                               fontWeight: i === calc.tendencia.length - 1 ? 700 : 400,
                               borderBottom: `1px solid ${C.linea}`, whiteSpace: 'nowrap' }}>
                    {m.nombre}
                  </td>
                  <td style={{ padding: '9px 12px 9px 0', textAlign: 'right',
                               fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                               borderBottom: `1px solid ${C.linea}` }}>
                    {pesos(m.promedioDia)}
                  </td>
                  <td style={{ padding: '9px 12px 9px 0', textAlign: 'right',
                               color: C.tinta2, fontVariantNumeric: 'tabular-nums',
                               borderBottom: `1px solid ${C.linea}` }}>
                    {pesos(m.ingresos)}
                  </td>
                  <td style={{ padding: '9px 12px 9px 0', textAlign: 'right',
                               color: C.tinta4, fontVariantNumeric: 'tabular-nums',
                               borderBottom: `1px solid ${C.linea}` }}>
                    {m.dias}
                  </td>
                  <td style={{ padding: '9px 0', textAlign: 'right',
                               borderBottom: `1px solid ${C.linea}` }}>
                    <Delta valor={m.cambio} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      {/* ── el periodo seleccionado ── */}
      <div style={tarjeta()}>
        <div style={{ fontSize: '10.5px', color: C.tinta4, textTransform: 'uppercase',
                      letterSpacing: '0.09em', fontWeight: 700, marginBottom: '14px' }}>
          {rangoLegible(rango.desde, rango.hasta)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px 14px' }}>
          <Cifra etiqueta="Ingresos" valor={pesos(t.ingresos)}
                 delta={vsAnterior.ingresos.porDia} pie={`por día vs ${cmp.anterior.nombre}`} />
          <Cifra etiqueta="Recibos" valor={numero(t.recibos)}
                 delta={vsAnterior.recibos.porDia} pie="por día" />
          <Cifra etiqueta="Ticket promedio" valor={pesos(t.ticket)}
                 delta={vsAnterior.ticket.crudo} pie="vs periodo anterior" />
          <Cifra etiqueta="Unidades" valor={numero(t.unidades)}
                 delta={vsAnterior.unidades.porDia} pie="por día" />
        </div>
        <p style={{ fontSize: '12.5px', color: C.tinta4, marginTop: '16px' }}>
          {t.dias} {t.dias === 1 ? 'día' : 'días'} · {t.fuertes} de viernes a domingo
          {t.ingreso_envio > 0 && ` · ${pesos(t.ingreso_envio)} de envío`}
        </p>
      </div>

      {calc.enCurso && (
        <div style={nota('aviso')}>
          <b>Este periodo va a la mitad</b> — todavía no termina, así que el
          total es de lo que lleva corrido. La comparación sí es justa:{' '}
          {cmp.anterior.nota.toLowerCase()}
        </div>
      )}

      {vsAnterior.mismosDias.aplica && vsAnterior.mismosDias.pct !== null && (
        <div style={nota('aviso')}>
          <b>Los dos periodos no traen los mismos días de la semana.</b> Este
          tiene {vsAnterior.mismosDias.sinPareja.length === 1 ? 'un día' : 'días'}{' '}
          que el otro no ({vsAnterior.mismosDias.sinPareja.join(' y ')}), y en un
          restaurante un domingo y un lunes no se parecen en nada.
          {' '}Comparando <b>solo los días que existen en los dos</b>
          {' '}({vsAnterior.mismosDias.emparejados.join(', ')}), el cambio real es{' '}
          <b style={{ color: vsAnterior.mismosDias.pct >= 0 ? C.bien : C.rojo }}>
            {porciento(vsAnterior.mismosDias.pct)}
          </b>
          {Math.abs(vsAnterior.mismosDias.pct - vsAnterior.ingresos.porDia) >= 3 &&
            ', no el que sale arriba'}.
        </div>
      )}

      {!calc.enCurso && vsAnterior.advertencia && (
        <div style={nota('aviso')}>
          <b>Ojo con el total.</b> Este periodo tuvo{' '}
          {Math.abs(vsAnterior.diferenciaDias)}{' '}
          {Math.abs(vsAnterior.diferenciaDias) === 1 ? 'día' : 'días'}{' '}
          {vsAnterior.diferenciaDias < 0 ? 'menos' : 'más'} que el anterior
          {vsAnterior.diferenciaFuertes !== 0 &&
            ` y ${Math.abs(vsAnterior.diferenciaFuertes)} de fin de semana ${
              vsAnterior.diferenciaFuertes < 0 ? 'menos' : 'más'}`}.
          {' '}Sumando todo {vsAnterior.ingresos.crudo > 0 ? 'subió' : 'bajó'}{' '}
          {Math.abs(vsAnterior.ingresos.crudo)}%; por día vendido{' '}
          {vsAnterior.ingresos.porDia > 0 ? 'subió' : 'bajó'}{' '}
          {Math.abs(vsAnterior.ingresos.porDia)}%.
          {vsAnterior.advertencia === 'signo'
            ? ' Las dos dicen cosas opuestas, y la del promedio diario compara peras con peras.'
            : ' La diferencia es el calendario, no el negocio.'}
        </div>
      )}

      <div style={rejilla(esAncho, '330px')}>
        <Tarjeta titulo={`Contra ${cmp.anterior.nombre}`} sub={cmp.anterior.nota}>
          <Comparacion c={vsAnterior} rango={cmp.anterior} />
        </Tarjeta>

        <Tarjeta titulo={`Contra ${cmp.anioPasado.nombre}`} sub={cmp.anioPasado.nota}>
          {vsAnio.b.dias > 0
            ? <Comparacion c={vsAnio} rango={cmp.anioPasado} />
            : <p style={{ fontSize: '13.5px', color: C.tinta3 }}>
                No hay datos de esas fechas.
              </p>}
        </Tarjeta>
      </div>

      <div style={rejilla(esAncho, '330px')}>
        <Tarjeta titulo="Entre semana y fin de semana"
                 sub={`Viernes, sábado y domingo son ${tipo.participacionFuerte}% de los ingresos del periodo.`}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <Cifra etiqueta="Un día fuerte" valor={pesos(tipo.promedioFuerte)} />
            <Cifra etiqueta="Un día normal" valor={pesos(tipo.promedioNormal)} />
          </div>
          <p style={{ fontSize: '13px', color: C.tinta3, marginTop: '14px',
                      lineHeight: 1.5 }}>
            Un día de fin de semana vende{' '}
            <b style={{ color: C.tinta }}>{tipo.promedioNormal
              ? `${Math.round((tipo.promedioFuerte / tipo.promedioNormal - 1) * 100)}% más`
              : '—'}</b>{' '}
            que uno entre semana.
          </p>
          <Numeros filas={[
            { k: 'Fin de semana', d: tipo.diasFuertes, p: tipo.promedioFuerte, t: tipo.fuerte },
            { k: 'Entre semana', d: tipo.diasNormales, p: tipo.promedioNormal, t: tipo.normal },
          ]} columnas={[
            { titulo: '', valor: (f) => f.k },
            { titulo: 'Días', valor: (f) => numero(f.d) },
            { titulo: 'Por día', valor: (f) => pesosExactos(f.p) },
            { titulo: 'Total', valor: (f) => pesosExactos(f.t) },
          ]} />
        </Tarjeta>

        <Tarjeta titulo="Por día de la semana"
                 sub="Promedio de cada día dentro del periodo. El número sobre la barra es el promedio; el total está en la tabla.">
          <Columnas datos={semana} alto={200} valores />
          <Numeros filas={semana} columnas={[
            { titulo: 'Día', valor: (f) => f.etiqueta },
            { titulo: 'Días', valor: (f) => numero(f.cuantos) },
            { titulo: 'Promedio', valor: (f) => pesosExactos(f.valor) },
            { titulo: 'Total', valor: (f) => pesosExactos(f.total) },
          ]} />
        </Tarjeta>
      </div>

      <Tarjeta titulo="Ingresos por mes"
               sub="Los últimos dos años. Ojo: son totales, así que un mes de 28 días se ve más bajo aunque haya vendido mejor por día — la tabla trae las dos cifras.">
        <Columnas datos={calc.mesesGrafica} alto={220} />
        <Numeros filas={[...calc.mesesGrafica].reverse()} columnas={[
          { titulo: 'Mes', valor: (f) => f.etiqueta },
          { titulo: 'Días', valor: (f) => numero(f.dias) },
          { titulo: 'Por día', valor: (f) => pesosExactos(f.promedioDia) },
          { titulo: 'Total', valor: (f) => pesosExactos(f.valor) },
        ]} />
      </Tarjeta>

      <Tarjeta titulo="Día a día"
               sub="Los últimos seis meses. La línea clara es cada día; la de color, el promedio de los 30 anteriores — que es donde se ve la tendencia sin el ruido.">
        <Tendencia puntos={calc.diaria} alto={240} />
      </Tarjeta>
    </div>
  );
}

// ─── tabla de comparación ────────────────────────────────────────────────────

function Comparacion({ c, rango }) {
  const filas = [
    ['Ingresos', c.ingresos.porDia, c.ingresos.crudo],
    ['Recibos', c.recibos.porDia, c.recibos.crudo],
    ['Unidades', c.unidades.porDia, c.unidades.crudo],
  ];
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto',
                    gap: '10px 16px', alignItems: 'center', fontSize: '14px' }}>
        <span />
        {['Por día', 'Total'].map((h) => (
          <span key={h} style={{ fontSize: '10.5px', color: C.tinta4,
                                 textTransform: 'uppercase', letterSpacing: '0.07em',
                                 fontWeight: 700, textAlign: 'right' }}>{h}</span>
        ))}
        {filas.map(([nombre, porDia, crudo]) => (
          <Renglon key={nombre} nombre={nombre} porDia={porDia} crudo={crudo} />
        ))}
      </div>

      {c.mismosDias.aplica && c.mismosDias.pct !== null && (
        <div style={{ marginTop: '12px', paddingTop: '12px',
                      borderTop: `1px solid ${C.linea}`,
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: C.tinta2 }}>
            Solo los días que coinciden
          </span>
          <Delta valor={c.mismosDias.pct} />
        </div>
      )}
      <p style={{ fontSize: '12px', color: C.tinta4, marginTop: '14px', lineHeight: 1.5 }}>
        {rangoLegible(rango.desde, rango.hasta)} · {c.b.dias} días,{' '}
        {c.b.fuertes} de fin de semana · {pesos(c.b.ingresos)}
      </p>
    </>
  );
}

function Renglon({ nombre, porDia, crudo }) {
  return (
    <>
      <span style={{ color: C.tinta2 }}>{nombre}</span>
      <span style={{ textAlign: 'right' }}><Delta valor={porDia} /></span>
      {/* El total va con color pero sin pastilla: es la cifra secundaria y no
          debe competir con la de por día, que es la que hay que leer. El color
          sí importa aquí — cuando esta columna es roja y la otra verde, eso ES
          la trampa del calendario, y verla en dos colores la delata sola. */}
      <span style={{ textAlign: 'right', fontSize: '13px' }}>
        <Delta valor={crudo} fondo={false} flecha={false} />
      </span>
    </>
  );
}
