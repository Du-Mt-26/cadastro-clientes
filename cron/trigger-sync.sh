#!/bin/bash
set -euo pipefail
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo ""
echo "[$TIMESTAMP] Triggering Linvix sync..."
if [ -z "${APP_URL:-}" ] || [ -z "${CRON_SECRET:-}" ]; then
  echo "[$TIMESTAMP] ERRO: APP_URL ou CRON_SECRET nao configurados"
  exit 1
fi
SYNC_URL="${APP_URL}/api/sync/linvix?mode=auto"
RESPONSE=$(curl -s -m 300 -w "\n%{http_code}" -X GET "${SYNC_URL}" -H "x-sync-secret: ${CRON_SECRET}" -H "User-Agent: mtech-cron/1.0" || true)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "  HTTP: ${HTTP_CODE}"
echo "  Body: ${BODY:0:500}"
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "409" ]; then
  echo "[$TIMESTAMP] OK"
  exit 0
else
  echo "[$TIMESTAMP] FAILED (HTTP $HTTP_CODE)"
  exit 1
fi
