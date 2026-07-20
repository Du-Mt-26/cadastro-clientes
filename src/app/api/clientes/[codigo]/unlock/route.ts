import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, type Role } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidateCache } from '@/lib/clientes-cache'

// ─── POST /api/clientes/[codigo]/unlock — Destrava a carteira de um cliente ───
// Restrito a ADMIN. Zera carteiraLocked, vendedorLocked, lockedAt, lockedBy,
// lockedReason — devolvendo o cliente para ser processado normalmente pelo
// sync automático (Bolsão / auto-assign-vendedores).

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ codigo: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const role = (session.user as any).role as Role
    if (role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Apenas administradores podem destravar clientes' },
        { status: 403 }
      )
    }

    const { codigo } = await params

    const cliente = await db.cliente.findUnique({ where: { codigo } })
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    await db.cliente.update({
      where: { codigo },
      data: {
        carteiraLocked: false,
        vendedorLocked: false,
        lockedAt: null,
        lockedBy: null,
        lockedReason: null,
      },
    })

    invalidateCache()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error unlocking cliente:', error)
    return NextResponse.json({ error: 'Erro ao destravar cliente' }, { status: 500 })
  }
}
