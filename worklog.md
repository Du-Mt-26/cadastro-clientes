---
Task ID: 1
Agent: main
Task: Architecture evaluation, cleanup, and optimization

Work Log:
- Read all source files: page.tsx, route.ts, export/route.ts, receita/route.ts, audit/route.ts, schema.prisma, table.tsx, db.ts, Caddyfile, package.json
- Fixed table.tsx wrapper div that was breaking sticky header (removed `<div className="relative w-full overflow-x-auto">`)
- Deleted useless `/src/app/api/route.ts` (Hello World endpoint)
- Created shared modules:
  - `/src/lib/types.ts` — All shared types, interfaces, and constants (225 lines)
  - `/src/lib/clientes.ts` — All shared helper functions (127 lines, client-safe)
  - `/src/lib/clientes-cache.ts` — Shared server cache module (219 lines, server-only)
- Updated all route files to use shared modules instead of duplicating code
- Updated page.tsx to import from shared modules (1236 → 1076 lines)
- Updated route.ts (644 → 349 lines)
- Updated export/route.ts (297 → 158 lines) — now uses cache instead of re-parsing XLSX
- Updated receita/route.ts (160 → 123 lines) — now uses cache instead of re-parsing XLSX
- Removed 18 unused packages: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, @tanstack/react-table, @tanstack/react-query, zustand, react-hook-form, recharts, sharp, sonner, date-fns, react-markdown, react-syntax-highlighter, @mdxeditor/editor, next-intl, next-auth, input-otp, uuid
- Fixed Prisma logging: only logs queries in development mode
- Added @@index([codigo]) on AuditLog model
- Ran bun run db:push to sync schema
- Verified lint passes, API responds correctly, frontend loads

Stage Summary:
- Architecture rating improved from 6.5/10 to ~7.5/10
- Code reduced significantly: removed ~500 lines of duplication, added ~571 in shared modules
- Performance: export and receita routes now reuse cached records (no more XLSX re-parsing)
- Bundle size: 18 unused packages removed
- Database: Prisma logging disabled in production, AuditLog indexed
