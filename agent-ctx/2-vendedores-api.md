# Task 2: Create /api/vendedores API Route

## Agent: Backend Developer
## Date: 2024-03-05

## Work Done

### 1. Created `src/app/api/vendedores/route.ts`
Implements three HTTP methods:

- **GET** — Lists all users with roles VENDEDOR, DIRETOR_COMERCIAL, GERENTE_COMERCIAL with client counts:
  - Returns `VendedorInfo[]` with: id, name, email, active, twoFactorEnabled, role
  - Includes aggregated counts: clientCount, carteiraRevendas, carteiraCorporativo, carteiraFria, bolsoa
  - Auth: requires `canSeeAllClients(role)` permission

- **POST** — Creates a new VENDEDOR user:
  - Body: `{ name, email, password? }`
  - Default password: "Mtech@2026" if not provided
  - Hashes password with bcrypt (12 rounds)
  - Validates email uniqueness (409 if duplicate)
  - Always sets role to "VENDEDOR"

- **PATCH** — Updates a vendor user:
  - Body: `{ id, name?, email?, password?, active? }`
  - Hashes password if provided (min 6 chars)
  - When name changes, updates `vendedor` text field on ALL linked Cliente records
  - Invalidates clientes cache after update

### 2. Created `src/app/api/vendedores/assign/route.ts`
Implements PATCH method:

- **PATCH** — Assigns/unassigns a client to a vendor:
  - Body: `{ clienteCodigo, vendedorId }`
  - Looks up client by `codigo` (unique field)
  - If vendedorId is null/empty: clears both `vendedorId` and `vendedor` text field
  - If vendedorId provided: sets `vendedorId` and updates `vendedor` text to match User.name
  - Validates both client and vendor existence
  - Invalidates clientes cache after update

## Patterns Followed
- Same auth pattern as `/api/users/route.ts` (getServerSession + role check)
- Same error handling (try/catch with proper status codes)
- Never returns password in any response
- Uses NextRequest/NextResponse from 'next/server'
- All responses are JSON

## Verification
- Lint passes clean (no errors)
- Dev server compiles successfully
