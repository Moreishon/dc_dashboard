// =============================================================================
// Todo lo que habla con Supabase
// =============================================================================
//
// El resto de la app no sabe qué es una petición HTTP ni qué es un JWT. Pide
// datos aquí y recibe objetos.
//
// Sobre la llave que ve el navegador
// ----------------------------------
// La llave 'anon' viaja dentro del código que corre en el celular de quien usa
// la app. Está diseñada para ser pública: no es un secreto y no se puede
// esconder. Lo que separa tus datos del mundo son dos cosas, y ninguna es la
// llave: que haya sesión iniciada, y que las políticas de RLS digan qué puede
// ver cada rol.
//
// Por eso la llave va en una variable de entorno y no incrustada en el código:
// no para esconderla, sino para que otro restaurante ponga la suya sin tocar
// el repositorio.
// =============================================================================

import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const LLAVE = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const faltaConfiguracion = !URL || !LLAVE || URL.includes('TU-PROYECTO');

export const sb = faltaConfiguracion
  ? null
  : createClient(URL, LLAVE, {
      auth: {
        persistSession: true,      // sobrevive a cerrar la pestaña
        autoRefreshToken: true,    // renueva el token sin sacar al usuario
        detectSessionInUrl: false,
      },
    });

// ─── sesión ──────────────────────────────────────────────────────────────────

export async function sesionActual() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}

export function alCambiarSesion(fn) {
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_evento, sesion) => fn(sesion));
  return () => data?.subscription?.unsubscribe();
}

export async function entrar(correo, contrasena) {
  const { data, error } = await sb.auth.signInWithPassword({
    email: correo.trim(), password: contrasena,
  });
  if (error) throw new Error(traducirError(error.message));
  return data.session;
}

export async function salir() {
  await sb?.auth.signOut();
}

/** Supabase contesta en inglés. Esto lo pasa a algo que se entienda. */
function traducirError(mensaje) {
  const m = String(mensaje || '').toLowerCase();
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'La cuenta todavía no está confirmada.';
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'No hay conexión con el servidor. Revisa tu internet.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Demasiados intentos seguidos. Espera un minuto.';
  return mensaje;
}

// ─── quién soy ───────────────────────────────────────────────────────────────

/**
 * El rol vive en la base, no en el token. Se pregunta al entrar.
 * Si el usuario existe en auth pero nadie lo dio de alta en dc_usuarios,
 * devuelve null: tiene sesión pero no tiene permisos, y hay que decírselo.
 */
export async function miPerfil() {
  const { data, error } = await sb
    .from('dc_usuarios')
    .select('user_id, nombre, rol, activo')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.activo) return null;
  return data;
}

// ─── catálogos ───────────────────────────────────────────────────────────────

export async function traerCatalogos() {
  const [mods, prods] = await Promise.all([
    sb.from('dc_cat_modificadores')
      .select('modificador_original, valor_normalizado, tipo, activo'),
    sb.from('dc_cat_productos')
      .select('producto, familia, unidad_venta, piezas_por_orden, lleva_guisado, activo'),
  ]);
  if (mods.error) throw new Error(mods.error.message);
  if (prods.error) throw new Error(prods.error.message);
  return { filasMods: mods.data || [], filasProds: prods.data || [] };
}

export async function guardarModificadores(filas) {
  const { error } = await sb.from('dc_cat_modificadores').insert(filas);
  if (error) throw new Error(error.message);
}

export async function guardarProductos(filas) {
  const { error } = await sb.from('dc_cat_productos').insert(filas);
  if (error) throw new Error(error.message);
}

// ─── periodos ya cargados ────────────────────────────────────────────────────

