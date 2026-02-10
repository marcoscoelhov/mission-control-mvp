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
        {'name': 'Blocked', 'items': []},
        {'name': 'Failed', 'items': []},
        {'name': 'Needs Clarification', 'items': []},
        {'name': 'Needs Monarca Decision', 'items': []},
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


def infer_mission_kind(title, desc):
    t = f"{title} {desc}".lower()
    if 'sitegpt' in t and ('remova' in t or 'remove' in t):
        return 'remove_sitegpt_badge'
    if 'header' in t and ('numero' in t or 'número' in t):
        return 'header_real_numbers'
    if 'chat' in t and 'agente' in t:
        return 'agent_chat_toggle'
    if 'tela infinita' in t or 'scroll infinito' in t:
        if 'doc' in t or 'bloco' in t:
            return 'infinite_reading'
        return 'dashboard_infinite_scroll'
    if 'infinita' in t and 'leitura' in t:
        return 'infinite_reading'
    return 'manual_required'


def apply_mission_effect(mission):
    title = mission.get('title', '')
    desc = mission.get('desc', '')
    kind = mission.get('kind') or infer_mission_kind(title, desc)

    index_path = BASE / 'index.html'
    styles_path = BASE / 'styles.css'

    evidence = []
    changed = False

    if kind == 'remove_sitegpt_badge':
        html = index_path.read_text(encoding='utf-8')
        if '<span class="badge">SiteGPT</span>' in html:
            html = html.replace('<span class="badge">SiteGPT</span>', '')
            index_path.write_text(html, encoding='utf-8')
            changed = True
            evidence.append('badge SiteGPT removida do header')
        else:
            evidence.append('badge SiteGPT já estava removida')

    elif kind == 'header_real_numbers':
        html = index_path.read_text(encoding='utf-8')
        ok_agents = 'id="agents-active-value"' in html
        ok_tasks = 'id="tasks-queue-value"' in html
        if ok_agents and ok_tasks:
            evidence.append('header já usa contadores dinâmicos reais')
        else:
            evidence.append('header ainda sem ids dinâmicos esperados')
            return False, kind, evidence

    elif kind == 'agent_chat_toggle':
        html = index_path.read_text(encoding='utf-8')
        if '>Chat<' in html:
            evidence.append('aba Chat já existe e está visível')
        else:
            evidence.append('aba Chat não encontrada no header')
            return False, kind, evidence

    elif kind == 'infinite_reading':
        css = styles_path.read_text(encoding='utf-8')
        target = '.doc-block pre {\n  margin: 0;\n  white-space: pre-wrap;\n  font-size: 11px;\n  color: #c9d4ea;\n  max-height: 180px;\n  overflow: auto;\n}'
        if target in css:
            css = css.replace(target, '.doc-block pre {\n  margin: 0;\n  white-space: pre-wrap;\n  font-size: 11px;\n  color: #c9d4ea;\n  max-height: none;\n  overflow: visible;\n}')
            styles_path.write_text(css, encoding='utf-8')
            changed = True
            evidence.append('modo leitura infinita aplicado em .doc-block pre')
        elif 'max-height: none;' in css:
            evidence.append('modo leitura infinita já estava ativo')
        else:
            evidence.append('bloco alvo de leitura infinita não encontrado')
            return False, kind, evidence

    elif kind == 'dashboard_infinite_scroll':
        css = styles_path.read_text(encoding='utf-8')
        changed_local = False
        if 'body {\n  overflow: hidden;\n}' in css:
            css = css.replace('body {\n  overflow: hidden;\n}', 'body {\n  overflow: auto;\n}')
            changed_local = True
            evidence.append('overflow global do body alterado para auto (scroll infinito)')
        if '.workspace {\n  display: grid;' in css and 'min-height: calc(100vh - 116px);' in css:
            css = css.replace('min-height: calc(100vh - 116px);', 'min-height: max-content;')
            changed_local = True
            evidence.append('workspace sem trava de altura fixa')
        if changed_local:
            styles_path.write_text(css, encoding='utf-8')
            changed = True
        else:
            evidence.append('scroll infinito do dashboard já estava ativo')

    else:
        evidence.append('missão exige execução manual/específica (kind não automatizado)')
        return False, kind, evidence

    return True, kind, evidence


