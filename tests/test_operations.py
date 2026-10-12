"""POS/fulfillment guards exercised against disposable SQLite databases only."""
import importlib
import importlib.util
import json
import sqlite3
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import commerce_api as api


class OperationsTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('commerce_ops'), 'Operations backend must exist')
        self.ops = importlib.import_module('commerce_ops')
        self.folder = tempfile.TemporaryDirectory()
        self.old_database = api.DATABASE
        self.old_token = api.TOKEN
        api.DATABASE = Path(self.folder.name) / 'operations.sqlite3'
        api.TOKEN = 'operations-test-admin-only'
        self.addCleanup(self.folder.cleanup)
        self.addCleanup(setattr, api, 'DATABASE', self.old_database)
        self.addCleanup(setattr, api, 'TOKEN', self.old_token)
        api.init()
        with api.connect() as c:
            self.ops.init_schema(c)
            c.execute("INSERT INTO products VALUES(1,'Koszulka','TS','Koszulki',7900,8)")
            c.execute("INSERT INTO products VALUES(2,'Kubek','CUP','Akcesoria',3000,2)")
            c.execute("INSERT INTO product_variants(product_id,size,sku,ean,stock) VALUES(1,'L','TS-L','2000000001018',8)")
            c.execute("INSERT INTO product_variants(product_id,size,sku,ean,stock) VALUES(2,'UNI','CUP-UNI','2000000002015',2)")
            c.execute("INSERT INTO product_options(product_id,personalization_enabled,personalization_fee) VALUES(1,1,1500)")
        self.actor = 1

    def payload(self, **extra):
        return {'items': [{'id': 1, 'size': 'L', 'quantity': 1}],
                'idempotency_key': 'operations-sale-key-123456',
                'payment_method': 'cash', 'payment_confirmed': True, **extra}

    def mutate(self, helper, *args):
        with api.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            return helper(c, *args, self.actor)

    def sale(self, **extra):
        return self.mutate(self.ops.create_sale, self.payload(**extra))

    def detail(self, oid):
        with api.connect() as c:
            return self.ops.detail(c, oid)

    def update(self, oid, action, index=0, **extra):
        data = {'revision': self.detail(oid)['revision'], 'line_index': index,
                'action': action, 'quantity': 1, **extra}
        return self.mutate(self.ops.update_line, oid, data)

    def finish(self, oid, action, **extra):
        return self.mutate(self.ops.complete, oid,
                           {'revision': self.detail(oid)['revision'], 'action': action, **extra})

    def expect_error(self, code, callback):
        with self.assertRaises(self.ops.OpsError) as error:
            callback()
        self.assertEqual(error.exception.code, code)
        return error.exception

    def counts(self):
        with api.connect() as c:
            return (c.execute('SELECT stock FROM product_variants WHERE product_id=1').fetchone()[0],
                    c.execute('SELECT COUNT(*) FROM orders').fetchone()[0],
                    c.execute('SELECT COUNT(*) FROM stock_events').fetchone()[0],
                    c.execute('SELECT COUNT(*) FROM audit_log').fetchone()[0])

    def test_partial_stock_failure_rolls_back_every_write(self):
        before = self.counts()
        self.expect_error('insufficient_stock', lambda: self.sale(items=[
            {'id': 1, 'size': 'L', 'quantity': 2}, {'id': 2, 'quantity': 3}]))
        self.assertEqual(self.counts(), before)

    def test_personalization_failure_rolls_back_stock(self):
        before = self.counts()
        self.expect_error('invalid_personalization', lambda: self.sale(items=[
            {'id': 2, 'quantity': 1, 'personalization': {'mode': 'custom', 'name': 'TEST', 'number': '3'}}]))
        self.assertEqual(self.counts(), before)
        with api.connect() as c:
            self.assertEqual(c.execute('SELECT stock FROM product_variants WHERE product_id=2').fetchone()[0], 2)

    def test_replay_preserves_snapshot_even_after_catalog_and_roster_change(self):
        first = self.sale(items=[{'id': 1, 'size': 'L', 'quantity': 2,
                                 'personalization': {'mode': 'player', 'player_id': 1}}])
        before = self.counts()
        with api.connect() as c:
            c.execute('UPDATE products SET price=1 WHERE id=1')
            c.execute('UPDATE players SET active=0,print_name="CHANGED" WHERE id=1')
            c.execute('UPDATE product_options SET personalization_enabled=0 WHERE product_id=1')
        replay = self.sale(items=[{'id': 1, 'size': 'l', 'quantity': 2,
                                  'personalization': {'mode': 'player', 'player_id': 1}}])
        self.assertTrue(first['demo'])
        self.assertTrue(replay['replayed'])
        self.assertEqual({k: v for k, v in first.items() if k != 'replayed'},
                         {k: v for k, v in replay.items() if k != 'replayed'})
        self.assertEqual(first['total'], 18800)
        self.assertEqual(self.counts(), before)

    def test_reused_key_conflicts_for_cart_payment_or_customer(self):
        self.sale()
        before = self.counts()
        for changes in ({'items': [{'id': 1, 'size': 'L', 'quantity': 2}]},
                        {'payment_method': 'terminal'}, {'customer_id': 12}):
            with self.subTest(changes=changes):
                error = self.expect_error('idempotency_conflict', lambda: self.sale(**changes))
                self.assertEqual(error.status, 409)
        self.assertEqual(self.counts(), before)

    def test_server_prices_and_aggregate_variant_stock(self):
        sale = self.sale(total=1, items=[{'id': 1, 'size': 'L', 'quantity': 2, 'unit_price': 1},
                                       {'id': 1, 'size': 'L', 'quantity': 3}])
        self.assertEqual(sale['total'], 39500)
        self.assertEqual(self.counts()[0], 3)
        with api.connect() as c:
            self.assertEqual(c.execute('SELECT stock FROM products WHERE id=1').fetchone()[0], 3)

    def test_duplicate_variant_lines_cannot_oversell(self):
        before = self.counts()
        self.expect_error('insufficient_stock', lambda: self.sale(items=[
            {'id': 1, 'size': 'L', 'quantity': 5}, {'id': 1, 'size': 'L', 'quantity': 5}]))
        self.assertEqual(self.counts(), before)

    def test_simultaneous_same_key_sales_reserve_once(self):
        barrier = threading.Barrier(2)
        def attempt():
            barrier.wait(timeout=5)
            return self.sale()
        with ThreadPoolExecutor(max_workers=2) as workers:
            results = list(workers.map(lambda _: attempt(), range(2)))
        self.assertEqual(results[0]['id'], results[1]['id'])
        self.assertEqual(sorted(value['replayed'] for value in results), [False, True])
        self.assertEqual(self.counts(), (7, 1, 1, 1))

    def test_simultaneous_progress_rejects_one_stale_revision(self):
        oid = self.sale(items=[{'id': 1, 'size': 'L', 'quantity': 2}])['id']
        barrier = threading.Barrier(2)
        def attempt():
            barrier.wait(timeout=5)
            try:
                self.update(oid, 'pick', revision=0)
                return 'ok'
            except self.ops.OpsError as error:
                return error.code
        with ThreadPoolExecutor(max_workers=2) as workers:
            results = list(workers.map(lambda _: attempt(), range(2)))
        self.assertEqual(sorted(results), ['ok', 'stale_revision'])
        value = self.detail(oid)
        self.assertEqual(value['revision'], 1)
        self.assertEqual(value['items'][0]['picked_qty'], 1)

    def test_payment_key_and_customer_validation_never_mutate(self):
        before = self.counts()
        for changes in ({'payment_confirmed': False}, {'payment_confirmed': 1},
                        {'payment_method': 'gateway'}, {'idempotency_key': 'short'},
                        {'customer_id': True}, {'customer_id': 999},
                        {'items': [{'id': True, 'quantity': 1}]},
                        {'items': [{'id': 1, 'quantity': True}]}):
            with self.subTest(changes=changes), self.assertRaises(self.ops.OpsError):
                self.sale(**changes)
        self.assertEqual(self.counts(), before)

    def test_scanner_mismatch_and_stale_revision_do_not_confirm(self):
        oid = self.sale()['id']
        self.expect_error('scanner_mismatch', lambda: self.update(oid, 'pick', code='CUP-UNI'))
        with api.connect() as c:
            code = c.execute('SELECT ean FROM product_variants WHERE product_id=1').fetchone()[0]
        self.update(oid, 'pick', code=code)
        error = self.expect_error('stale_revision', lambda: self.update(oid, 'check', revision=0))
        self.assertEqual(error.status, 409)
        line = self.detail(oid)['items'][0]
        self.assertEqual((line['picked_qty'], line['checked_qty']), (1, 0))

    def test_repeated_quantity_and_stage_prerequisites(self):
        oid = self.sale()['id']
        self.expect_error('progress_prerequisite', lambda: self.update(oid, 'check'))
        self.expect_error('invalid_request', lambda: self.update(oid, 'pick', quantity=2))
        self.update(oid, 'pick', code='TS-L')
        self.expect_error('quantity_complete', lambda: self.update(oid, 'pick'))
        self.update(oid, 'check')
        self.expect_error('quantity_complete', lambda: self.update(oid, 'check'))
        self.assertEqual(self.detail(oid)['revision'], 2)

    def test_same_variant_different_prints_require_separate_confirmation(self):
        oid = self.sale(items=[{'id': 1, 'size': 'L', 'quantity': 1,
                               'personalization': {'mode': 'custom', 'name': 'FIRST', 'number': '1'}},
                              {'id': 1, 'size': 'L', 'quantity': 1,
                               'personalization': {'mode': 'custom', 'name': 'SECOND', 'number': '2'}}])['id']
        self.update(oid, 'pick', index=0)
        self.update(oid, 'pick', index=1)
        self.expect_error('progress_prerequisite', lambda: self.update(oid, 'check', index=0))
        self.update(oid, 'print', index=0)
        self.update(oid, 'check', index=0)
        self.expect_error('fulfillment_not_ready', lambda: self.finish(oid, 'pack'))
        self.assertEqual(self.detail(oid)['items'][1]['printed_qty'], 0)
        self.update(oid, 'print', index=1)
        self.update(oid, 'check', index=1)
        self.assertTrue(self.detail(oid)['ready_to_pack'])
        packed = self.finish(oid, 'pack')
        self.assertEqual(packed['status'], 'spakowane')
        handed = self.finish(oid, 'handover')
        self.assertEqual(handed['status'], 'wydane')
        self.expect_error('order_closed', lambda: self.update(oid, 'pick'))
        self.expect_error('order_closed', lambda: self.finish(oid, 'handover'))
        with api.connect() as c:
            self.assertEqual(self.ops.queue(c), [])

    def test_handover_requires_pack_and_pack_is_not_repeatable(self):
        oid = self.sale()['id']
        self.expect_error('fulfillment_not_ready', lambda: self.finish(oid, 'handover'))
        self.update(oid, 'pick')
        self.update(oid, 'check')
        self.finish(oid, 'pack')
        self.expect_error('order_packed', lambda: self.finish(oid, 'pack'))
        self.expect_error('order_packed', lambda: self.update(oid, 'pick'))

    def test_legacy_order_read_does_not_mutate_and_cancelled_order_is_closed(self):
        with api.connect() as c:
            c.execute('INSERT INTO orders(created,items,total,status) VALUES(?,?,?,?)',
                      (api.stamp(), json.dumps([{'sku': 'TS', 'variant_sku': 'TS-L',
                                                'name': 'Old shirt', 'size': 'L', 'qty': 1}]), 7900, 'nowe'))
            oid = c.execute('SELECT MAX(id) FROM orders').fetchone()[0]
            before = c.total_changes
            value = self.ops.detail(c, oid)
            self.assertEqual(value['revision'], 0)
            self.assertEqual(c.total_changes, before)
            self.assertEqual(len(self.ops.queue(c)), 1)
        self.update(oid, 'pick', code='TS-L')
        with api.connect() as c:
            c.execute('UPDATE orders SET status="anulowane" WHERE id=?', (oid,))
        self.expect_error('order_closed', lambda: self.update(oid, 'check'))

    def test_corrupt_personalization_snapshot_cannot_be_printed_or_packed(self):
        oid = self.sale()['id']
        with api.connect() as c:
            items = json.loads(c.execute('SELECT items FROM orders WHERE id=?', (oid,)).fetchone()[0])
            items[0]['personalization'] = {'mode': 'custom', 'name': 'TEST', 'number': '\n1'}
            c.execute('UPDATE orders SET items=? WHERE id=?', (json.dumps(items), oid))
        self.expect_error('invalid_order_snapshot', lambda: self.update(oid, 'print'))
        self.expect_error('invalid_order_snapshot', lambda: self.finish(oid, 'pack'))

    def test_missing_order_has_structured_404(self):
        error = self.expect_error('order_not_found', lambda: self.detail(999))
        self.assertEqual(error.status, 404)

    def test_legacy_product_sku_resolves_size_for_sku_ean_and_qr(self):
        with api.connect() as c:
            oid = c.execute('INSERT INTO orders(created,items,total,status) VALUES(?,?,?,?)',
                            (api.stamp(), json.dumps([{'sku': 'TS', 'size': 'L', 'qty': 3}]),
                             23700, 'nowe')).lastrowid
            ean = c.execute("SELECT ean FROM product_variants WHERE sku='TS-L'").fetchone()[0]
        self.update(oid, 'pick', code=' ts-l ')
        self.update(oid, 'pick', code=ean)
        self.expect_error('scanner_mismatch', lambda: self.update(oid, 'pick', code=f'ZASTAL|TS-L|incorrect'))
        value = self.update(oid, 'pick', code=f'ZASTAL|ts-l|{ean}')
        self.assertEqual(value['items'][0]['picked_qty'], 3)
        self.assertNotIn('variant_sku', value['items'][0])

    def production_task(self, oid, status='oczekuje'):
        with api.connect() as c:
            batch = c.execute('SELECT id FROM dtf_batches LIMIT 1').fetchone()[0]
            return c.execute('''INSERT INTO production_tasks(order_id,line_index,batch_id,design,status,created,updated)
                VALUES(?,0,?,'Existing DTF',?,?,?)''', (oid, batch, status, api.stamp(), api.stamp())).lastrowid

    def test_existing_production_task_requires_ready_status_for_print_confirmation(self):
        oid = self.sale()['id']
        task = self.production_task(oid)
        self.update(oid, 'pick')
        self.expect_error('production_not_ready', lambda: self.update(oid, 'print'))
        with api.connect() as c:
            c.execute("UPDATE production_tasks SET status='gotowe' WHERE id=?", (task,))
        self.update(oid, 'print')
        self.update(oid, 'check')
        self.assertTrue(self.detail(oid)['ready_to_pack'])

    def test_new_unready_production_task_blocks_previously_checked_line(self):
        oid = self.sale(items=[{'id': 1, 'size': 'L', 'quantity': 1,
                               'personalization': {'mode': 'custom', 'name': 'TEST', 'number': '1'}}])['id']
        self.update(oid, 'pick')
        self.update(oid, 'print')
        self.update(oid, 'check')
        self.assertTrue(self.detail(oid)['ready_to_pack'])
        task = self.production_task(oid)
        self.assertFalse(self.detail(oid)['ready_to_pack'])
        self.expect_error('fulfillment_not_ready', lambda: self.finish(oid, 'pack'))
        with api.connect() as c:
            c.execute("UPDATE production_tasks SET status='gotowe' WHERE id=?", (task,))
        self.assertTrue(self.detail(oid)['ready_to_pack'])


if __name__ == '__main__':
    unittest.main()
