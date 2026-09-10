#!/usr/bin/env bash
# =============================================================================
# Prueba de seguridad
# =============================================================================
# Instala el esquema completo en una base desechable y trata de romperlo.
#
# No comprueba que el código "se vea correcto": comprueba que un atacante no
# pueda hacer daño. La diferencia importa, porque el agujero que motivó este
# archivo se leía perfectamente bien.
#
# Qué se intenta, y qué debe pasar:
#
#   1. Anónimo llama a la importación            → permission denied
#   2. Anónimo CON permiso de ejecutar           → "Hay que iniciar sesión"
#   3. Usuario con sesión pero sin rol           → rechazado
#   4. Usuario con rol de solo lectura           → rechazado
#   5. Administrador                             → funciona
#   6. Anónimo leyendo tablas y vistas           → sin acceso
#
# El caso 2 es el importante. El permiso de ejecutar por sí solo NO alcanza
# como defensa: Supabase se lo concede a 'anon' automáticamente a cada función
# nueva del esquema public. Si eso vuelve a pasar, la comprobación de rol
# adentro de la función tiene que seguir cerrando la puerta.
#
# Uso:  ./pruebas/seguridad.sh [carpeta_sql]
# =============================================================================

set -uo pipefail

SQL="${1:-$(dirname "$0")/../sql}"
BASE="dc_prueba_seguridad"
UID_ADMIN="22222222-2222-2222-2222-222222222222"

fallas=0
ok()  { echo "  ✓ $1"; }
mal() { echo "  ✗ $1"; fallas=$((fallas + 1)); }

DETALLE='[{"_k":0,"fecha":"2026-08-02","producto":"ATAQUE","cantidad":1,"ventas_brutas":1,"ingresos":1}]'

# Devuelve solo la salida útil: psql imprime un "SET" por cada 'set role' y
# 'set prueba.uid', y esas líneas ensucian la comparación.
corre() {  # corre() <rol> <uid|-> <sql>
  local rol="$1" uid="$2" sql="$3" pre=""
  [ "$uid" != "-" ] && pre="set \"prueba.uid\" = '$uid';"
  psql -d "$BASE" -t -A -c "set role $rol; $pre $sql" 2>&1 | grep -v '^SET$'
}

echo "Preparando base desechable"
dropdb --if-exists "$BASE" 2>/dev/null
createdb "$BASE" || { echo "No se pudo crear $BASE"; exit 1; }
psql -q -d "$BASE" -f "$SQL/99_prueba.sql" >/dev/null 2>&1
for f in 01_seguridad 02_ventas 03_importacion 04_por_rango 05_permisos \
         06_cobertura_rapida 07_agregados 08_rangos 09_cerrar_funciones; do
  psql -q -d "$BASE" -f "$SQL/$f.sql" >/dev/null 2>&1
done

psql -q -d "$BASE" >/dev/null 2>&1 <<SQL
insert into dc_ventas_detalle (sucursal,fecha,periodo,producto,cantidad,ventas_brutas,ingresos)
values ('Principal','2026-08-02','2026-08','Gorditas',10,190,190);
insert into auth.users (id,email) values ('$UID_ADMIN','prueba@doncomal.mx')
  on conflict do nothing;
insert into dc_usuarios (user_id,nombre,rol) values ('$UID_ADMIN','Prueba','admin')
  on conflict (user_id) do update set rol='admin';
SQL

echo
echo "Intentos de ataque"

# 1 · anónimo sin permiso de ejecutar
s=$(corre anon - "select dc_importar_mes('2026-08','x','$DETALLE'::jsonb,'[]'::jsonb,'[]'::jsonb);")
case "$s" in *"permission denied"*) ok "anónimo: la función no le deja ni llamarla";;
  *) mal "anónimo pudo llamar la función → $s";; esac

# 2 · anónimo CON permiso de ejecutar (como lo concede Supabase por omisión)
psql -q -d "$BASE" -c "grant execute on function dc_importar_mes(text,text,jsonb,jsonb,jsonb,jsonb) to anon;" >/dev/null 2>&1
s=$(corre anon - "select dc_importar_mes('2026-08','x','$DETALLE'::jsonb,'[]'::jsonb,'[]'::jsonb);")
case "$s" in *"iniciar sesión"*) ok "anónimo con permiso: lo frena la comprobación de rol";;
  *) mal "CON permiso el anónimo pasó → $s";; esac
psql -q -d "$BASE" -c "revoke all on function dc_importar_mes(text,text,jsonb,jsonb,jsonb,jsonb) from anon;" >/dev/null 2>&1

# 3 · con sesión pero sin alta
s=$(corre authenticated "33333333-3333-3333-3333-333333333333" \
    "select dc_importar_mes('2026-08','x','$DETALLE'::jsonb,'[]'::jsonb,'[]'::jsonb);")
case "$s" in *"no está dado de alta"*) ok "con sesión pero sin rol: rechazado";;
  *) mal "un usuario sin alta pasó → $s";; esac

# 4 · rol de solo lectura
psql -q -d "$BASE" -c "update dc_usuarios set rol='lectura' where user_id='$UID_ADMIN';" >/dev/null 2>&1
s=$(corre authenticated "$UID_ADMIN" \
    "select dc_importar_mes('2026-08','x','$DETALLE'::jsonb,'[]'::jsonb,'[]'::jsonb);")
case "$s" in *"no puede hacer esto"*) ok "rol de lectura: rechazado";;
  *) mal "el rol de lectura pudo importar → $s";; esac

# 5 · administrador
psql -q -d "$BASE" -c "update dc_usuarios set rol='admin' where user_id='$UID_ADMIN';" >/dev/null 2>&1
s=$(corre authenticated "$UID_ADMIN" \
    "select dc_importar_mes('2026-08','x','$DETALLE'::jsonb,'[]'::jsonb,'[]'::jsonb)->>'renglones';")
case "$s" in 1) ok "administrador: sí puede importar";;
  *) mal "el administrador NO pudo importar → $s";; esac

echo
echo "Lectura anónima"
for objeto in dc_ventas_detalle dc_ventas_dia dc_v_dias dc_v_cobertura dc_usuarios app_data; do
  s=$(corre anon - "select count(*) from $objeto;")
  case "$s" in *"permission denied"*|*"denegado"*) ok "$objeto: cerrado al anónimo";;
    *) mal "$objeto quedó legible sin sesión → $s";; esac
done

echo
echo "Ninguna función dc_* ejecutable por el anónimo"
s=$(psql -d "$BASE" -t -A -c "
select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'dc\_%'
  and has_function_privilege('anon', p.oid, 'EXECUTE');")
[ "$s" = "0" ] && ok "las $(psql -d "$BASE" -t -A -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'dc\_%';") funciones están cerradas" \
                || mal "$s funciones siguen abiertas al anónimo"

echo
if [ $fallas -eq 0 ]; then echo "✓ el esquema aguanta los intentos"
else echo "✗ $fallas pruebas fallaron — NO desplegar"; fi

dropdb --if-exists "$BASE" 2>/dev/null
exit $((fallas > 0 ? 1 : 0))
