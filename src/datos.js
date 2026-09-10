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
  const { data, error } = await sb
    .from('dc_v_cobertura')
    .select('datos_hasta, ultima_venta, desde, dias_con_ventas, renglones')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

export async function traerImportaciones(limite = 10) {
  const { data, error } = await sb
    .from('dc_importaciones')
    .select('id, archivo, periodo_min, periodo_max, renglones, estado, creada_en')
    .order('creada_en', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return data || [];
}