def find_mission_ref(data, title=None, card_id=None):
    cols = data.get('columns', [])
    for c in cols:
        items = c.get('items', []) or []
        for i, m in enumerate(items):
            mc = str(m.get('cardId', '')).strip().lower()
            mid = str(m.get('id', '')).strip().lower()
            if card_id:
                needle = str(card_id).strip().lower()
                if (mc and mc == needle) or (mid and mid == needle):
                    return c, i, m
    # fallback by title only if unique match
    if title:
        needle = str(title).strip().lower()
        matches = []
        for c in cols:
            for i, m in enumerate(c.get('items', []) or []):
                mt = str(m.get('title', '')).strip().lower()
                if mt and mt == needle:
                    matches.append((c, i, m))
        if len(matches) == 1:
            return matches[0]
    return None, None, None


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
        if self.path == '/api/openclaw/agents/details':
            details = BASE / 'openclaw-agents-details.json'
            if details.exists():
                try:
                    return self._json(200, json.loads(details.read_text(encoding='utf-8')))
                except Exception:
                    return self._json(500, {'ok': False, 'error': 'invalid_agents_details'})
            return self._json(404, {'ok': False, 'error': 'agents_details_not_found'})
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

            mission_id = payload.get('id') or f"m_{uuid.uuid4().hex[:10]}"
            title = payload.get('title', 'Missão sem título')
            desc = payload.get('desc', '')
            kind = payload.get('kind') or infer_mission_kind(title, desc)

            mission = {
                **payload,
                'id': mission_id,
                'cardId': payload.get('cardId') or mission_id,
                'kind': kind,
                'targetFile': payload.get('targetFile', ''),
                'expectedChange': payload.get('expectedChange', ''),
                'acceptanceTest': payload.get('acceptanceTest', ''),
                'createdAt': int(time.time() * 1000),
                'executed': False,
            }
            inbox['items'] = [mission] + inbox.get('items', [])

            data.setdefault('missionIndex', {})
            data['missionIndex'][str(mission['id'])] = mission['id']
            data['missionIndex'][str(mission['cardId'])] = mission['id']

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

        if self.path == '/api/missions/execute':
            payload = self._read_json()
            data = load_data()
            title = payload.get('title')
            card_id = payload.get('cardId')
            if not card_id:
                return self._json(400, {'ok': False, 'error': 'missing_card_id'})
            col, idx, mission = find_mission_ref(data, title=title, card_id=card_id)
            if mission is None:
                return self._json(404, {'ok': False, 'error': 'mission_not_found'})

            ok, kind, evidence = apply_mission_effect(mission)
            mission['kind'] = kind
            mission['effective'] = bool(ok)
            mission['executed'] = bool(ok)
            mission['effectEvidence'] = evidence

            status = 'effective'
            needs_user_action = ''
            if not ok:
                if kind == 'manual_required':
                    status = 'needs_clarification'
                    needs_user_action = 'Missão ambígua. Defina escopo, arquivo-alvo e critério de sucesso.'
                else:
                    status = 'failed'
                    needs_user_action = 'Execução técnica falhou. Revisar evidência e ajustar missão.'
            mission['executionStatus'] = status
            mission['needsUserAction'] = needs_user_action

            if col is not None and idx is not None:
                col['items'][idx] = mission

            mission_id = mission.get('id') or mission.get('cardId') or mission.get('title', 'unknown')
            append_trail_entry(mission_id, mission.get('title', 'Missão sem título'), f"Execução ({kind}): {'OK' if ok else 'FALHOU'} | {'; '.join(evidence)}")
            if needs_user_action:
                append_trail_entry(mission_id, mission.get('title', 'Missão sem título'), f"Ação necessária: {needs_user_action}")

            save_data(data)
            return self._json(200, {'ok': ok, 'kind': kind, 'evidence': evidence, 'status': status, 'needsUserAction': needs_user_action})

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
                elif action == 'effectiveness_ok':
                    append_trail_entry(mission_id, title, 'Efetividade real validada; liberada para seguir no fluxo.')

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
