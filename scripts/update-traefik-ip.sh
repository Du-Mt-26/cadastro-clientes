#!/bin/bash
# Atualiza o IP do mtech-crm-app no dynamic.yml do Traefik
# Rodar depois de: docker compose up -d --force-recreate mtech-crm-app

set -euo pipefail

DYNAMIC_YML="/opt/duda-bot/traefik/dynamic.yml"
NETWORK="duda-bot_duda-network"
PORT=3000

NEW_IP=$(docker inspect mtech-crm-app --format "{{range \$k, \$v := .NetworkSettings.Networks}}{{if eq \$k \"$NETWORK\"}}{{\$v.IPAddress}}{{end}}{{end}}")

if [ -z "$NEW_IP" ]; then
  echo "ERRO: Não consegui obter IP do container mtech-crm-app"
  exit 1
fi

echo "IP atual do mtech-crm-app: $NEW_IP"

if ! grep -q "http://[0-9.]*:$PORT" "$DYNAMIC_YML"; then
  echo "ERRO: Não encontrei linha 'http://IP:$PORT' no $DYNAMIC_YML"
  exit 1
fi

sed -i "s|http://[0-9.]*:$PORT|http://$NEW_IP:$PORT|" "$DYNAMIC_YML"
echo "✓ dynamic.yml atualizado: http://$NEW_IP:$PORT"

sleep 2

echo ""
echo "=== Teste pelo domínio ==="
HTTP_CODE=$(curl -sI -m 10 https://clientes.nikki.com.br/login -o /dev/null -w "%{http_code}")
echo "HTTP: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ]; then
  echo "✅ Tudo OK!"
else
  echo "⚠️  HTTP $HTTP_CODE — verifique os logs do Traefik"
fi
