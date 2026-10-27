"""Versioned Zastal Store homepage CMS.

Drafts and revisions are private. Public storefront sees published configuration
only; checkout and registration gates are entirely independent of CMS publishing.
"""
import base64
import copy
import datetime as dt
import hashlib
import io
import json
import re
from pathlib import Path
from PIL import Image, ImageOps, UnidentifiedImageError

HOME_MEDIA = Path(__file__).resolve().parent / "home_media"
SECTION_TYPES = ("hero", "categories", "products", "personalization", "retro",
                 "accessories", "banner", "text", "services", "campaign", "ticker")
REGEX_ID = re.compile(r"^[a-z][a-z0-9-]{1,55}$")
SAFE_LINK = re.compile(r"^/(?!/)[a-zA-Z0-9_/\.\-?&=%#]*$")
COLOR = re.compile(r"^#[a-fA-F0-9]{6}$")
SLUGS = {"Koszulki", "Bluzy", "Akcesoria", "Dzieci", "Wszystko"}

# Exact whitelisted edit fields and type validation. HTML is intentionally unsupported.
FIELDS = {
 "campaign": {"eyebrow": "text", "title": "text", "description": "long",
              "image": "image", "image_alt": "text", "image_role": "image_role",
              "image_illustrative": "bool", "product_ids": "product_ids",
              "cta_text": "text", "cta_url": "url", "alignment": "align"},
 "hero": {"eyebrow": "text", "title": "text", "description": "long",
          "image": "image", "cta_text": "text", "cta_url": "url",
          "secondary_text": "text", "secondary_url": "url",
          "height": "height", "overlay": "overlay", "alignment": "align"},
 "categories": {"eyebrow": "text", "title": "text", "cta_text": "text", "categories": "categories", "columns": "columns"},
 "products": {"eyebrow": "text", "title": "text", "category": "category",
              "count": "count", "columns": "columns", "show_filters": "bool",
              "cta_text": "text", "product_ids": "product_ids"},
 "personalization": {"eyebrow": "text", "title": "text", "description": "long",
                     "button_text": "text", "product_id": "product"},
 "retro": {"eyebrow": "text", "title": "text", "description": "long",
           "button_text": "text", "product_id": "product", "image": "image"},
 "accessories": {"eyebrow": "text", "title": "text", "description": "long", "count": "count"},
 "banner": {"eyebrow": "text", "title": "text", "description": "long", "image": "image",
            "cta_text": "text", "cta_url": "url", "background": "color",
            "text_color": "color", "alignment": "align"},
 "text": {"eyebrow": "text", "title": "text", "description": "long", "alignment": "align",
          "background": "color", "text_color": "color"},
 "ticker": {"items": "long", "background": "color", "text_color": "color", "speed": "speed"},
 "services": {"title": "text", "first_title": "text", "first_text": "text",
              "second_title": "text", "second_text": "text", "third_title": "text", "third_text": "text"},
}

# Optional additions deliberately stay out of DEFAULT and stored old revisions.
# Saving a legacy draft must not silently add fields or rewrite its first cover.
HERO_OPTIONAL_FIELDS = {
    "slides_enabled": "bool", "autoplay": "bool", "interval_ms": "interval",
    "image_alt": "text", "image_role": "hero_image_role", "image_illustrative": "bool",
}
for _slide in (2, 3):
    HERO_OPTIONAL_FIELDS.update({f"slide_{_slide}_{key}": format_ for key, format_ in {
        "enabled": "bool", "eyebrow": "text", "title": "text", "description": "long",
        "image": "image", "image_alt": "text", "image_role": "hero_image_role",
        "image_illustrative": "bool", "cta_text": "text", "cta_url": "url",
    }.items()})

