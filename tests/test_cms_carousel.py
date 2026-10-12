"""Carousel additions remain optional and cannot mutate stored legacy revisions."""
import copy
import json
import sqlite3
import unittest
import commerce_cms as cms


class HeroCarouselValidation(unittest.TestCase):
    def config(self, **fields):
        config = copy.deepcopy(cms.DEFAULT)
        config['sections'][0]['settings'].update(fields)
        return config

    def test_legacy_config_and_existing_rows_are_unchanged(self):
        conn = sqlite3.connect(':memory:'); conn.row_factory = sqlite3.Row
        cms.init_schema(conn)
        before = [tuple(row) for row in conn.execute('SELECT * FROM site_home')]
        self.assertEqual(cms.validate(self.config()), cms.DEFAULT)
        cms.init_schema(conn)
        self.assertEqual([tuple(row) for row in conn.execute('SELECT * FROM site_home')], before)
        self.assertEqual(cms.get(conn)['config'], cms.DEFAULT)
        conn.close()

    def test_optional_numbered_slides_and_options_survive_validation(self):
        config = self.config(slides_enabled=True, autoplay=False, interval_ms=9000,
            image_alt='Kibice na trybunach', image_role='lifestyle', image_illustrative=False,
            slide_2_enabled=True, slide_2_eyebrow='Bluzy', slide_2_title='Klubowe bluzy',
            slide_2_description='Z katalogu sklepu', slide_2_image='/assets/photos/product-1.webp',
            slide_2_image_alt='Zielona bluza', slide_2_image_role='packshot',
            slide_2_image_illustrative=True, slide_2_cta_text='Zobacz bluzy',
            slide_2_cta_url='/sklep?category=Bluzy', slide_3_enabled=False)
        self.assertEqual(cms.validate(config), config)

    def test_numbered_slide_draft_and_publication_remain_isolated(self):
        conn = sqlite3.connect(':memory:'); conn.row_factory = sqlite3.Row
        cms.init_schema(conn)
        config = self.config(autoplay=False, slide_2_enabled=False, slide_3_enabled=False)
        cms.save_draft(conn, config, 1)
        self.assertEqual(cms.get(conn)['config'], cms.DEFAULT)
        self.assertEqual(cms.get(conn, True)['config'], config)
        cms.publish(conn, 2)
        self.assertEqual(cms.get(conn)['config'], config)
        initial = next(item for item in cms.history(conn) if item['action'] == 'initial')
        cms.restore(conn, initial['id'], 2)
        self.assertEqual(cms.get(conn, True)['config'], cms.DEFAULT)
        self.assertEqual(cms.get(conn)['config'], config)
        conn.close()

    def test_rejects_unknown_fields_types_bounds_roles_and_unsafe_urls(self):
        invalid = [dict(slide_4_title='Too many'), dict(slides_enabled=1), dict(autoplay='true'),
            dict(interval_ms=True), dict(interval_ms=2999), dict(interval_ms=15001),
            dict(slide_2_title='x'*251), dict(slide_3_description='x'*1301),
            dict(slide_2_image_role='fashion'), dict(slide_2_image_illustrative='false'),
            dict(slide_2_cta_url='javascript:alert(1)'), dict(slide_3_cta_url='//evil.test'),
            dict(slide_2_image='/assets/../secret.webp'),
            dict(slide_2_image='/assets/%2e%2e/secret.webp'),
            dict(slide_3_image='https://evil.test/photo.jpg')]
        for fields in invalid:
            with self.subTest(fields=list(fields)):
                with self.assertRaises(ValueError): cms.validate(self.config(**fields))

    def test_enabled_custom_image_requires_description_but_disabled_draft_does_not(self):
        with self.assertRaises(ValueError):
            cms.validate(self.config(slide_2_image='/assets/photos/product-1.webp'))
        config = self.config(slide_2_enabled=False, slide_2_image='/assets/photos/product-1.webp', slide_2_image_alt='')
        self.assertEqual(cms.validate(config), config)


if __name__ == '__main__': unittest.main()
