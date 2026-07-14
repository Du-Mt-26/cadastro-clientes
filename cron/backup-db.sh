#!/bin/bash
set -euo pipefail
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/backups"
BACKUP_FILE="${BACKUP_DIR}/mtech-db-${DATE}.sql.gz"
echo "[$TIMESTAMP] Starting backup..."
mkdir -p "${BACKUP_DIR}"
pg_dump -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-acl --format=plain 2>/tmp/pgdump-error.log | gzip > "${BACKUP_FILE}"
if [ ! -s "${BACKUP_FILE}" ]; then
  echo "[$TIMESTAMP] ERRO: backup vazio"
  cat /tmp/pgdump-error.log
  exit 1
fi
FILE_SIZE=$(ls -lh "${BACKUP_FILE}" | awk '{print $5}')
echo "[$TIMESTAMP] Backup OK: ${BACKUP_FILE} (${FILE_SIZE})"
find "${BACKUP_DIR}" -name "mtech-db-*.sql.gz" -mtime +30 -delete
echo "[$TIMESTAMP] Backup complete"
