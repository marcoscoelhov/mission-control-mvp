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
MISSION_FILE = BASE / 'MISSAO.md'
CHAT_FILE = BASE / 'agent-chat.json'
WHATSAPP_TARGETS = ['556699819658', '5566999819658']
WHATSAPP_CLARIFY_ENABLED = False  # default off to avoid spam; enable only when explicitly needed

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
    'missionIndex': {},
}


def now_ms():
    return int(time.time() * 1000)


def mission_guard_prefix():
    if not MISSION_FILE.exists():
        return 'Siga estritamente MISSAO.md do dashboard.'
    txt = MISSION_FILE.read_text(encoding='utf-8', errors='ignore')[:600]
    return f"Siga estritamente esta missão do Reino antes de executar: {txt}"


def dispatch_mission_to_openclaw(mission):
    title = mission.get('title', 'Missão sem título')
    desc = mission.get('desc', '')
    owner = mission.get('owner', 'Stark')
    guard = mission_guard_prefix()
    mission_id = mission.get('id', 'unknown')
    text = (
        f"[MISSION CONTROL] Execução autônoma: {title} | missionId={mission_id} | Responsável: {owner}. "
        f"Contexto: {desc}. {guard}"
    )
    try:
        subprocess.Popen(
            ['openclaw', 'system', 'event', '--text', text, '--mode', 'now'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except Exception:
        return False


def ask_whatsapp_clarification(mission, reason):
    if not WHATSAPP_CLARIFY_ENABLED:
        return False

    title = mission.get('title', 'Missão sem título')
    desc = mission.get('desc', '')
    missing = mission.get('missingContext') or 'Objetivo final, arquivo-alvo e critério de sucesso'
    msg = (
        f"[Oráculo] Falta contexto para: {title}\n"
        f"Mission ID: {mission.get('id', 'unknown')}\n"
        f"O que falta: {missing}\n"
        f"Motivo: {reason}\n"
        f"Resumo: {desc}\n\n"
        "Responda neste formato (1 mensagem):\n"
        "OBJETIVO: ...\n"
        "ARQUIVO-ALVO: ...\n"
        "SUCESSO: ..."
    )
    ok = False
    for target in WHATSAPP_TARGETS:
        try:
            r = subprocess.run(
                ['openclaw', 'message', 'send', '--channel', 'whatsapp', '--target', target, '--message', msg],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=20,
            )
            if r.returncode == 0:
                ok = True
                break
        except Exception:
            pass
    return ok


def load_data():
    if not DATA_FILE.exists():
        return json.loads(json.dumps(DEFAULT_DATA))
    try:
        return json.loads(DATA_FILE.read_text(encoding='utf-8'))
    except Exception:
        return json.loads(json.dumps(DEFAULT_DATA))


def save_data(data):
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def load_chat():
    if not CHAT_FILE.exists():
        return {'messages': []}
    try:
        return json.loads(CHAT_FILE.read_text(encoding='utf-8'))
    except Exception:
        return {'messages': []}


def save_chat(data):
    CHAT_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


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


def triage_with_oraculo(title, desc, priority='p2'):
    prompt = (
        "Você é Oráculo do Mission Control. Analise a missão e retorne APENAS JSON com chaves: "
        "kind, owner, confidence, needsClarification, missingContext, targetFile, expectedChange, acceptanceTest. "
        "Sem texto extra. "
        f"Missão: título='{title}', descrição='{desc}', prioridade='{priority}'."
    )
    try:
        r = subprocess.run(
            ['openclaw', 'agent', '--agent', 'stark', '--message', prompt, '--json', '--timeout', '45'],
            capture_output=True,
            text=True,
            timeout=55,
        )
        raw = (r.stdout or '').strip()
        if r.returncode == 0 and raw:
            try:
                data = json.loads(raw)
                txt = json.dumps(data, ensure_ascii=False)
            except Exception:
                txt = raw
            start = txt.find('{')
            end = txt.rfind('}')
            if start >= 0 and end > start:
                obj = json.loads(txt[start:end+1])
                return {
                    'kind': obj.get('kind') or infer_mission_kind(title, desc),
                    'owner': obj.get('owner') or 'Oráculo',
                    'confidence': float(obj.get('confidence', 0.6) or 0.6),
                    'needsClarification': bool(obj.get('needsClarification', False)),
                    'missingContext': obj.get('missingContext', ''),
                    'targetFile': obj.get('targetFile', ''),
                    'expectedChange': obj.get('expectedChange', ''),
                    'acceptanceTest': obj.get('acceptanceTest', ''),
                    'source': 'llm',
                }
    except Exception:
        pass

    kind = infer_mission_kind(title, desc)
    return {
        'kind': kind,
        'owner': 'Oráculo' if kind == 'manual_required' else ('Wanda' if 'ui' in kind or 'scroll' in kind else 'Alfred'),
        'confidence': 0.45,
        'needsClarification': kind == 'manual_required',
        'missingContext': 'Objetivo final, arquivo-alvo e critério de sucesso',
        'targetFile': '',
        'expectedChange': '',
        'acceptanceTest': '',
        'source': 'fallback',
    }


def normalize_execution(mission, default_agent='Oráculo'):
    execution = mission.get('execution') if isinstance(mission.get('execution'), dict) else {}
    evidence = execution.get('evidence', mission.get('effectEvidence', []))
    if not isinstance(evidence, list):
        evidence = []
    status = execution.get('status') or mission.get('executionStatus') or 'pending'
    started = execution.get('startedAt')
    ended = execution.get('endedAt')
    normalized = {
        'sessionId': execution.get('sessionId') or mission.get('sessionId') or None,
        'agent': execution.get('agent') or mission.get('owner') or default_agent,
        'startedAt': started,
        'endedAt': ended,
        'updatedAt': execution.get('updatedAt') or now_ms(),
        'status': status,
        'evidence': [str(x) for x in evidence if str(x).strip()],
    }
    mission['execution'] = normalized
    mission['executionStatus'] = normalized['status']
    mission['effectEvidence'] = normalized['evidence']
    mission['effective'] = bool(mission.get('effective')) or normalized['status'] == 'effective'
    return normalized


def has_execution_proof(mission):
    ex = normalize_execution(mission)
    status = str(ex.get('status') or '').lower()
    return status == 'effective' and len(ex.get('evidence') or []) > 0


def apply_mission_effect(mission):
    title = mission.get('title', '')
    desc = mission.get('desc', '')
    kind = mission.get('kind') or infer_mission_kind(title, desc)

    index_path = BASE / 'index.html'
    styles_path = BASE / 'styles.css'

    evidence = []

    if kind == 'remove_sitegpt_badge':
        html = index_path.read_text(encoding='utf-8')
        if '<span class="badge">SiteGPT</span>' in html:
            html = html.replace('<span class="badge">SiteGPT</span>', '')
            index_path.write_text(html, encoding='utf-8')
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
        else:
            evidence.append('scroll infinito do dashboard já estava ativo')

    else:
        evidence.append('missão exige execução manual/específica (kind não automatizado)')
        return False, kind, evidence

    return True, kind, evidence


def should_send_clarification(data, mission):
    now = int(time.time())
    mission_id = str(mission.get('id') or 'unknown')
    digest = f"{mission.get('title','')}|{mission.get('desc','')}".strip().lower()

    data.setdefault('clarificationLocks', {})
    lock = data['clarificationLocks'].get(mission_id) or {}
    if lock.get('asked'):
        return False

    last_by_digest = data.setdefault('clarificationDigest', {}).get(digest)
    if last_by_digest and (now - int(last_by_digest)) < 1800:
        return False

    data['clarificationLocks'][mission_id] = {'asked': True, 'askedAt': now}
    data['clarificationDigest'][digest] = now
    return True


def ensure_mission_id(mission):
    mid = str(mission.get('id') or '').strip()
    if not mid:
        mid = f"m_{uuid.uuid4().hex[:10]}"
    mission['id'] = mid
    mission['cardId'] = mid
    return mid


def ensure_execution_defaults(mission):
    mission_id = ensure_mission_id(mission)
    mission.setdefault('createdAt', now_ms())
    ex = normalize_execution(mission, default_agent=mission.get('owner', 'Oráculo'))
    if not ex.get('startedAt'):
        ex['startedAt'] = mission.get('createdAt')
    mission['execution'] = ex
    return mission_id


def build_mission_index(data):
    idx = {}
    for col in data.get('columns', []) or []:
        for mission in col.get('items', []) or []:
            mid = ensure_mission_id(mission)
            idx[mid] = mid
    data['missionIndex'] = idx
    return idx


def get_column(data, key_name, fallback_label=None):
    cols = data.get('columns', [])
    lower = key_name.lower().strip()
    col = next((c for c in cols if str(c.get('name', '')).lower().strip() == lower), None)
    if col is None and fallback_label:
        col = {'name': fallback_label, 'items': []}
        cols.append(col)
        data['columns'] = cols
    return col


def find_mission_ref(data, mission_id):
    if not mission_id:
        return None, None, None
    needle = str(mission_id).strip().lower()
    for c in data.get('columns', []) or []:
        for i, m in enumerate(c.get('items', []) or []):
            mid = str(m.get('id', '')).strip().lower()
            if mid == needle:
                return c, i, m
    return None, None, None


def route_without_proof(data, mission, reason):
    needs_clar = str(mission.get('kind') or 'manual_required') == 'manual_required'
    target = get_column(data, 'Needs Clarification', 'Needs Clarification') if needs_clar else get_column(data, 'Failed', 'Failed')

    ex = normalize_execution(mission)
    ex['status'] = 'needs_clarification' if needs_clar else 'failed'
    ex['updatedAt'] = now_ms()
    if not ex.get('endedAt'):
        ex['endedAt'] = now_ms()
    mission['execution'] = ex
    mission['executionStatus'] = ex['status']
    mission['effective'] = False
    mission['needsEffectiveness'] = True
    mission['needsUserAction'] = (
        'Falta prova de execução (evidence[] + status effective). Informe objetivo, arquivo-alvo e critério de sucesso.'
        if needs_clar else
        'Falta prova de execução (evidence[] + status effective). Reexecutar e anexar evidências reais.'
    )

    target['items'] = [mission] + (target.get('items', []) or [])
    append_trail_entry(mission.get('id', 'unknown'), mission.get('title', 'Missão sem título'), f"Bloqueado Done sem proof: {reason}")


def enforce_done_proof(data):
    done = get_column(data, 'Done')
    if not done:
        return
    kept = []
    for mission in done.get('items', []) or []:
        ensure_execution_defaults(mission)
        if has_execution_proof(mission):
            kept.append(mission)
        else:
            route_without_proof(data, mission, 'Card chegou em Done sem executionProof válido')
    done['items'] = kept


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
            data = load_data()
            build_mission_index(data)
            for c in data.get('columns', []) or []:
                for m in c.get('items', []) or []:
                    ensure_execution_defaults(m)
            return self._json(200, data)
        if self.path == '/api/chat':
            return self._json(200, load_chat())
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
            inbox = get_column(data, 'Inbox', 'Inbox')

            mission_id = str(payload.get('id') or payload.get('missionId') or f"m_{uuid.uuid4().hex[:10]}")
            title = payload.get('title', 'Missão sem título')
            desc = payload.get('desc', '')
            priority = payload.get('priority', 'p2')
            triage = triage_with_oraculo(title, desc, priority)

            text_words = len((f"{title} {desc}".strip()).split())
            needs_clar = bool(triage.get('needsClarification', False))
            if triage.get('confidence', 0) >= 0.8:
                needs_clar = False
            if (triage.get('kind') or infer_mission_kind(title, desc)) != 'manual_required':
                needs_clar = False
            if text_words >= 8:
                needs_clar = False

            mission = {
                **payload,
                'id': mission_id,
                'cardId': mission_id,
                'kind': triage.get('kind') or infer_mission_kind(title, desc),
                'owner': triage.get('owner') or payload.get('owner', 'Oráculo'),
                'confidence': triage.get('confidence', 0.5),
                'needsClarification': needs_clar,
                'missingContext': triage.get('missingContext', ''),
                'targetFile': triage.get('targetFile') or payload.get('targetFile', ''),
                'expectedChange': triage.get('expectedChange') or payload.get('expectedChange', ''),
                'acceptanceTest': triage.get('acceptanceTest') or payload.get('acceptanceTest', ''),
                'triageSource': triage.get('source', 'fallback'),
                'createdAt': now_ms(),
                'executed': False,
                'effective': False,
                'needsEffectiveness': True,
                'execution': {
                    'sessionId': None,
                    'agent': triage.get('owner') or payload.get('owner', 'Oráculo'),
                    'startedAt': now_ms(),
                    'endedAt': None,
                    'updatedAt': now_ms(),
                    'status': 'needs_clarification' if needs_clar else 'pending',
                    'evidence': [],
                },
            }

            if mission.get('needsClarification'):
                clar = get_column(data, 'Needs Clarification', 'Needs Clarification')
                can_ask = should_send_clarification(data, mission)
                sent = ask_whatsapp_clarification(mission, mission.get('missingContext') or 'Contexto insuficiente') if can_ask else False
                mission['clarificationAsked'] = bool(sent)
                mission['clarificationSkipped'] = (not can_ask)
                mission['executionStatus'] = 'needs_clarification'
                mission['needsUserAction'] = mission.get('missingContext') or 'Responder contexto no WhatsApp.'
                clar['items'] = [mission] + (clar.get('items', []) or [])
                append_trail_entry(mission['id'], mission.get('title', 'Missão sem título'), 'Oráculo classificou como ambígua e pediu contexto no WhatsApp.')
            else:
                inbox['items'] = [mission] + (inbox.get('items', []) or [])
                append_trail_entry(mission['id'], mission.get('title', 'Missão sem título'), 'Missão criada via Broadcast e enviada para Inbox.')

            build_mission_index(data)

            dispatched = False
            if data.get('autonomous') and not mission.get('needsClarification'):
                dispatched = dispatch_mission_to_openclaw(mission)
                mission['executed'] = dispatched
                append_trail_entry(
                    mission['id'],
                    mission.get('title', 'Missão sem título'),
                    'Despacho autônomo para OpenClaw executado.' if dispatched else 'Falha no despacho autônomo para OpenClaw.'
                )

            save_data(data)
            return self._json(200, {
                'ok': True,
                'missionId': mission['id'],
                'dispatched': dispatched,
                'needsClarification': bool(mission.get('needsClarification')),
                'triageSource': mission.get('triageSource', 'fallback'),
            })

        if self.path == '/api/missions/proof':
            payload = self._read_json()
            mission_id = str(payload.get('missionId') or '').strip()
            if not mission_id:
                return self._json(400, {'ok': False, 'error': 'missing_mission_id'})

            data = load_data()
            col, idx, mission = find_mission_ref(data, mission_id)
            if mission is None:
                return self._json(404, {'ok': False, 'error': 'mission_not_found'})

            ex = normalize_execution(mission)
            if payload.get('sessionId') is not None:
                ex['sessionId'] = payload.get('sessionId') or None
            if payload.get('agent'):
                ex['agent'] = str(payload.get('agent'))
            if payload.get('startedAt'):
                ex['startedAt'] = int(payload.get('startedAt'))
            if payload.get('endedAt'):
                ex['endedAt'] = int(payload.get('endedAt'))
            if payload.get('status'):
                ex['status'] = str(payload.get('status'))

            incoming = payload.get('evidence')
            if isinstance(incoming, list):
                merged = ex.get('evidence', []) + [str(x) for x in incoming if str(x).strip()]
                ex['evidence'] = list(dict.fromkeys(merged))

            ex['updatedAt'] = now_ms()
            mission['execution'] = ex
            mission['executionStatus'] = ex['status']
            mission['effectEvidence'] = ex.get('evidence', [])
            mission['effective'] = has_execution_proof(mission)
            mission['needsEffectiveness'] = not mission['effective']
            if mission['effective']:
                mission['needsUserAction'] = ''

            col['items'][idx] = mission
            append_trail_entry(mission_id, mission.get('title', 'Missão sem título'), f"Proof registrada ({ex['status']}) com {len(ex.get('evidence', []))} evidência(s).")
            save_data(data)
            return self._json(200, {'ok': True, 'missionId': mission_id, 'execution': ex, 'effective': mission['effective']})

        if self.path == '/api/missions/execute':
            payload = self._read_json()
            mission_id = str(payload.get('missionId') or '').strip()
            if not mission_id:
                return self._json(400, {'ok': False, 'error': 'missing_mission_id'})

            data = load_data()
            col, idx, mission = find_mission_ref(data, mission_id)
            if mission is None:
                return self._json(404, {'ok': False, 'error': 'mission_not_found'})

            ex = normalize_execution(mission)
            ex['startedAt'] = ex.get('startedAt') or now_ms()
            ex['updatedAt'] = now_ms()

            ok, kind, evidence = apply_mission_effect(mission)
            mission['kind'] = kind

            status = 'effective' if ok else ('needs_clarification' if kind == 'manual_required' else 'failed')
            needs_user_action = ''
            if not ok:
                needs_user_action = (
                    'Missão ambígua. Defina escopo, arquivo-alvo e critério de sucesso.'
                    if status == 'needs_clarification' else
                    'Execução técnica falhou. Revisar evidência e ajustar missão.'
                )

            ex['status'] = status
            ex['endedAt'] = now_ms()
            ex['evidence'] = list(dict.fromkeys((ex.get('evidence') or []) + evidence))
            mission['execution'] = ex
            mission['executionStatus'] = status
            mission['effectEvidence'] = ex['evidence']
            mission['effective'] = has_execution_proof(mission)
            mission['executed'] = bool(ok)
            mission['needsEffectiveness'] = not mission['effective']
            mission['needsUserAction'] = '' if mission['effective'] else needs_user_action

            clarification_sent = False
            if status == 'needs_clarification' and not mission.get('clarificationAsked'):
                can_ask = should_send_clarification(data, mission)
                clarification_sent = ask_whatsapp_clarification(mission, needs_user_action) if can_ask else False
                mission['clarificationAsked'] = bool(clarification_sent)
                mission['clarificationSkipped'] = (not can_ask)

            if col is not None and idx is not None:
                col['items'][idx] = mission

            append_trail_entry(mission['id'], mission.get('title', 'Missão sem título'), f"Execução ({kind}): {'OK' if ok else 'FALHOU'} | {'; '.join(evidence)}")
            if mission.get('needsUserAction'):
                append_trail_entry(mission['id'], mission.get('title', 'Missão sem título'), f"Ação necessária: {mission['needsUserAction']}")

            save_data(data)
            return self._json(200, {
                'ok': mission['effective'],
                'kind': kind,
                'evidence': ex['evidence'],
                'status': status,
                'needsUserAction': mission.get('needsUserAction', ''),
                'clarificationSent': clarification_sent if status == 'needs_clarification' else False,
                'missionId': mission['id'],
                'execution': ex,
            })

        if self.path == '/api/dashboard/state':
            payload = self._read_json()
            board = payload.get('board')
            if not isinstance(board, list):
                return self._json(400, {'ok': False, 'error': 'invalid_board'})

            data = load_data()
            data['columns'] = board
            build_mission_index(data)

            action = payload.get('action', 'update')
            mission_id = str(payload.get('missionId') or '').strip()
            title = payload.get('title') or 'Missão sem título'
            if mission_id:
                idx = data.get('missionIndex', {})
                idx[mission_id] = mission_id

            if action == 'move':
                append_trail_entry(mission_id or 'unknown', title, f"Movida de {payload.get('fromColumn', '?')} para {payload.get('toColumn', '?')}.")
            elif action in ('approve', 'autonomous_approve'):
                append_trail_entry(mission_id or 'unknown', title, 'Aprovada por Jarvis.')
            elif action == 'auto_delegate' and payload.get('title'):
                append_trail_entry(mission_id or 'unknown', title, 'Delegação automática executada por Stark.')
            elif action == 'autonomous_move':
                from_col = payload.get('from', '?')
                to_col = payload.get('to', '?')
                owner = payload.get('owner', 'Stark')
                append_trail_entry(mission_id or 'unknown', title, f"Fluxo autônomo: {from_col} → {to_col} (owner: {owner}).")
                if str(to_col).lower() == 'in_progress':
                    dispatched = dispatch_mission_to_openclaw({'id': mission_id, 'title': title, 'desc': payload.get('desc', ''), 'owner': owner})
                    append_trail_entry(mission_id or 'unknown', title, 'Despacho real para OpenClaw enviado.' if dispatched else 'Falha ao despachar para OpenClaw.')
            elif action == 'clarification_reply':
                append_trail_entry(mission_id or 'unknown', title, f"Monarca respondeu clarificação; missão movida de {payload.get('fromColumn', '?')} para {payload.get('toColumn', '?')}.")
                clar = str(payload.get('clarification', '')).strip()
                if clar:
                    append_trail_entry(mission_id or 'unknown', title, f"Contexto recebido: {clar[:600]}")
            elif action == 'delete_card':
                append_trail_entry(mission_id or 'unknown', title, f"Card removido manualmente da coluna {payload.get('fromColumn', '?')}.")

            enforce_done_proof(data)
            save_data(data)
            return self._json(200, {'ok': True, 'trailFile': '/MISSOES_TRAJETO.md'})

        if self.path == '/api/dashboard/move':
            return self._json(200, {'ok': True})

        if self.path == '/api/cards/delete':
            payload = self._read_json()
            mission_id = str(payload.get('missionId') or '').strip()
            if not mission_id:
                return self._json(400, {'ok': False, 'error': 'missing_mission_id'})

            data = load_data()
            removed = False
            removed_from = []

            for col in data.get('columns', []) or []:
                items = col.get('items', []) or []
                kept = []
                for m in items:
                    mid = str(m.get('id') or '').strip()
                    if mid == mission_id:
                        removed = True
                        removed_from.append(str(col.get('name') or '?'))
                        continue
                    kept.append(m)
                col['items'] = kept

            if not removed:
                return self._json(404, {'ok': False, 'error': 'card_not_found'})

            idx = data.get('missionIndex', {})
            if isinstance(idx, dict):
                idx.pop(mission_id, None)

            append_trail_entry(mission_id, payload.get('title') or 'Missão sem título', f"Card removido manualmente (endpoint dedicado) das colunas: {', '.join(removed_from)}.")
            save_data(data)
            return self._json(200, {'ok': True, 'removedFrom': removed_from})

        if self.path == '/api/chat/send':
            payload = self._read_json()
            text = str(payload.get('text', '')).strip()
            if not text:
                return self._json(400, {'ok': False, 'error': 'empty_text'})
            from_agent = str(payload.get('from', 'Oráculo')).strip() or 'Oráculo'
            chat = load_chat()
            msg = {
                'id': f"c_{uuid.uuid4().hex[:10]}",
                'from': from_agent,
                'text': text,
                'at': now_ms(),
            }
            msgs = chat.get('messages', [])
            msgs.append(msg)
            chat['messages'] = msgs[-300:]
            save_chat(chat)
            return self._json(200, {'ok': True, 'message': msg})

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
