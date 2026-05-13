import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions, canAssignVendedor, type Role } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * GET /api/vendedores — List all vendedores with client count breakdown
 * Accessible by ADMIN, DIRETOR_COMERCIAL, GERENTE_COMERCIAL
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const role = (session.user as any).role as Role
    if (!canAssignVendedor(role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const users = await db.user.findMany({
      orderBy: [{ isSystemUser: 'asc' }, { active: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        twoFactorEnabled: true,
        isSystemUser: true,
        clientes: {
          select: {
            tipo: true,
            fornecedor: true,
            vendedorId: true,
          },
        },
      },
    })

    const vendedores = users.map((u) => {
      // Compute carteira counts using the new logic
      let carteiraRevendas = 0
      let carteiraCorporativo = 0
      let bolsao = 0
      let listaFria = 0
      let fornecedores = 0

      for (const c of u.clientes) {
        if (u.isSystemUser) {
          if (u.email === 'bolsao@sistema.mtech') bolsao++
          else if (u.email === 'lista-fria@sistema.mtech') listaFria++
          else if (u.email === 'fornecedor@sistema.mtech') fornecedores++
        } else {
          // Regular vendedor
          if (c.fornecedor) {
            fornecedores++
          } else if (c.tipo === 'CORPORATIVO') {
            carteiraCorporativo++
          } else {
            carteiraRevendas++
          }
        }
      }

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        twoFactorEnabled: u.twoFactorEnabled,
        isSystemUser: u.isSystemUser,
        clientCount: u.clientes.length,
        carteiraRevendas,
        carteiraCorporativo,
        bolsao,
        listaFria,
        fornecedores,
      }
    })

    return NextResponse.json({ vendedores })
  } catch (error) {
    console.error('Error listing vendedores:', error)
    return NextResponse.json({ error: 'Erro ao listar vendedores' }, { status: 500 })
  }
}

/**
 * POST /api/vendedores — Create a new vendedor
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const role = (session.user as any).role as Role
    if (!canAssignVendedor(role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await request.json()
    const { name, email, password: rawPassword, role: newRole, isSystemUser } = body

    if (!name || !email || !rawPassword) {
      return NextResponse.json(
        { error: 'Nome, email e senha são obrigatórios' },
        { status: 400 }
      )
    }

    const validRoles: Role[] = ['ADMIN', 'DIRETOR_COMERCIAL', 'GERENTE_COMERCIAL', 'VENDEDOR']
    if (!validRoles.includes(newRole)) {
      return NextResponse.json(
        { error: `Papel inválido. Use: ${validRoles.join(', ')}` },
        { status: 400 }
      )
    }

    // Check if email already exists
    const existing = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (existing) {
      return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 })
    }

    if (rawPassword.length < 6) {
      return NextResponse.json(
        { error: 'Senha deve ter no mínimo 6 caracteres' },
        { status: 400 }
      )
    }

    const hashedPassword = await bcrypt.hash(rawPassword, 12)

    const user = await db.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: newRole,
        isSystemUser: isSystemUser || false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        twoFactorEnabled: true,
        isSystemUser: true,
        createdAt: true,
      },
    })

    // Invalidate system user IDs cache if creating a system user
    if (isSystemUser) {
      const { invalidateSystemUserIds } = await import('@/lib/auth')
      invalidateSystemUserIds()
    }

    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    console.error('Error creating vendedor:', error)
    return NextResponse.json({ error: 'Erro ao criar vendedor' }, { status: 500 })
  }
}

/**
 * PATCH /api/vendedores — Update a vendedor (name, email, active, password)
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const currentRole = (session.user as any).role as Role
    if (!canAssignVendedor(currentRole)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await request.json()
    const { id, name, email, password: rawPassword, role, active } = body

    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { id } })
    if (!user) {
      return NextResponse.json({ error: 'Vendedor não encontrado' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name.trim()
    if (email !== undefined) updateData.email = email.toLowerCase().trim()
    if (role !== undefined) {
      const validRoles: Role[] = ['ADMIN', 'DIRETOR_COMERCIAL', 'GERENTE_COMERCIAL', 'VENDEDOR']
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: 'Papel inválido' }, { status: 400 })
      }
      updateData.role = role
    }
    if (active !== undefined) updateData.active = active
    if (rawPassword) {
      if (rawPassword.length < 6) {
        return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 })
      }
      updateData.password = await bcrypt.hash(rawPassword, 12)
    }

    const updated = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        twoFactorEnabled: true,
        isSystemUser: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // Sync the vendedor text field on all linked Cliente records when name changes
    if (name !== undefined && name.trim() !== user.name) {
      await db.cliente.updateMany({
        where: { vendedorId: id },
        data: { vendedor: name.trim() },
      })
      // Invalidate clientes cache since we changed Cliente records
      const { invalidateCache } = await import('@/lib/clientes-cache')
      invalidateCache()
    }

    return NextResponse.json({ user: updated })
  } catch (error) {
    console.error('Error updating vendedor:', error)
    return NextResponse.json({ error: 'Erro ao atualizar vendedor' }, { status: 500 })
  }
}
