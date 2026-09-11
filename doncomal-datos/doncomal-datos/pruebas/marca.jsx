// =============================================================================
// Banco de la marca
// =============================================================================
//
// Las tres superficies oscuras donde va el logo —carga, entrada y encabezado—
// no aparecen en el banco del tablero, porque viven en App.jsx y en Entrar.jsx
// y las dos hablan con Supabase. Aquí se montan sueltas, sin sesión, solo para
// verlas y para que Playwright compruebe que el logo llegó y se pintó.
// =============================================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import { C, FUENTES, encabezado, tituloEncabezado, fechaLarga, fechaMedia } from '../src/estilo.js';
import { Isotipo, Imagotipo, ImagotipoVertical } from '../src/marca.jsx';

function Carga() {
  return (
    <div id="carga" style={{
      minHeight: '380px', background: C.negro, display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: '22px', padding: '24px',
    }}>
      <ImagotipoVertical alto={150} />
      <div style={{ width: '120px', height: '3px', background: '#222',
                    borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: '40%', height: '100%', background: C.naranja,
                      borderRadius: '2px' }} />
      </div>
      <div style={{ color: C.tinta4, fontSize: '13px' }}>Trayendo tres años de ventas…</div>
    </div>
  );
}

function Entrada() {
  return (
    <div id="entrada" style={{ background: C.negro, padding: '40px 24px' }}>
      <div style={{ maxWidth: '380px', width: '100%', margin: '0 auto' }}>
        <ImagotipoVertical alto={132} />
        <p style={{ color: C.tinta4, fontSize: '13.5px', marginTop: '14px',
                    marginBottom: '30px', textAlign: 'center',
                    textTransform: 'uppercase', letterSpacing: '0.14em',
                    fontWeight: 600 }}>Tablero de ventas</p>
        <input placeholder="correo" style={{ width: '100%', padding: '12px 14px',
          borderRadius: '12px', background: '#161616', color: C.durazno,
          border: '1.5px solid #2A2A2A', marginBottom: '16px' }} />
        <button style={{ width: '100%', background: C.naranja, color: 'white',
          border: 'none', borderRadius: '14px', padding: '16px',
          fontWeight: 700, fontSize: '16px' }}>Entrar</button>
      </div>
    </div>
  );
}

function Cabecera({ esAncho }) {
  return (
    <div id={esAncho ? 'cab-ancha' : 'cab-angosta'}
         style={{ ...encabezado, maxWidth: esAncho ? '1040px' : '390px',
                  margin: '0 auto' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '11px' }}>
        {esAncho ? <Imagotipo alto={30} /> : <Isotipo alto={28} />}
        <div style={{ borderLeft: `1px solid ${C.negroSuave}`, paddingLeft: '11px' }}>
          {esAncho && <h1 style={{ ...tituloEncabezado, fontSize: '16px' }}>Datos</h1>}
          <p style={{ fontSize: '11.5px', color: C.tinta4,
                      marginTop: esAncho ? '1px' : 0 }}>Octavio · admin</p>
        </div>
      </div>
      <div style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '10px', color: C.tinta4, textTransform: 'uppercase',
                      letterSpacing: '0.08em', fontWeight: 600 }}>Datos hasta</div>
        <div style={{ fontSize: '13px', color: C.durazno, fontWeight: 600 }}>
          {esAncho ? fechaLarga('2026-09-05') : fechaMedia('2026-09-05')}
        </div>
      </div>
      <button style={{ background: 'none', border: '1px solid #2A2A2A',
        borderRadius: '8px', color: C.tinta4, fontSize: '13px',
        padding: '7px 12px', flex: 'none' }}>Salir</button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <style>{FUENTES}</style>
    <div style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <Cabecera esAncho />
      <div style={{ height: '2px' }} />
      <Cabecera esAncho={false} />
      <Carga />
      <Entrada />
    </div>
  </>
);
