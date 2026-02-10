#!/usr/bin/env python3
import json, os, re
from pathlib import Path

ROOT = Path('/root/.openclaw')
AGENTS_DIR = ROOT / 'agents'
REGISTRY = ROOT / 'AGENT_REGISTRY.json'
OUT = Path('/root/.openclaw/workspace-stark/APP/openclaw-agents-details.json')

registry = {}
if REGISTRY.exists():
    registry = json.loads(REGISTRY.read_text(encoding='utf-8')).get('agents', {})

def read_excerpt(path: Path, n=900):
    if not path.exists():
        return ''
    txt = path.read_text(encoding='utf-8', errors='ignore')
    txt = re.sub(r'\n{3,}', '\n\n', txt).strip()
    return txt[:n]

items = []
for d in sorted([p for p in AGENTS_DIR.iterdir() if p.is_dir()]):
    aid = d.name
    rg = registry.get(aid, {})

    model = 'unknown'
    sessions = d / 'sessions' / 'sessions.json'
    if sessions.exists():
      try:
        data = json.loads(sessions.read_text(encoding='utf-8'))
        best = None
        for _, v in data.items():
            if isinstance(v, dict) and v.get('model'):
                ua = v.get('updatedAt', 0)
                if best is None or ua > best[0]:
                    best = (ua, v)
        if best:
            model = best[1].get('model', 'unknown')
      except Exception:
        pass

    soul = read_excerpt(d / 'SOUL.md') or read_excerpt(d / 'agent' / 'SOUL.md')
    memory = read_excerpt(d / 'MEMORY.md')

    display = rg.get('displayName', aid.capitalize())
    role = rg.get('role', 'OpenClaw Agent')
    rank = rg.get('rank', '—')
    mission = rg.get('mission', '')

    icon = display[:1].upper() if display else aid[:1].upper()

    items.append({
      'id': aid,
      'name': display,
      'icon': icon,
      'role': role,
      'rank': rank,
      'mission': mission,
      'status': 'online',
      'model': model,
      'soul': soul,
      'memory': memory
    })

payload = {'agents': items}
OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'wrote {len(items)} agents -> {OUT}')
