"""HTML version of every shop e-mail. The plain-text body stays the source of truth (and the fallback part); this
module lays it out in the shop's colours: club green header with the logo, a white card, one button for the main
link, a light box for indented detail lines, and the seller's details in the footer."""
import html
import re

GREEN, INK, MUTED, PAPER, LINE, ORANGE = '#165114', '#19231b', '#5e6d60', '#f7f8f3', '#dbe2d9', '#ef7d00'
URL = re.compile(r'(https?://[^\s<>"\']+)')
FONT = "'ZT Talk', 'Segoe UI', Arial, Helvetica, sans-serif"


def _link_text(url):
    if '/zamowienie' in url:
        return 'Otwórz zamówienie'
    if '/konto/email?action=verify' in url:
        return 'Potwierdź adres e-mail'
    if '/konto/email?action=reset' in url:
        return 'Ustaw nowe hasło'
    if '/newsletter' in url and 'wypisz' not in url:
        return 'Potwierdzam zapis'
    if '/karta-podarunkowa' in url:
        return 'Sprawdź saldo karty'
    if '/produkt/' in url:
        return 'Zobacz produkt'
    if '/admin' in url:
        return 'Otwórz panel sklepu'
    return 'Otwórz w sklepie'


def _inline(text):
    """Escaped text with URLs turned into links."""
    parts, last = [], 0
    for match in URL.finditer(text):
        parts.append(html.escape(text[last:match.start()]))
        url = match.group(1)
        parts.append(f'<a href="{html.escape(url)}" style="color:{GREEN};font-weight:600">{html.escape(url)}</a>')
        last = match.end()
    parts.append(html.escape(text[last:]))
    return ''.join(parts)


def _blocks(body):
    """Paragraphs, detail boxes (indented lines) and the primary button from the plain-text lines."""
    blocks, paragraph, box, button_done = [], [], [], False
    def flush_paragraph():
        nonlocal paragraph
        if paragraph:
            blocks.append(('p', paragraph)); paragraph = []
    def flush_box():
        nonlocal box
        if box:
            blocks.append(('box', box)); box = []
    for raw in body.split('\n'):
        line = raw.rstrip()
        if not line.strip():
            flush_paragraph(); flush_box(); continue
        stripped = line.strip()
        if line.startswith('  '):
            flush_paragraph(); box.append(stripped); continue
        flush_box()
        labelled = re.fullmatch(r'([^:]{2,60}):\s*(https?://\S+)', stripped)
        if not button_done and (URL.fullmatch(stripped) or labelled):
            flush_paragraph(); blocks.append(('button', (labelled.group(2), labelled.group(1)) if labelled else (stripped, ''))); button_done = True; continue
        if stripped.endswith(':') and len(stripped) < 60:
            flush_paragraph(); blocks.append(('h', stripped.rstrip(':'))); continue
        paragraph.append(stripped)
    flush_paragraph(); flush_box()
    return blocks


def _render_block(kind, value):
    if kind == 'p':
        strong = value[0].startswith(('Razem do zapłaty', 'Do zapłaty', 'Zapłacono', 'Kod karty', 'Status:'))
        text = '<br>'.join(_inline(line) for line in value)
        weight = 'font-weight:700;' if strong else ''
        return f'<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:{INK};{weight}">{text}</p>'
    if kind == 'h':
        return f'<p style="margin:18px 0 8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:{MUTED};font-weight:700">{html.escape(value)}</p>'
    if kind == 'box':
        rows = ''.join(f'<tr><td style="padding:6px 0;font-size:14px;line-height:1.5;color:{INK};border-bottom:1px solid {LINE}">{_inline(line)}</td></tr>' for line in value)
        return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:{PAPER};border:1px solid {LINE};border-radius:12px;padding:8px 16px">{rows}</table>'
    if kind == 'button':
        url, caption = value
        label = _link_text(url)
        lead = f'<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:{INK}">{html.escape(caption)}</p>' if caption and caption.casefold() not in ('szczegóły zamówienia', 'link', 'saldo sprawdzisz tutaj') else ''
        return (lead + f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="background:{GREEN};border-radius:10px">'
                f'<a href="{html.escape(url)}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">{label}</a></td></tr></table>'
                f'<p style="margin:-10px 0 18px;font-size:12px;color:{MUTED};word-break:break-all">Link: <a href="{html.escape(url)}" style="color:{MUTED}">{html.escape(url)}</a></p>')
    return ''


