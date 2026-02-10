#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json
import subprocess
import time
import uuid
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA_FILE = BASE / 'data.json'
TRAIL_FILE = BASE / 'MISSOES_TRAJETO.md'

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
    owner = mission.get('owner', 'Stark')
    text = f"[MISSION CONTROL] Execução autônoma: {title} | Responsável: {owner}. Contexto: {desc}"
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


def ensure_trail_file():
    if TRAIL_FILE.exists():
        return
    TRAIL_FILE.write_text(
        "# Missões — Trajeto Completo\n\n"
        "Este arquivo guarda o histórico completo de cada missão (um card por missão).\n\n",
        encoding='utf-8',
    )


def append_trail_entry(mission_id, title, line):
    ensure_trail_file()
    text = TRAIL_FILE.read_text(encoding='utf-8')
    marker = f"## CARD {mission_id} — {title}"
    if marker not in text:
        text += (
            f"\n{marker}\n"
            f"- Status: criado\n"
            f"- Trajeto:\n"
        )
    ts = time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())
    text += f"  - [{ts}] {line}\n"
    TRAIL_FILE.write_text(text, encoding='utf-8')


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

            data.setdefault('missionIndex', {})
            key = payload.get('cardId') or payload.get('title') or mission['id']
            data['missionIndex'][str(key)] = mission['id']

            append_trail_entry(mission['id'], mission.get('title', 'Missão sem título'), 'Missão criada via Broadcast e enviada para Inbox.')

            dispatched = False
            if data.get('autonomous'):
                dispatched = dispatch_mission_to_openclaw(mission)
                mission['executed'] = dispatched
                append_trail_entry(
                    mission['id'],
                    mission.get('title', 'Missão sem título'),
                    'Despacho autônomo para OpenClaw executado.' if dispatched else 'Falha no despacho autônomo para OpenClaw.'
                )

            save_data(data)
            return self._json(200, {'ok': True, 'missionId': mission['id'], 'dispatched': dispatched})

        if self.path == '/api/dashboard/state':
            payload = self._read_json()
            board = payload.get('board')
            data = load_data()
            if isinstance(board, list):
                data['columns'] = board

                action = payload.get('action', 'update')
                title = payload.get('title') or 'Missão sem título'
                card_id = str(payload.get('cardId') or title)
                mission_id = data.get('missionIndex', {}).get(card_id) or card_id

                if action == 'move':
                    append_trail_entry(
                        mission_id,
                        title,
                        f"Movida de {payload.get('fromColumn', '?')} para {payload.get('toColumn', '?')}."
                    )
                elif action in ('approve', 'autonomous_approve'):
                    append_trail_entry(mission_id, title, 'Aprovada por Jarvis.')
                elif action == 'auto_delegate' and payload.get('title'):
                    append_trail_entry(mission_id, title, 'Delegação automática executada por Stark.')
                elif action == 'autonomous_move':
                    from_col = payload.get('from', '?')
                    to_col = payload.get('to', '?')
                    owner = payload.get('owner', 'Stark')
                    append_trail_entry(
                        mission_id,
                        title,
                        f"Fluxo autônomo: {from_col} → {to_col} (owner: {owner})."
                    )
                    if str(to_col).lower() == 'in_progress':
                        dispatched = dispatch_mission_to_openclaw({
                            'title': title,
                            'desc': payload.get('desc', ''),
                            'owner': owner,
                        })
                        append_trail_entry(
                            mission_id,
                            title,
                            'Despacho real para OpenClaw enviado.' if dispatched else 'Falha ao despachar para OpenClaw.'
                        )
                elif action == 'broadcast_inbox':
                    append_trail_entry(mission_id, title, 'Confirmada no estado do board (Inbox).')
                elif action == 'effectiveness_reopen':
                    append_trail_entry(mission_id, title, 'Alfred reabriu a missão para garantir efetividade real antes do Done final.')

                save_data(data)
                return self._json(200, {'ok': True, 'trailFile': '/MISSOES_TRAJETO.md'})
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
