// =============================================================================
// Pantalla de entrada
// =============================================================================

import { useState } from 'react';
import { entrar, faltaConfiguracion } from '../datos.js';
import { C, campo, etiqueta, boton, botonApagado, nota } from '../estilo.js';
import { ImagotipoVertical } from '../marca.jsx';

export default function Entrar() {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    if (!correo || !contrasena) { setError('Faltan el correo o la contraseña.'); return; }
    setError(''); setOcupado(true);
    try {
      await entrar(correo, contrasena);
      // No hay que hacer nada más: App escucha el cambio de sesión.
    } catch (err) {
      setError(err.message);
      setOcupado(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '32px 24px',
      paddingTop: 'calc(32px + env(safe-area-inset-top))',
      paddingBottom: 'calc(32px + env(safe-area-inset-bottom))',
      background: C.negro,
    }}>
      <div style={{ maxWidth: '380px', width: '100%', margin: '0 auto' }}>
        {/* Aquí la marca es lo único que hay que ver, así que va completa y
            centrada. El logo es blanco sobre transparente y esta pantalla es
            negra: encaja sin recuadro ni fondo de ningún tipo. */}
        <ImagotipoVertical alto={132} />
        <p style={{ color: C.tinta4, fontSize: '13.5px', marginTop: '14px',
                    marginBottom: '30px', textAlign: 'center',
                    textTransform: 'uppercase', letterSpacing: '0.14em',
                    fontWeight: 600 }}>
          Tablero de ventas
        </p>

        {faltaConfiguracion && (
          <div style={{ ...nota('error'), background: '#2A1512', color: '#F0C0B8' }}>
            Falta configurar la conexión con Supabase. Copia <code>.env.example</code> como
            {' '}<code>.env</code> y pon la URL y la llave de tu proyecto.
          </div>
        )}

        <form onSubmit={enviar}>
          <label style={{ ...etiqueta, color: C.tinta4 }}>Correo</label>
          <input
            type="email" inputMode="email" autoComplete="username"
            value={correo}
            onChange={(e) => { setCorreo(e.target.value); if (error) setError(''); }}
            disabled={ocupado || faltaConfiguracion}
            style={{ ...campo(false), marginBottom: '16px',
                     background: '#161616', color: C.crema,
                     border: `1.5px solid ${error ? C.error : '#2A2A2A'}` }}
          />

          <label style={{ ...etiqueta, color: C.tinta4 }}>Contraseña</label>
          <input
            type="password" autoComplete="current-password"
            value={contrasena}
            onChange={(e) => { setContrasena(e.target.value); if (error) setError(''); }}
            disabled={ocupado || faltaConfiguracion}
            style={{ ...campo(false), marginBottom: '20px',
                     background: '#161616', color: C.crema,
                     border: `1.5px solid ${error ? C.error : '#2A2A2A'}` }}
          />

          {error && (
            <p style={{ color: '#F0A090', fontSize: '13.5px', marginBottom: '16px' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={ocupado || faltaConfiguracion}
            style={{ ...boton(), ...(ocupado || faltaConfiguracion ? botonApagado : {}) }}
          >
            {ocupado ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p style={{ color: C.tinta4, fontSize: '12.5px', marginTop: '22px',
                    lineHeight: 1.6 }}>
          Las cuentas se crean desde el panel de Supabase, en Authentication.
          Después hay que darles rol en la tabla <code>dc_usuarios</code>.
        </p>
      </div>
    </div>
  );
}
