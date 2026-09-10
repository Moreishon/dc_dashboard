// =============================================================================
// Don Comal · Datos
// =============================================================================
//
// Sesión, rol, carga de datos y navegación entre pantallas.
//
// Los datos se traen UNA vez al entrar y se reparten a las pantallas. Son unos
// 5,600 renglones en total —la serie diaria y los agregados por mes—, que pesan
// poco y permiten cambiar de mes o de pestaña sin volver a pedir nada. El
// tablero se siente instantáneo porque no habla con la red al navegar.
//
// Nota para quien lo modifique: los componentes van FUERA de App. Si se definen
// adentro, React los considera un componente distinto en cada render, desmonta
// lo que había y el campo de texto en el que estabas escribiendo pierde el foco
// a cada letra. Pasó en la app de compras y costó encontrarlo.
// =============================================================================

import { useState, useEffect, useMemo } from 'react';
import {
  sesionActual, alCambiarSesion, miPerfil, salir, traerCobertura,
  traerDias, traerProductoMes, traerGuisadoMes, traerModificadorMes,
} from './datos.js';
import { C, FUENTES, pagina, encabezado, tituloEncabezado, nota, fechaLarga,
         fechaMedia, DISPLAY } from './estilo.js';
import { usarAncho } from './usarAncho.js';
import { atajoInicial } from './rango.js';
import { Isotipo, Imagotipo, ImagotipoVertical } from './marca.jsx';
import SelectorPeriodo from './pantallas/SelectorPeriodo.jsx';
import Entrar from './pantallas/Entrar.jsx';
import Importar from './pantallas/Importar.jsx';
import Resumen from './pantallas/Resumen.jsx';
import Productos from './pantallas/Productos.jsx';
import Guisados from './pantallas/Guisados.jsx';

const PESTANAS = [
  { id: 'resumen', nombre: 'Resumen' },
  { id: 'productos', nombre: 'Productos' },
  { id: 'guisados', nombre: 'Guisados' },
  { id: 'importar', nombre: 'Importar' },
];

function Cargando({ texto }) {
  return (
    <div style={{
      minHeight: '100vh', background: C.negro,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '22px',
      padding: '24px',
    }}>
      <ImagotipoVertical alto={150} />
      <div style={{ width: '120px', height: '3px', background: '#222',
                    borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: '40%', height: '100%', background: C.terracota,
                      borderRadius: '2px', animation: 'dc-vaiven 1.1s ease-in-out infinite' }} />
      </div>
      {texto && <div style={{ color: C.tinta4, fontSize: '13px' }}>{texto}</div>}
      <style>{`
        @keyframes dc-vaiven {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(320%); }
        }
      `}</style>
    </div>
  );
}

// En pantalla ancha cabe el imagotipo completo y todavía sobra lugar para el
// "Datos". En celular no: ahí va solo el isotipo, que es la pieza que sigue
// siendo reconocible a 28 píxeles, y el nombre de la app se cae porque compite
// con la fecha de corte, que sí es información.
function Encabezado({ perfil, cobertura, onSalir, esAncho }) {
  return (
    <div style={encabezado}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '11px' }}>
        {esAncho ? <Imagotipo alto={30} /> : <Isotipo alto={28} />}
        <div style={{ borderLeft: `1px solid ${C.negroSuave}`, paddingLeft: '11px' }}>
          {esAncho && <h1 style={{ ...tituloEncabezado, fontSize: '16px' }}>Datos</h1>}
          <p style={{ fontSize: '11.5px', color: C.tinta4,
                      marginTop: esAncho ? '1px' : 0 }}>
            {perfil?.nombre || 'Sin nombre'} · {perfil?.rol || 'sin rol'}
          </p>
        </div>
      </div>

      {cobertura?.datos_hasta && (
        <div style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '10px', color: C.tinta4, textTransform: 'uppercase',
                        letterSpacing: '0.08em', fontWeight: 600 }}>Datos hasta</div>
          <div style={{ fontSize: '13px', color: C.crema, fontWeight: 600 }}>
            {esAncho ? fechaLarga(cobertura.datos_hasta)
                     : fechaMedia(cobertura.datos_hasta)}
          </div>
        </div>
      )}

      <button onClick={onSalir}
        style={{ background: 'none', border: '1px solid #2A2A2A', borderRadius: '8px',
                 color: C.tinta4, cursor: 'pointer', fontSize: '13px',
                 fontFamily: 'inherit', padding: '7px 12px', flex: 'none' }}>
        Salir
      </button>
    </div>
  );
}

