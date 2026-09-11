"""
Script de Sincronización: Poster POS → Frappe CRM
Sincroniza automáticamente clientes desde Poster a Frappe CRM
Se ejecuta diariamente y crea contactos nuevos

Uso:
    python sync_poster_to_frappe.py

Requiere:
    - requests: pip install requests
    - Credenciales de Poster (application_id, application_secret)
    - Credenciales de Frappe (api_key, api_secret)
    - URL de Poster y Frappe configuradas
"""

import requests
import json
from datetime import datetime, timedelta
import sys

# ============================================================================
# CONFIGURACIÓN - ACTUALIZA ESTOS VALORES
# ============================================================================

# Poster POS
POSTER_APP_ID = "5111"
POSTER_APP_SECRET = "587c5af145fe0303425b6b707452abdb"
POSTER_URL = "https://kdsdoncomal.joinposter.com"

# Frappe CRM
FRAPPE_URL = "https://don-comal.frappe.cloud"
FRAPPE_API_KEY = "71c07e95f2d73253916968b1aae66afcb5968b5baf1ff71d5c40d23b"
FRAPPE_API_SECRET = "e7f56cd21ef7e44b6aabf38dbe4dc4c55e7e924b32f448d7a2b236f4"

# Grupos de Poster a sincronizar (separa por comas)
GRUPOS_A_SINCRONIZAR = ["En Restaurante", "WhatsApp"]

# ============================================================================
# CLASES Y FUNCIONES
# ============================================================================

class PosterAPI:
    """Conexión con API de Poster POS"""

    def __init__(self, app_id, app_secret, url):
        self.app_id = app_id
        self.app_secret = app_secret
        self.url = url
        self.session = requests.Session()

    def get_clients(self, limit=100):
        """Obtiene lista de clientes desde Poster"""
        try:
            url = f"{self.url}/api/clients"
            params = {
                "limit": limit,
                "application_id": self.app_id,
                "application_secret": self.app_secret
            }

            response = self.session.get(url, params=params, timeout=10)

            if response.status_code == 200:
                data = response.json()
                return data.get("response", {}).get("clients", [])
            else:
                print(f"❌ Error Poster API: {response.status_code}")
                return []
        except Exception as e:
            print(f"❌ Error conectando a Poster: {e}")
            return []

    def extract_origin(self, commentario):
        """Extrae origen del campo comentario"""
        if not commentario:
            return "Sin origen"

        if "WhatsApp" in commentario:
            return "WhatsApp"
        elif "Instagram" in commentario:
            return "Instagram Ads"
        elif "Facebook" in commentario:
            return "Facebook Ads"
        elif "Google" in commentario:
            return "Google Ads"
        elif "En Restaurante" in commentario or "Mesas" in commentario:
            return "En Mesas"
        else:
            return "Otro"


class FrappeAPI:
    """Conexión con API de Frappe CRM"""

    def __init__(self, url, api_key, api_secret):
        self.url = url
        self.api_key = api_key
        self.api_secret = api_secret
        self.session = requests.Session()
        self.session.auth = (api_key, api_secret)
        self.session.headers.update({"Content-Type": "application/json"})

    def contact_exists(self, email_or_phone):
        """Verifica si un contacto ya existe en Frappe"""
        try:
            # Buscar por email
            if email_or_phone and "@" in email_or_phone:
                url = f"{self.url}/api/resource/Contact"
                params = {"filters": [["email_address", "=", email_or_phone]], "limit": 1}

                response = self.session.get(url, params=params, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    return len(data.get("data", [])) > 0

            return False
        except:
            return False

    def create_contact(self, data):
        """Crea nuevo contacto en Frappe"""
        try:
            url = f"{self.url}/api/resource/Contact"

            payload = {
                "first_name": data.get("first_name", ""),
                "last_name": data.get("last_name", ""),
                "full_name": data.get("full_name", ""),
                "mobile_no": data.get("mobile_no", ""),
                "email_address": data.get("email_address", ""),
                "company_name": "Don Comal",
                "status": "Active",
                "custom_origen": data.get("origin", ""),
                "custom_codigo_poster": data.get("codigo_poster", ""),
            }

            response = self.session.post(url, json=payload, timeout=10)

            if response.status_code == 200:
                return True, response.json().get("data", {}).get("name")
            else:
                print(f"⚠️  Error creando contacto: {response.text}")
                return False, None
        except Exception as e:
            print(f"❌ Error en Frappe: {e}")
            return False, None


# ============================================================================
# MAIN - SINCRONIZACIÓN
# ============================================================================

def main():
    print("=" * 60)
    print(f"🔄 Sincronización Poster → Frappe CRM")
    print(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # Conectar a Poster
    print("\n📡 Conectando a Poster POS...")
    poster = PosterAPI(POSTER_APP_ID, POSTER_APP_SECRET, POSTER_URL)

    # Obtener clientes de Poster
    print("📥 Obteniendo clientes de Poster...")
    clientes_poster = poster.get_clients(limit=500)

    if not clientes_poster:
        print("❌ No se pudieron obtener clientes de Poster")
        return

    print(f"✓ Obtenidos {len(clientes_poster)} clientes de Poster")

    # Conectar a Frappe
    print("\n🌐 Conectando a Frappe CRM...")
    frappe = FrappeAPI(FRAPPE_URL, FRAPPE_API_KEY, FRAPPE_API_SECRET)

    # Sincronizar
    print(f"\n🔄 Sincronizando clientes...")
    creados = 0
    duplicados = 0
    errores = 0

    for cliente in clientes_poster:
        # Extraer datos
        nombre_completo = cliente.get("name", "")
        telefono = cliente.get("phone", "")
        email = cliente.get("email", "")
        grupo = cliente.get("group", {}).get("name", "")
        codigo = cliente.get("id", "")
        comentario = cliente.get("comment", "")

        # Filtrar por grupo
        if grupo not in GRUPOS_A_SINCRONIZAR:
            continue

        # Extraer origen del comentario
        origen = poster.extract_origin(comentario)

        # Verificar si ya existe
        if frappe.contact_exists(email or telefono):
            duplicados += 1
            continue

        # Separar nombre
        nombres = nombre_completo.strip().split(maxsplit=1)
        first_name = nombres[0] if nombres else ""
        last_name = nombres[1] if len(nombres) > 1 else ""

        # Preparar datos para Frappe
        contact_data = {
            "first_name": first_name,
            "last_name": last_name,
            "full_name": nombre_completo,
            "mobile_no": telefono,
            "email_address": email,
            "origin": origen,
            "codigo_poster": codigo,
        }

        # Crear en Frappe
        exito, contact_id = frappe.create_contact(contact_data)

        if exito:
            creados += 1
            print(f"   ✓ {nombre_completo} ({origen})")
        else:
            errores += 1
            print(f"   ✗ Error: {nombre_completo}")

    # Resumen
    print("\n" + "=" * 60)
    print("📊 RESUMEN DE SINCRONIZACIÓN")
    print("=" * 60)
    print(f"✓ Creados:    {creados}")
    print(f"⊘ Duplicados: {duplicados}")
    print(f"✗ Errores:    {errores}")
    print(f"Total procesados: {creados + duplicados + errores}")
    print("=" * 60)

    if creados > 0:
        print("✅ Sincronización completada exitosamente")
    else:
        print("⚠️  No se crearon contactos nuevos")


if __name__ == "__main__":
    main()
