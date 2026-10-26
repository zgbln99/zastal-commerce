"""Shipping integration uses cached data only and safe DPD links."""
import sqlite3
import json
import unittest
from unittest.mock import patch
import commerce_dpd as dpd
import commerce_sales as sales
import commerce_api as api
import commerce_returns as returns

class ShipmentSalesTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(':memory:'); self.c.row_factory=sqlite3.Row
        self.c.execute('CREATE TABLE orders(id INTEGER PRIMARY KEY,status TEXT,items TEXT,total INTEGER,created TEXT)')
        self.c.execute("INSERT INTO orders VALUES(1,'spakowane','[]',100,'2026-10-24')")
        sales.init_schema(self.c); dpd.init_schema(self.c); returns.init_schema(self.c)
        self.c.execute('CREATE TABLE events(id INTEGER PRIMARY KEY,order_id INTEGER,created TEXT,status TEXT)')
    def tearDown(self): self.c.close()
    def test_dpd_normalization_safe_link_and_cache(self):
        with patch.object(sales,'_event'), patch.object(dpd,'TRANSPORT') as transport:
            detail=sales.record_shipment(self.c,1,{'carrier':'dpd','tracking_number':'0000001094090S','tracking_url':'https://evil.test/{tracking}'})
            self.assertEqual(detail['carrier'],'DPD')
            self.assertEqual(detail['tracking_url'],dpd.tracking_url('0000001094090S'))
            self.c.execute("UPDATE order_details SET mode='live' WHERE order_id=1")
            detail=sales.details(self.c,1)
            self.assertEqual(detail['shipment']['tracking_number'],'0000001094090S')
            self.assertIsNone(detail['shipment']['source'])
            self.c.execute('INSERT INTO dpd_shipments(order_id,tracking_number,events,sync_state) VALUES(?,?,?,?)',(1,'0000001094090S',json.dumps([{'code':'190101','label':'Doręczono','occurred_at':'2026-10-24T10:00:00+00:00'}]),'ok'))
            receipt={'order_id':1,'fulfillment':'dostawa','shipping_fee':0,'subtotal':100}
            order=api.order_detail(self.c,receipt)
            self.assertEqual(order['details']['shipment']['tracking_number'],'0000001094090S')
            self.assertEqual(order['details']['shipment']['status_code'],'190101')
            self.assertEqual(order['details']['shipment']['source'],'dpd')
            self.assertNotIn('note',order['details'])
            transport.assert_not_called()
    def test_invalid_dpd_number_does_not_change_order(self):
        with self.assertRaises(sales.SalesError):
            sales.record_shipment(self.c,1,{'carrier':'DPD','tracking_number':'invalid-1234'})
        self.assertIsNone(sales.details(self.c,1))
        self.assertEqual(self.c.execute('SELECT status FROM orders WHERE id=1').fetchone()[0],'spakowane')
