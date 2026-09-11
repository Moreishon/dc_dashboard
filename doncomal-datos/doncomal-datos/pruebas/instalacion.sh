#!/usr/bin/env bash
# =============================================================================
# Prueba de la instalación
# =============================================================================
#
# Corre los ocho archivos SQL sobre una base vacía, en orden, TRES VECES.
#
# La primera vuelta comprueba que una instalación desde cero funciona. Las
# otras dos comprueban algo que se olvida fácil: que los archivos se puedan
# volver a correr sin romperse ni deshacerse entre ellos.
#
# Esa segunda parte no es teórica. Una versión anterior definía la misma vista
# en dos archivos con definiciones distintas: correrlos otra vez reintroducía
# en silencio una consulta que se pasaba del tiempo límite. No daba error;
# simplemente dejaba de funcionar una pantalla.
#
# Uso:  ./pruebas/instalacion.sh [carpeta_sql]
# Necesita psql y un Postgres local donde el usuario pueda crear bases.
# =============================================================================

set -uo pipefail

SQL="${1:-$(dirname "$0")/../sql}"
BASE="dc_prueba_instalacion"
ARCHIVOS=(01_seguridad 02_ventas 03_importacion 04_por_rango
          05_permisos 06_cobertura_rapida 07_agregados 08_rangos
          09_cerrar_funciones 10_categorias 11_extras)

fallas=0

echo "Instalando desde $SQL"
dropdb --if-exists "$BASE" 2>/dev/null
createdb "$BASE" || { echo "No se pudo crear la base $BASE"; exit 1; }

# Supabase trae su propio esquema auth; aquí se simula lo mínimo.
psql -q -d "$BASE" -f "$SQL/99_prueba.sql" >/dev/null 2>&1

for vuelta in 1 2 3; do
  malos=0
  for f in "${ARCHIVOS[@]}"; do
    salida=$(psql -q -v ON_ERROR_STOP=0 -d "$BASE" -f "$SQL/$f.sql" 2>&1 \
             | grep -iE "^ERROR|^psql.*ERROR")
    if [ -n "$salida" ]; then
      echo "  ✗ vuelta $vuelta · $f"
      echo "$salida" | head -3 | sed 's/^/      /'
      malos=1; fallas=$((fallas + 1))
    fi
  done
  [ $malos -eq 0 ] && echo "  ✓ vuelta $vuelta: los ${#ARCHIVOS[@]} archivos sin errores"
done

# -----------------------------------------------------------------------------
# La cadena de dependencias tiene que ser real
#
# Esto atrapa un error que llegó a producción. Entre dos vistas materializadas,
# Postgres conoce la liga y un 'drop cascade' se las lleva a las dos; si en
# medio hay una FUNCIÓN SQL, la liga se corta — Postgres no registra qué tablas
# usa el cuerpo de una función. La función sobrevivía apuntando a una vista que
# ya no existía y el error salía después, en otro lado, diciendo:
#
#   ERROR: relation "dc_m_extra_precio" does not exist
#   CONTEXT: SQL function "dc_precio_extra" during inlining
#
# Aquí se tira el primer eslabón y se comprueba que caiga la cadena completa y
# que los archivos la reconstruyan.
echo
echo "Cadena de dependencias:"
antes=$(psql -d "$BASE" -t -A -c "select count(*) from pg_matviews where schemaname='public'")
psql -q -d "$BASE" -c "drop materialized view if exists dc_m_extra_producto cascade;" >/dev/null 2>&1
quedan=$(psql -d "$BASE" -t -A -c "select count(*) from pg_matviews where matviewname like 'dc\_m\_extra%'")
if [ "$quedan" = "0" ]; then
  echo "  ✓ tirar el primer eslabón se lleva la cadena entera"
else
  echo "  ✗ quedaron $quedan vistas de extras colgando de una que ya no existe"
  fallas=$((fallas + 1))
fi
for f in "${ARCHIVOS[@]}"; do
  psql -q -v ON_ERROR_STOP=0 -d "$BASE" -f "$SQL/$f.sql" >/dev/null 2>&1
done
despues=$(psql -d "$BASE" -t -A -c "select count(*) from pg_matviews where schemaname='public'")
if [ "$antes" = "$despues" ]; then
  echo "  ✓ y los archivos la reconstruyen completa ($despues vistas)"
else
  echo "  ✗ quedaron $despues vistas de $antes que había"
  fallas=$((fallas + 1))
fi

echo
echo "Qué quedó instalado:"
psql -d "$BASE" -t -A -F' · ' -c "
select
  (select count(*) from information_schema.tables
     where table_schema='public' and table_type='BASE TABLE' and table_name like 'dc\_%')
    || ' tablas',
  (select count(*) from information_schema.views
     where table_schema='public' and table_name like 'dc\_v\_%') || ' vistas',
  (select count(*) from pg_matviews where schemaname='public') || ' materializadas',
  (select count(*) from pg_policies where schemaname='public') || ' políticas',
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and proname like 'dc\_%') || ' funciones';" \
  | sed 's/^/  /'

echo
if [ $fallas -eq 0 ]; then
  echo "✓ la instalación funciona desde cero y se puede repetir"
else
  echo "✗ $fallas archivos con errores"
fi

dropdb --if-exists "$BASE" 2>/dev/null
exit $((fallas > 0 ? 1 : 0))
