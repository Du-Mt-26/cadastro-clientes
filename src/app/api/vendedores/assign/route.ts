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
    const { clienteCodigo, vendedorId, carteira: targetCarteira } = body

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

    // Handle direct carteira moves (LISTA_FRIA, FORNECEDOR)
    if (targetCarteira === 'LISTA_FRIA') {
      await db.cliente.update({
        where: { codigo: clienteCodigo },
        data: {
          carteira: 'LISTA_FRIA',
          vendedorId: null,
          vendedor: 'LISTA FRIA',
          dataAtribuicaoVendedor: null,
          dataEntradaBolsao: null,
          carteiraLocked: true,
          lockedAt: new Date(),
          lockedBy: (session.user as any).id,
          lockedReason: `Movido para LISTA_FRIA por ${(session.user as any).name}`,
        },
      })
      invalidateCache()
      return NextResponse.json({ success: true, carteira: 'LISTA_FRIA' })
    }

    if (targetCarteira === 'FORNECEDOR') {
      await db.cliente.update({
        where: { codigo: clienteCodigo },
        data: {
          carteira: 'FORNECEDOR',
          vendedorId: null,
          vendedor: 'FORNECEDOR',
          fornecedor: true,
          dataAtribuicaoVendedor: null,
          dataEntradaBolsao: null,
          carteiraLocked: true,
          lockedAt: new Date(),
          lockedBy: (session.user as any).id,
          lockedReason: `Movido para FORNECEDOR por ${(session.user as any).name}`,
        },
      })
      invalidateCache()
      return NextResponse.json({ success: true, carteira: 'FORNECEDOR' })
    }

    if (targetCarteira === 'BOLSAO') {
      await db.cliente.update({
        where: { codigo: clienteCodigo },
        data: {
          carteira: 'BOLSAO',
          vendedorId: null,
          vendedor: 'BOLSÃO',
          dataAtribuicaoVendedor: null,
          dataEntradaBolsao: new Date(),
          carteiraLocked: true,
          lockedAt: new Date(),
          lockedBy: (session.user as any).id,
          lockedReason: `Movido para BOLSÃO por ${(session.user as any).name}`,
        },
      })
      invalidateCache()
      return NextResponse.json({ success: true, carteira: 'BOLSAO' })
    }

    if (vendedorId === null || vendedorId === undefined || vendedorId === '') {
      // Clear assignment — set carteira to SEM_VENDEDOR
      await db.cliente.update({
        where: { codigo: clienteCodigo },
        data: {
          carteira: 'SEM_VENDEDOR',
          vendedorId: null,
          vendedor: '',
          dataAtribuicaoVendedor: null,
          // Clear fornecedor flag if was fornecedor
          ...(cliente.fornecedor ? { fornecedor: false } : {}),
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

      // Assign to real vendedor — set carteira to COM_VENDEDOR
      await db.cliente.update({
        where: { codigo: clienteCodigo },
        data: {
          carteira: 'COM_VENDEDOR',
          vendedorId: vendedorId,
          vendedor: vendedor.name,
          dataAtribuicaoVendedor: new Date(),
          // Clear Bolsão timestamp if was in Bolsão
          dataEntradaBolsao: null,
          // If was a fornecedor and now assigned to regular vendedor, clear flag
          ...(cliente.fornecedor ? { fornecedor: false } : {}),
          carteiraLocked: true,
          lockedAt: new Date(),
          lockedBy: (session.user as any).id,
          lockedReason: `Atribuído a ${vendedor.name} por ${(session.user as any).name}`,
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
