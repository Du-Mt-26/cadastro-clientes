# Worklog — Mtech Cadastro de Clientes

---
Task ID: 1
Agent: Main
Task: Implement authentication, 2FA, RBAC, and carteira system

Work Log:
- Updated Prisma schema with User model, carteira/vendedorId fields on Cliente
- Installed next-auth@4, bcryptjs, otplib@12, qrcode, and type definitions
- Created auth configuration (lib/auth.ts) with credentials provider, JWT sessions, RBAC helpers
- Created NextAuth API route (api/auth/[...nextauth]/route.ts)
- Created auth provider component (components/auth-provider.tsx)
- Updated layout.tsx with AuthProvider wrapper
- Created middleware.ts with custom auth guard (API returns 401, pages redirect to /login)
- Created login page (app/login/page.tsx) with email/password + 2FA step
- Created 2FA setup/verify/disable API routes (api/auth/2fa/*)
- Created user management API (api/users) with CRUD operations (admin only)
- Created Bolsão/Carteira Fria API (api/clientes/bolsao) with auto-move logic
- Created AuthUserMenu component with role badge, 2FA setup, user management
- Created UserManagementModal component (admin user management dialog)
- Created TwoFactorSetupModal component (QR code, verify, disable)
- Updated tipos.ts with carteira/vendedor_id fields, carteira stats, carteira filter
- Updated clientes-cache.ts with carteira/vendedorId mapping
- Updated api/clientes/route.ts with auth checks, role-based filtering, carteira support
- Updated page.tsx with session guard, AuthUserMenu, Bolsão button, carteira filter/badges/stats
- Seeded 5 initial users: Renato (ADMIN), Artur (ADMIN), Priscila (DIRETOR_COMERCIAL), Michelly (GERENTE_COMERCIAL), Débora (VENDEDOR)
- Linked 30 existing clients to Priscila based on vendedor field matching
- Fixed otplib version (downgraded from v13 to v12 for authenticator API)
- Fixed db.ts to lazy-load @libsql/client (Turbopack compatibility)
- Fixed middleware to return 401 JSON for API routes instead of redirecting

Stage Summary:
- Full authentication system with login/password + 2FA (TOTP/Google Authenticator)
- RBAC with 4 roles: ADMIN, DIRETOR_COMERCIAL, GERENTE_COMERCIAL, VENDEDOR
- Vendedores see only their clients + Bolsão (151+ days) clients
- Admin/Diretor/Gerente see all clients
- Carteira system: CARTEIRA_ATUAL → BOLSAO (151+ days) → CARTEIRA_FRIA (all vendors tried)
- User management: create, edit, deactivate, password reset (admin only)
- 2FA setup with QR code scanning
- All API routes protected with auth
- Audit logs now record who made changes
- Default passwords: Mtech@2024 for all seeded users

---
Task ID: update-renato-email
Agent: Main
Task: Update Renato's email from fake (renato@mtech.com.br) to real email (renato@renatoalvesfilho.com.br) with password 123mudar@2026!

Work Log:
- Updated prisma/seed-users.ts with real email renato@renatoalvesfilho.com.br and password 123mudar@2026!
- Deleted old user (renato@mtech.com.br) and created new user with real email in SQLite database
- Verified password hash matches with bcrypt.compare — confirmed working
- Verified user: name=Renato, role=ADMIN, active=true, twoFactorEnabled=false
- Tested login flow: CSRF token obtained, POST to /api/auth/callback/credentials returns 302 (success redirect)
- No other code references to renato@mtech.com.br found in src/ directory

Stage Summary:
- Renato's login: renato@renatoalvesfilho.com.br / 123mudar@2026!
- Other users still use @mtech.com.br emails (Artur, Priscila, Michelly, Débora) with password Mtech@2024
- Login system fully functional with real email
- 2FA not yet enabled for any user (each user can set it up from their profile menu)

---
Task ID: neon-migration-prep
Agent: Main
Task: Prepare project for Vercel + Neon (PostgreSQL) deployment

Work Log:
- Updated prisma/schema.prisma: provider = "postgresql", added @db.Text for long text fields, added User↔Cliente relation (vendedorUser)
- Created prisma/schema.neon.prisma: PostgreSQL schema ready for Neon
- Created prisma/schema.sqlite.prisma: SQLite schema for local dev (sandbox has no PostgreSQL)
- Simplified src/lib/db.ts: removed all Turso/libsql adapter code, now just uses PrismaClient directly
- Updated prisma/seed.ts: removed all Turso/libsql imports and conditional logic
- Updated prisma/seed-users.ts: removed SQLite comment
- Updated vercel.json: removed Turso env vars, added Neon DATABASE_URL format
- Removed dependencies: @libsql/client, @prisma/adapter-libsql
- Added package.json scripts: db:neon (switch to PostgreSQL), db:sqlite (switch to SQLite)
- Created switch-db.sh script for schema switching
- Removed previewFeatures = ["driverAdapters"] from Prisma generator (not needed for PostgreSQL)
- Verified: lint passes, dev server starts, 2079 clients + 5 users intact
- Currently running on SQLite schema (for sandbox), ready to switch to Neon anytime

Stage Summary:
- Project is now Neon/PostgreSQL-ready
- Two schemas maintained: schema.neon.prisma (PostgreSQL) and schema.sqlite.prisma (local dev)
- Switch command: `bun run db:neon` or `bun run db:sqlite`
- No more libsql/Turso dependencies in codebase
- db.ts is dramatically simpler (3 lines of logic vs 20+ before)
- To deploy: 1) Create Neon account, 2) Get connection string, 3) Set DATABASE_URL in Vercel, 4) Run `bun run db:neon && prisma db push`
