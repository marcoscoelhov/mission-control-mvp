#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/root/.openclaw/workspace-stark/APP"
CHECK_SCRIPT="$APP_DIR/scripts/check-mission-control.sh"
LOG_FILE="/tmp/mission-control-watchdog.log"

now(){ date -u +"%Y-%m-%dT%H:%M:%SZ"; }

{
  echo "[$(now)] watchdog tick"
  if "$CHECK_SCRIPT" >/tmp/mc_watchdog_check.out 2>&1; then
    echo "[$(now)] status=online"
    cat /tmp/mc_watchdog_check.out
    exit 0
  fi

  echo "[$(now)] status=offline, attempting restart"
  cat /tmp/mc_watchdog_check.out || true

  cd "$APP_DIR"
  nohup python3 app_server.py >/tmp/mission-control.log 2>&1 &
  sleep 2

  if "$CHECK_SCRIPT" >/tmp/mc_watchdog_check_after.out 2>&1; then
    echo "[$(now)] recovery=success"
    cat /tmp/mc_watchdog_check_after.out
    exit 0
  else
    echo "[$(now)] recovery=failed"
    cat /tmp/mc_watchdog_check_after.out || true
    echo "[$(now)] tail /tmp/mission-control.log"
    tail -n 40 /tmp/mission-control.log || true
    exit 1
  fi
} >> "$LOG_FILE" 2>&1
