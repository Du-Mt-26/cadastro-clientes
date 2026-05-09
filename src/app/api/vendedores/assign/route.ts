import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, canSeeAllClients, type Role } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidateCache } from '@/lib/clientes-cache'

// ─── PATCH /api/vendedores/assign — Assign a client to a vendor ─────────────

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const role = (session.user as any).role as Role
    if (!canSeeAllClients(role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await request.json()
    const { clienteCodigo, vendedorId } = body

    if (!clienteCodigo) {
      return NextResponse.json(
        { error: 'clienteCodigo é obrigatório' },
        { status: 400 }
      )
    }

    // Find the client by codigo
    const cliente = await db.cliente.findUnique({
      where: { codigo: clienteCodigo },
    })

    if (!cliente) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      )
    }

    if (vendedorId === null || vendedorId === undefined || vendedorId === '') {
      // Clear assignment
      await db.cliente.update({
        where: { codigo: clienteCodigo },
        data: {
          vendedorId: null,
          vendedor: '',
        },
      })
    } else {
      // Find the vendor user to get their name
      const vendedor = await db.user.findUnique({
        where: { id: vendedorId },
        select: { id: true, name: true, role: true },
      })

      if (!vendedor) {
        return NextResponse.json(
          { error: 'Vendedor não encontrado' },
          { status: 404 }
        )
      }

      await db.cliente.update({
        where: { codigo: clienteCodigo },
        data: {
          vendedorId: vendedorId,
          vendedor: vendedor.name,
        },
      })
    }

    // Invalidate the clientes cache after assignment
    invalidateCache()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error assigning vendedor:', error)
    return NextResponse.json(
      { error: 'Erro ao atribuir vendedor' },
      { status: 500 }
    )
  }
}