def render(subject, body, origin, seller=None, preheader=''):
    """Complete HTML document for one message."""
    title = re.sub(r'^Zastal Store,\s*', '', subject).strip()
    title = title[:1].upper() + title[1:]
    seller = seller or {}
    footer_bits = [html.escape(seller.get('seller_name') or 'Zastal Zielona Góra')]
    if seller.get('business_address'):
        footer_bits.append(html.escape(seller['business_address']))
    contact = ' · '.join(html.escape(x) for x in (seller.get('support_email', ''), seller.get('support_phone', '')) if x)
    content = ''.join(_render_block(kind, value) for kind, value in _blocks(body))
    logo = html.escape(origin.rstrip('/') + '/assets/icon-192.png')
    return f'''<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title></head>
<body style="margin:0;padding:0;background:{PAPER};font-family:{FONT};color:{INK}">
<span style="display:none;max-height:0;overflow:hidden;color:transparent">{html.escape(preheader or title)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{PAPER}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="background:{GREEN};border-radius:16px 16px 0 0;padding:22px 28px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px"><img src="{logo}" width="44" height="44" alt="" style="display:block;border-radius:10px"></td>
<td style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:.08em">ZASTAL STORE<div style="font-size:11px;font-weight:400;letter-spacing:.12em;color:#d7e7d5;text-transform:uppercase;margin-top:2px">Oficjalny sklep klubu</div></td>
</tr></table></td></tr>
<tr><td style="background:#ffffff;padding:30px 28px 10px;border-left:1px solid {LINE};border-right:1px solid {LINE}">
<h1 style="margin:0 0 18px;font-size:24px;line-height:1.2;font-weight:700;color:{INK}">{html.escape(title)}</h1>
{content}
</td></tr>
<tr><td style="background:#ffffff;border:1px solid {LINE};border-top:0;border-radius:0 0 16px 16px;padding:18px 28px 24px">
<p style="margin:0;font-size:12px;line-height:1.6;color:{MUTED}">{' · '.join(footer_bits)}{('<br>' + contact) if contact else ''}<br><a href="{html.escape(origin)}" style="color:{GREEN}">{html.escape(origin.replace('https://', '').replace('http://', ''))}</a></p>
</td></tr>
<tr><td style="padding:16px 8px 0;font-size:11px;line-height:1.5;color:{MUTED};text-align:center">Ta wiadomość została wysłana automatycznie przez sklep Zastalu Zielona Góra. Odpowiedź na nią trafi do obsługi sklepu.</td></tr>
</table></td></tr></table>
</body></html>'''


