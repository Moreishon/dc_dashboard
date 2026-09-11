"""
Script de diagnóstico: Prueba conexión a Poster API
"""

import requests
import json

# Configuración
POSTER_APP_ID = "5111"
POSTER_APP_SECRET = "587c5af145fe0303425b6b707452abdb"
POSTER_URL = "https://kdsdoncomal.joinposter.com"

print("🔍 Diagnóstico Poster API")
print("=" * 60)

# Prueba 1: Conexión básica
print("\n1️⃣  Probando conexión básica...")
try:
    response = requests.get(f"{POSTER_URL}/api", timeout=5)
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.text[:200]}")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Prueba 2: Obtener clientes sin autenticación
print("\n2️⃣  Probando GET /api/clients (sin auth)...")
try:
    response = requests.get(f"{POSTER_URL}/api/clients", timeout=5)
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.text[:300]}")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Prueba 3: Con application_id y application_secret como parámetros
print("\n3️⃣  Probando con params (application_id, application_secret)...")
try:
    params = {
        "application_id": POSTER_APP_ID,
        "application_secret": POSTER_APP_SECRET
    }
    response = requests.get(f"{POSTER_URL}/api/clients", params=params, timeout=5)
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.text[:300]}")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Prueba 4: Con headers básicos
print("\n4️⃣  Probando con Authorization header...")
try:
    headers = {
        "Authorization": f"Bearer {POSTER_APP_SECRET}"
    }
    response = requests.get(f"{POSTER_URL}/api/clients", headers=headers, timeout=5)
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.text[:300]}")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Prueba 5: Probar obtener settings de aplicación
print("\n5️⃣  Probando GET /api/applications...")
try:
    response = requests.get(f"{POSTER_URL}/api/applications", timeout=5)
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.text[:300]}")
except Exception as e:
    print(f"   ❌ Error: {e}")

print("\n" + "=" * 60)
print("✅ Diagnóstico completado")
print("\nSi todos devuelven 401/403, necesitas:")
print("- Revisar la documentación de Poster API")
print("- Obtener un token OAuth válido")
print("- O generar una nueva aplicación en Poster Developer")
