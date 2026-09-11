// =============================================================================
// Ancho de la ventana
// =============================================================================
//
// La app no detecta "si es un celular o una computadora", y es a propósito:
// detectar el aparato falla seguido —una tablet, un celular acostado, una
// ventana angosta en un monitor grande— y además no es lo que importa. Lo que
// importa es cuánto espacio hay ahora mismo.
//
// Por eso se mide el ancho de la ventana y se reacciona a él. Si arrastras la
// esquina de la ventana en la computadora, el diseño se acomoda solo.
//
// El corte está en 760 px: abajo de eso una sola columna, arriba caben dos.
// =============================================================================

import { useState, useEffect } from 'react';

export const CORTE = 760;

export function usarAncho() {
  const [ancho, setAncho] = useState(
    () => (typeof window === 'undefined' ? 1024 : window.innerWidth));

  useEffect(() => {
    const alCambiar = () => setAncho(window.innerWidth);
    window.addEventListener('resize', alCambiar);
    // En iOS, girar el teléfono no siempre dispara 'resize'.
    window.addEventListener('orientationchange', alCambiar);
    return () => {
      window.removeEventListener('resize', alCambiar);
      window.removeEventListener('orientationchange', alCambiar);
    };
  }, []);

  return { ancho, esAncho: ancho >= CORTE };
}
