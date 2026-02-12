#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8080}"
HEALTH_URL="$BASE_URL/api/health"
DASHBOARD_URL="$BASE_URL/api/dashboard"
TIMEOUT="${TIMEOUT_SECONDS:-5}"

check_endpoint() {
  local url="$1"
  local name="$2"

  local status
  status=$(curl -sS -m "$TIMEOUT" -o /tmp/mc_check_body.$$ -w "%{http_code}" "$url" || true)

  if [[ "$status" == "200" ]]; then
    echo "✅ $name: HTTP 200"
    return 0
  fi

  echo "❌ $name: HTTP ${status:-000}"
  if [[ -s /tmp/mc_check_body.$$ ]]; then
    echo "   body: $(head -c 180 /tmp/mc_check_body.$$ | tr '\n' ' ')"
  fi
  return 1
}

echo "== Mission Control Status Check =="
echo "Base URL: $BASE_URL"
echo "Timeout: ${TIMEOUT}s"
echo

ok=0
if check_endpoint "$HEALTH_URL" "health"; then
  ((ok+=1))
fi
if check_endpoint "$DASHBOARD_URL" "dashboard"; then
  ((ok+=1))
fi

echo
if [[ "$ok" -eq 2 ]]; then
  echo "🟢 Mission Control ONLINE"
  rm -f /tmp/mc_check_body.$$
  exit 0
else
  echo "🔴 Mission Control OFFLINE/DEGRADED"
  echo "Dica: cd /root/.openclaw/workspace-stark/APP && nohup python3 app_server.py >/tmp/mission-control.log 2>&1 &"
  rm -f /tmp/mc_check_body.$$
  exit 1
fi
