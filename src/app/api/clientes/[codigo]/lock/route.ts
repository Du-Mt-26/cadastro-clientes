import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, type Role } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidateCache } from '@/lib/clientes-cache'

// ─── POST /api/clientes/[codigo]/lock — Trava manualmente a carteira de um cliente ───
// Visível para quem pode editar carteira (não-VENDEDOR). Não muda a carteira atual,
// só marca carteiraLocked = true para proteger contra o sync automático.

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
    if (role === 'VENDEDOR') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const { codigo } = await params

    const cliente = await db.cliente.findUnique({ where: { codigo } })
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    await db.cliente.update({
      where: { codigo },
      data: {
        carteiraLocked: true,
        lockedAt: new Date(),
        lockedBy: (session.user as any).id,
        lockedReason: `Travado manualmente por ${(session.user as any).name}`,
      },
    })

    invalidateCache()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error locking cliente:', error)
    return NextResponse.json({ error: 'Erro ao travar cliente' }, { status: 500 })
  }
}
