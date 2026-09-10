// =============================================================================
// Sistema visual
// =============================================================================
//
// Los colores de marca los definió Octavio. Los de las gráficas no salen de
// ahí, y vale la pena explicar por qué.
//
// Marca y datos son dos trabajos distintos
// ----------------------------------------
// Una paleta de marca busca que todo se sienta de la misma familia: por eso el
// naranja, el rojo y el café conviven bien. Una paleta de datos busca lo
// contrario — que ninguna serie se confunda con otra, ni siquiera para quien no
// distingue el rojo del verde.
//
// El naranja #ED6B1F y el rojo #DD3C26 son casi el mismo tono para un ojo con
// daltonismo. Como marca funcionan; como dos líneas en una gráfica serían la
// misma línea. Por eso las series usan una paleta aparte, validada, que arranca
// con el naranja de la marca y sigue con azul, verde, dorado, violeta y rosa.
//
// El amarillo #FCCA3D vive aquí como color de realce, pero no como línea: es
// demasiado claro para verse sobre blanco. Para las series se usa un dorado más
// oscuro que sí se ve.
// =============================================================================

export const C = {
  // ── marca ──
  naranja:    '#ED6B1F',
  naranjaHondo:'#C4530F',
  cacao:       '#661606',
  rojo:        '#DD3C26',
  durazno:     '#FFD8C5',
  oro:         '#FCCA3D',

  // ── fondos ──
  negro:      '#14100E',
  negroSuave: '#231C18',
  papel:      '#FBF7F4',
  tarjeta:    '#FFFFFF',
  papelHondo: '#F3EDE8',

  // ── texto ──
  tinta:      '#1C1310',
  tinta2:     '#54443C',
  tinta3:     '#7B675D',
  tinta4:     '#9C8A80',

  // ── líneas ──
  linea:      '#EDE4DC',
  lineaFuerte:'#DFD2C8',

  // ── estados ──
  error:      '#DD3C26',
  errorSuave: '#FDECE8',
  bien:       '#1E7A50',
  bienSuave:  '#E8F4EE',
  aviso:      '#9A5A12',
  avisoSuave: '#FFF1E7',
};

/** Alias, para no romper lo que ya usaba el nombre viejo. */
C.terracota = C.naranja;
C.crema = C.durazno;

// Fraunces para los títulos: es una serif de formas suaves, moderna sin ser
// fría. Plus Jakarta Sans para todo lo demás, incluidos TODOS los números —
// una serif en una cifra grande se lee como decoración, no como dato.
export const FUENTES =
  "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');";

export const SANS = "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif";
export const DISPLAY = "'Fraunces', Georgia, serif";

export const ANCHO_CELULAR = '520px';
export const ANCHO_ESCRITORIO = '1040px';

export const pagina = (esAncho) => ({
  fontFamily: SANS,
  background: C.papel,
  minHeight: '100vh',
  maxWidth: esAncho ? ANCHO_ESCRITORIO : ANCHO_CELULAR,
  margin: '0 auto',
  color: C.tinta,
});

/** Dos columnas cuando hay espacio, una cuando no. */
export const rejilla = (esAncho, minimo = '320px') => ({
  display: 'grid',
  gridTemplateColumns: esAncho ? `repeat(auto-fit, minmax(${minimo}, 1fr))` : '1fr',
  gap: '14px',
  alignItems: 'start',
  marginBottom: '14px',
});

// El encabezado respeta el notch del iPhone y la barra de Android.
// env() vale 0 en escritorio.
export const encabezado = {
  background: C.negro,
  paddingTop: 'calc(18px + env(safe-area-inset-top))',
  paddingRight: '20px',
  paddingBottom: '18px',
  paddingLeft: '20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
};

export const tituloEncabezado = {
  fontFamily: DISPLAY,
  color: '#FFF6F0',
  fontSize: '20px',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  margin: 0,
};

export const cuerpo = {
  padding: '18px',
  paddingBottom: 'calc(44px + env(safe-area-inset-bottom))',
};

export const tarjeta = (extra) => ({
  background: C.tarjeta,
  borderRadius: '16px',
  border: `1px solid ${C.linea}`,
  boxShadow: '0 1px 2px rgba(28,19,16,.04), 0 8px 24px -12px rgba(28,19,16,.10)',
  padding: '18px',
  marginBottom: '14px',
  ...(extra || {}),
});

