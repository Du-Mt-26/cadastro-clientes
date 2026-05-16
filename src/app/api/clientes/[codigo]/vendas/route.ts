import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions, type Role } from '@/lib/auth'

// ─── GET /api/clientes/[codigo]/vendas ────────────────
// Get all vendas for a specific client

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ codigo: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { codigo } = await params

    const vendas = await db.venda.findMany({
      where: { clienteCodigo: codigo },
      orderBy: { dataEmissao: 'desc' },
      include: {
        itens: {
          orderBy: { item: 'asc' },
        },
      },
    })

    // Stats for this client
    const stats = await db.venda.aggregate({
      where: {
        clienteCodigo: codigo,
        situacao: { contains: 'AUTORIZADO' },
      },
      _sum: { valorTotal: true },
      _count: true,
    })

    const ultimaVenda = await db.venda.findFirst({
      where: {
        clienteCodigo: codigo,
        situacao: { contains: 'AUTORIZADO' },
      },
      orderBy: { dataEmissao: 'desc' },
      select: { dataEmissao: true },
    })

    return NextResponse.json({
      data: vendas,
      stats: {
        totalVendido: stats._sum.valorTotal || 0,
        totalNotas: stats._count,
        ultimaVenda: ultimaVenda?.dataEmissao || null,
      },
    })
  } catch (error) {
    console.error('Error loading client vendas:', error)
    return NextResponse.json({ error: 'Erro ao carregar vendas do cliente' }, { status: 500 })
  }
}
