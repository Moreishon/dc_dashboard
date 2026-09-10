// =============================================================================
// Don Comal · Datos
// =============================================================================
//
// Por ahora la app hace una sola cosa: subir el reporte mensual de Poster a la
// base. El tablero viene después y se cuelga de este mismo esqueleto.
//
// Nota para quien la modifique: los componentes van FUERA de App. Si se definen
// adentro, React los considera un componente distinto en cada render, desmonta
// lo que había y el campo de texto en el que estabas escribiendo pierde el foco
// a cada letra. Pasó en la app de compras y costó encontrarlo.
// =============================================================================

import { useState, useEffect } from 'react';
import { sesionActual, alCambiarSesion, miPerfil, salir, traerCobertura } from './datos.js';
import { C, FUENTES, pagina, encabezado, tituloEncabezado, nota, fechaLarga } from './estilo.js';
import { usarAncho } from './usarAncho.js';
import Entrar from './pantallas/Entrar.jsx';
import Importar from './pantallas/Importar.jsx';

function Cargando() {
  return (
    <div style={{
      minHeight: '100vh', background: C.negro,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '16px',
    }}>
      <div style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        color: C.crema, fontSize: '26px', fontWeight: 700,
      }}>Don Comal</div>
      <div style={{
        width: '120px', height: '3px', background: '#222',
        borderRadius: '2px', overflow: 'hidden',
      }}>
        <div style={{
          width: '40%', height: '100%', background: C.terracota,
          borderRadius: '2px', animation: 'dc-vaiven 1.1s ease-in-out infinite',
        }} />
      </div>
      <style>{`
        @keyframes dc-vaiven {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(320%); }
        }
      `}</style>
    </div>
  );
}

function Encabezado({ perfil, cobertura, onSalir }) {
  return (
    <div style={encabezado}>
      <div>
        <h1 style={tituloEncabezado}>Datos</h1>
        <p style={{ fontSize: '11.5px', color: C.tinta4, marginTop: '2px' }}>
          {perfil?.nombre || 'Sin nombre'} · {perfil?.rol || 'sin rol'}
        </p>
      </div>

      {/* Hasta qué día llegan los datos. Va en el encabezado a propósito: es
          lo primero que uno quiere saber al abrir la app, y se ve en todas
          las pantallas sin tener que buscarlo. */}
      {cobertura?.datos_hasta && (
        <div style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '10px', color: C.tinta4, textTransform: 'uppercase',
                        letterSpacing: '0.08em', fontWeight: 600 }}>
            Datos hasta
          </div>
          <div style={{ fontSize: '13px', color: C.crema, fontWeight: 600 }}>
            {fechaLarga(cobertura.datos_hasta)}
          </div>
        </div>
      )}

      <button
        onClick={onSalir}
        style={{
          background: 'none', border: `1px solid #2A2A2A`, borderRadius: '8px',
          color: C.tinta4, cursor: 'pointer', fontSize: '13px',
          fontFamily: 'inherit', padding: '7px 12px', flex: 'none',
        }}
      >Salir</button>
    </div>
  );
}

export default function App() {
  const [listo, setListo] = useState(false);
  const [sesion, setSesion] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [errorPerfil, setErrorPerfil] = useState('');
  const [cobertura, setCobertura] = useState(null);
  const { esAncho } = usarAncho();

  // Arranque: se pregunta si ya había sesión guardada antes de decidir qué
  // pintar. Sin esta bandera la app parpadea mostrando el login a alguien que
  // ya estaba dentro.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const s = await sesionActual();
      if (!vivo) return;
      setSesion(s);
      setListo(true);
    })();
    const cancelar = alCambiarSesion((s) => {
      setSesion(s);
      if (!s) { setPerfil(null); setErrorPerfil(''); }
    });
    return () => { vivo = false; cancelar(); };
  }, []);

  // El rol vive en la base, no en el token: se pregunta cada vez que hay sesión.
  useEffect(() => {
    if (!sesion) return;
    let vivo = true;
    (async () => {
      try {
        const p = await miPerfil();
        if (!vivo) return;
        if (!p) setErrorPerfil('sin-alta');
        else {
          setPerfil(p); setErrorPerfil('');
          // La cobertura no es crítica: si falla, la app sigue funcionando
          // y simplemente no se muestra la fecha.
          try { setCobertura(await traerCobertura()); } catch { /* sin fecha */ }
        }
      } catch (e) {
        if (vivo) setErrorPerfil(e.message);
      }
    })();
    return () => { vivo = false; };
  }, [sesion]);

  if (!listo) return <Cargando />;
  if (!sesion) return <><style>{FUENTES}</style><Entrar /></>;

  // Tiene sesión pero nadie lo dio de alta con un rol. Es un estado real:
  // crear el usuario en Supabase y darle rol son dos pasos distintos.
  if (errorPerfil === 'sin-alta') {
    return (
      <>
        <style>{FUENTES}</style>
        <div style={pagina(esAncho)}>
          <Encabezado perfil={null} cobertura={null} onSalir={salir} />
          <div style={{ padding: '20px' }}>
            <div style={nota('aviso')}>
              Tu cuenta existe pero todavía no tiene rol asignado, así que la base
              no te deja ver nada. Un administrador tiene que darte de alta en la
              tabla <code>dc_usuarios</code>.
            </div>
          </div>
        </div>
      </>
    );
  }

  if (errorPerfil) {
    return (
      <>
        <style>{FUENTES}</style>
        <div style={pagina(esAncho)}>
          <Encabezado perfil={perfil} cobertura={cobertura} onSalir={salir} />
          <div style={{ padding: '20px' }}>
            <div style={nota('error')}>{errorPerfil}</div>
          </div>
        </div>
      </>
    );
  }

  if (!perfil) return <Cargando />;

  return (
    <>
      <style>{FUENTES}</style>
      <div style={pagina(esAncho)}>
        <Encabezado perfil={perfil} cobertura={cobertura} onSalir={salir} />
        <Importar perfil={perfil} esAncho={esAncho}
                  cobertura={cobertura} alImportar={setCobertura} />
      </div>
    </>
  );
}
