import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, canManageUsers, invalidatePermissionCache, type Role } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * GET /api/permissions — List all permissions with their role overrides (Admin only)
 *
 * Returns:
 *  - permissions: all Permission records
 *  - rolePermissions: all RolePermission records
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

    const [permissions, rolePermissions] = await Promise.all([
      db.permission.findMany({
        orderBy: [{ category: 'asc' }, { key: 'asc' }],
      }),
      db.rolePermission.findMany({
        orderBy: [{ role: 'asc' }, { permissionKey: 'asc' }],
        include: {
          permission: {
            select: { key: true, description: true, category: true },
          },
        },
      }),
    ])

    return NextResponse.json({ permissions, rolePermissions })
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

    const validRoles: Role[] = ['ADMIN', 'DIRETOR_COMERCIAL', 'GERENTE_COMERCIAL', 'VENDEDOR']
    if (!validRoles.includes(targetRole)) {
      return NextResponse.json(
        { error: `Papel inválido. Use: ${validRoles.join(', ')}` },
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