DEFAULT = {"version": 1, "sections": [
 {"id": "hero-main", "type": "hero", "enabled": True, "settings": {
    "eyebrow": "KLUBOWA KOLEKCJA", "title": "Sklep Zastalu Zielona Góra",
    "description": "Koszulki, bluzy i akcesoria z klubowej kolekcji.",
    "image": "/assets/photos/fans.webp", "cta_text": "Zobacz produkty",
    "cta_url": "/sklep", "secondary_text": "Zobacz koszulki",
    "secondary_url": "/sklep?category=Koszulki", "height": 620,
    "overlay": 72, "alignment": "left"}},
 {"id": "shop-categories", "type": "categories", "enabled": True, "settings": {
    "eyebrow": "01 / KATEGORIE", "title": "Kolekcje", "cta_text": "Cały sklep",
    "categories": "Koszulki,Bluzy,Dzieci,Akcesoria", "columns": 4}},
 {"id": "merch-grid", "type": "products", "enabled": True, "settings": {
    "eyebrow": "03 / PRODUKTY", "title": "W klubowym sklepie",
    "category": "Wszystko", "count": 8, "columns": 4, "show_filters": True,
    "cta_text": "Wszystkie produkty", "product_ids": ""}},
 {"id": "print-studio", "type": "personalization", "enabled": True, "settings": {
    "eyebrow": "02 / PERSONALIZACJA", "title": "Twoje nazwisko. Twój numer.",
    "description": "Wybierz zawodnika z listy lub wpisz własne nazwisko i numer.",
    "button_text": "Personalizuj ten produkt", "product_id": 1}},
 {"id": "retro-feature", "type": "retro", "enabled": True, "settings": {
    "eyebrow": "04 / ZASTAL RETRO", "title": "Klasyczny znak. Klubowa bluza.",
    "description": "Retro logo Zastalu na zielonej bluzie.",
    "button_text": "Zobacz kolekcję", "product_id": 2, "image": ""}},
 {"id": "accessories-edit", "type": "accessories", "enabled": True, "settings": {
    "eyebrow": "05 / DODATKI", "title": "Małe rzeczy. Te same barwy.",
    "description": "Akcesoria, które możesz zabrać ze sobą nie tylko na mecz.", "count": 3}},
 {"id": "shop-services", "type": "services", "enabled": True, "settings": {
    "title": "Informacje o sklepie", "first_title": "Dostawa i odbiór",
    "first_text": "Warunki po uruchomieniu sprzedaży",
    "second_title": "Twoje konto", "second_text": "Zamówienia i ustawienia w jednym miejscu",
    "third_title": "Dobierz rozmiar", "third_text": "Informacje przed zakupem"}}
]}

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

def canonical(config):
    return json.dumps(config, ensure_ascii=False, separators=(",", ":"), sort_keys=True)

