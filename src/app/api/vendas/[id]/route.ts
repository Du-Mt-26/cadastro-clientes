import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// ─── GET /api/vendas/[id] ─────────────────────────────
// Get venda detail with items

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params

    const venda = await db.venda.findUnique({
      where: { id },
      include: {
        cliente: {
          select: {
            codigo: true,
            razaoSocial: true,
            nomeFantasia: true,
            cnpj: true,
            cidade: true,
            uf: true,
          },
        },
        itens: {
          orderBy: { item: 'asc' },
        },
      },
    })

    if (!venda) {
      return NextResponse.json({ error: 'Venda não encontrada' }, { status: 404 })
    }

    return NextResponse.json({ data: venda })
  } catch (error) {
    console.error('Error loading venda detail:', error)
    return NextResponse.json({ error: 'Erro ao carregar venda' }, { status: 500 })
  }
}
