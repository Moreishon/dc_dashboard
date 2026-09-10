// =============================================================================
// Sistema visual
// =============================================================================
//
// Los mismos colores, tipografías y formas que la app de compras, para que las
// dos se sientan una sola cosa. Si algún día cambian allá, se cambian aquí.
//
// Está como objetos de estilo en línea, igual que la otra app, y no como CSS
// aparte: así todo el proyecto se lee con el mismo criterio y no hay que
// aprender dos maneras de hacer lo mismo.
// =============================================================================

export const C = {
  // marca
  terracota:  '#C4622D',
  terracotaOscuro: '#8B5E3C',
  crema:      '#F5DFC0',

  // fondos
  negro:      '#0A0A0A',
  papel:      '#FAF5EE',
  tarjeta:    '#FFFFFF',
  papelHondo: '#F0EBE3',

  // texto
  tinta:      '#1C1208',
  tinta2:     '#5A4A3A',
  tinta3:     '#7A6B5A',
  tinta4:     '#8A7B6A',

  // líneas
  linea:      '#EAE0D5',
  lineaFuerte:'#E0D5C8',

  // estados
  error:      '#E53E3E',
  errorSuave: '#FDEDED',
  bien:       '#2D6633',
  bienSuave:  '#EAF3EB',
  aviso:      '#8B5E3C',
  avisoSuave: '#F8EFE4',
  azul:       '#2D5580',
};

export const FUENTES =
  "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap');";

// Mobile-first, igual que la app de compras: en el celular una sola columna
// de 480 px. En una pantalla grande se ensancha para que no quede una tira
// angosta en medio de un monitor.
export const ANCHO_CELULAR = '480px';
export const ANCHO_ESCRITORIO = '960px';

export const pagina = (esAncho) => ({
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  background: C.papel,
  minHeight: '100vh',
  maxWidth: esAncho ? ANCHO_ESCRITORIO : ANCHO_CELULAR,
  margin: '0 auto',
  color: C.tinta,
});

/** Dos columnas cuando hay espacio, una cuando no. */
export const rejilla = (esAncho, minimo = '300px') => ({
  display: 'grid',
  gridTemplateColumns: esAncho ? `repeat(auto-fit, minmax(${minimo}, 1fr))` : '1fr',
  gap: '12px',
  alignItems: 'start',
});

// El encabezado se pega arriba y respeta el notch del iPhone y la barra de
// estado de Android. env() vale 0 en un navegador de escritorio.
export const encabezado = {
  background: C.negro,
  paddingTop: 'calc(16px + env(safe-area-inset-top))',
  paddingRight: '20px',
  paddingBottom: '16px',
  paddingLeft: '20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  position: 'sticky',
  top: 0,
  zIndex: 10,
};

export const tituloEncabezado = {
  fontFamily: "'Playfair Display', Georgia, serif",
  color: C.crema,
  fontSize: '18px',
  fontWeight: 700,
  margin: 0,
};

export const cuerpo = {
  padding: '20px',
  paddingBottom: 'calc(40px + env(safe-area-inset-bottom))',
};

export const tarjeta = (extra) => ({
  background: C.tarjeta,
  borderRadius: '12px',
  border: `1.5px solid ${C.linea}`,
  padding: '16px',
  marginBottom: '12px',
  ...(extra || {}),
});

export const etiqueta = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: C.tinta4,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '6px',
};

export const campo = (hayError) => ({
  width: '100%',
  background: 'white',
  border: `1.5px solid ${hayError ? C.error : C.lineaFuerte}`,
  borderRadius: '10px',
  padding: '11px 14px',
  fontSize: '15px',
  color: C.tinta,
  outline: 'none',
  minHeight: '46px',
  fontFamily: 'inherit',
});

export const boton = (extra) => ({
  width: '100%',
  background: C.terracota,
  color: 'white',
  border: 'none',
  borderRadius: '12px',
  padding: '16px',
  fontSize: '16px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: '52px',
  ...(extra || {}),
});

export const botonSecundario = (extra) => ({
  ...boton(),
  background: 'white',
  color: C.tinta2,
  border: `1.5px solid ${C.lineaFuerte}`,
  ...(extra || {}),
});

export const botonApagado = {
  opacity: 0.45,
  cursor: 'not-allowed',
};

export const pastilla = (activa, color) => ({
  padding: '7px 14px',
  borderRadius: '20px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  fontSize: '13px',
  fontWeight: 500,
  border: activa ? 'none' : `1.5px solid ${C.lineaFuerte}`,
  background: activa ? (color || C.terracota) : 'white',
  color: activa ? 'white' : C.tinta3,
});

export const nota = (tono) => {
  const tonos = {
    error: [C.error, C.errorSuave],
    bien:  [C.bien, C.bienSuave],
    aviso: [C.aviso, C.avisoSuave],
  };
  const [borde, fondo] = tonos[tono] || tonos.aviso;
  return {
    borderLeft: `3px solid ${borde}`,
    background: fondo,
    borderRadius: '0 8px 8px 0',
    padding: '12px 14px',
    fontSize: '14px',
    color: C.tinta2,
    marginBottom: '12px',
    lineHeight: 1.5,
  };
};

// ─── formato ─────────────────────────────────────────────────────────────────

export const pesos = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN',
    maximumFractionDigits: 0 }).format(n || 0);

export const numero = (n) =>
  new Intl.NumberFormat('es-MX').format(Math.round(n || 0));

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-08' -> 'agosto 2026'. Se parte el texto en vez de crear un Date: en
 *  UTC-6 un Date construido desde '2026-08-01' cae en julio. */
export const nombreMes = (periodo) => {
  const [a, m] = String(periodo).split('-');
  return `${MESES[+m - 1]} ${a}`;
};

/** '2026-08-31' -> '31 ago'. Mismo motivo: nada de Date. */
export const fechaCorta = (iso) => {
  const [, m, d] = String(iso).split('-');
  return `${+d} ${MESES[+m - 1].slice(0, 3)}`;
};

/** '2026-09-05' -> '5 de septiembre de 2026'. */
export const fechaLarga = (iso) => {
  if (!iso) return '—';
  const [a, m, d] = String(iso).split('-');
  return `${+d} de ${MESES[+m - 1]} de ${a}`;
};
