#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
import json
import subprocess
import time
import uuid
import hashlib
import threading
from urllib.parse import urlparse, unquote
from pathlib import Path

BASE = Path(__file__).resolve().parent
REPO_ROOT = BASE.parent  # /root/.openclaw/workspace-stark
DATA_FILE = BASE / 'data.json'
DATA_SEED_FILE = BASE / 'data.sample.json'
TRAIL_FILE = BASE / 'MISSOES_TRAJETO.md'
MISSION_FILE = BASE / 'MISSAO.md'
CHAT_FILE = BASE / 'agent-chat.json'

# External messaging must be explicitly enabled and configured via env.
# Example: WHATSAPP_TARGETS="5566... , 5566..." WHATSAPP_CLARIFY_ENABLED=1
WHATSAPP_TARGETS = [x.strip() for x in (os.getenv('WHATSAPP_TARGETS') or '').split(',') if x.strip()]
WHATSAPP_CLARIFY_ENABLED = os.getenv('WHATSAPP_CLARIFY_ENABLED', '').strip() in ('1', 'true', 'yes', 'on')

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
        {'name': 'Awaiting Monarca', 'items': []},
        {'name': 'Proof Pending', 'items': []},
        {'name': 'Needs Monarca Decision', 'items': []},
    ],
    'feed': [],
    'autonomous': False,
    'missionIndex': {},
    'auditTrail': [],
    'transitionKeys': {},
    'telemetryCache': {'updatedAt': 0, 'payload': {}},
    'taskSeq': 0,
}


def now_ms():
    return int(time.time() * 1000)


def next_task_title(data):
    seq = int(data.get('taskSeq') or 0) + 1
    data['taskSeq'] = seq
    return f"#task_{seq}"


def mission_guard_prefix():
    if not MISSION_FILE.exists():
        return 'Siga estritamente MISSAO.md do dashboard.'
    txt = MISSION_FILE.read_text(encoding='utf-8', errors='ignore')[:600]
    return f"Siga estritamente esta missão do Reino antes de executar: {txt}"


def owner_to_agent_id(owner):
    owner_map = {
        'stark': 'stark',
        'thanos': 'thanos',
        'wanda': 'wanda',
        'alfred': 'alfred',
        'jarvis': 'jarvis',
        'oráculo': 'oraculo',
        'oraculo': 'oraculo',
    }
    return owner_map.get(str(owner).strip().lower(), 'stark')


def mission_openclaw_text(mission):
    title = mission.get('requestedTitle') or mission.get('title') or 'Missão sem título'
    desc = mission.get('desc', '')
    owner = mission.get('owner', 'Stark')
    mission_id = mission.get('id', 'unknown')
    guard = mission_guard_prefix()
    return (
        f"[MISSION CONTROL] Missão: {title} | missionId={mission_id} | Responsável: {owner}. "
        f"Contexto: {desc}. {guard}"
    )


def run_cmd(cmd, timeout_seconds=10, cwd=None):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_seconds, cwd=cwd)
        out = (r.stdout or '').strip()
        err = (r.stderr or '').strip()
        return {'ok': r.returncode == 0, 'rc': r.returncode, 'out': out, 'err': err}
    except Exception as e:
        return {'ok': False, 'rc': 1, 'out': '', 'err': str(e)}


def agent_workspace_dir(agent_id: str):
    """Best-effort mapping from agent_id -> workspace directory.

    Mission Control runs from workspace-stark; other agents usually have /root/.openclaw/workspace-<agent>.
    """
    aid = (str(agent_id or '').strip().lower() or 'stark')
    if aid in ('stark', 'main'):
        return REPO_ROOT
    return Path('/root/.openclaw') / f'workspace-{aid}'


def git_snapshot(repo_dir: Path):
    """Snapshot repo dirty state (for evidence criterion C: file altered + diff).

    If the directory is not a git repo, return gitRepo=False and empty stats."""
    try:
        repo_dir = Path(repo_dir)
    except Exception:
        repo_dir = REPO_ROOT

    git_dir = repo_dir / '.git'
    if not git_dir.exists():
        return {
            'gitRepo': False,
            'repoDir': str(repo_dir),
            'status': '',
            'diffstat': '',
        }

    st = run_cmd(['git', '-C', str(repo_dir), 'status', '--porcelain'], timeout_seconds=6)
    ds = run_cmd(['git', '-C', str(repo_dir), 'diff', '--stat'], timeout_seconds=6)
    return {
        'gitRepo': True,
        'repoDir': str(repo_dir),
        'status': st.get('out', ''),
        'diffstat': ds.get('out', ''),
    }


def run_openclaw_agent_sync(agent_id, session_id, message_text, timeout_seconds=240):
    """Run an OpenClaw agent and capture output as evidence.

    Uses a dedicated session id to avoid huge contexts.
    Uses Popen+communicate so we can hard-kill on timeout."""
    cmd = [
        'openclaw', 'agent',
        '--agent', str(agent_id),
        '--session-id', str(session_id),
        '--message', str(message_text),
        '--thinking', 'low',
        '--timeout', str(int(timeout_seconds)),
        '--json'
    ]

    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        stdout, stderr = p.communicate(timeout=int(timeout_seconds) + 25)
    except subprocess.TimeoutExpired:
        try:
            p.kill()
        except Exception:
            pass
        return {
            'ok': False,
            'returncode': 124,
            'reply': '',
            'stderr': 'timeout',
            'evidence': ['runner_timeout'],
        }

    rc = p.returncode
    stdout = (stdout or '').strip()
    stderr = (stderr or '').strip()

    parsed = None
    reply_text = ''
    if stdout:
        try:
            parsed = json.loads(stdout)
        except Exception:
            parsed = None

    if isinstance(parsed, dict):
        for k in ['reply', 'text', 'message', 'output', 'content']:
            if isinstance(parsed.get(k), str) and parsed.get(k).strip():
                reply_text = parsed.get(k).strip()
                break
        if not reply_text:
            for k in ['result', 'data']:
                v = parsed.get(k)
                if isinstance(v, dict):
                    for kk in ['reply', 'text', 'message', 'output', 'content']:
                        if isinstance(v.get(kk), str) and v.get(kk).strip():
                            reply_text = v.get(kk).strip()
                            break
    else:
        reply_text = stdout

    ok = (rc == 0)
    evidence = []
    if reply_text:
        evidence.append(('LLM: ' + reply_text.replace('\n', ' ')[:900]).strip())
    elif stdout:
        evidence.append(('stdout: ' + stdout.replace('\n', ' ')[:900]).strip())
    if stderr and not ok:
        evidence.append(('stderr: ' + stderr.replace('\n', ' ')[:400]).strip())
    if ok and not evidence:
        evidence.append('runner_ok_no_output')

    return {
        'ok': ok,
        'returncode': rc,
        'reply': reply_text,
        'stderr': stderr,
        'evidence': evidence,
    }


