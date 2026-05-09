# Task ID: 1 — Vendedor Management Modal

## Work Summary

Created the VendedorManagementModal component and integrated it into the application.

## Files Created/Modified

### Created
- `src/components/vendedor-management-modal.tsx` — Full-featured modal for managing vendors

### Modified
- `src/app/api/vendedores/route.ts` — Updated API route (cleaned unused imports, using `canAssignVendedor` for access control)
- `src/components/auth-user-menu.tsx` — Added "Cadastro de Vendedores" menu item for privileged roles (ADMIN, DIRETOR_COMERCIAL, GERENTE_COMERCIAL), added `onOpenVendedorManagement` prop and `Briefcase` icon
- `src/app/page.tsx` — Added `showVendedorManagement` state, imported `VendedorManagementModal`, rendered it alongside other modals, passed `onOpenVendedorManagement` to `AuthUserMenu`

## Component Features

- **Dialog** with max-w-4xl, max-h-[85vh]
- **Header**: "Cadastro de Vendedores" with subtitle showing total count, active count, total clients
- **Add vendor button** at top (teal accent)
- **Vendor cards** showing:
  - Name, email, role badge (using ROLE_LABELS/ROLE_COLORS)
  - Active/Inactive toggle (Switch component)
  - 2FA indicator (ShieldCheck/ShieldX icons)
  - Client count breakdown: Revendas (teal), Corporativo (purple), Fria (slate), Bolsão (amber), Total
  - "Inativo" badge for inactive vendors with muted/gray styling
- **Inline new vendor form** when "Novo Vendedor" is clicked (default password: Mtech@2026, default role: VENDEDOR)
- **Inline edit** for name, email, and role
- **Password reset** with inline input and save/cancel
- Loading states with Loader2 spinner
- Error handling with toast notifications
- Dark mode support
- Responsive design

## API Route Details

- GET `/api/vendedores` — Lists all users with client count breakdown per carteira, ordered by active desc, name asc
- POST `/api/vendedores` — Creates new user (requires canAssignVendedor permission)
- PATCH `/api/vendedores` — Updates user (name, email, role, active, password)
- Access control: `canAssignVendedor` (ADMIN, DIRETOR_COMERCIAL, GERENTE_COMERCIAL)

## Verification
- Lint passes clean
- Dev server running without errors