export const tituloTarjeta = {
  fontFamily: DISPLAY,
  fontSize: '17px',
  fontWeight: 600,
  color: C.tinta,
  letterSpacing: '-0.005em',
  margin: 0,
};

export const etiqueta = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 700,
  color: C.tinta4,
  textTransform: 'uppercase',
  letterSpacing: '0.09em',
  marginBottom: '7px',
};

export const campo = (hayError) => ({
  width: '100%',
  background: 'white',
  border: `1.5px solid ${hayError ? C.error : C.lineaFuerte}`,
  borderRadius: '12px',
  padding: '12px 14px',
  fontSize: '15px',
  color: C.tinta,
  outline: 'none',
  minHeight: '48px',
  fontFamily: 'inherit',
});

export const boton = (extra) => ({
  width: '100%',
  background: C.naranja,
  color: 'white',
  border: 'none',
  borderRadius: '14px',
  padding: '16px',
  fontSize: '16px',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: '54px',
  boxShadow: '0 2px 8px -2px rgba(237,107,31,.45)',
  ...(extra || {}),
});

export const botonSecundario = (extra) => ({
  ...boton(),
  background: 'white',
  color: C.tinta2,
  border: `1.5px solid ${C.lineaFuerte}`,
  boxShadow: 'none',
  ...(extra || {}),
});

export const botonApagado = {
  opacity: 0.45,
  cursor: 'not-allowed',
  boxShadow: 'none',
};

/** Las pastillas de filtro. Grandes para el dedo, no para el ratón. */
export const pastilla = (activa, extra) => ({
  padding: '9px 15px',
  borderRadius: '999px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  fontSize: '13.5px',
  fontWeight: activa ? 700 : 500,
  minHeight: '40px',
  border: activa ? '1.5px solid transparent' : `1.5px solid ${C.lineaFuerte}`,
  background: activa ? C.naranja : 'white',
  color: activa ? 'white' : C.tinta2,
  transition: 'background .15s, color .15s',
  ...(extra || {}),
});

export const nota = (tono) => {
  const tonos = {
    error: [C.error, C.errorSuave],
    bien:  [C.bien, C.bienSuave],
    aviso: [C.naranja, C.avisoSuave],
  };
  const [borde, fondo] = tonos[tono] || tonos.aviso;
  return {
    borderLeft: `3px solid ${borde}`,
    background: fondo,
    borderRadius: '0 12px 12px 0',
    padding: '13px 16px',
    fontSize: '14px',
    color: C.tinta2,
    marginBottom: '14px',
    lineHeight: 1.55,
  };
};

// ─── formato ─────────────────────────────────────────────────────────────────

export const pesos = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN',
    maximumFractionDigits: 0 }).format(n || 0);

export const pesosExactos = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);

export const numero = (n) =>
  new Intl.NumberFormat('es-MX').format(Math.round(n || 0));

export const porciento = (n, d = 1) =>
  n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(d)}%`;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-08' -> 'agosto 2026'. Se parte el texto en vez de crear un Date: en
 *  UTC−6 un Date construido desde '2026-08-01' cae en julio. */
export const nombreMes = (periodo) => {
  const [a, m] = String(periodo).split('-');
  return `${MESES[+m - 1]} ${a}`;
};

/** '2026-08-31' -> '31 ago'. Mismo motivo: nada de Date. */
export const fechaCorta = (iso) => {
  if (!iso) return '';
  const [, m, d] = String(iso).split('-');
  return `${+d} ${MESES[+m - 1].slice(0, 3)}`;
};

/** '2026-09-05' -> '5 de septiembre de 2026'. */
export const fechaLarga = (iso) => {
  if (!iso) return '—';
  const [a, m, d] = String(iso).split('-');
  return `${+d} de ${MESES[+m - 1]} de ${a}`;
};

/** Un rango legible, sin repetir el mes ni el año cuando coinciden. */
export function rangoLegible(desde, hasta) {
  if (!desde || !hasta) return '';
  if (desde === hasta) return fechaLarga(desde);
  const [a1, m1, d1] = desde.split('-');
  const [a2, m2, d2] = hasta.split('-');
  if (a1 === a2 && m1 === m2) return `${+d1} al ${+d2} de ${MESES[+m1 - 1]} ${a1}`;
  if (a1 === a2) return `${+d1} de ${MESES[+m1 - 1]} al ${+d2} de ${MESES[+m2 - 1]} ${a1}`;
  return `${fechaCorta(desde)} ${a1} al ${fechaCorta(hasta)} ${a2}`;
}
