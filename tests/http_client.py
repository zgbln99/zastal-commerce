"""Small real HTTP client for isolated account and commerce integration tests."""
import json
import urllib.error
import urllib.request
from http.cookies import SimpleCookie


class Client:
    def __init__(self, port):
        self.base = 'http://127.0.0.1:' + str(port)
        self.cookie = ''
        self.csrf = ''
        self.headers = None

    def request(self, method, path, data=None, headers=None, csrf=True):
        outgoing = {'Content-Type': 'application/json'}
        if self.cookie:
            outgoing['Cookie'] = self.cookie
        if csrf and self.csrf:
            outgoing['X-CSRF-Token'] = self.csrf
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
                if '__Host-zastal_session' in cookies:
                    self.cookie = '__Host-zastal_session=' + cookies['__Host-zastal_session'].value
            value = json.load(response)
            if isinstance(value, dict) and 'csrf_token' in value:
                self.csrf = value['csrf_token']
            return response.status, value

    def session(self):
        return self.request('GET', '/api/auth/session')

    def login(self, identifier, password):
        self.session()
        return self.request('POST', '/api/auth/login', {'identifier': identifier, 'password': password})

    def register(self, email='customer@example.test', password='Customer password 2026'):
        self.session()
        return self.request('POST', '/api/auth/register', {'email': email, 'name': 'Kibic', 'password': password})
