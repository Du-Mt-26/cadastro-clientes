#!/bin/bash
# Switch Prisma schema between SQLite (local dev) and PostgreSQL (Neon/production)
#
# Usage:
#   ./switch-db.sh sqlite     # Switch to SQLite for local dev
#   ./switch-db.sh postgres   # Switch to PostgreSQL for Neon/production
#
# After switching, run: bun run prisma generate

set -e

SCHEMA_DIR="prisma"
SQLITE_SCHEMA="$SCHEMA_DIR/schema.sqlite.prisma"
PG_SCHEMA="$SCHEMA_DIR/schema.prisma"
MAIN_SCHEMA="$SCHEMA_DIR/schema.prisma"
BACKUP_DIR="$SCHEMA_DIR/.backups"

mkdir -p "$BACKUP_DIR"

case "$1" in
  sqlite)
    if [ ! -f "$SQLITE_SCHEMA" ]; then
      echo "❌ SQLite schema not found: $SQLITE_SCHEMA"
      exit 1
    fi
    # Backup current PostgreSQL schema
    cp "$PG_SCHEMA" "$BACKUP_DIR/schema.postgres.prisma"
    # Copy SQLite schema as main
    cp "$SQLITE_SCHEMA" "$MAIN_SCHEMA"
    echo "✅ Switched to SQLite (local dev)"
    echo "   Run: bun run prisma generate && bun run db:push"
    ;;

  postgres|postgresql|pg|neon)
    if [ -f "$BACKUP_DIR/schema.postgres.prisma" ]; then
      cp "$BACKUP_DIR/schema.postgres.prisma" "$MAIN_SCHEMA"
      echo "✅ Switched to PostgreSQL (Neon/production)"
    else
      echo "✅ Already using PostgreSQL schema (no backup needed)"
    fi
    echo "   Make sure DATABASE_URL points to Neon"
    echo "   Run: bun run prisma generate && bun run db:push"
    ;;

  status)
    PROVIDER=$(grep 'provider = ' "$MAIN_SCHEMA" | head -1 | sed 's/.*provider = "\(.*\)"/\1/')
    echo "Current provider: $PROVIDER"
    ;;

  *)
    echo "Usage: ./switch-db.sh {sqlite|postgres|status}"
    echo ""
    echo "  sqlite    — Switch to SQLite for local development"
    echo "  postgres  — Switch to PostgreSQL for Neon/production"
    echo "  status    — Show current provider"
    exit 1
    ;;
esac
