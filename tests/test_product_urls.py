import sqlite3
import unittest
import commerce_urls as urls

class ProductUrlTests(unittest.TestCase):
    def test_polish_names_collisions_and_stable_urls(self):
        c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row
        c.execute('CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT)')
        c.executemany('INSERT INTO products VALUES(?,?)',[(1,'Bluza Zastal Logo'),(2,'Bluza Zastal Logo'),(3,'Łódź i Żółć!')])
        urls.init_schema(c)
        self.assertEqual(urls.slugs(c),{1:'bluza-zastal-logo',2:'bluza-zastal-logo-2',3:'lodz-i-zolc'})
        c.execute("UPDATE products SET name='Nowa nazwa' WHERE id=1")
        urls.init_schema(c)
        self.assertEqual(urls.slugs(c)[1],'bluza-zastal-logo')
        c.execute("INSERT INTO products VALUES(4,'123')")
        self.assertEqual(urls.assign(c,4,'123'),'produkt-123')

if __name__=='__main__':unittest.main()
