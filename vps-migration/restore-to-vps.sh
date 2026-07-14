#!/bin/bash
set -euo pipefail
DUMP_FILE="${1:-}"
if [ -z "${DUMP_FILE}" ]; then
  echo "Uso: $0 <dump-file.sql.gz>"
  exit 1
fi
if [ ! -f "${DUMP_FILE}" ]; then
  echo "Arquivo nao encontrado: ${DUMP_FILE}"
  exit 1
fi
CONTAINER="mtech-db"
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "Container ${CONTAINER} nao esta rodando. Rode: docker compose up -d mtech-db"
  exit 1
fi
POSTGRES_USER=$(grep '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "mtech")
POSTGRES_DB=$(grep '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "mtech")
POSTGRES_USER="${POSTGRES_USER:-mtech}"
POSTGRES_DB="${POSTGRES_DB:-mtech}"
echo "Dump: ${DUMP_FILE}"
echo "DB: ${POSTGRES_DB} | User: ${POSTGRES_USER}"
read -p "Vai APAGAR e recriar o database. Continuar? [y/N] " CONFIRM
if [ "${CONFIRM}" != "y" ] && [ "${CONFIRM}" != "Y" ]; then exit 0; fi
docker exec -i "${CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS \"${POSTGRES_DB}\" WITH (FORCE);"
docker exec -i "${CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres -c "CREATE DATABASE \"${POSTGRES_DB}\";"
echo "Restaurando..."
gunzip -c "${DUMP_FILE}" | docker exec -i "${CONTAINER}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -q
echo ""
echo "Verificacao — contagens:"
docker exec -i "${CONTAINER}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" << 'EOF'
SELECT 'Clientes' as tabela, COUNT(*) as total FROM "Cliente"
UNION ALL SELECT 'Users', COUNT(*) FROM "User"
UNION ALL SELECT 'Vendas', COUNT(*) FROM "Venda"
UNION ALL SELECT 'AuditLogs', COUNT(*) FROM "AuditLog"
ORDER BY total DESC;
EOF
