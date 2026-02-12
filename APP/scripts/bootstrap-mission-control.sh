#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="/tmp/mission-control.log"

cd "$ROOT"

if pgrep -f "$ROOT/app_server.py" >/dev/null 2>&1; then
  echo "[bootstrap] app_server já está rodando"
else
  nohup python3 "$ROOT/app_server.py" >"$LOG" 2>&1 &
  sleep 1
  echo "[bootstrap] app_server iniciado"
fi

python3 - <<'PY'
import urllib.request, json
url='http://127.0.0.1:8080/api/health'
with urllib.request.urlopen(url, timeout=5) as r:
    print('[bootstrap] health', r.status, r.read().decode())
PY

echo "[bootstrap] pronto. dashboard: http://127.0.0.1:8080"
