#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json
import subprocess
import time
import uuid
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
    'autonomous': False,
}


def dispatch_mission_to_openclaw(mission):
    title = mission.get('title', 'Missão sem título')
    desc = mission.get('desc', '')
    text = f"[MISSION CONTROL] Nova missão para execução autônoma: {title}. Contexto: {desc}"
    try:
        subprocess.Popen(
            ['openclaw', 'system', 'event', '--text', text, '--mode', 'now'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except Exception:
        return False


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
            data = load_data()
            return self._json(200, {'ok': True, 'autonomous': bool(data.get('autonomous'))})
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

            mission = {
                **payload,
                'id': payload.get('id') or f"m_{uuid.uuid4().hex[:10]}",
                'createdAt': int(time.time() * 1000),
                'executed': False,
            }
            inbox['items'] = [mission] + inbox.get('items', [])

            dispatched = False
            if data.get('autonomous'):
                dispatched = dispatch_mission_to_openclaw(mission)
                mission['executed'] = dispatched

            save_data(data)
            return self._json(200, {'ok': True, 'missionId': mission['id'], 'dispatched': dispatched})

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
            payload = self._read_json()
            enabled = bool(payload.get('enabled') or payload.get('auto_exec_enabled'))
            data = load_data()
            data['autonomous'] = enabled
            save_data(data)
            return self._json(200, {'ok': True, 'enabled': enabled})

        return self._json(404, {'ok': False, 'error': 'not found'})


if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', 8080), Handler)
    print('Mission Control server running on 0.0.0.0:8080')
    server.serve_forever()
