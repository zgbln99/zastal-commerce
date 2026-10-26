import re
import unicodedata

def slugify(name):
    value=unicodedata.normalize('NFKD',str(name).lower().replace('ł','l')).encode('ascii','ignore').decode()
    value=re.sub(r'[^a-z0-9]+','-',value).strip('-')[:100].strip('-') or 'produkt'
    return 'produkt-'+value if value.isdigit() else value

def assign(c,pid,name):
    row=c.execute('SELECT slug FROM product_urls WHERE product_id=?',(pid,)).fetchone()
    if row:return row['slug']
    base=slugify(name);slug=base;number=2
    while c.execute('SELECT 1 FROM product_urls WHERE slug=?',(slug,)).fetchone():
        slug=f'{base}-{number}';number+=1
    c.execute('INSERT INTO product_urls(product_id,slug) VALUES(?,?)',(pid,slug))
    return slug

def init_schema(c):
    c.execute('CREATE TABLE IF NOT EXISTS product_urls(product_id INTEGER PRIMARY KEY REFERENCES products(id),slug TEXT NOT NULL UNIQUE)')
    for row in c.execute('SELECT id,name FROM products ORDER BY id').fetchall():assign(c,row['id'],row['name'])

def slugs(c):
    return {row['product_id']:row['slug'] for row in c.execute('SELECT product_id,slug FROM product_urls')}
