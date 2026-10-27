"""Small real HTTP client for isolated account and commerce integration tests."""
import json
import urllib.error
import urllib.request
from http.cookies import SimpleCookie

COOKIES = ('__Host-zastal_session', '__Host-zastal_staff')


def scope_of(path):
    return 'staff' if path.startswith(('/api/admin/', '/api/staff/')) else 'customer'


class Client:
    """One browser: a shop-account cookie and a separate staff-panel cookie, each with its own CSRF token."""
    def __init__(self, port):
        self.base = 'http://127.0.0.1:' + str(port)
        self.jar = {}
        self.tokens = {'customer': '', 'staff': ''}
        self.primary = 'customer'
        self.headers = None

    @property
    def cookie(self):
        return '; '.join(f'{name}={value}' for name, value in self.jar.items())

    @cookie.setter
    def cookie(self, value):
        self.jar = dict(part.strip().split('=', 1) for part in value.split(';') if '=' in part)

    @property
    def csrf(self):
        return self.tokens['staff'] or self.tokens['customer']

    @csrf.setter
    def csrf(self, value):
        self.tokens = {'customer': value, 'staff': value}

    def request(self, method, path, data=None, headers=None, csrf=True):
        outgoing = {'Content-Type': 'application/json'}
        scope = scope_of(path)
        if self.jar:
            outgoing['Cookie'] = self.cookie
        if csrf and self.tokens[scope]:
            outgoing['X-CSRF-Token'] = self.tokens[scope]
        outgoing.update(headers or {})
        request = urllib.request.Request(
            self.base + path, method=method, headers=outgoing,
            data=json.dumps(data).encode() if data is not None else None)
        try:
            response = urllib.request.urlopen(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            self.headers = response.headers
            for header in response.headers.get_all('Set-Cookie', []):
                cookies = SimpleCookie(header)
                for name in COOKIES:
                    if name in cookies:
                        self.jar[name] = cookies[name].value
            value = json.load(response)
            if isinstance(value, dict) and 'csrf_token' in value:
                self.tokens[scope] = value['csrf_token']
            return response.status, value

    def session(self, staff=None):
        staff = self.primary == 'staff' if staff is None else staff
        return self.request('GET', '/api/staff/auth/session' if staff else '/api/auth/session')

    def login(self, identifier, password, staff=None):
        """Staff accounts sign in to the panel, customers (e-mail addresses) to the shop; `staff` overrides the guess."""
        staff = '@' not in identifier if staff is None else staff
        self.primary = 'staff' if staff else 'customer'
        self.session(staff)
        return self.request('POST', '/api/staff/auth/login' if staff else '/api/auth/login', {'identifier': identifier, 'password': password})

    def register(self, email='customer@example.test', password='Customer password 2026'):
        self.primary = 'customer'
        self.session()
        return self.request('POST', '/api/auth/register', {'email': email, 'name': 'Kibic', 'password': password})