export async function traerPeriodos() {
  const { data, error } = await sb
    .from('dc_v_periodos')
    .select('periodo, renglones, unidades, ingresos, desde, hasta')
    .order('periodo', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// ─── guardar un mes ──────────────────────────────────────────────────────────

/**
 * Manda un mes completo al servidor. Allá entra todo en una sola transacción:
 * o queda el mes entero, o no queda nada. Si se cae la conexión a media carga,
 * la base se queda como estaba.
 */
export async function importarMes({ periodo, archivo, detalle, mods, dia, qa }) {
  const { data, error } = await sb.rpc('dc_importar_mes', {
    p_periodo: periodo,
    p_archivo: archivo || null,
    p_detalle: detalle,
    p_mods: mods,
    p_dia: dia,
    p_qa: qa || {},
  });
  if (error) {
    const m = String(error.message || '');
    if (m.includes('permiso') || error.code === '42501')
      throw new Error('Tu usuario no tiene permiso para importar ventas. ' +
                      'Se necesita rol de administrador o gerente.');
    if (m.toLowerCase().includes('failed to fetch'))
      throw new Error('Se cortó la conexión durante la carga. ' +
                      'El mes NO quedó a medias: la base sigue como estaba. ' +
                      'Vuelve a intentarlo.');
    throw new Error(m);
  }
  return data;
}

// ─── hasta cuándo llegan los datos ───────────────────────────────────────────

/**
 * Devuelve dos fechas que conviene no confundir:
 *   datos_hasta   el último día que alguna importación dice haber cubierto
 *   ultima_venta  el último día con ventas registradas
 * Si el restaurante cerró el lunes, la segunda es el domingo aunque los datos
 * lleguen al lunes.
 */
export async function traerCobertura() {
  // Se pide como lista y se toma el primero, en vez de maybeSingle(): esa
  // variante manda una cabecera especial y falla de formas raras cuando la
  // vista no devuelve exactamente una fila. Aquí no hace falta.
  const { data, error } = await sb
    .from('dc_v_cobertura')
    .select('datos_hasta, ultima_venta, desde, dias_con_ventas, renglones')
    .limit(1);
  if (error) {
    const e = new Error(error.message || 'No se pudo leer la cobertura');
    e.detalle = [error.code, error.details, error.hint]
      .filter(Boolean).join(' · ');
    throw e;
  }
  return (data && data[0]) || null;
}

// ─── lo que consume el tablero ───────────────────────────────────────────────

/**
 * Trae una tabla completa, por páginas.
 *
 * Supabase corta cualquier consulta en 1,000 renglones por omisión, y no avisa:
 * simplemente devuelve mil y ya. Con 1,106 días y 2,677 renglones de
 * producto-mes, pedir "todo" sin paginar daría un tablero con datos faltantes
 * y ningún error a la vista.
 */
async function traerTodo(vista, columnas, orden) {
  const TAMANO = 1000;
  const salida = [];
  for (let desde = 0; ; desde += TAMANO) {
    let q = sb.from(vista).select(columnas).range(desde, desde + TAMANO - 1);
    if (orden) q = q.order(orden, { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(`${vista}: ${error.message}`);
    salida.push(...(data || []));
    if (!data || data.length < TAMANO) break;
  }
  return salida;
}

/** La serie diaria completa. Es la base de casi todo el tablero. */
export const traerDias = () => traerTodo(
  'dc_v_dias',
  'fecha, periodo, ingresos_totales, ingresos_productos, ingreso_envio, ' +
  'recibos, clientes, ticket_promedio, unidades, piezas, renglones',
  'fecha');

export const traerProductoMes = () => traerTodo(
  'dc_v_t_producto_mes',
  'periodo, producto, familia, unidad_venta, unidades, piezas, ingresos, ' +
  'renglones, extras, peticiones, ingreso_por_unidad',
  'periodo');

export const traerGuisadoMes = () => traerTodo(
  'dc_v_t_guisado_mes',
  'periodo, guisado, unidades_atribuidas, unidades_presencia, renglones',
  'periodo');

export const traerModificadorMes = () => traerTodo(
  'dc_v_t_modificador_mes',
  'periodo, tipo, modificador, veces, renglones, unidades_afectadas',
  'periodo');

export const traerPrecios = () => traerTodo(
  'dc_v_t_precios',
  'periodo, producto, precio_lista, confianza, unidades',
  'periodo');

// ─── agregados por rango ─────────────────────────────────────────────────────
//
// Se calculan en el servidor, no en el navegador. Un agregado por producto y
// día serían 43,304 renglones —varios megabytes cada vez que se abre la
// página—, mientras que con el índice por fecha el servidor los agrega en 7
// milisegundos para una semana y 265 para un año.

async function rango(fn, desde, hasta) {
  const { data, error } = await sb.rpc(fn, { p_desde: desde, p_hasta: hasta });
  if (error) {
    const e = new Error(error.message || `Falló ${fn}`);
    e.detalle = [error.code, error.hint].filter(Boolean).join(' · ');
    throw e;
  }
  return data || [];
}

export const traerProductosRango = (desde, hasta) =>
  rango('dc_productos_rango', desde, hasta);

export const traerGuisadosRango = (desde, hasta) =>
  rango('dc_guisados_rango', desde, hasta);

export const traerModificadoresRango = (desde, hasta) =>
  rango('dc_modificadores_rango', desde, hasta);

export async function traerImportaciones(limite = 10) {
  const { data, error } = await sb
    .from('dc_importaciones')
    .select('id, archivo, periodo_min, periodo_max, renglones, estado, creada_en')
    .order('creada_en', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return data || [];
}
