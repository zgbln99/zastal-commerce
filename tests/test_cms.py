"""Zastal Store CMS integration checks: draft isolation, concurrency and media."""
import base64
import os
import copy
import io
import json
import tempfile
import threading
import urllib.error
import urllib.request
import unittest
from pathlib import Path
from PIL import Image
import commerce_api as api
import commerce_cms as cms
from http_client import Client

class CMSIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        cls.previous_database=api.DATABASE
        cls.previous_token=api.TOKEN
        cls.previous_media=cms.HOME_MEDIA
        api.DATABASE=Path(cls.tmp.name)/"cms.sqlite3"
        api.TOKEN="cms-admin-test-token"
        cms.HOME_MEDIA=Path(cls.tmp.name)/"images"
        api.init()
        cls.server=api.ThreadingHTTPServer(("127.0.0.1",0),api.Handler)
        cls.port=cls.server.server_address[1]
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.admin=Client(cls.port)
        cls.outsider=Client(cls.port)
        status,_=cls.admin.login("admin","cms-admin-test-token")
        if status!=200:raise RuntimeError("CMS test login failed")

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close()
        cms.HOME_MEDIA=cls.previous_media
        api.DATABASE=cls.previous_database;api.TOKEN=cls.previous_token
        cls.tmp.cleanup()

    def test_01_default_live_and_separate_admin_access(self):
        code,public=self.outsider.request("GET","/api/store/home")
        self.assertEqual(code,200)
        self.assertEqual(len(public["config"]["sections"]),7)
        self.assertNotIn("revision",public)
        code,data=self.outsider.request("GET","/api/admin/home")
        self.assertIn(code,(401,403))
        self.assertNotIn("config",data)
        code,private=self.admin.request("GET","/api/admin/home")
        self.assertEqual(code,200)
        self.assertEqual(private["revision"],1)
        self.assertFalse(private["draft_changed"])

    def test_02_draft_then_publication(self):
        _,state=self.admin.request("GET","/api/admin/home")
        conf=copy.deepcopy(state["config"])
        conf["sections"][0]["settings"]["title"]="Nowa kampania | sezon 2026"
        status,draft=self.admin.request("PATCH","/api/admin/home",{"config":conf,"revision":state["revision"]})
        self.assertEqual(status,200)
        self.assertTrue(draft["draft_changed"])
        _,public=self.outsider.request("GET","/api/store/home")
        self.assertNotEqual(public["config"]["sections"][0]["settings"]["title"],"Nowa kampania | sezon 2026")
        status,new=self.admin.request("POST","/api/admin/home/publish",{"revision":draft["revision"]})
        self.assertEqual(status,200)
        self.assertFalse(new["draft_changed"])
        _,live=self.outsider.request("GET","/api/store/home")
        self.assertEqual(live["config"]["sections"][0]["settings"]["title"],"Nowa kampania | sezon 2026")

    def test_03_stale_revision_and_bad_links_fail(self):
        _,state=self.admin.request("GET","/api/admin/home")
        conf=copy.deepcopy(state["config"])
        status,error=self.admin.request("PATCH","/api/admin/home",{"config":conf,"revision":1})
        self.assertEqual(status,409)
        conf["sections"][0]["settings"]["cta_url"]="javascript:alert(1)"
        status,error=self.admin.request("PATCH","/api/admin/home",{"config":conf,"revision":state["revision"]})
        self.assertEqual(status,400)
        conf["sections"][0]["settings"]["cta_url"]="/sklep"
        conf["sections"].append(copy.deepcopy(conf["sections"][0]))
        status,error=self.admin.request("PATCH","/api/admin/home",{"config":conf,"revision":state["revision"]})
        self.assertEqual(status,400)
        self.assertTrue(error.get("error"))

    def test_04_restore_creates_draft_without_publishing(self):
        _,state=self.admin.request("GET","/api/admin/home")
        status,versions=self.admin.request("GET","/api/admin/home/revisions")
        self.assertEqual(status,200)
        initial=next(x for x in versions if x["action"]=="initial")
        status,restored=self.admin.request("POST","/api/admin/home/restore",
            {"revision_id":initial["id"],"revision":state["revision"]})
        self.assertEqual(status,200)
        self.assertTrue(restored["draft_changed"])
        self.assertNotEqual(restored["config"]["sections"][0]["settings"]["title"],
                            "Nowa kampania | sezon 2026")
        _,live=self.outsider.request("GET","/api/store/home")
        self.assertEqual(live["config"]["sections"][0]["settings"]["title"],"Nowa kampania | sezon 2026")

    def test_05_uploaded_media_is_reusable_and_verified(self):
        im=Image.new("RGB",(620,420),(9,85,59))
        buff=io.BytesIO();im.save(buff,"JPEG",quality=82)
        payload="data:image/jpeg;base64,"+base64.b64encode(buff.getvalue()).decode("ascii")
        status,data=self.admin.request("POST","/api/admin/home/media",{"image":payload,"name":"background.jpg"})
        self.assertEqual(status,201)
        self.assertRegex(data["url"],r"/api/store/media/[0-9a-f]{32}\.webp$")
        code,items=self.admin.request("GET","/api/admin/home/media")
        self.assertEqual(code,200)
        self.assertEqual(items[0]["url"],data["url"])
        with urllib.request.urlopen(self.outsider.base+data["url"],timeout=5) as res:
            self.assertEqual(res.status,200)
            self.assertIn("image/webp",res.headers["Content-Type"])
            self.assertGreater(len(res.read()),100)
        status,invalid=self.admin.request("POST","/api/admin/home/media",
            {"image":"data:image/svg+xml;base64,PHN2Zz4=","name":"danger.svg"})
        self.assertEqual(status,400)

    def test_06_order_gate_unaffected(self):
        previous=os.environ.pop("ZASTAL_TEST_MODE",None)
        try:
            status,response=self.outsider.request("POST","/api/orders",{"items":[{"id":1,"size":"L","quantity":1}]})
            self.assertEqual(status,503)
            self.assertEqual(response["code"],"store_prelaunch")
        finally:
            if previous is not None:os.environ["ZASTAL_TEST_MODE"]=previous



