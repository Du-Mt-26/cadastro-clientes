import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions, type Role } from '@/lib/auth'

// ─── GET /api/vendas ──────────────────────────────────
// List vendas with filters and pagination

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    const role = (session.user as any).role as Role
    const userId = (session.user as any).id

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const clienteCodigo = searchParams.get('clienteCodigo') || ''
    const situacao = searchParams.get('situacao') || ''
    const dataInicio = searchParams.get('dataInicio') || ''
    const dataFim = searchParams.get('dataFim') || ''
    const vendedor = searchParams.get('vendedor') || ''
    const search = searchParams.get('search') || ''
    const sortBy = searchParams.get('sortBy') || 'dataEmissao'
    const sortOrder = searchParams.get('sortOrder') || 'desc'

    // Build where clause
    const where: any = {}

    if (clienteCodigo) {
      where.clienteCodigo = clienteCodigo
    }

    // VENDEDOR role: only see vendas for their assigned clients
    if (role === 'VENDEDOR') {
      const myClients = await db.cliente.findMany({
        where: { vendedorId: userId },
        select: { codigo: true },
      })
      where.clienteCodigo = { in: myClients.map(c => c.codigo) }
    }

    if (situacao) {
      where.situacao = { contains: situacao }
    }

    if (dataInicio || dataFim) {
      where.dataEmissao = {}
      if (dataInicio) where.dataEmissao.gte = new Date(dataInicio)
      if (dataFim) where.dataEmissao.lte = new Date(dataFim + 'T23:59:59')
    }

    if (vendedor) {
      // Search in itens (vendedor field on VendaItem)
      where.itens = { some: { vendedor: { contains: vendedor } } }
    }

    if (search) {
      where.OR = [
        { numero: { contains: search } },
        { clienteCodigo: { contains: search } },
        { operador: { contains: search } },
        { naturezaOperacao: { contains: search } },
        { observacoes: { contains: search } },
        { chave: { contains: search } },
      ]
    }

    // Determine sort
    const allowedSortFields = ['dataEmissao', 'valorTotal', 'numero', 'situacao', 'clienteCodigo']
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'dataEmissao'
    const order = sortOrder === 'asc' ? 'asc' : 'desc'

    const [vendas, total] = await Promise.all([
      db.venda.findMany({
        where,
        orderBy: { [sortField]: order },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          cliente: {
            select: { codigo: true, razaoSocial: true, nomeFantasia: true },
          },
          _count: { select: { itens: true } },
        },
      }),
      db.venda.count({ where }),
    ])

    // Stats
    const statsAgg = await db.venda.aggregate({
      where: { ...where, situacao: { contains: 'AUTORIZADO' } },
      _sum: { valorTotal: true },
      _count: true,
    })

    const canceladas = await db.venda.count({ where: { ...where, situacao: { contains: 'CANCELAMENTO' } } })
    const aguardando = await db.venda.count({ where: { ...where, situacao: { contains: 'AGUARDANDO' } } })

    return NextResponse.json({
      data: vendas,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        totalVendido: statsAgg._sum.valorTotal || 0,
        totalNotas: statsAgg._count,
        autorizadas: statsAgg._count,
        canceladas,
        aguardando,
      },
    })
  } catch (error) {
    console.error('Error loading vendas:', error)
    return NextResponse.json({ error: 'Erro ao carregar vendas' }, { status: 500 })
  }
}
