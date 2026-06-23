#!/usr/bin/env bash
# AUTOCONT — Ideas poller
# Llama al endpoint /api/ideas/poll cada 5h vía launchd. Si el dashboard no
# está corriendo, registra y se va — la app no necesita estar siempre arriba.
set -u

LOG="$HOME/Library/Logs/AUTOCONT-ideas.log"
URL="http://localhost:3000/api/ideas/poll"

mkdir -p "$(dirname "$LOG")"
echo "============================================================" >> "$LOG"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Ideas poll firing" >> "$LOG"

# ¿Está vivo el server?
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:3000" 2>/dev/null || echo "000")
if [ "$HTTP" = "000" ]; then
  echo "[ideas] dashboard no está corriendo, salto el poll" >> "$LOG"
  exit 0
fi

# Ejecuta el poll. Timeout alto porque el endpoint puede tardar 1-3 min.
RESPONSE=$(curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '{"limitPerSource": 3, "sinceHours": 24}' \
  --max-time 600)

echo "[ideas] response: $RESPONSE" >> "$LOG"
