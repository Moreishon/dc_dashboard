// =============================================================================
// Selector de periodo
// =============================================================================
//
// Vive arriba de todas las pantallas y manda sobre las tres. Atajos para lo que
// se consulta todos los días, y un rango libre para lo demás.
//
// Debajo de las pastillas siempre se ven LAS FECHAS EXACTAS del periodo. No es
// decoración: "esta semana" significa cosas distintas según el día, y un
// tablero donde no sabes qué fechas estás viendo no se puede usar para decidir
// nada.
// =============================================================================

import { useState } from 'react';
import { atajos, cuantosDias } from '../rango.js';
import { C, pastilla, campo, etiqueta, rangoLegible, boton } from '../estilo.js';

export default function SelectorPeriodo({ rango, setRango, ultimoDato, anios, esAncho }) {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(rango?.desde || '');
  const [hasta, setHasta] = useState(rango?.hasta || '');
  const [error, setError] = useState('');

  const lista = atajos(ultimoDato, anios);

  function aplicar() {
    if (!desde || !hasta) { setError('Faltan las dos fechas.'); return; }
    if (desde > hasta) { setError('La fecha de inicio va después de la de fin.'); return; }
    setError('');
    setRango({
      id: 'libre', nombre: 'Personalizado', tipo: 'ventana', desde, hasta,
    });
    setAbierto(false);
  }

  return (
    <div style={{
      background: C.tarjeta,
      borderBottom: `1px solid ${C.linea}`,
      padding: '14px 18px',
      boxShadow: '0 4px 12px -8px rgba(28,19,16,.25)',
    }}>
      <div style={{ display: 'flex', gap: '7px', flexWrap: esAncho ? 'wrap' : 'nowrap',
                    overflowX: esAncho ? 'visible' : 'auto',
                    paddingBottom: esAncho ? 0 : '4px',
                    marginBottom: '10px',
                    scrollbarWidth: 'thin' }}>
        {lista.map((a) => (
          <button key={a.id} onClick={() => setRango(a)}
                  style={pastilla(rango?.id === a.id)}>
            {a.nombre}
          </button>
        ))}
        <button onClick={() => setAbierto((x) => !x)}
                style={pastilla(rango?.id === 'libre')}>
          Otro periodo
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px',
                    flexWrap: 'wrap' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: C.tinta }}>
          {rangoLegible(rango?.desde, rango?.hasta)}
        </span>
        <span style={{ fontSize: '12.5px', color: C.tinta4 }}>
          {rango ? `${cuantosDias(rango.desde, rango.hasta)} días` : ''}
        </span>
      </div>

      {abierto && (
        <div style={{ marginTop: '14px', paddingTop: '14px',
                      borderTop: `1px solid ${C.linea}`,
                      display: 'grid',
                      gridTemplateColumns: esAncho ? '1fr 1fr auto' : '1fr 1fr',
                      gap: '10px', alignItems: 'end' }}>
          <div>
            <label style={etiqueta}>Del</label>
            <input type="date" value={desde} max={ultimoDato}
                   onChange={(e) => setDesde(e.target.value)}
                   style={campo(false)} />
          </div>
          <div>
            <label style={etiqueta}>Al</label>
            <input type="date" value={hasta} max={ultimoDato}
                   onChange={(e) => setHasta(e.target.value)}
                   style={campo(false)} />
          </div>
          <button onClick={aplicar}
                  style={{ ...boton(), gridColumn: esAncho ? undefined : 'span 2',
                           minHeight: '48px', padding: '12px' }}>
            Aplicar
          </button>
          {error && (
            <span style={{ gridColumn: '1 / -1', color: C.error, fontSize: '13px' }}>
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