function Pestanas({ actual, ir, puedeImportar }) {
  const visibles = PESTANAS.filter((p) => p.id !== 'importar' || puedeImportar);
  return (
    <div style={{
      display: 'flex', gap: '2px', background: C.negro,
      padding: '0 12px',
      overflowX: 'auto', borderTop: `1px solid ${C.negroSuave}`,
    }}>
      {visibles.map((p) => (
        <button key={p.id} onClick={() => ir(p.id)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '14px', whiteSpace: 'nowrap',
            padding: '13px 14px', minHeight: '46px',
            color: actual === p.id ? C.crema : C.tinta4,
            fontWeight: actual === p.id ? 600 : 400,
            borderBottom: `2px solid ${actual === p.id ? C.terracota : 'transparent'}`,
          }}>
          {p.nombre}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [listo, setListo] = useState(false);
  const [sesion, setSesion] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [errorPerfil, setErrorPerfil] = useState('');
  const [cobertura, setCobertura] = useState(null);
  const [errorCobertura, setErrorCobertura] = useState('');
  const { esAncho } = usarAncho();

  const [pestana, setPestana] = useState('resumen');
  const [datos, setDatos] = useState(null);
  const [errorDatos, setErrorDatos] = useState('');
  const [rango, setRango] = useState(null);

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
      if (!s) { setPerfil(null); setErrorPerfil(''); setDatos(null); }
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
        if (!p) { setErrorPerfil('sin-alta'); return; }
        setPerfil(p); setErrorPerfil('');

        // La cobertura no es crítica —la app sirve sin ella— pero si falla hay
        // que DECIRLO. Un catch vacío deja una pantalla incompleta sin ninguna
        // pista de por qué, y eso es imposible de diagnosticar desde fuera.
        try {
          setCobertura(await traerCobertura());
          setErrorCobertura('');
        } catch (e) {
          setCobertura(null);
          setErrorCobertura([e.message, e.detalle].filter(Boolean).join(' — '));
        }
      } catch (e) {
        if (vivo) setErrorPerfil(e.message);
      }
    })();
    return () => { vivo = false; };
  }, [sesion]);

  // Los datos del tablero: una sola vez, todos juntos.
  useEffect(() => {
    if (!perfil) return;
    let vivo = true;
    (async () => {
      try {
        const [dias, productoMes, guisadoMes, modificadorMes] = await Promise.all([
          traerDias(), traerProductoMes(), traerGuisadoMes(), traerModificadorMes(),
        ]);
        if (!vivo) return;
        setDatos({ dias, productoMes, guisadoMes, modificadorMes });
        setErrorDatos('');
      } catch (e) {
        if (vivo) setErrorDatos(e.message);
      }
    })();
    return () => { vivo = false; };
  }, [perfil]);

  const periodos = useMemo(() => {
    if (!datos?.dias?.length) return [];
    return [...new Set(datos.dias.map((d) => d.fecha.slice(0, 7)))].sort();
  }, [datos]);

  const anios = useMemo(() => [...new Set(periodos.map((p) => +p.slice(0, 4)))], [periodos]);

  // El último día CON DATOS, que no es lo mismo que hoy. Todos los atajos se
  // anclan aquí: si hoy es 10 y el último dato es del 5, "esta semana" anclada
  // a hoy saldría vacía y el tablero parecería roto.
  const ultimoDato = useMemo(() => {
    if (!datos?.dias?.length) return null;
    return datos.dias.reduce((max, d) => (d.fecha > max ? d.fecha : max), '');
  }, [datos]);

  // Se arranca en la semana en curso.
  useEffect(() => {
    if (ultimoDato && !rango) setRango(atajoInicial(ultimoDato, anios));
  }, [ultimoDato, anios, rango]);

  if (!listo) return <Cargando />;
  if (!sesion) return <><style>{FUENTES}</style><Entrar /></>;

  const marco = (contenido) => (
    <>
      <style>{FUENTES}</style>
      <div style={pagina(esAncho)}>
        <Encabezado perfil={perfil} cobertura={cobertura} onSalir={salir}
                    esAncho={esAncho} />
        {contenido}
      </div>
    </>
  );

  // Tiene sesión pero nadie lo dio de alta con un rol. Es un estado real:
  // crear el usuario en Supabase y darle rol son dos pasos distintos.
  if (errorPerfil === 'sin-alta') {
    return marco(
      <div style={{ padding: '20px' }}>
        <div style={nota('aviso')}>
          Tu cuenta existe pero todavía no tiene rol asignado, así que la base no
          te deja ver nada. Un administrador tiene que darte de alta en la tabla
          <code> dc_usuarios</code>.
        </div>
      </div>
    );
  }

  if (errorPerfil) {
    return marco(
      <div style={{ padding: '20px' }}>
        <div style={nota('error')}>{errorPerfil}</div>
      </div>
    );
  }

  if (!perfil) return <Cargando />;
  if (!datos && !errorDatos) return <Cargando texto="Trayendo tres años de ventas…" />;

  const puedeImportar = perfil.rol === 'admin' || perfil.rol === 'gerente';
  const enTablero = pestana !== 'importar';

  return (
    <>
      <style>{FUENTES}</style>
      <div style={pagina(esAncho)}>
        <Encabezado perfil={perfil} cobertura={cobertura} onSalir={salir}
                    esAncho={esAncho} />
        {/* Las pestañas y el selector se pegan arriba JUNTOS, dentro de un
            solo contenedor. Por separado los dos pedirían top:0 y se
            encimarían al hacer scroll. */}
        <div style={{ position: 'sticky', top: 0, zIndex: 9 }}>
          <Pestanas actual={pestana} ir={setPestana} puedeImportar={puedeImportar} />
          {enTablero && rango && (
            <SelectorPeriodo rango={rango} setRango={setRango}
                             ultimoDato={ultimoDato} anios={anios} esAncho={esAncho} />
          )}
        </div>

        {errorCobertura && (
          <div style={{ padding: '20px 20px 0' }}>
            <div style={nota('aviso')}>
              No se pudo leer hasta qué fecha llegan los datos. Lo demás funciona
              normal; solo falta ese indicador.
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px',
                            marginTop: '8px', color: C.tinta3, wordBreak: 'break-word' }}>
                {errorCobertura}
              </div>
            </div>
          </div>
        )}

        {errorDatos && (
          <div style={{ padding: '20px 20px 0' }}>
            <div style={nota('error')}>
              No se pudieron traer los datos del tablero.
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px',
                            marginTop: '8px', wordBreak: 'break-word' }}>
                {errorDatos}
              </div>
            </div>
          </div>
        )}

        {datos && rango && pestana === 'resumen' && (
          <Resumen dias={datos.dias} esAncho={esAncho}
                   rango={rango} ultimoDato={ultimoDato} />
        )}
        {datos && rango && pestana === 'productos' && (
          <Productos rango={rango} esAncho={esAncho} />
        )}
        {datos && rango && pestana === 'guisados' && (
          <Guisados rango={rango} esAncho={esAncho}
                    guisadoMes={datos.guisadoMes} periodos={periodos} />
        )}
        {pestana === 'importar' && (
          <Importar perfil={perfil} esAncho={esAncho}
                    cobertura={cobertura} alImportar={setCobertura} />
        )}
      </div>
    </>
  );
}
