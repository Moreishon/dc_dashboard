"""
Script de Sincronización: Poster POS → Frappe CRM (VERSIÓN 2 - CON OAUTH)
Sincroniza automáticamente clientes desde Poster a Frappe CRM
Se ejecuta diariamente y crea contactos nuevos

Uso:
    python sync_poster_to_frappe_v2.py

Requiere:
    - requests: pip install requests
    - Credenciales de Poster (application_id, application_secret)
    - Credenciales de Frappe (api_key, api_secret)
"""

import requests
import json
from datetime import datetime

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

POSTER_APP_ID = "5111"
POSTER_APP_SECRET = "587c5af145fe0303425b6b707452abdb"
POSTER_URL = "https://kdsdoncomal.joinposter.com"

FRAPPE_URL = "https://don-comal.frappe.cloud"
FRAPPE_API_KEY = "71c07e95f2d73253916968b1aae66afcb5968b5baf1ff71d5c40d23b"
FRAPPE_API_SECRET = "e7f56cd21ef7e44b6aabf38dbe4dc4c55e7e924b32f448d7a2b236f4"

GRUPOS_A_SINCRONIZAR = ["En Restaurante", "WhatsApp"]

# ============================================================================
# CLASES
# ============================================================================

class PosterAPI:
    def __init__(self, app_id, app_secret, url):
        self.app_id = app_id
        self.app_secret = app_secret
        self.url = url
        self.access_token = None
        self.session = requests.Session()

    def get_access_token(self):
        """Obtiene access token OAuth"""
        try:
            url = f"{self.url}/api/auth/token"
            payload = {
                "application_id": self.app_id,
                "application_secret": self.app_secret
            }
            response = self.session.post(url, json=payload, timeout=10)

            if response.status_code == 200:
                data = response.json()
                token = data.get("response", {}).get("access_token")
                if token:
                    self.access_token = token
                    print(f"✓ Access token obtenido")
                    return True
            print(f"❌ Error: {response.text}")
            return False
        except Exception as e:
            print(f"❌ Error: {e}")
            return False

    def get_clients(self):
        """Obtiene clientes de Poster"""
        if not self.access_token:
            return []

        try:
            url = f"{self.url}/api/clients"
            headers = {"Authorization": f"Bearer {self.access_token}"}
            response = self.session.get(url, headers=headers, timeout=10)

            if response.status_code == 200:
                data = response.json()
                clientes = data.get("response", {}).get("clients", [])
                print(f"✓ Obtenidos {len(clientes)} clientes de Poster")
                return clientes
            print(f"❌ Error: {response.text}")
            return []
        except Exception as e:
            print(f"❌ Error: {e}")
            return []


class FrappeAPI:
    def __init__(self, url, api_key, api_secret):
        self.url = url
        self.session = requests.Session()
        self.session.auth = (api_key, api_secret)
        self.session.headers.update({"Content-Type": "application/json"})

    def contact_exists(self, email_or_phone):
        """Verifica si contacto existe"""
        try:
            if email_or_phone and "@" in email_or_phone:
                url = f"{self.url}/api/resource/Contact"
                params = {"filters": [["email_address", "=", email_or_phone]], "limit": 1}
                response = self.session.get(url, params=params, timeout=10)
                if response.status_code == 200:
                    return len(response.json().get("data", [])) > 0
            return False
        except:
            return False

    def create_contact(self, data):
        """Crea contacto en Frappe"""
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
            }
            response = self.session.post(url, json=payload, timeout=10)
            return response.status_code == 200
        except:
            return False


# ============================================================================
# MAIN
# ============================================================================

def main():
    print("=" * 60)
    print(f"🔄 Sincronización Poster → Frappe CRM")
    print(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    print("\n📡 Conectando a Poster...")
    poster = PosterAPI(POSTER_APP_ID, POSTER_APP_SECRET, POSTER_URL)

    print("🔐 Obteniendo token OAuth...")
    if not poster.get_access_token():
        print("❌ Fallo en autenticación de Poster")
        return

    print("📥 Obteniendo clientes...")
    clientes = poster.get_clients()
    if not clientes:
        print("❌ No se obtuvieron clientes")
        return

    print("\n🌐 Conectando a Frappe...")
    frappe = FrappeAPI(FRAPPE_URL, FRAPPE_API_KEY, FRAPPE_API_SECRET)

    print("🔄 Sincronizando...\n")
    creados = duplicados = errores = 0

    for cliente in clientes:
        nombre = cliente.get("name", "")
        telefono = cliente.get("phone", "")
        email = cliente.get("email", "")
        grupo = cliente.get("group", {}).get("name", "") if cliente.get("group") else ""

        if GRUPOS_A_SINCRONIZAR and grupo not in GRUPOS_A_SINCRONIZAR:
            continue

        if frappe.contact_exists(email or telefono):
            duplicados += 1
            continue

        nombres = nombre.strip().split(maxsplit=1)
        contact_data = {
            "first_name": nombres[0] if nombres else "",
            "last_name": nombres[1] if len(nombres) > 1 else "",
            "full_name": nombre,
            "mobile_no": telefono,
            "email_address": email,
        }

        if frappe.create_contact(contact_data):
            creados += 1
            print(f"   ✓ {nombre}")
        else:
            errores += 1
            print(f"   ✗ {nombre}")

    print("\n" + "=" * 60)
    print(f"✓ Creados: {creados} | ⊘ Duplicados: {duplicados} | ✗ Errores: {errores}")
    print("=" * 60)


if __name__ == "__main__":
    main()
