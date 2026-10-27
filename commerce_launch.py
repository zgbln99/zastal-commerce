"""Readiness and seller profile for a real Zastal Store launch.

No ability to enable real checkout until actual payments, delivery and receipts
are integrated and independently verified. Public storefront is in prelaunch.
"""
import re
import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse

FIELDS = {
    "seller_name": 160,
    "tax_id": 24,
    "business_address": 350,
    "support_email": 254,
    "support_phone": 40,
    "returns_address": 350,
    "terms_url": 400,
    "privacy_url": 400,
    "returns_url": 400,
    "shipping_url": 400,
    "ga4_id": 20,
    "meta_pixel_id": 20,
}
FLAGS = ("brand_approved", "catalog_reviewed", "inventory_counted", "supplier_confirmed")
LABELS = {
    "seller": "Dane rejestrowe sprzedawcy i kontakt",
    "policies": "Regulamin, polityka prywatności, zwroty i dostawy",
    "brand": "Zgoda klubu na identyfikację i materiały",
    "catalog": "Zatwierdzone ceny, opisy i rozmiarówki",
    "stock": "Spis z natury i weryfikacja dostępności",
    "supplier": "Dostawca transferów DTF i zamówienia",
    "payment": "Podłączony i przetestowany operator płatności",
    "delivery": "Integracja realnych etykiet i usług dostawy",
    "email": "Wysyłka wiadomości transakcyjnych i weryfikacja e-mail",
    "fiscal": "Dokumenty sprzedaży i obsługa podatkowa",
}
# Hard gates are NOT user-toggleable. A production implementation will replace
# these with actual provider health checks and configuration validation.
INTEGRATIONS = {"payment": False, "delivery": False, "email": False, "fiscal": False}


def init_schema(c):
    c.execute("""CREATE TABLE IF NOT EXISTS launch_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS launch_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        old_value TEXT NOT NULL,
        new_value TEXT NOT NULL,
        changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")


def values(c):
    fields = {key: "" for key in FIELDS}
    fields.update({key: False for key in FLAGS})
    for key, value in c.execute("SELECT key,value FROM launch_settings"):
        if key in FLAGS:
            fields[key] = value == "1"
        elif key in FIELDS:
            fields[key] = value
    return fields


def niptax_ok(value):
    digits = "".join(ch for ch in value if ch.isdigit())
    if len(digits) != 10:
        return False
    check = sum(int(digit) * factor for digit, factor in zip(digits[:9], (6,5,7,2,3,4,5,6,7))) % 11
    return check != 10 and check == int(digits[-1])


def https_url(url):
    if not isinstance(url, str) or not url or len(url) > 400:
        return False
    parsed = urlparse(url)
    return parsed.scheme == "https" and bool(parsed.netloc) and not parsed.username and not parsed.password


def valid_support_phone(value):
    """Require a real contact before live sales; staged test numbers stay private."""
    value = value.strip()
    digits = re.sub(r'[^0-9]', '', value)
    return bool(re.fullmatch(r'\+?[0-9][0-9 -]{7,17}', value) and
                9 <= len(digits) <= 15 and len(set(digits)) > 1 and
                'test' not in value.casefold())


def checks(v):
    return {
        "seller": bool(v["seller_name"].strip() and niptax_ok(v["tax_id"]) and
                       v["business_address"].strip() and valid_support_phone(v["support_phone"]) and
                       re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", v["support_email"])),
        "policies": all(https_url(v[key]) for key in ("terms_url","privacy_url","returns_url","shipping_url")),
        "brand": bool(v["brand_approved"]),
        "catalog": bool(v["catalog_reviewed"]),
        "stock": bool(v["inventory_counted"]),
        "supplier": bool(v["supplier_confirmed"]),
        **INTEGRATIONS,
    }


def snapshot(c, public=False, readiness=None):
    """readiness comes from commerce_sales.readiness(); without it every integration is reported missing."""
    v = values(c)
    status = checks(v)
    if readiness:
        status.update({key: readiness["checks"][key] for key in INTEGRATIONS})
    live = bool(readiness) and readiness["mode"] == "live"
    result = {
        "phase": "live" if live else "prelaunch",
        "checkout_enabled": live,
        "registration_enabled": True,
        "notice": "" if live else "Sklep Zastalu jest przygotowywany do uruchomienia sprzedaży online.",
    }
    if not public:
        result.update({
            "settings": v,
            "checks": [{"id": key, "label": LABELS[key], "ok": bool(status[key]), "automated": key in INTEGRATIONS}
                       for key in LABELS],
            "completed": sum(status.values()),
            "total": len(status),
            "blocking": [LABELS[key] for key in LABELS if not status[key]],
            "sales_live": live,
            "switch_present": bool(readiness) and readiness["switch_present"],
            "requested_mode": readiness["requested_mode"] if readiness else "prelaunch",
            "can_activate": False,
        })
    return result


def validate(data):
    if not isinstance(data, dict) or not data:
        raise ValueError("Brak danych do zapisania")
    if len(data) > len(FIELDS) + len(FLAGS):
        raise ValueError("Nieprawidłowa liczba pól")
    out = {}
    for key, value in data.items():
        if key in FIELDS:
            if not isinstance(value, str) or len(value) > FIELDS[key] or any(ord(c)<32 for c in value):
                raise ValueError("Nieprawidłowe pole: " + key)
            clean = value.strip()
            if key.endswith("_url") and clean and not https_url(clean):
                raise ValueError("Adres polityki musi używać HTTPS: " + key)
            if key == "ga4_id" and clean and not re.fullmatch(r"G-[A-Z0-9]{6,14}", clean):
                raise ValueError("Identyfikator Google Analytics 4 ma postać G-XXXXXXXXXX")
            if key == "meta_pixel_id" and clean and not re.fullmatch(r"[0-9]{8,20}", clean):
                raise ValueError("Identyfikator piksela Meta składa się z samych cyfr")
            if key == "tax_id" and clean and not niptax_ok(clean):
                raise ValueError("Nieprawidłowy NIP (sprawdź cyfrę kontrolną)")
            if key == "support_email" and clean and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", clean):
                raise ValueError("Nieprawidłowy adres e-mail")
            out[key] = clean
        elif key in FLAGS:
            if not isinstance(value, bool):
                raise ValueError("Potwierdzenie musi być wartością logiczną")
            out[key] = "1" if value else "0"
        else:
            raise ValueError("Nieznane ustawienie sklepu: " + str(key))
    return out


def update(c, data):
    changed = {}
    for key, value in validate(data).items():
        old = c.execute("SELECT value FROM launch_settings WHERE key=?", (key,)).fetchone()
        previous = old[0] if old else ""
        if previous == value:
            continue
        c.execute("INSERT INTO launch_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,changed_at=CURRENT_TIMESTAMP", (key,value))
        c.execute("INSERT INTO launch_changes(key,old_value,new_value) VALUES(?,?,?)", (key,previous,value))
        changed[key] = True
    return changed


def isolated_test_workflow(database_path):
    """Explicit isolated test-only bypass; never usable with production data path."""
    root = Path(tempfile.gettempdir()).resolve()
    db = Path(database_path).resolve()
    return (os.environ.get("ZASTAL_TEST_MODE") == "isolated-only"
            and db != root and db.is_relative_to(root))
