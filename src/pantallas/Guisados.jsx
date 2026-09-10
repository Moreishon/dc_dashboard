// =============================================================================
// Guisados y extras
// =============================================================================
//
// Esta es la parte que el POS no da y que ningún reporte de Poster contesta,
// porque los guisados viven revueltos dentro de una celda de texto.
//
// Dos medidas que no se pueden mezclar
// ------------------------------------
//   Repartidas   Si un pedido de 2 lleva Deshebrada y Chicharrón, cada uno se
//                lleva 1. Suman al total del periodo, así que sirven para
//                hablar de participación: los porcentajes cierran en 100.
//
//   Presencia    El pedido completo cuenta para cada guiso que aparece. NO
//                suman al total —un pedido con tres guisos se cuenta tres
//                veces— y está bien: contestan "¿en cuántos pedidos salió?".
//
// Las dos son correctas y responden preguntas distintas. Ponerlas en la misma
// gráfica sería mentir, así que van separadas y con su explicación.
// =============================================================================

import { useMemo, useState, useEffect } from 'react';
import { comparaciones } from '../rango.js';
import { evolucionGuisados } from '../analisis.js';
import { traerGuisadosRango, traerModificadoresRango } from '../datos.js';
import { Barras, Lineas, Numeros, SERIES } from '../graficas.jsx';
import {
  C, tarjeta, tituloTarjeta, nota, rejilla,
  pesos, numero, nombreMes, rangoLegible,
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

/** Participación de cada guisado, con los que no caben juntos en 'Otros'. */
function participacion(filas, cuantos = 8) {
  const orden = filas
    .map((f) => ({
      guisado: f.guisado,
      unidades: +f.unidades_atribuidas || 0,
      presencia: +f.unidades_presencia || 0,
      renglones: +f.renglones || 0,
    }))
    .sort((a, b) => b.unidades - a.unidades);
  const total = orden.reduce((s, f) => s + f.unidades, 0);
  const cabeza = orden.slice(0, cuantos);
  const cola = orden.slice(cuantos);

  const salida = cabeza.map((f) => ({
    ...f,
    unidades: Math.round(f.unidades * 100) / 100,
    participacion: total ? Math.round((f.unidades / total) * 1000) / 10 : 0,
  }));
  if (cola.length) {
    const u = cola.reduce((s, f) => s + f.unidades, 0);
    salida.push({
      guisado: 'Otros', unidades: Math.round(u * 100) / 100, otros: cola.length,
      presencia: cola.reduce((s, f) => s + f.presencia, 0),
      renglones: cola.reduce((s, f) => s + f.renglones, 0),
      participacion: total ? Math.round((u / total) * 1000) / 10 : 0,
    });
  }
  return { filas: salida, total: Math.round(total * 100) / 100, todos: orden };
}

export default function Guisados({ rango, esAncho, guisadoMes, periodos }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cmp = useMemo(() => comparaciones(rango), [rango]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    (async () => {
      try {
        const [guis, antes, mods] = await Promise.all([
          traerGuisadosRango(rango.desde, rango.hasta),
          traerGuisadosRango(cmp.anterior.desde, cmp.anterior.hasta),
          traerModificadoresRango(rango.desde, rango.hasta),
        ]);
        if (!vivo) return;
        setDatos({ guis, antes, mods });
        setError('');
      } catch (e) {
        if (vivo) setError([e.message, e.detalle].filter(Boolean).join(' — '));
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [rango.desde, rango.hasta, cmp.anterior.desde, cmp.anterior.hasta]);

  const calc = useMemo(() => {
    if (!datos) return null;
    const part = participacion(datos.guis, 8);
    const partAntes = participacion(datos.antes, 40);
    const mapaAntes = new Map(partAntes.filas.map((f) => [f.guisado, f.participacion]));

    // La evolución mes a mes sale de los agregados mensuales, no del rango:
    // aquí el grano SÍ es el mes, y son doce puntos fijos.
    const ultimos = (periodos || []).slice(-12);
    const evo = evolucionGuisados(guisadoMes || [], ultimos, 5);
    const series = Object.keys(evo[evo.length - 1] || {})
      .filter((k) => k !== 'periodo' && k !== 'total');

    const extras = (datos.mods || [])
      .filter((m) => m.tipo === 'EXTRA')
      .map((m) => ({
        modificador: m.modificador,
        veces: +m.veces || 0,
        renglones: +m.renglones || 0,
      }))
      .sort((a, b) => b.veces - a.veces);

    return {
      part, mapaAntes, hayAntes: partAntes.total > 0,
      evo: evo.map((p) => ({
        ...p, etiqueta: nombreMes(p.periodo),
        corta: nombreMes(p.periodo).slice(0, 3),
      })),
      series,
      extras,
      porciones: extras.reduce((s, f) => s + f.veces, 0),
      pedidos: extras.reduce((s, f) => s + f.renglones, 0),
    };
  }, [datos, guisadoMes, periodos]);

  if (error) {
    return <div style={{ padding: '18px' }}><div style={nota('error')}>{error}</div></div>;
  }
  if (!calc) {
    return <div style={{ padding: '30px 18px', color: C.tinta3, fontSize: '14px' }}>
      Cargando los guisados del periodo…
    </div>;
  }

  // Los cinco que salen en la gráfica de abajo van con SU color, para que se
  // reconozcan entre las dos. Los demás en gris: son contexto, no series.
  // Nunca se repite un color — dos barras idénticas se leerían como lo mismo.
  const barras = calc.part.filas.map((f) => {
    const iSerie = calc.series.indexOf(f.guisado);
    const antes = calc.mapaAntes.get(f.guisado);
    // 'Otros' NO se compara: agrupa guisados distintos en cada periodo.
    const mueve = (f.guisado !== 'Otros' && antes !== undefined)
      ? Math.round((f.participacion - antes) * 10) / 10 : null;
    return {
      etiqueta: f.guisado,
      valor: f.participacion,
      color: iSerie >= 0 ? SERIES[iSerie] : '#BCADA2',
      nota: `${numero(f.unidades)} unidades` +
        (mueve !== null && calc.hayAntes
          ? ` · ${mueve > 0 ? '+' : ''}${mueve} puntos contra ${cmp.anterior.nombre}`
          : '') +
        (f.otros ? ` · ${f.otros} guisados más` : ''),
    };
  });

  return (
    <div style={{ padding: '18px',
                  paddingBottom: 'calc(44px + env(safe-area-inset-bottom))' }}>

      <div style={{ ...tarjeta(), display: 'flex', gap: '24px',
                    flexWrap: 'wrap', alignItems: 'baseline' }}>
        {[['Unidades con guisado', numero(calc.part.total)],
          ['Guisados distintos', numero(calc.part.todos.length)],
          ['Porciones de extra', numero(calc.porciones)]].map(([et, v]) => (
          <div key={et}>
            <div style={{ fontSize: '10.5px', color: C.tinta4, textTransform: 'uppercase',
                          letterSpacing: '0.09em', fontWeight: 700, marginBottom: '5px' }}>
              {et}
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700,
                          letterSpacing: '-0.02em' }}>{v}</div>
          </div>
        ))}
      </div>

      <Tarjeta titulo="Participación del periodo"
               sub="Porcentaje de las unidades con guisado. Un pedido con dos guisos se reparte entre los dos, por eso cierran en 100%.">
        <Barras datos={barras} formato={(v) => `${v}%`} />
        <Numeros filas={calc.part.filas} columnas={[
          { titulo: 'Guisado', valor: (f) => f.guisado },
          { titulo: 'Repartidas', valor: (f) => numero(f.unidades) },
          { titulo: 'Participación', valor: (f) => `${f.participacion}%` },
          { titulo: 'En pedidos', valor: (f) => numero(f.presencia) },
        ]} />
      </Tarjeta>

      <Tarjeta titulo="Cómo se mueven"
               sub="Los cinco principales, mes a mes, a lo largo del último año. Que la Deshebrada sea la número uno ya lo sabes; lo que no se ve en ningún lado es si está ganando o perdiendo terreno.">
        <Lineas puntos={calc.evo} series={calc.series} alto={260} />
        <Numeros filas={[...calc.evo].reverse()} columnas={[
          { titulo: 'Mes', valor: (f) => f.etiqueta },
          ...calc.series.map((s) => ({ titulo: s, valor: (f) => `${f[s]}%` })),
        ]} />
      </Tarjeta>

      <div style={nota('aviso')}>
        Esa gráfica es de <b>participación</b>, no de volumen: siempre va mes a
        mes, sin importar el filtro de arriba. Un guiso puede bajar de porcentaje
        en un mes en que vendió más, si los demás crecieron más rápido. Para
        volumen, mira Productos.
      </div>

      <Tarjeta titulo="Extras"
               sub={`${numero(calc.porciones)} porciones en ${numero(calc.pedidos)} pedidos durante ${rangoLegible(rango.desde, rango.hasta)}. Es la palanca más directa sobre el ticket.`}>
        {calc.extras.length ? (
          <>
            <Barras datos={calc.extras.slice(0, 10).map((f) => ({
              etiqueta: f.modificador, valor: f.veces, color: SERIES[2],
              nota: `en ${numero(f.renglones)} pedidos`,
            }))} formato={numero} />
            <Numeros filas={calc.extras} columnas={[
              { titulo: 'Extra', valor: (f) => f.modificador },
              { titulo: 'Porciones', valor: (f) => numero(f.veces) },
              { titulo: 'Pedidos', valor: (f) => numero(f.renglones) },
              { titulo: 'Por pedido', valor: (f) =>
                (f.renglones ? f.veces / f.renglones : 0).toFixed(1) },
            ]} />
          </>
        ) : (
          <p style={{ fontSize: '13.5px', color: C.tinta3 }}>
            No se registraron extras en este periodo.
          </p>
        )}
      </Tarjeta>

      <div style={nota('aviso')}>
        <b>Un número que falta.</b> Ya sabemos que hay pedidos con varios
        guisados donde el extra no se cobró, por el error de flujo en la toma del
        pedido. Esos pedidos no aparecen aquí porque nunca se registraron como
        extra. Dimensionar ese hueco se puede hacer, comparando pedidos con más
        de un guisado contra extras cobrados — dímelo y lo armamos.
      </div>
    </div>
  );
}
