import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, canManageUsers, invalidatePermissionCache, type Role, FALLBACK_PERMISSIONS } from '@/lib/auth'
import { db } from '@/lib/db'

const VALID_ROLES: Role[] = ['ADMIN', 'DIRETOR_COMERCIAL', 'GERENTE_COMERCIAL', 'VENDEDOR']

/**
 * GET /api/permissions — List all permissions grouped by role (Admin only)
 *
 * Returns:
 *  - permissions: Record<role, Record<key, { label, category, allowed }>>
 *    Nested structure for easy UI rendering per role.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const role = (session.user as any).role as Role
    if (!canManageUsers(role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    // Fetch all permissions and role permissions from DB
    const [permissions, rolePermissions] = await Promise.all([
      db.permission.findMany({
        orderBy: [{ category: 'asc' }, { key: 'asc' }],
      }),
      db.rolePermission.findMany({
        orderBy: [{ role: 'asc' }, { permissionKey: 'asc' }],
      }),
    ])

    // If no permissions in DB yet (migration not run), use fallback
    if (permissions.length === 0) {
      // Build the response from hardcoded fallback
      const result: Record<string, Record<string, { label: string; category: string; allowed: boolean }>> = {}
      for (const r of VALID_ROLES) {
        result[r] = {}
        const fallback = FALLBACK_PERMISSIONS[r] ?? {}
        for (const [key, allowed] of Object.entries(fallback)) {
          result[r][key] = {
            label: key, // No description in fallback
            category: key.split('.')[0] === 'clients' ? 'clientes'
              : key.split('.')[0] === 'bolsao' ? 'bolsao'
              : key.split('.')[0] === 'users' ? 'users'
              : key.split('.')[0] === 'sheets' ? 'sheets'
              : 'geral',
            allowed,
          }
        }
      }
      return NextResponse.json({ permissions: result })
    }

    // Build a lookup for role permissions: Map<"role:key", allowed>
    const rpLookup = new Map<string, boolean>()
    for (const rp of rolePermissions) {
      rpLookup.set(`${rp.role}:${rp.permissionKey}`, rp.allowed)
    }

    // Build the nested response structure
    const result: Record<string, Record<string, { label: string; category: string; allowed: boolean }>> = {}

    for (const r of VALID_ROLES) {
      result[r] = {}
      for (const perm of permissions) {
        const lookupKey = `${r}:${perm.key}`
        const allowed = rpLookup.has(lookupKey)
          ? rpLookup.get(lookupKey)!
          : (FALLBACK_PERMISSIONS[r]?.[perm.key] ?? false)

        result[r][perm.key] = {
          label: perm.description || perm.key,
          category: perm.category,
          allowed,
        }
      }
    }

    return NextResponse.json({ permissions: result })
  } catch (error) {
    console.error('Error listing permissions:', error)
    return NextResponse.json({ error: 'Erro ao listar permissões' }, { status: 500 })
  }
}

/**
 * PATCH /api/permissions — Update a role permission (Admin only)
 *
 * Body:
 *  - role: string (ADMIN | DIRETOR_COMERCIAL | GERENTE_COMERCIAL | VENDEDOR)
 *  - permissionKey: string (e.g. "clients.export")
 *  - allowed: boolean
 *
 * Upserts the RolePermission record and invalidates the permission cache.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const role = (session.user as any).role as Role
    if (!canManageUsers(role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await request.json()
    const { role: targetRole, permissionKey, allowed } = body

    if (!targetRole || !permissionKey || typeof allowed !== 'boolean') {
      return NextResponse.json(
        { error: 'role, permissionKey e allowed (boolean) são obrigatórios' },
        { status: 400 }
      )
    }

    if (!VALID_ROLES.includes(targetRole)) {
      return NextResponse.json(
        { error: `Papel inválido. Use: ${VALID_ROLES.join(', ')}` },
        { status: 400 }
      )
    }

    // Verify the permission key exists
    const permission = await db.permission.findUnique({
      where: { key: permissionKey },
    })

    if (!permission) {
      return NextResponse.json(
        { error: `Permissão "${permissionKey}" não encontrada` },
        { status: 404 }
      )
    }

    // Upsert the role permission
    await db.rolePermission.upsert({
      where: {
        role_permissionKey: {
          role: targetRole,
          permissionKey,
        },
      },
      create: {
        role: targetRole,
        permissionKey,
        allowed,
      },
      update: {
        allowed,
      },
    })

    // Invalidate permission cache so changes take effect immediately
    invalidatePermissionCache()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating permission:', error)
    return NextResponse.json({ error: 'Erro ao atualizar permissão' }, { status: 500 })
  }
}
