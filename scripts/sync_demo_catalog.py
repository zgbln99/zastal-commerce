"""Idempotent migration of prototype merchandise records to real Zastal Store catalog examples.
Prices/images were manually reviewed in October 2026. DEMO DATA ONLY.
"""
import sqlite3
from pathlib import Path
DB=Path(__file__).resolve().parents[1]/"zastal.sqlite3"
items=[
 (1,"Bluza Zastal Logo","ZS-HD-001","Bluzy",9900,38),
 (2,"Bluza Zastal Retro","ZS-HD-002","Bluzy",9900,19),
 (3,"Koszulka Wicemistrz Polski","ZS-TS-003","Koszulki",6500,24),
 (4,"Koszulka The Final — ciemna","ZS-TS-004","Koszulki",6000,27),
 (5,"Koszulka The Final — jasna","ZS-TS-005","Koszulki",6000,17),
 (6,"Koszulka Zastal Sulima","ZS-TS-006","Koszulki",6000,35),
 (7,"Zastal Express — koszulka","ZS-TS-007","Koszulki",5500,25),
 (8,"Worek sportowy Zastal","ZS-AC-008","Akcesoria",5000,42),
 (9,"Koszulka dziecięca Wicemistrz","ZS-KD-009","Dzieci",5500,20),
 (10,"Koszulka Zastal Trio","ZS-TS-010","Koszulki",6000,24),
 (11,"Brelok Dziczek 3D","ZS-AC-011","Akcesoria",3000,60),
 (12,"Magnes Zastal Dziczek","ZS-AC-012","Akcesoria",2500,45),
]
with sqlite3.connect(DB) as con:
 existing=con.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
 if existing:
  print("Existing orders:",existing,"— migration updates catalog names and prices only, preserving stock levels of existing products.")
 for id,name,sku,cat,price,initial in items:
  row=con.execute("SELECT id FROM products WHERE id=?",(id,)).fetchone()
  if row:
   con.execute("UPDATE products SET name=?,sku=?,category=?,price=? WHERE id=?",(name,sku,cat,price,id))
  else:
   con.execute("INSERT INTO products(id,name,sku,category,price,stock) VALUES(?,?,?,?,?,?)",(id,name,sku,cat,price,initial))
 print("Catalog:",con.execute("SELECT COUNT(*) FROM products").fetchone()[0],"products")