def campaign_config(enabled=False, **changes):
    config = copy.deepcopy(cms.DEFAULT)
    config['sections'].append({'id': 'new-campaign', 'type': 'campaign', 'enabled': enabled,
        'settings': {'eyebrow': 'Kolekcja', 'title': 'Barwy klubu', 'description': '',
                     'image': '', 'image_alt': '', 'image_role': 'lifestyle',
                     'image_illustrative': True, 'product_ids': '',
                     'cta_text': 'Zobacz', 'cta_url': '/sklep', 'alignment': 'left', **changes}})
    return config


class CampaignValidation(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        import sqlite3
        self.conn = sqlite3.connect(Path(self.tmp.name) / 'campaign.sqlite3')
        self.conn.row_factory = sqlite3.Row
        self.conn.execute('CREATE TABLE products(id INTEGER PRIMARY KEY)')
        self.conn.execute('INSERT INTO products VALUES(7)')
        cms.init_schema(self.conn)
        self.conn.commit()

    def tearDown(self):
        self.conn.close(); self.tmp.cleanup()

    def ready(self, **changes):
        return campaign_config(True, **{'image': '/assets/photos/product-1.webp',
                                       'image_alt': 'Koszulka na zdjęciu', 'product_ids': '7', **changes})

    def accepts(self, function, *args):
        try: return function(*args)
        except ValueError as ex: self.fail('Valid campaign rejected: '+str(ex))

    def test_old_version_one_configs_remain_identical(self):
        before = [tuple(r) for r in self.conn.execute('SELECT * FROM site_home')]
        self.assertEqual(cms.validate(copy.deepcopy(cms.DEFAULT)), cms.DEFAULT)
        cms.init_schema(self.conn)
        self.assertEqual([tuple(r) for r in self.conn.execute('SELECT * FROM site_home')], before)
        self.assertFalse(any(section['type'] == 'campaign' for section in cms.get(self.conn)['config']['sections']))

    def test_disabled_empty_campaign_is_a_draft_without_auto_publication(self):
        config = campaign_config()
        self.assertEqual(self.accepts(cms.validate, config), config)
        self.assertEqual(self.accepts(cms.save_draft, self.conn, config, 1), 2)
        self.assertEqual(cms.get(self.conn)['config'], cms.DEFAULT)
        self.assertEqual(cms.get(self.conn, admin=True)['config'], config)
        self.assertEqual(cms.history(self.conn)[0]['action'], 'draft')

    def test_enabled_campaign_preserves_actual_and_illustrative_metadata(self):
        for illustrative in [False, True]:
            with self.subTest(illustrative=illustrative):
                config = self.ready(image_illustrative=illustrative, image_role='model')
                state = cms.get(self.conn, admin=True)
                revision = self.accepts(cms.save_draft, self.conn, config, state['revision'])
                cms.publish(self.conn, revision)
                self.assertEqual(cms.get(self.conn)['config'], config)
                self.assertIs(cms.get(self.conn)['config']['sections'][-1]['settings']['image_illustrative'], illustrative)

    def test_campaign_rejects_bad_urls_roles_types_and_missing_required_metadata(self):
        bad = [('image', ''), ('image', 'https://example.test/photo.webp'),
               ('image', '/assets/../commerce_api.py'), ('image', '/assets/%2e%2e/file'),
               ('image', '/assets/photos/missing.webp'), ('image', '/assets/photos/product-1.webp?x=1'),
               ('image', '/api/store/media/'+'a'*32+'.webp'),
               ('image_role', 'packshot'), ('image_role', []), ('image_role', 5),
               ('image_illustrative', 1), ('image_illustrative', 'false'),
               ('image_alt', ''), ('image_alt', '\nOpis'), ('image_alt', '<img src=x>'), ('image_alt', 'x'*251),
               ('product_ids', ''), ('product_ids', '9'*100), ('product_ids', '0'), ('product_ids', '-1'),
               ('product_ids', []), ('cta_url', 'javascript:alert(1)')]
        for field, value in bad:
            with self.subTest(field=field, value=value):
                config = self.ready(); config['sections'][-1]['settings'][field] = value
                with self.assertRaises(ValueError): cms.validate(config)
        missing = self.ready(); del missing['sections'][-1]['settings']['image_illustrative']
        with self.assertRaises(ValueError): cms.validate(missing)
        unknown = self.ready(); unknown['sections'][-1]['settings']['unknown'] = True
        with self.assertRaises(ValueError): cms.validate(unknown)
        self.assertEqual(cms.get(self.conn, admin=True)['revision'], 1)

    def test_missing_product_references_fail_save_and_publish_without_mutating_cms(self):
        config = self.ready(product_ids='7,999')
        before = cms.get(self.conn, admin=True)
        with self.assertRaises(ValueError): cms.save_draft(self.conn, config, 1)
        self.assertEqual(cms.get(self.conn, admin=True), before)
        revision = self.accepts(cms.save_draft, self.conn, self.ready(), 1)
        self.conn.execute('DELETE FROM products WHERE id=7')
        with self.assertRaises(ValueError): cms.publish(self.conn, revision)
        self.assertEqual(cms.get(self.conn)['config'], cms.DEFAULT)
        self.assertEqual(cms.history(self.conn)[0]['action'], 'draft')


if __name__ == "__main__": unittest.main()
