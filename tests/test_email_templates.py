"""Regressions for visual email layout; all data here is synthetic."""
import unittest
from commerce_email import render_html

ORIGIN = 'https://store.example.test'


class EmailLayoutTests(unittest.TestCase):
    def test_legacy_generic_subject_and_html_escaping(self):
        page = render_html('Zastal Store, zamówienie <5>', 'Status: <script>\n\n' + ORIGIN + '/konto', ORIGIN)
        self.assertIn('Zamówienie &lt;5&gt;', page)
        self.assertNotIn('<script>', page)
        self.assertIn('Status: &lt;script&gt;', page)

    def test_order_items_promo_and_totals_are_visible(self):
        body = ('Dziękujemy za zamówienie ZS-00042.\nStatus: Nowe\nDo zapłaty: 129.00 PLN\n'
                'Pozycje:\n2 × Koszulka Home / L, 120.00 PLN\n\n'
                'Dostawa: DPD\nRabat (ZASTAL10): -15.00 PLN\nRazem do zapłaty: 129.00 PLN\n\n'
                'Szczegóły zamówienia: ' + ORIGIN + '/zamowienie?id=42')
        page = render_html('Zastal Store, potwierdzenie zamówienia ZS-00042', body, ORIGIN, 'order_created')
        for part in ('Zamówienie przyjęte', 'Zamówione produkty', 'Koszulka Home',
                     'ZASTAL10', '-15.00 PLN', '129.00 PLN', 'ZS-00042', 'Sprawdź zamówienie'):
            self.assertIn(part, page)
        self.assertIn('href="' + ORIGIN + '/zamowienie?id=42"', page)

    def test_shipment_link_is_clickable_and_escaped(self):
        body = ('Zamówienie ZS-00042 zostało nadane.\nPrzewoźnik: DPD · numer przesyłki: ABC\n'
                'Śledzenie: https://tracking.example.test/?id=42&view=short\n'
                'Pozycje:\n1 × Bluza / XL, 219.00 PLN\n\nSzczegóły zamówienia: '
                + ORIGIN + '/zamowienie?id=42')
        page = render_html('Zastal Store, zamówienie ZS-00042 wysłane', body, ORIGIN, 'order_status_changed')
        self.assertIn('Śledź przesyłkę', page)
        self.assertIn('href="https://tracking.example.test/?id=42&amp;view=short"', page)
        self.assertIn('Sprawdź dostawę', page)

    def test_account_buttons_and_logo(self):
        for kind, phrase in [('email_verification', 'Potwierdź adres e-mail'),
                             ('password_reset', 'Ustaw nowe hasło'),
                             ('welcome', 'Przejdź do konta')]:
            with self.subTest(kind=kind):
                page = render_html('Zastal Store, konto', 'Otwórz konto.\n\n' + ORIGIN + '/konto', ORIGIN, kind)
                self.assertIn(phrase, page)
                self.assertIn('assets/zastal-logo-email.png', page)
                self.assertIn('Twoje konto', page)


if __name__ == '__main__':
    unittest.main()