def init_schema(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS site_home (
        id INTEGER PRIMARY KEY CHECK(id=1),
        published TEXT NOT NULL,
        draft TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        published_revision INTEGER NOT NULL DEFAULT 1,
        updated TEXT NOT NULL)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS site_home_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        revision INTEGER NOT NULL,
        content TEXT NOT NULL,
        action TEXT NOT NULL,
        created TEXT NOT NULL)""")
    columns={row[1] for row in conn.execute("PRAGMA table_info(site_home)")}
    for column,kind in (("scheduled_at","TEXT"),("scheduled_content","TEXT"),("scheduled_revision","INTEGER")):
        if column not in columns:conn.execute(f"ALTER TABLE site_home ADD COLUMN {column} {kind}")
    if not conn.execute("SELECT 1 FROM site_home WHERE id=1").fetchone():
        payload=canonical(DEFAULT)
        conn.execute("INSERT INTO site_home(id,published,draft,revision,published_revision,updated) VALUES(1,?,?,1,1,?)",
                     (payload,payload,now()))
        conn.execute("INSERT INTO site_home_revisions(revision,content,action,created) VALUES(1,?,'initial',?)",(payload,now()))

def get(conn, admin=False):
    record=conn.execute("SELECT * FROM site_home WHERE id=1").fetchone()
    if not record:
        raise RuntimeError("CMS not initialized")
    output={"config":json.loads(record["draft"] if admin else record["published"]),
            "published_revision":record["published_revision"], "updated":record["updated"]}
    if admin:
        output["revision"]=record["revision"]
        output["draft_changed"]=record["draft"] != record["published"]
        output["scheduled_at"]=record["scheduled_at"]
        output["scheduled_revision"]=record["scheduled_revision"]
    return output

def history(conn):
    return [{"id":row["id"],"revision":row["revision"],"action":row["action"],"created":row["created"]}
            for row in conn.execute("SELECT id,revision,action,created FROM site_home_revisions ORDER BY id DESC LIMIT 25")]

def valid_url(value):
    return isinstance(value,str) and (not value or (len(value)<400 and bool(SAFE_LINK.fullmatch(value))))

def valid_image(value):
    return valid_url(value) and (not value or value.startswith(("/assets/", "/api/store/media/")))

def valid_hero_image(value):
    # Validate the reference without demanding that archived assets exist locally.
    # Checkout/testing hosts may serve media separately from the CMS process.
    if not value:return True
    if re.fullmatch(r"/api/store/media/[0-9a-f]{32}\.webp",value):return True
    return bool(re.fullmatch(r"/assets/[A-Za-z0-9_./-]+",value)) and all(
        part and part not in (".","..") for part in value[len("/assets/"):].split("/"))

def validate(conf, conn=None):
    if not isinstance(conf,dict) or set(conf)!={"version","sections"} or conf["version"]!=1:
        raise ValueError("Nieprawidłowa wersja konfiguracji strony")
    sections=conf["sections"]
    if not isinstance(sections,list) or not 1<=len(sections)<=25:
        raise ValueError("Strona musi zawierać od 1 do 25 sekcji")
    ids=set()
    out=[]
    for section in sections:
        if not isinstance(section,dict) or set(section)!={"id","type","enabled","settings"}:
            raise ValueError("Nieprawidłowa struktura sekcji")
        sid=section["id"]
        if not isinstance(sid,str) or not REGEX_ID.fullmatch(sid) or sid in ids:
            raise ValueError("Identyfikator sekcji musi być unikalny")
        ids.add(sid)
        kind=section["type"]
        if kind not in SECTION_TYPES or type(section["enabled"]) is not bool:
            raise ValueError("Nieznany typ sekcji")
        data=section["settings"]
        required=FIELDS[kind]
        optional=HERO_OPTIONAL_FIELDS if kind=="hero" else {}
        if not isinstance(data,dict) or not set(required)<=set(data) or not set(data)<=set(required)|set(optional):
            raise ValueError("Brakuje pól sekcji: "+kind)
        clean={}
        for field,format_ in {**required,**optional}.items():
            if field not in data:continue
            value=data[field]
            if format_ in ("text","long"):
                limit=250 if format_=="text" else 1300
                if not isinstance(value,str) or len(value)>limit or any(ord(ch)<32 and ch not in '\n\t' for ch in value):
                    raise ValueError("Nieprawidłowy tekst: "+field)
                clean[field]=value.strip()
            elif format_=="url":
                if not valid_url(value):raise ValueError("Niedozwolony adres odnośnika")
                clean[field]=value
            elif format_=="image":
                if not valid_image(value):raise ValueError("Obraz musi być wybrany z biblioteki mediów")
                if kind=="hero" and not valid_hero_image(value):
                    raise ValueError("Obraz musi być wybrany z biblioteki mediów")
                clean[field]=value
            elif format_=="color":
                if not isinstance(value,str) or not COLOR.fullmatch(value):
                    raise ValueError("Nieprawidłowy kolor")
                clean[field]=value.lower()
            elif format_=="align":
                if value not in ("left","center","right"):raise ValueError("Nieprawidłowe wyrównanie")
                clean[field]=value
            elif format_=="image_role":
                if value not in ("model", "lifestyle"):raise ValueError("Wybierz zdjęcie modelowe lub lifestyle")
                clean[field]=value
            elif format_=="hero_image_role":
                if value not in ("packshot", "model", "detail", "lifestyle"):
                    raise ValueError("Nieprawidłowa rola zdjęcia slajdu")
                clean[field]=value
            elif format_=="bool":
                if type(value) is not bool:raise ValueError("Nieprawidłowy przełącznik")
                clean[field]=value
            elif format_ in ("height","overlay","columns","count","product","interval","speed"):
                low,high={"height":(400,850),"overlay":(0,95),"columns":(2,4),
                          "count":(1,12),"product":(1,999999),"interval":(3000,15000),"speed":(10,90)}[format_]
                if type(value) is not int or not low<=value<=high:
                    raise ValueError("Nieprawidłowa wartość pola: "+field)
                clean[field]=value
            elif format_=="category":
                if value not in SLUGS:raise ValueError("Nieprawidłowa kategoria produktów")
                clean[field]=value
            elif format_=="categories":
                if not isinstance(value,str) or not 1<=len(value)<130 or any(x.strip() not in SLUGS-{"Wszystko"} for x in value.split(",")):
                    raise ValueError("Wybierz poprawne kategorie")
                clean[field]=value
            elif format_=="product_ids":
                if not isinstance(value,str) or len(value)>140 or (value.strip() and not re.fullmatch(r"\d+(?:\s*,\s*\d+)*",value)):
                    raise ValueError("Wprowadź ID produktów oddzielone przecinkiem")
                clean[field]=value
        if kind=="ticker":
            parts=[x.strip() for x in clean["items"].split("|")]
            if not 1<=len([x for x in parts if x])<=12 or any(len(x)>120 for x in parts):
                raise ValueError("Pasek: podaj od 1 do 12 haseł oddzielonych znakiem |, każde do 120 znaków")
        if kind=="hero":
            for slide in (2,3):
                prefix=f"slide_{slide}_"
                if section["enabled"] and clean.get("slides_enabled",True) and clean.get(prefix+"enabled",True) and clean.get(prefix+"image") and not clean.get(prefix+"image_alt"):
                    raise ValueError("Uzupełnij opis zdjęcia slajdu "+str(slide))
        if kind=="campaign":
            # Lazy import keeps the upload module independent of gallery storage.
            import commerce_media as media
            if clean["image"] and not media.valid_image_url(clean["image"]):
                raise ValueError("Wybierz istniejące zdjęcie z biblioteki mediów")
            if not media.plain_text(data["image_alt"],250):
                raise ValueError("Nieprawidłowy opis zdjęcia kampanii")
            product_ids=[int(part.strip()) for part in clean["product_ids"].split(",")] if clean["product_ids"].strip() else []
            if any(not 1<=product_id<=9223372036854775807 for product_id in product_ids):
                raise ValueError("Wybierz poprawne ID produktów")
            if section["enabled"] and (not clean["image"] or not clean["image_alt"] or not product_ids):
                raise ValueError("Aktywna kampania wymaga zdjęcia, opisu i powiązanych produktów")
            if conn is not None:
                for product_id in set(product_ids):
                    if not conn.execute("SELECT 1 FROM products WHERE id=?",(product_id,)).fetchone():
                        raise ValueError("Produkt kampanii nie istnieje: "+str(product_id))
        out.append({"id":sid,"type":kind,"enabled":section["enabled"],"settings":clean})
    if not any(x["enabled"] and x["type"]=="hero" for x in out):
        raise ValueError("Strona musi posiadać aktywny baner główny")
    if len(canonical({"version":1,"sections":out}))>30000:
        raise ValueError("Konfiguracja strony jest zbyt duża")
    return {"version":1,"sections":out}

def save_draft(conn,config,expected_revision):
    c=validate(config,conn)
    row=conn.execute("SELECT revision FROM site_home WHERE id=1").fetchone()
    if type(expected_revision) is not int or expected_revision!=row["revision"]:
        raise RuntimeError("Edytor jest nieaktualny. Odśwież dane przed zapisem.")
    revision=row["revision"]+1
    payload=canonical(c)
    conn.execute("UPDATE site_home SET draft=?,revision=?,updated=? WHERE id=1",(payload,revision,now()))
    conn.execute("INSERT INTO site_home_revisions(revision,content,action,created) VALUES(?,?,'draft',?)",(revision,payload,now()))
    return revision

def publish(conn,expected_revision):
    row=conn.execute("SELECT revision,draft FROM site_home WHERE id=1").fetchone()
    if type(expected_revision) is not int or expected_revision!=row["revision"]:
        raise RuntimeError("Wersja edytora jest nieaktualna")
    validate(json.loads(row["draft"]),conn)
    conn.execute("UPDATE site_home SET published=draft,published_revision=revision,updated=? WHERE id=1",(now(),))
    conn.execute("INSERT INTO site_home_revisions(revision,content,action,created) VALUES(?,?,'published',?)",(row["revision"],row["draft"],now()))

def parse_when(value):
    if not isinstance(value,str) or not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)",value):
        raise ValueError("Podaj datę i godzinę publikacji")
    moment=dt.datetime.fromisoformat(value.replace("Z","+00:00"))
    if moment.tzinfo is None:raise ValueError("Podaj datę i godzinę publikacji")
    return moment.astimezone(dt.timezone.utc)

def schedule(conn,expected_revision,when):
    """Freeze the current draft and publish exactly that content at `when`; later draft edits do not leak into it."""
    row=conn.execute("SELECT revision,draft FROM site_home WHERE id=1").fetchone()
    if type(expected_revision) is not int or expected_revision!=row["revision"]:
        raise RuntimeError("Wersja edytora jest nieaktualna")
    moment=parse_when(when)
    current=dt.datetime.now(dt.timezone.utc)
    if moment<=current+dt.timedelta(minutes=1):raise ValueError("Termin publikacji musi być w przyszłości")
    if moment>current+dt.timedelta(days=366):raise ValueError("Termin publikacji może być odległy najwyżej o rok")
    validate(json.loads(row["draft"]),conn)
    stamp=moment.isoformat(timespec="seconds")
    conn.execute("UPDATE site_home SET scheduled_at=?,scheduled_content=?,scheduled_revision=?,updated=? WHERE id=1",(stamp,row["draft"],row["revision"],now()))
    return stamp

def cancel_schedule(conn):
    conn.execute("UPDATE site_home SET scheduled_at=NULL,scheduled_content=NULL,scheduled_revision=NULL,updated=? WHERE id=1",(now(),))

def run_due(conn):
    """Publish a scheduled version once its time has come. Cheap when nothing is due; safe to call from any process."""
    row=conn.execute("SELECT scheduled_at FROM site_home WHERE id=1").fetchone()
    if not row or not row["scheduled_at"] or row["scheduled_at"]>dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"):
        return False
    conn.execute("BEGIN IMMEDIATE")
    try:
        row=conn.execute("SELECT scheduled_at,scheduled_content,scheduled_revision FROM site_home WHERE id=1").fetchone()
        if not row["scheduled_at"] or row["scheduled_at"]>dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"):
            conn.rollback();return False
        try:
            clean=canonical(validate(json.loads(row["scheduled_content"]),conn))
        except (ValueError,TypeError):
            # A frozen version that no longer validates (for example a deleted campaign product) is dropped, never published.
            cancel_schedule(conn);conn.commit();return False
        conn.execute("UPDATE site_home SET published=?,published_revision=?,updated=?,scheduled_at=NULL,scheduled_content=NULL,scheduled_revision=NULL WHERE id=1",(clean,row["scheduled_revision"],now()))
        conn.execute("INSERT INTO site_home_revisions(revision,content,action,created) VALUES(?,?,'published',?)",(row["scheduled_revision"],clean,now()))
        conn.commit();return True
    except Exception:
        conn.rollback();raise

def restore(conn,revision_id,expected_revision):
    row=conn.execute("SELECT revision FROM site_home WHERE id=1").fetchone()
    if type(expected_revision) is not int or expected_revision!=row["revision"]:
        raise RuntimeError("Wersja edytora jest nieaktualna")
    if type(revision_id) is not int:raise ValueError("Nieprawidłowa wersja")
    found=conn.execute("SELECT content FROM site_home_revisions WHERE id=?",(revision_id,)).fetchone()
    if not found:raise ValueError("Wersja nie istnieje")
    return save_draft(conn,json.loads(found["content"]),expected_revision)

def write_media(data):
    if not isinstance(data,dict) or set(data)!={"image","name"}:
        raise ValueError("Nieprawidłowy plik")
    image=data["image"]
    if not isinstance(image,str) or len(image)>1_850_000:
        raise ValueError("Plik jest za duży (maks. 1 MB)")
    if not isinstance(data["name"],str) or len(data["name"])>140:
        raise ValueError("Nieprawidłowa nazwa")
    try:
        prefix,encoded=image.split(",",1)
        if prefix not in ("data:image/png;base64","data:image/jpeg;base64","data:image/webp;base64"):
            raise ValueError("Akceptujemy tylko JPG, PNG i WebP")
        blob=base64.b64decode(encoded,validate=True)
        if len(blob)>1_200_000:raise ValueError("Maksymalny rozmiar 1,2 MB")
        with Image.open(io.BytesIO(blob)) as picture:
            picture.verify()
        with Image.open(io.BytesIO(blob)) as picture:
            if picture.width*picture.height>14_000_000 or picture.width<300 or picture.height<200:
                raise ValueError("Zdjęcie musi mieć od 300×200 px i maksymalnie 14 Mpix")
            image_obj=ImageOps.exif_transpose(picture).convert("RGB")
            image_obj.thumbnail((2200,1700))
            buff=io.BytesIO()
            image_obj.save(buff,"WEBP",quality=83,method=5)
            content=buff.getvalue()
    except (OSError,UnidentifiedImageError,ValueError,base64.binascii.Error) as ex:
        raise ValueError("Nieprawidłowy obraz: "+str(ex)[:90])
    if len(content)>1_500_000:raise ValueError("Obraz po przetworzeniu jest zbyt duży")
    name=hashlib.sha256(content).hexdigest()[:32]+".webp"
    HOME_MEDIA.mkdir(mode=0o750,parents=True,exist_ok=True)
    destination=HOME_MEDIA / name
    if not destination.exists():
        destination.write_bytes(content)
        destination.chmod(0o640)
    return "/api/store/media/"+name

def list_media():
    if not HOME_MEDIA.is_dir():return []
    entries=sorted(HOME_MEDIA.glob("*.webp"),key=lambda path:path.stat().st_mtime,reverse=True)
    return [{"url":"/api/store/media/"+p.name,"name":p.name,"bytes":p.stat().st_size}
            for p in entries[:100] if re.fullmatch(r"[0-9a-f]{32}\.webp",p.name)]

def load_media(filename):
    if not re.fullmatch(r"[0-9a-f]{32}\.webp",filename):
        return None
    item=HOME_MEDIA / filename
    return item.read_bytes() if item.is_file() else None