SAMPLES = {
    'order_created': ('Zastal Store, potwierdzenie zamówienia ZS-00042', 'Dziękujemy za zamówienie ZS-00042.\nStatus: Oczekuje na płatność\nDo zapłaty: 124.99 PLN\n\nDane do przelewu:\n  Odbiorca: Zastal Zielona Góra S.A.\n  Numer rachunku: PL61 1090 1014 0000 0712 1981 2874\n  Tytuł: ZS-00042\n  Kwota: 124.99 PLN\n\nZamówienie czeka na wpłatę przez 14 dni; potem zostanie anulowane.\n\nPozycje:\n  1 × Bluza Zastal Logo / M, 99.00 PLN\n  1 × Brelok Dziczek 3D / UNI, 30.00 PLN\n\nDostawa: Automat paczkowy\nRabat (KIBIC10): -12.90 PLN\nRazem do zapłaty: 124.99 PLN\n\nSzczegóły zamówienia: {origin}/zamowienie?id=42&token=przyklad\n'),
    'order_paid': ('Zastal Store, płatność za ZS-00042 przyjęta', 'Otrzymaliśmy płatność za zamówienie ZS-00042 (124.99 PLN).\nPrzekazujemy je do realizacji.\n\nSzczegóły zamówienia: {origin}/zamowienie?id=42&token=przyklad\n'),
    'pickup_ready': ('Zastal Store, zamówienie ZS-00042 czeka na odbiór', 'Zamówienie ZS-00042 jest spakowane i czeka na Ciebie w sklepie klubowym.\nAdres: Sklep klubowy, CRS, ul. Sulechowska 41, Zielona Góra\nGodziny odbioru: pn–pt 10:00–18:00, dni meczowe od 16:00\nPrzy odbiorze podaj numer zamówienia.\n\nSzczegóły zamówienia: {origin}/zamowienie?id=42&token=przyklad\n'),
    'shipped': ('Zastal Store, zamówienie ZS-00042 wysłane', 'Zamówienie ZS-00042 zostało wysłane.\nPrzewoźnik: InPost\nNumer przesyłki: 620000012345678901234567\nŚledzenie: https://inpost.pl/sledzenie-przesylek?number=620000012345678901234567\n\nSzczegóły zamówienia: {origin}/zamowienie?id=42&token=przyklad\n'),
    'email_verification': ('Zastal Store, potwierdź adres e-mail', 'Potwierdź adres e-mail swojego konta Zastal Store:\n\n{origin}/konto/email?action=verify#token=przyklad\n\nLink jest jednorazowy i ważny przez 24 godziny.\nJeżeli nie tworzono konta, zignoruj tę wiadomość.'),
    'gift_card_issued': ('Karta podarunkowa Zastal Store o wartości 100.00 PLN', 'Masz kartę podarunkową do oficjalnego sklepu Zastalu Zielona Góra o wartości 100.00 PLN.\n\nKod karty: ZG-7K2M-9QPA-X4WB\nWażna do: 2027-10-24\n\nWiadomość od nadawcy:\nWszystkiego najlepszego! Do zobaczenia w hali.\n\nJak użyć: w sklepie online wpisz kod w polu „Karta podarunkowa” w podsumowaniu zamówienia;\nw sklepie klubowym pokaż kod przy kasie. Kartę można wykorzystać w kilku zakupach, aż do wyczerpania salda.\nSaldo sprawdzisz tutaj: {origin}/karta-podarunkowa\n\nKarta nie podlega wymianie na gotówkę.\n'),
    'newsletter_confirm': ('Zastal Store, potwierdź zapis do newslettera', 'Potwierdź zapis do newslettera sklepu Zastal Zielona Góra:\n\n{origin}/newsletter?token=przyklad\n\nLink jest ważny przez 72 godziny. Będziemy pisać tylko o nowościach, premierach i promocjach w sklepie klubowym.\nJeżeli to nie Ty podałeś ten adres, zignoruj tę wiadomość: bez potwierdzenia nic nie wyślemy.\n\nWypisanie się: {origin}/newsletter?token=przyklad&action=wypisz\n'),
    'price_alert': ('Bluza Zastal Retro w niższej cenie', 'Bluza Zastal Retro kosztuje teraz 89.00 PLN zamiast 99.00 PLN.\n\n{origin}/produkt/bluza-zastal-retro\n\nTę wiadomość wysłaliśmy jednorazowo na Twoją prośbę o powiadomienie o obniżce.'),
    'cart_reminder': ('Twój koszyk w Zastal Store czeka', 'Zostawiłeś/aś w koszyku:\n  Bluza Zastal Logo, rozmiar L\n  Worek sportowy Zastal, 2 szt.\n\nWróć do koszyka: {origin}/koszyk?przywroc=przyklad\n\nProdukty nie są zarezerwowane; stany mogą się zmienić.\nTo jednorazowe przypomnienie wysłane na podstawie zgody marketingowej z formularza zamówienia albo zapisu do newslettera.'),
    'stock_alert': ('Bluza Zastal Retro w rozmiarze L jest znów dostępna', 'Bluza Zastal Retro w rozmiarze L wróciła do sklepu Zastalu.\n\n{origin}/produkt/bluza-zastal-retro\n\nIlość jest ograniczona, więc nie czekaj zbyt długo.\nTę wiadomość wysłaliśmy jednorazowo na Twoją prośbę.'),
    'withdrawal_ack': ('Zastal Store, potwierdzenie odstąpienia od umowy (ZS-00042)', 'Dzień dobry,\n\npotwierdzamy, że 2026-10-27 12:30 UTC otrzymaliśmy Twoje oświadczenie o odstąpieniu od umowy dotyczącej zamówienia ZS-00042 (całości zamówienia).\n\nCo dalej: sprawdzimy zamówienie i odpowiemy e-mailem.\n\nSklep Zastalu Zielona Góra\n{origin}\n'),
    'contact_ack': ('Zastal Store, otrzymaliśmy Twoją wiadomość', 'Dzień dobry,\n\notrzymaliśmy Twoją wiadomość w sprawie zamówienia ZS-00042. Odpowiemy e-mailem, zwykle w ciągu jednego dnia roboczego.\n\nTreść wiadomości:\nCzy koszulka będzie dostępna w rozmiarze XXL przed meczem?\n\nSklep Zastalu Zielona Góra\n{origin}\n'),
}


def sample(kind, origin, seller=None):
    subject, body = SAMPLES.get(kind, SAMPLES['order_created'])
    return render(subject, body.replace('{origin}', origin.rstrip('/')), origin, seller)
