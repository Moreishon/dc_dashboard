// =============================================================================
// Banco de pruebas
// =============================================================================
//
// Monta las pantallas del tablero con datos reales del histórico, sin pasar por
// Supabase. Sirve para verlas y para que Playwright las revise.
//
// No forma parte de la app. Las funciones que normalmente van al servidor se
// simulan en datos_falsos.js, que hace el mismo cálculo sobre fixtures por día.
// =============================================================================

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import Resumen from '../src/pantallas/Resumen.jsx';
import Productos from '../src/pantallas/Productos.jsx';
import Guisados from '../src/pantallas/Guisados.jsx';
import SelectorPeriodo from '../src/pantallas/SelectorPeriodo.jsx';
import { C, FUENTES, pagina } from '../src/estilo.js';
import { usarAncho } from '../src/usarAncho.js';
import { atajoInicial } from '../src/rango.js';

function leerCSV(t) {
  const filas = []; let campo = '', fila = [], q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else q = false; }
      else campo += c;
    } else if (c === '"') q = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  const cols = filas.shift();
  return filas.filter((f) => f.length === cols.length)
    .map((f) => Object.fromEntries(cols.map((c, i) => [c, f[i]])));
}

function Banco() {
  const [d, setD] = useState(null);
  const [pest, setPest] = useState('resumen');
  const [rango, setRango] = useState(null);
  const { esAncho } = usarAncho();

  useEffect(() => {
    (async () => {
      const traer = async (n) =>
        leerCSV(await fetch(`/pruebas/datos/${n}.csv`).then((r) => r.text()));
      const [dias, guisadoMes, prodDia, guisDia, modDia] = await Promise.all([
        traer('dias'), traer('guisado_mes'),
        traer('producto_dia'), traer('guisado_dia'), traer('modificador_dia'),
      ]);
      // Los agregadores falsos leen de aquí.
      window.__falso = { prodDia, guisDia, modDia };
      setD({ dias, guisadoMes });
    })();
  }, []);

  const periodos = d ? [...new Set(d.dias.map((x) => x.fecha.slice(0, 7)))].sort() : [];
  const anios = [...new Set(periodos.map((p) => +p.slice(0, 4)))];
  const ultimoDato = d ? d.dias.reduce((m, x) => (x.fecha > m ? x.fecha : m), '') : null;

  useEffect(() => {
    if (ultimoDato && !rango) setRango(atajoInicial(ultimoDato, anios));
  }, [ultimoDato, rango]);

  if (!d || !rango) return <div id="cargando" style={{ padding: 40 }}>Cargando…</div>;

  return (
    <>
      <style>{FUENTES}</style>
      <div style={pagina(esAncho)}>
        <div style={{ display: 'flex', gap: 2, background: C.negro, padding: '0 12px' }}>
          {['resumen', 'productos', 'guisados'].map((p) => (
            <button key={p} id={`tab-${p}`} onClick={() => setPest(p)}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                       fontFamily: 'inherit', fontSize: 14, padding: '13px 14px',
                       color: pest === p ? C.durazno : C.tinta4,
                       borderBottom: `2px solid ${pest === p ? C.naranja : 'transparent'}` }}>
              {p}
            </button>
          ))}
        </div>
        <SelectorPeriodo rango={rango} setRango={setRango}
                         ultimoDato={ultimoDato} anios={anios} esAncho={esAncho} />
        {pest === 'resumen' && (
          <Resumen dias={d.dias} esAncho={esAncho} rango={rango} ultimoDato={ultimoDato} />
        )}
        {pest === 'productos' && <Productos rango={rango} esAncho={esAncho} />}
        {pest === 'guisados' && (
          <Guisados rango={rango} esAncho={esAncho}
                    guisadoMes={d.guisadoMes} periodos={periodos} />
        )}
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Banco />);
