#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA_FILE = BASE / 'data.json'

DEFAULT_DATA = {
    'agents': [],
    'columns': [
        {'name': 'Inbox', 'items': []},
        {'name': 'Assigned', 'items': []},
        {'name': 'In Progress', 'items': []},
        {'name': 'Review', 'items': []},
        {'name': 'Done', 'items': []},
    ],
    'feed': [],
}


def load_data():
    if not DATA_FILE.exists():
        return DEFAULT_DATA.copy()
    try:
        return json.loads(DATA_FILE.read_text(encoding='utf-8'))
    except Exception:
        return DEFAULT_DATA.copy()


def save_data(data):
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE), **kwargs)

    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/api/health':
            return self._json(200, {'ok': True})
        if self.path == '/api/dashboard':
            return self._json(200, load_data())
        return super().do_GET()

    def _read_json(self):
        length = int(self.headers.get('Content-Length', '0'))
        raw = self.rfile.read(length) if length else b'{}'
        try:
            return json.loads(raw.decode('utf-8'))
        except Exception:
            return {}

    def do_POST(self):
        if self.path == '/api/missions':
            payload = self._read_json()
            data = load_data()
            cols = data.get('columns', [])
            inbox = next((c for c in cols if c.get('name', '').lower() == 'inbox'), None)
            if inbox is None:
                inbox = {'name': 'Inbox', 'items': []}
                cols.insert(0, inbox)
                data['columns'] = cols
            inbox['items'] = [payload] + inbox.get('items', [])
            save_data(data)
            return self._json(200, {'ok': True})

        if self.path == '/api/dashboard/state':
            payload = self._read_json()
            board = payload.get('board')
            data = load_data()
            if isinstance(board, list):
                data['columns'] = board
                save_data(data)
                return self._json(200, {'ok': True})
            return self._json(400, {'ok': False, 'error': 'invalid board'})

        if self.path == '/api/dashboard/move':
            # movement is persisted by /api/dashboard/state in strict mode
            return self._json(200, {'ok': True})

        if self.path == '/api/autonomous/mode':
            return self._json(200, {'ok': True})

        return self._json(404, {'ok': False, 'error': 'not found'})


if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', 8080), Handler)
    print('Mission Control server running on 0.0.0.0:8080')
    server.serve_forever()