def dispatch_mission_to_openclaw(mission):
    """Legacy fire-and-forget dispatch (kept for compatibility).

    NOTE: Prefer /api/missions/run for tracked execution + proof."""
    owner = mission.get('owner', 'Stark')
    agent_id = owner_to_agent_id(owner)
    text = mission_openclaw_text(mission)
    mission_id = mission.get('id', 'unknown')

    try:
        subprocess.Popen(
            ['openclaw', 'agent', '--agent', agent_id, '--session-id', str(mission_id), '--message', text, '--timeout', '120'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        mission['dispatchAgent'] = agent_id
        return True
    except Exception:
        pass

    try:
        subprocess.Popen(
            ['openclaw', 'system', 'event', '--text', text, '--mode', 'now'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        mission['dispatchAgent'] = 'system_event_fallback'
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
        f"[Stark] Falta contexto para: {title}\n"
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


def migrate_monarca_columns(data):
    """Migrate legacy "Needs Monarca Decision" into clearer buckets.

    - Proof Pending: execution/proof issues (e.g. criterion_c_missing)
    - Awaiting Monarca: truly waiting for user input/OK

    Keeps legacy column for backwards-compat but empties it.
    """
    # Ensure new columns exist
    awaiting = get_column(data, 'Awaiting Monarca', 'Awaiting Monarca')
    proof = get_column(data, 'Proof Pending', 'Proof Pending')
    legacy = get_column(data, 'Needs Monarca Decision')
    if not legacy:
        return

    moved_awaiting = []
    moved_proof = []

    # Build a quick lookup for latest transition reason per mission
    latest_reason = {}
    for e in (data.get('auditTrail') or []):
        mid = str(e.get('missionId') or '').strip()
        if not mid:
            continue
        ts = int(e.get('timestamp') or 0)
        prev = latest_reason.get(mid)
        if (prev is None) or (ts >= prev[0]):
            latest_reason[mid] = (ts, str(e.get('reason') or '').strip())

    for m in (legacy.get('items') or []):
        ensure_execution_defaults(m)
        ex = normalize_execution(m)
        status = str(ex.get('status') or '').lower()
        mid = str(m.get('id') or m.get('cardId') or '').strip()
        reason = (latest_reason.get(mid) or (0, ''))[1]

        # Heuristic:
        # - criterion_c_missing (and most proof issues) -> Proof Pending
        # - explicit awaiting statuses -> Awaiting Monarca
        if reason == 'criterion_c_missing' or status in ('proof_pending', 'failed'):
            moved_proof.append(m)
        else:
            # Default: still treat as awaiting user
            moved_awaiting.append(m)

    if moved_proof:
        proof['items'] = moved_proof + (proof.get('items') or [])
    if moved_awaiting:
        awaiting['items'] = moved_awaiting + (awaiting.get('items') or [])

    legacy['items'] = []


def load_data():
    # If no local state exists yet, optionally seed from a sample file (kept in repo).
    if not DATA_FILE.exists() and DATA_SEED_FILE.exists():
        try:
            DATA_FILE.write_text(DATA_SEED_FILE.read_text(encoding='utf-8'), encoding='utf-8')
        except Exception:
            pass

    if not DATA_FILE.exists():
        data = json.loads(json.dumps(DEFAULT_DATA))
        remove_needs_clarification_column(data)
        migrate_monarca_columns(data)
        return data

    try:
        data = json.loads(DATA_FILE.read_text(encoding='utf-8'))
    except Exception:
        data = json.loads(json.dumps(DEFAULT_DATA))

    remove_needs_clarification_column(data)
    migrate_monarca_columns(data)
    return data


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
    if ('header' in t or 'mission control' in t) and any(k in t for k in ['icone', 'ícone', 'icon']):
        return 'header_brand_icon'
    if ('sessão live' in t or 'sessao live' in t or 'live panel' in t or 'trackeamento' in t or 'tracking' in t) and ('dashboard' in t or 'task' in t or 'tarefa' in t):
        return 'live_tracking_center_plan'
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


def infer_owner_simple(title, desc):
    t = f"{title} {desc}".lower()
    if any(k in t for k in ['api', 'backend', 'deploy', 'infra', 'server', 'banco', 'db', 'código', 'code', 'integra']):
        return 'Thanos'
    if any(k in t for k in ['ui', 'ux', 'frontend', 'front', 'layout', 'página', 'design', 'landing', 'tela', 'header', 'visual', 'icone', 'ícone']):
        return 'Wanda'
    if any(k in t for k in ['auditoria', 'auditar', 'gargalo', 'dependên', 'distribui', 'fluxo', 'handoff']):
        return 'Alfred'
    return 'Alfred'


def triage_with_oraculo(title, desc, priority='p2'):
    # Validation triage disabled by explicit user request.
    kind = infer_mission_kind(title, desc)
    return {
        'kind': kind,
        'owner': infer_owner_simple(title, desc),
        'confidence': 1.0,
        'needsClarification': False,
        'missingContext': '',
        'targetFile': '',
        'expectedChange': '',
        'acceptanceTest': '',
        'source': 'disabled',
    }


def normalize_execution(mission, default_agent='Stark'):
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
    if kind == 'manual_required':
        inferred = infer_mission_kind(title, desc)
        if inferred != 'manual_required':
            kind = inferred

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

    elif kind == 'header_brand_icon':
        html = index_path.read_text(encoding='utf-8')
        css = styles_path.read_text(encoding='utf-8') if styles_path.exists() else ''

        changed = False
        if '<h1>MISSION CONTROL</h1>' in html:
            html = html.replace(
                '<h1>MISSION CONTROL</h1>',
                '<h1><span class="brand-icon" aria-hidden="true">🦞</span><span class="sr-only">MISSION CONTROL</span></h1>'
            )
            changed = True
            evidence.append('header trocado de texto para ícone')
        elif 'class="brand-icon"' in html:
            evidence.append('ícone de marca já está aplicado no header')
        else:
            evidence.append('alvo do título do header não encontrado')
            return False, kind, evidence

        if '.brand-icon {' not in css:
            css += "\n\n.brand-icon {\n  display: inline-block;\n  font-size: 18px;\n  line-height: 1;\n  filter: drop-shadow(0 0 8px rgba(126, 249, 207, 0.45));\n}\n\n.sr-only {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  margin: -1px;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  white-space: nowrap;\n  border: 0;\n}\n"
            styles_path.write_text(css, encoding='utf-8')
            changed = True
            evidence.append('estilo do ícone de marca aplicado')

        if changed:
            index_path.write_text(html, encoding='utf-8')

    elif kind == 'live_tracking_center_plan':
        plan_path = BASE / 'LIVE_TRACKING_PLAN.md'
        ts = time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())
        plan = (
            '# Live Tracking Center — Plano Operacional\n\n'
            f'Atualizado em: {ts}\n\n'
            '## Objetivo\n'
            'Transformar o painel Live no centro de rastreamento real das tarefas do dashboard.\n\n'
            '## Estrutura recomendada\n'
            '1. Fila em tempo real por missão (missionId, owner, status).\n'
            '2. Prova de execução sempre visível (status/evidence/session).\n'
            '3. Linha do tempo por missão (from/to, actor, timestamp, reason).\n'
            '4. Alertas de falha e bloqueio sem proof.\n\n'
            '## Próximos parafusos\n'
            '- Corrigir consistência de status (execution.status vs executionStatus).\n'
            '- Eliminar eventos com missionId unknown.\n'
            '- Exibir timeline dedicada no Live por missão selecionada.\n'
        )
        plan_path.write_text(plan, encoding='utf-8')
        evidence.append('plano de transformação do Live gerado em APP/LIVE_TRACKING_PLAN.md')

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
    ex = normalize_execution(mission, default_agent=mission.get('owner', 'Stark'))
    if not ex.get('startedAt'):
        ex['startedAt'] = mission.get('createdAt')
    mission['execution'] = ex
    return mission_id


def record_transition(data, mission_id, from_col, to_col, actor='system', reason='update', title='Missão sem título', transition_id=None):
    if not mission_id:
        return None

    ts = now_ms()
    base_key = transition_id or f"{mission_id}:{from_col}->{to_col}:{actor}:{reason}".lower()
    digest = hashlib.sha1(base_key.encode('utf-8')).hexdigest()[:16]
    key_slot = data.setdefault('transitionKeys', {})
    if key_slot.get(digest):
        return None
    key_slot[digest] = ts

    event = {
        'id': f"tr_{uuid.uuid4().hex[:12]}",
        'missionId': mission_id,
        'from': from_col,
        'to': to_col,
        'actor': actor,
        'reason': reason,
        'timestamp': ts,
        'title': title,
    }
    trail = data.setdefault('auditTrail', [])
    trail.append(event)
    if len(trail) > 5000:
        data['auditTrail'] = trail[-5000:]
    return event


def get_mission_timeline(data, mission_id):
    needle = str(mission_id or '').strip()
    if not needle:
        return []
    trail = data.get('auditTrail', []) or []
    out = [e for e in trail if str(e.get('missionId') or '').strip() == needle]
    out.sort(key=lambda x: int(x.get('timestamp') or 0))
    return out


def dedupe_board_items(data):
    seen = set()
    for col in data.get('columns', []) or []:
        unique = []
        for m in col.get('items', []) or []:
            mid = ensure_mission_id(m)
            if mid in seen:
                continue
            seen.add(mid)
            unique.append(m)
        col['items'] = unique


def merge_board_with_canonical(data, incoming_board):
    existing_by_id = {}
    for col in data.get('columns', []) or []:
        for m in col.get('items', []) or []:
            mid = str(m.get('id') or m.get('cardId') or '').strip()
            if mid:
                existing_by_id[mid] = m

    merged_columns = []
    for col in incoming_board or []:
        merged_items = []
        for raw in col.get('items', []) or []:
            m = dict(raw)
            mid = ensure_mission_id(m)
            ex = existing_by_id.get(mid)
            if ex:
                merged = {**ex, **m}
                # Keep canonical mission identity/content from backend to avoid stale UI overwrite
                for field in ['id', 'cardId', 'title', 'requestedTitle', 'desc', 'kind', 'targetFile', 'expectedChange', 'acceptanceTest', 'triageSource', 'createdAt']:
                    if field in ex:
                        merged[field] = ex.get(field)

                # Keep canonical execution proof/state from backend (source of truth)
                if ex.get('execution') is not None:
                    merged['execution'] = ex.get('execution')
                if 'executionStatus' in ex:
                    merged['executionStatus'] = ex.get('executionStatus')
                if 'effective' in ex:
                    merged['effective'] = ex.get('effective')
                if 'effectEvidence' in ex:
                    merged['effectEvidence'] = ex.get('effectEvidence')
                if 'needsUserAction' in ex and ex.get('needsUserAction'):
                    merged['needsUserAction'] = ex.get('needsUserAction')

                merged_items.append(merged)
            else:
                merged_items.append(m)
        merged_columns.append({'name': col.get('name', ''), 'items': merged_items})

    data['columns'] = merged_columns


def build_openclaw_telemetry(data):
    now = now_ms()
    cache = data.setdefault('telemetryCache', {'updatedAt': 0, 'payload': {}})
    if (now - int(cache.get('updatedAt') or 0)) < 10000 and cache.get('payload'):
        return cache['payload']

    sessions = []
    source_path = ''
    try:
        r = subprocess.run(['openclaw', 'sessions', '--json', '--active', '240'], capture_output=True, text=True, timeout=20)
        if r.returncode == 0 and (r.stdout or '').strip():
            parsed = json.loads(r.stdout)
            source_path = parsed.get('path', '')
            sessions = parsed.get('sessions', []) or []
    except Exception:
        sessions = []

    agents = {}
    active_cut = now - (15 * 60 * 1000)

    for s in sessions:
        sid = str(s.get('id') or s.get('sessionId') or '')
        title = str(s.get('title') or s.get('name') or sid or 'session')
        updated = int(s.get('updatedAt') or s.get('lastActivityAt') or s.get('createdAt') or 0)

        # openclaw sessions output is key-based (e.g. "agent:main:cron:..."), so infer agentId from it.
        key = str(s.get('key') or '').strip()
        inferred = ''
        if key.startswith('agent:'):
            parts = key.split(':')
            if len(parts) >= 2:
                inferred = parts[1]

        owner_raw = str(
            s.get('agent') or s.get('agentId') or s.get('owner') or inferred or ''
        ).strip() or 'unknown'
        owner = owner_raw.lower()

        bucket = agents.setdefault(owner, {
            'agentId': owner,
            'agentName': owner_raw,
            'status': 'idle',
            'lastActivityAt': 0,
            'activeSessions': 0,
            'sessions': [],
        })
        if updated > bucket['lastActivityAt']:
            bucket['lastActivityAt'] = updated
        if updated >= active_cut:
            bucket['activeSessions'] += 1
        bucket['sessions'].append({'id': sid, 'title': title, 'updatedAt': updated})

    for b in agents.values():
        b['status'] = 'working' if b['activeSessions'] > 0 else 'idle'
        b['sessions'] = sorted(b['sessions'], key=lambda x: int(x.get('updatedAt') or 0), reverse=True)[:8]

    payload = {
        'ok': True,
        'source': 'openclaw_sessions',
        'sourcePath': source_path,
        'updatedAt': now,
        'windowMinutes': 15,
        'summary': {
            'totalSessions': len(sessions),
            'activeSessions': sum(1 for s in sessions if int(s.get('updatedAt') or s.get('lastActivityAt') or s.get('createdAt') or 0) >= active_cut),
            'agentsTracked': len(agents),
        },
        'agents': sorted(list(agents.values()), key=lambda x: x['agentId']),
    }
    data['telemetryCache'] = {'updatedAt': now, 'payload': payload}
    return payload


def build_mission_index(data):
    dedupe_board_items(data)
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


def remove_needs_clarification_column(data):
    cols = data.get('columns', []) or []
    move_items = []
    kept = []
    for c in cols:
        if str(c.get('name', '')).lower().strip() == 'needs clarification':
            move_items.extend(c.get('items', []) or [])
        else:
            kept.append(c)
    data['columns'] = kept

    if move_items:
        failed = get_column(data, 'Failed', 'Failed')
        normalized = []
        for m in move_items:
            ensure_execution_defaults(m)
            ex = normalize_execution(m)
            ex['status'] = 'failed'
            ex['updatedAt'] = now_ms()
            if not ex.get('endedAt'):
                ex['endedAt'] = now_ms()
            m['execution'] = ex
            m['executionStatus'] = 'failed'
            m['effective'] = False
            m['needsClarification'] = False
            if not m.get('needsUserAction'):
                m['needsUserAction'] = 'Missão sem clarificação. Ajuste escopo e reexecute.'
            normalized.append(m)
        failed['items'] = normalized + (failed.get('items', []) or [])


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


def find_mission_id_by_title_unique(data, title):
    needle = str(title or '').strip().lower()
    if not needle:
        return None
    matches = []
    for c in data.get('columns', []) or []:
        for m in c.get('items', []) or []:
            mt = str(m.get('title', '')).strip().lower()
            if mt == needle:
                mid = str(m.get('id') or m.get('cardId') or '').strip()
                if mid:
                    matches.append(mid)
    uniq = list(dict.fromkeys(matches))
    return uniq[0] if len(uniq) == 1 else None


def route_without_proof(data, mission, reason):
    target = get_column(data, 'Failed', 'Failed')

    ex = normalize_execution(mission)
    ex['status'] = 'failed'
    ex['updatedAt'] = now_ms()
    if not ex.get('endedAt'):
        ex['endedAt'] = now_ms()
    mission['execution'] = ex
    mission['executionStatus'] = ex['status']
    mission['effective'] = False
    mission['needsClarification'] = False
    mission['needsEffectiveness'] = True
    mission['needsUserAction'] = 'Falta prova de execução (evidence[] + status effective). Reexecutar e anexar evidências reais.'

    target['items'] = [mission] + (target.get('items', []) or [])
    record_transition(data, mission.get('id', 'unknown'), 'done', 'failed', actor='alfred', reason='missing_execution_proof', title=mission.get('title', 'Missão sem título'))
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
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/api/health':
            data = load_data()
            return self._json(200, {'ok': True, 'autonomous': bool(data.get('autonomous'))})
        if path == '/api/dashboard':
            data = load_data()
            build_mission_index(data)

            # Watchdog: avoid missions stuck forever in "running" if the server was restarted mid-run.
            now = now_ms()
            stuck_ms = 12 * 60 * 1000

            mutated = False
            for c in data.get('columns', []) or []:
                for m in c.get('items', []) or []:
                    ensure_execution_defaults(m)

                    ex = normalize_execution(m)
                    if str(ex.get('status') or '').lower() == 'running':
                        started = int(ex.get('startedAt') or 0)
                        if started and (now - started) > stuck_ms:
                            ex['status'] = 'failed'
                            ex['endedAt'] = ex.get('endedAt') or now
                            ex['updatedAt'] = now
                            evid = list(ex.get('evidence') or [])
                            evid.append('watchdog: marked failed after server restart / timeout')
                            ex['evidence'] = list(dict.fromkeys([str(x) for x in evid if str(x).strip()]))

                            m['execution'] = ex
                            m['executionStatus'] = ex['status']
                            m['effectEvidence'] = ex.get('evidence', [])
                            m['effective'] = has_execution_proof(m)
                            m['needsEffectiveness'] = not m['effective']
                            m['needsUserAction'] = 'Execução ficou presa em running (provável restart). Reexecute para gerar PROOF.'

                            mutated = True

                    tl = get_mission_timeline(data, m.get('id'))
                    m['timelineCount'] = len(tl)
                    if tl:
                        m['latestTransition'] = tl[-1]

            if mutated:
                save_data(data)

            return self._json(200, data)
        if path == '/api/chat':
            return self._json(200, load_chat())
        if path == '/api/openclaw/telemetry':
            data = load_data()
            payload = build_openclaw_telemetry(data)
            save_data(data)
            return self._json(200, payload)
        if path.startswith('/api/missions/') and path.endswith('/timeline'):
            mission_id = unquote(path[len('/api/missions/'): -len('/timeline')]).strip('/')
            if not mission_id:
                return self._json(400, {'ok': False, 'error': 'missing_mission_id'})
            data = load_data()
            timeline = get_mission_timeline(data, mission_id)
            _, _, mission = find_mission_ref(data, mission_id)
            ex = normalize_execution(mission) if mission else {}
            return self._json(200, {
                'ok': True,
                'missionId': mission_id,
                'timeline': timeline,
                'count': len(timeline),
                'executionProof': {
                    'effective': bool(mission.get('effective')) if mission else False,
                    'status': ex.get('status') if ex else None,
                    'evidence': ex.get('evidence', []) if ex else [],
                    'sessionId': ex.get('sessionId') if ex else None,
                    'agent': ex.get('agent') if ex else None,
                    'updatedAt': ex.get('updatedAt') if ex else None,
                },
            })
        if path == '/api/openclaw/agents/details':
            details = BASE / 'openclaw-agents-details.json'
            if not details.exists():
                # Best-effort generation so fresh clones still work.
                try:
                    subprocess.run(['python3', str(BASE / 'sync_openclaw_agents.py')], timeout=12)
                except Exception:
                    pass
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
            requested_title = str(payload.get('title', '')).strip()
            title = next_task_title(data)
            desc = str(payload.get('desc', '')).strip()
            if requested_title:
                desc = f"[Solicitação: {requested_title}]\n{desc}" if desc else f"[Solicitação: {requested_title}]"
            priority = payload.get('priority', 'p2')

            _, _, existing = find_mission_ref(data, mission_id)
            if existing is not None:
                return self._json(200, {
                    'ok': True,
                    'missionId': mission_id,
                    'missionTitle': existing.get('title', ''),
                    'requestedTitle': existing.get('requestedTitle', ''),
                    'dispatched': False,
                    'needsClarification': bool(existing.get('needsClarification')),
                    'triageSource': existing.get('triageSource', 'idempotent'),
                    'idempotent': True,
                })

            triage = triage_with_oraculo(title, desc, priority)

            mission = {
                **payload,
                'id': mission_id,
                'cardId': mission_id,
                'title': title,
                'requestedTitle': requested_title,
                'desc': desc,

                # Mission contract fields (Mission Control constitution)
                'missionType': str(payload.get('missionType') or '').strip() or 'Feature',
                'riskLevel': int(payload.get('riskLevel') or 0),
                'successCriteria': str(payload.get('successCriteria') or '').strip(),
                'proofExpected': str(payload.get('proofExpected') or '').strip(),
                'monarcaOk': bool(payload.get('monarcaOk') or False),

                'kind': triage.get('kind') or infer_mission_kind(title, desc),
                'owner': triage.get('owner') or payload.get('owner', infer_owner_simple(title, desc)),
                'confidence': 1.0,
                'needsClarification': False,
                'missingContext': '',
                'targetFile': triage.get('targetFile') or payload.get('targetFile', ''),
                'expectedChange': triage.get('expectedChange') or payload.get('expectedChange', ''),
                'acceptanceTest': triage.get('acceptanceTest') or payload.get('acceptanceTest', ''),
                'triageSource': 'disabled',
                'createdAt': now_ms(),
                'executed': False,
                'effective': False,
                'needsEffectiveness': True,
                'execution': {
                    'sessionId': None,
                    'agent': triage.get('owner') or payload.get('owner', infer_owner_simple(title, desc)),
                    'startedAt': now_ms(),
                    'endedAt': None,
                    'updatedAt': now_ms(),
                    'status': 'pending',
                    'evidence': [],
                },
            }

            inbox['items'] = [mission] + (inbox.get('items', []) or [])
            record_transition(data, mission['id'], 'broadcast', 'inbox', actor='stark', reason='mission_created', title=mission.get('title', 'Missão sem título'))
            append_trail_entry(mission['id'], mission.get('title', 'Missão sem título'), 'Missão criada via Broadcast e enviada para Inbox.')

            build_mission_index(data)

            dispatched = False
            if data.get('autonomous'):
                dispatched = dispatch_mission_to_openclaw(mission)
                mission['executed'] = dispatched
                dispatch_target = mission.get('dispatchAgent', mission.get('owner', 'stark'))
                append_trail_entry(
                    mission['id'],
                    mission.get('title', 'Missão sem título'),
                    (f"Despacho autônomo para OpenClaw executado (agent: {dispatch_target})." if dispatched else 'Falha no despacho autônomo para OpenClaw.')
                )

            save_data(data)
            return self._json(200, {
                'ok': True,
                'missionId': mission['id'],
                'missionTitle': mission.get('title', ''),
                'requestedTitle': mission.get('requestedTitle', ''),
                'dispatched': dispatched,
                'needsClarification': False,
                'triageSource': mission.get('triageSource', 'disabled'),
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

        if self.path == '/api/missions/run':
            payload = self._read_json()
            mission_id = str(payload.get('missionId') or '').strip()
            if not mission_id:
                return self._json(400, {'ok': False, 'error': 'missing_mission_id'})

            data = load_data()
            col, idx, mission = find_mission_ref(data, mission_id)
            if mission is None:
                return self._json(404, {'ok': False, 'error': 'mission_not_found'})

            # mark running and return immediately (async execution)
            ex = normalize_execution(mission)
            was_running = str(ex.get('status') or '').lower() == 'running'

            ex['startedAt'] = now_ms()
            ex['updatedAt'] = now_ms()
            ex['endedAt'] = None
            ex['status'] = 'running'

            # Clear any stale user-action text when re-queuing.
            mission['needsUserAction'] = ''
            mission['execution'] = ex
            mission['executionStatus'] = ex['status']
            mission['effective'] = False
            mission['needsEffectiveness'] = True

            if col is not None and idx is not None:
                col['items'][idx] = mission

            append_trail_entry(
                mission_id,
                mission.get('title', 'Missão sem título'),
                ('Execução (LLM) re-enfileirada (override de running anterior).' if was_running else 'Execução (LLM) enfileirada (async).')
            )
            save_data(data)

            owner = mission.get('owner', 'Stark')
            agent_id = owner_to_agent_id(owner)
            msg = mission_openclaw_text(mission)

            def worker():
                # Criterion C must verify the workspace where the responsible agent operates.
                exec_repo = agent_workspace_dir(agent_id)
                before_git = git_snapshot(exec_repo)
                try:
                    result = run_openclaw_agent_sync(agent_id=agent_id, session_id=mission_id, message_text=msg)
                except Exception as e:
                    result = {'ok': False, 'evidence': [f'runner_error: {e}'], 'reply': ''}
                after_git = git_snapshot(exec_repo)

                # Evidence criterion C:
                # - If the executor workspace is a git repo: require an actual diff.
                # - If it's NOT a git repo: we can't diff; accept runner ok as long as we have evidence.
                if after_git.get('gitRepo'):
                    changed = (after_git.get('status') or '').strip() != (before_git.get('status') or '').strip()
                    has_diff = bool((after_git.get('diffstat') or '').strip())
                    c_ok = changed and has_diff
                else:
                    changed = False
                    has_diff = False
                    c_ok = bool(result.get('ok')) and bool(result.get('evidence'))

                git_evidence = [f"exec_repo: {after_git.get('repoDir')}"]
                if after_git.get('gitRepo'):
                    if changed:
                        git_evidence.append('git: changes detected')
                    if has_diff:
                        git_evidence.append('git diff --stat:\n' + after_git.get('diffstat', '')[:900])
                    else:
                        git_evidence.append('git: no diff detected')
                else:
                    git_evidence.append('git: repo not detected (skipping diff-based proof)')

                data2 = load_data()
                col2, idx2, mission2 = find_mission_ref(data2, mission_id)
                if mission2 is None:
                    return

                ex2 = normalize_execution(mission2)
                ex2['agent'] = agent_id
                ex2['sessionId'] = mission_id
                ex2['updatedAt'] = now_ms()
                ex2['endedAt'] = now_ms()

                base_ok = bool(result.get('ok'))
                final_ok = base_ok and c_ok

                # If criterion C fails, this is a proof problem (not necessarily a Monarca decision).
                if final_ok:
                    ex2['status'] = 'effective'
                else:
                    ex2['status'] = 'proof_pending' if base_ok and (not c_ok) else 'failed'

                evidence = list(dict.fromkeys((ex2.get('evidence') or []) + (result.get('evidence') or []) + git_evidence))
                ex2['evidence'] = evidence
                mission2['execution'] = ex2
                mission2['executionStatus'] = ex2['status']
                mission2['effectEvidence'] = evidence
                mission2['effective'] = has_execution_proof(mission2)
                mission2['needsEffectiveness'] = not mission2['effective']

                if mission2['effective']:
                    mission2['needsUserAction'] = ''
                else:
                    if ex2['status'] == 'proof_pending':
                        mission2['needsUserAction'] = (
                            'PROOF pendente: não detectei mudanças verificáveis no workspace do executor (ver exec_repo nas evidências). '
                            'Ajuste o alvo (arquivo/tarefa) e reexecute. Se a proof não for git, anexe screenshot/log como evidência.'
                        )
                    else:
                        mission2['needsUserAction'] = 'Falha de execução. Ver evidências e reexecutar.'

                # Route proof failures to Proof Pending (not Awaiting Monarca).
                if ex2['status'] == 'proof_pending':
                    # Remove from current column
                    if col2 is not None and idx2 is not None:
                        try:
                            col2['items'].pop(idx2)
                        except Exception:
                            pass
                    target = get_column(data2, 'Proof Pending', 'Proof Pending')
                    if target is not None:
                        target['items'] = [mission2] + (target.get('items', []) or [])
                        record_transition(data2, mission_id, 'in_progress', 'proof_pending', actor='alfred', reason='criterion_c_missing', title=mission2.get('title','Missão'))
                        append_trail_entry(mission_id, mission2.get('title', 'Missão'), 'Movida para Proof Pending (Critério de proof não atendido).')
                else:
                    if col2 is not None and idx2 is not None:
                        col2['items'][idx2] = mission2

                append_trail_entry(mission_id, mission2.get('title', 'Missão sem título'), f"Execução (LLM) finalizada: {ex2['status']} | evidências: {len(evidence)}")
                save_data(data2)

            t = threading.Thread(target=worker, daemon=True)
            t.start()

            return self._json(202, {
                'ok': True,
                'queued': True,
                'missionId': mission_id,
                'execution': ex,
            })

        if self.path == '/api/missions/execute':
            # Deterministic local executors (kept for small automations / demos).
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

            status = 'effective' if ok else 'failed'
            needs_user_action = ''
            if not ok:
                needs_user_action = (
                    'Execução técnica falhou. Revisar evidência e ajustar missão.'
                    if kind != 'manual_required' else
                    'Escopo manual detectado. Defina arquivo-alvo e critério de sucesso, depois reexecute.'
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
                'clarificationSent': False,
                'missionId': mission['id'],
                'execution': ex,
            })

        if self.path == '/api/dashboard/state':
            payload = self._read_json()
            board = payload.get('board')
            if not isinstance(board, list):
                return self._json(400, {'ok': False, 'error': 'invalid_board'})

            data = load_data()
            merge_board_with_canonical(data, board)
            build_mission_index(data)

            action = payload.get('action', 'update')
            mission_id = str(payload.get('missionId') or payload.get('cardId') or '').strip()
            title = payload.get('title') or 'Missão sem título'
            if not mission_id:
                mission_id = find_mission_id_by_title_unique(data, title) or ''
            if mission_id:
                idx = data.get('missionIndex', {})
                idx[mission_id] = mission_id

            actor = str(payload.get('actor') or 'ui')
            transition_id = str(payload.get('transitionId') or '').strip() or None

            # Fetch canonical mission for validations / state mutations
            col_ref, idx_ref, mission_ref = find_mission_ref(data, mission_id) if mission_id else (None, None, None)

            if action == 'move':
                from_c = payload.get('fromColumn', '?')
                to_c = payload.get('toColumn', '?')

                # Guard rails: DONE requires proof + approvals depending on risk.
                if str(to_c).strip().lower() == 'done' and mission_ref is not None:
                    risk = int(mission_ref.get('riskLevel') or 0)
                    if not has_execution_proof(mission_ref):
                        return self._json(409, {
                            'ok': False,
                            'error': 'done_requires_proof',
                            'message': 'DONE bloqueado: falta PROOF (execution.status=effective + evidence[]). Execute e gere evidências reais antes de concluir.',
                        })
                    if risk >= 1 and not bool(mission_ref.get('approved')):
                        return self._json(409, {
                            'ok': False,
                            'error': 'done_requires_jarvis',
                            'message': 'DONE bloqueado: missão Risco 1 exige aprovação do Jarvis antes de concluir.',
                        })
                    if risk >= 2 and not bool(mission_ref.get('monarcaOk')):
                        return self._json(409, {
                            'ok': False,
                            'error': 'done_requires_monarca',
                            'message': 'DONE bloqueado: missão Risco 2 exige OK explícito do Monarca antes de concluir.',
                        })

                record_transition(data, mission_id or 'unknown', from_c, to_c, actor=actor, reason='manual_move', title=title, transition_id=transition_id)
                append_trail_entry(mission_id or 'unknown', title, f"Movida de {from_c} para {to_c}.")

            elif action in ('approve', 'autonomous_approve'):
                # Persist Jarvis approval into the canonical mission.
                if mission_ref is not None and col_ref is not None and idx_ref is not None:
                    mission_ref['approved'] = True
                    col_ref['items'][idx_ref] = mission_ref

                record_transition(data, mission_id or 'unknown', payload.get('fromColumn', '?'), payload.get('toColumn', payload.get('fromColumn', '?')), actor='jarvis', reason='approved', title=title, transition_id=transition_id)
                append_trail_entry(mission_id or 'unknown', title, 'Aprovada por Jarvis.')

            elif action == 'monarca_ok':
                if mission_ref is not None and col_ref is not None and idx_ref is not None:
                    mission_ref['monarcaOk'] = True
                    col_ref['items'][idx_ref] = mission_ref
                record_transition(data, mission_id or 'unknown', payload.get('fromColumn', '?'), payload.get('toColumn', payload.get('fromColumn', '?')), actor='marcos', reason='monarca_ok', title=title, transition_id=transition_id)
                append_trail_entry(mission_id or 'unknown', title, 'OK do Monarca registrado.')

            elif action == 'monarca_reply':
                # Monarca provides required context/decision inside the dashboard.
                reply = str(payload.get('reply') or payload.get('clarification') or '').strip()
                if not reply:
                    return self._json(400, {'ok': False, 'error': 'empty_reply', 'message': 'Resposta vazia.'})

                if mission_ref is not None:
                    # Append reply to mission description
                    mission_ref['desc'] = str(mission_ref.get('desc') or '') + f"\n\n[Resposta do Monarca]\n{reply}"
                    mission_ref['needsUserAction'] = ''
                    # A reply implicitly counts as Monarca OK for risk-2 gates.
                    mission_ref['monarcaOk'] = True
                    ensure_execution_defaults(mission_ref)

                    # Move mission to Assigned for re-execution
                    if col_ref is not None and idx_ref is not None:
                        try:
                            col_ref['items'].pop(idx_ref)
                        except Exception:
                            pass
                    assigned = get_column(data, 'Assigned', 'Assigned')
                    assigned['items'] = [mission_ref] + (assigned.get('items') or [])

                record_transition(data, mission_id or 'unknown', payload.get('fromColumn', '?'), 'assigned', actor='marcos', reason='monarca_reply', title=title, transition_id=transition_id)
                append_trail_entry(mission_id or 'unknown', title, 'Monarca respondeu via dashboard; missão voltou para Assigned.')

            elif action == 'auto_delegate' and payload.get('title'):
                record_transition(data, mission_id or 'unknown', 'inbox', 'assigned', actor='stark', reason='auto_delegate', title=title, transition_id=transition_id)
                append_trail_entry(mission_id or 'unknown', title, 'Delegação automática executada por Stark.')

            elif action == 'autonomous_move':
                from_col = payload.get('from', '?')
                to_col = payload.get('to', '?')
                owner = payload.get('owner', 'Stark')
                record_transition(data, mission_id or 'unknown', from_col, to_col, actor=owner, reason='autonomous_move', title=title, transition_id=transition_id)
                append_trail_entry(mission_id or 'unknown', title, f"Fluxo autônomo: {from_col} → {to_col} (owner: {owner}).")
                if str(to_col).lower() == 'in_progress':
                    # Execution is now tracked via /api/missions/run (LLM) to ensure proof + timeline.
                    append_trail_entry(mission_id or 'unknown', title, 'Entrou em In Progress — aguardando execução (LLM) rastreada.')

            elif action == 'clarification_reply':
                from_c = payload.get('fromColumn', '?')
                to_c = payload.get('toColumn', '?')
                record_transition(data, mission_id or 'unknown', from_c, to_c, actor=actor, reason='clarification_reply', title=title, transition_id=transition_id)
                append_trail_entry(mission_id or 'unknown', title, f"Monarca respondeu clarificação; missão movida de {from_c} para {to_c}.")
                clar = str(payload.get('clarification', '')).strip()
                if clar:
                    append_trail_entry(mission_id or 'unknown', title, f"Contexto recebido: {clar[:600]}")

            elif action == 'delete_card':
                from_c = payload.get('fromColumn', '?')
                record_transition(data, mission_id or 'unknown', from_c, 'deleted', actor=actor, reason='delete_card', title=title, transition_id=transition_id)
                append_trail_entry(mission_id or 'unknown', title, f"Card removido manualmente da coluna {from_c}.")

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
                    mid = str(m.get('id') or m.get('cardId') or '').strip()
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

            for col_name in removed_from:
                record_transition(data, mission_id, col_name, 'deleted', actor='ui', reason='delete_card', title=payload.get('title') or 'Missão sem título')
            append_trail_entry(mission_id, payload.get('title') or 'Missão sem título', f"Card removido manualmente (endpoint dedicado) das colunas: {', '.join(removed_from)}.")
            save_data(data)
            return self._json(200, {'ok': True, 'removedFrom': removed_from})

        if self.path == '/api/chat/send':
            payload = self._read_json()
            text = str(payload.get('text', '')).strip()
            if not text:
                return self._json(400, {'ok': False, 'error': 'empty_text'})
            from_agent = str(payload.get('from', 'Stark')).strip() or 'Stark'
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

        if self.path == '/api/agents/command':
            payload = self._read_json()
            to = str(payload.get('to') or '').strip().lower() or 'stark'
            cmd = str(payload.get('cmd') or '').strip()
            risk = int(payload.get('riskLevel') or 0)
            success = str(payload.get('successCriteria') or '').strip() or 'Entrega registrada no Live + evidências anexadas.'
            if not cmd:
                return self._json(400, {'ok': False, 'error': 'empty_cmd', 'message': 'Comando vazio.'})

            data = load_data()
            assigned = get_column(data, 'Assigned', 'Assigned')

            mission_id = f"m_{uuid.uuid4().hex[:12]}"
            requested_title = f"CMD → {to}: {cmd[:42].strip()}" + ('…' if len(cmd) > 42 else '')
            title = next_task_title(data)
            desc = (
                f"[Comando do Marcos]\n"
                f"PARA: {to}\n"
                f"RISCO: {risk}\n"
                f"COMANDO:\n{cmd}\n\n"
                f"CRITÉRIO DE SUCESSO:\n{success}"
            )

            mission = {
                'id': mission_id,
                'cardId': mission_id,
                'title': title,
                'requestedTitle': requested_title,
                'desc': desc,
                'missionType': 'Automacao' if 'auto' in cmd.lower() else 'Feature',
                'riskLevel': risk,
                'successCriteria': success,
                'proofExpected': '',
                'monarcaOk': True,
                'owner': to.title() if to != 'oraculo' else 'Oráculo',
                # Marcos-originated commands are implicitly approved for moving into execution.
                'approved': True,
                'triageSource': 'command',
                'createdAt': now_ms(),
                'executed': False,
                'effective': False,
                'needsEffectiveness': True,
                'needsUserAction': '',
                'execution': {
                    'sessionId': None,
                    'agent': to,
                    'startedAt': now_ms(),
                    'endedAt': None,
                    'updatedAt': now_ms(),
                    'status': 'pending',
                    'evidence': [],
                },
            }

            assigned['items'] = [mission] + (assigned.get('items', []) or [])
            record_transition(data, mission_id, 'marcos', 'assigned', actor='marcos', reason='command_created', title=mission.get('title', 'Missão'))
            append_trail_entry(mission_id, mission.get('title', 'Missão'), 'Comando criado pelo Marcos via dashboard (Comandos).')
            build_mission_index(data)
            save_data(data)

            return self._json(200, {'ok': True, 'missionId': mission_id, 'title': mission.get('title'), 'requestedTitle': requested_title})

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
