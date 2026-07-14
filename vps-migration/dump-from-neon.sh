#!/bin/bash
set -euo pipefail
NEON_URL="${1:-${DATABASE_URL:-}}"
if [ -z "${NEON_URL}" ]; then
  echo "Uso: $0 \"postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require\""
  exit 1
fi
if ! command -v pg_dump &> /dev/null; then
  echo "Instale postgresql-client: apt install postgresql-client"
  exit 1
fi
OUTPUT_FILE="mtech-neon-dump-$(date +%Y%m%d-%H%M%S).sql.gz"
echo "Dumping Neon..."
pg_dump "${NEON_URL}" --no-owner --no-acl --format=plain 2>/tmp/neon-dump-error.log | gzip > "${OUTPUT_FILE}"
if [ ! -s "${OUTPUT_FILE}" ]; then
  echo "Dump falhou"
  cat /tmp/neon-dump-error.log
  exit 1
fi
FILE_SIZE=$(ls -lh "${OUTPUT_FILE}" | awk '{print $5}')
echo "OK: ${OUTPUT_FILE} (${FILE_SIZE})"
