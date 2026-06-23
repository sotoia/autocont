#!/usr/bin/env bash
# AUTOCONT — News poller (cada 1h)
# Llama al endpoint /api/news/poll. Si el dashboard no está corriendo,
# registra y se va — la app no necesita estar siempre arriba.
set -u

LOG="$HOME/Library/Logs/AUTOCONT-news.log"
URL="http://localhost:3000/api/news/poll"

mkdir -p "$(dirname "$LOG")"
echo "============================================================" >> "$LOG"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] News poll firing" >> "$LOG"

HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:3000" 2>/dev/null || echo "000")
if [ "$HTTP" = "000" ]; then
  echo "[news] dashboard no está corriendo, salto el poll" >> "$LOG"
  exit 0
fi

RESPONSE=$(curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '{"sinceHours": 24}' \
  --max-time 180)

echo "[news] response: $RESPONSE" >> "$LOG"
