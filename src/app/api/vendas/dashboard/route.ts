import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions, type Role } from '@/lib/auth'

// ─── GET /api/vendas/dashboard ──────────────────────────
// Aggregated dashboard data for the vendas page

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    const role = (session.user as any).role as Role
    const userId = (session.user as any).id

    const searchParams = request.nextUrl.searchParams
    const dataInicio = searchParams.get('dataInicio') || ''
    const dataFim = searchParams.get('dataFim') || ''

    // Base where clause for authorized access
    const baseWhere: any = {}

    // VENDEDOR role: only see vendas for their assigned clients
    if (role === 'VENDEDOR') {
      const myClients = await db.cliente.findMany({
        where: { vendedorId: userId },
        select: { codigo: true },
      })
      baseWhere.clienteCodigo = { in: myClients.map(c => c.codigo) }
    }

    // Date range filter
    const dateWhere: any = { ...baseWhere }
    if (dataInicio || dataFim) {
      dateWhere.dataEmissao = {}
      if (dataInicio) dateWhere.dataEmissao.gte = new Date(dataInicio)
      if (dataFim) dateWhere.dataEmissao.lte = new Date(dataFim + 'T23:59:59')
    }

    const whereAutorizado = { ...dateWhere, situacao: { contains: 'AUTORIZADO' } }
    const whereCancelado = { ...dateWhere, situacao: { contains: 'CANCELAMENTO' } }

    // ── KPI Cards ──
    const [autorizadasAgg, canceladasAgg, aguardandoCount] = await Promise.all([
      db.venda.aggregate({ where: whereAutorizado, _sum: { valorTotal: true, valorProdutos: true, valorDesconto: true, valorFrete: true }, _count: true }),
      db.venda.aggregate({ where: whereCancelado, _sum: { valorTotal: true }, _count: true }),
      db.venda.count({ where: { ...dateWhere, situacao: { contains: 'AGUARDANDO' } } }),
    ])

    const totalVendido = autorizadasAgg._sum.valorTotal || 0
    const totalNotas = autorizadasAgg._count
    const ticketMedio = totalNotas > 0 ? totalVendido / totalNotas : 0

    // ── Vendas por Mês (last 12 months) ──
    const vendasPorMesRaw: Array<{ mes: string; total: number; count: number }> = await db.$queryRaw`
      SELECT 
        TO_CHAR(v."dataEmissao", 'YYYY-MM') as mes,
        COALESCE(SUM(v."valorTotal"), 0) as total,
        COUNT(*)::int as count
      FROM "Venda" v
      WHERE v.situacao LIKE '%AUTORIZADO%'
        AND v."dataEmissao" IS NOT NULL
      GROUP BY TO_CHAR(v."dataEmissao", 'YYYY-MM')
      ORDER BY mes ASC
      LIMIT 12
    `
    // Filter by date range in JS (simpler than conditional SQL)
    const vendasPorMes = vendasPorMesRaw.filter((row: { mes: string }) => {
      if (dataInicio && row.mes < dataInicio.slice(0, 7)) return false
      if (dataFim && row.mes > dataFim.slice(0, 7)) return false
      return true
    })

    // ── Top 10 Clientes por valor ──
    const topClientesRaw = await db.venda.groupBy({
      by: ['clienteCodigo'],
      where: whereAutorizado,
      _sum: { valorTotal: true },
      _count: true,
      orderBy: { _sum: { valorTotal: 'desc' } },
      take: 10,
    })

    const topClienteCodigos = topClientesRaw.map(t => t.clienteCodigo)
    const topClienteInfo = await db.cliente.findMany({
      where: { codigo: { in: topClienteCodigos } },
      select: { codigo: true, razaoSocial: true, nomeFantasia: true },
    })
    const clienteInfoMap = new Map(topClienteInfo.map(c => [c.codigo, c]))

    const topClientes = topClientesRaw.map(t => ({
      codigo: t.clienteCodigo,
      razaoSocial: clienteInfoMap.get(t.clienteCodigo)?.razaoSocial || '',
      nomeFantasia: clienteInfoMap.get(t.clienteCodigo)?.nomeFantasia || '',
      totalVendido: t._sum.valorTotal || 0,
      totalNotas: t._count,
    }))

    // ── Vendas por Vendedor (from VendaItem) ──
    const vendasPorVendedorRaw: Array<{ vendedor: string; total: number; count: number }> = await db.$queryRaw`
      SELECT 
        vi.vendedor,
        COALESCE(SUM(vi."valorTotal"), 0) as total,
        COUNT(*)::int as count
      FROM "VendaItem" vi
      INNER JOIN "Venda" v ON v.id = vi."vendaId"
      WHERE v.situacao LIKE '%AUTORIZADO%'
        AND vi.vendedor != ''
      GROUP BY vi.vendedor
      ORDER BY total DESC
      LIMIT 10
    `

    // ── Vendas por Forma de Pagamento ──
    const vendasPorFormaPagamento = await db.venda.groupBy({
      by: ['formaPagamento'],
      where: whereAutorizado,
      _sum: { valorTotal: true },
      _count: true,
      orderBy: { _sum: { valorTotal: 'desc' } },
      take: 10,
    })

    // ── Vendas por Emitente ──
    const vendasPorEmitente = await db.venda.groupBy({
      by: ['emitente'],
      where: whereAutorizado,
      _sum: { valorTotal: true },
      _count: true,
      orderBy: { _sum: { valorTotal: 'desc' } },
    })

    // ── Vendas por UF ──
    const vendasPorUfRaw: Array<{ uf: string; total: number; count: number }> = await db.$queryRaw`
      SELECT 
        c.uf,
        COALESCE(SUM(v."valorTotal"), 0) as total,
        COUNT(*)::int as count
      FROM "Venda" v
      INNER JOIN "Cliente" c ON c.codigo = v."clienteCodigo"
      WHERE v.situacao LIKE '%AUTORIZADO%'
        AND c.uf != ''
      GROUP BY c.uf
      ORDER BY total DESC
      LIMIT 15
    `

    // ── Top Produtos ──
    const topProdutosRaw: Array<{ codigo: string; descricao: string; total: number; quantidade: number }> = await db.$queryRaw`
      SELECT 
        vi."codigoProduto" as codigo,
        vi.descricao,
        COALESCE(SUM(vi."valorTotal"), 0) as total,
        SUM(vi.quantidade)::float as quantidade
      FROM "VendaItem" vi
      INNER JOIN "Venda" v ON v.id = vi."vendaId"
      WHERE v.situacao LIKE '%AUTORIZADO%'
      GROUP BY vi."codigoProduto", vi.descricao
      ORDER BY total DESC
      LIMIT 10
    `

    return NextResponse.json({
      kpi: {
        totalVendido,
        totalNotas,
        ticketMedio,
        totalCancelado: canceladasAgg._sum.valorTotal || 0,
        notasCanceladas: canceladasAgg._count,
        aguardando: aguardandoCount,
        valorProdutos: autorizadasAgg._sum.valorProdutos || 0,
        valorDesconto: autorizadasAgg._sum.valorDesconto || 0,
        valorFrete: autorizadasAgg._sum.valorFrete || 0,
      },
      vendasPorMes,
      topClientes,
      vendasPorVendedor: vendasPorVendedorRaw,
      vendasPorFormaPagamento: vendasPorFormaPagamento.map(f => ({
        forma: f.formaPagamento || 'Não informado',
        total: f._sum.valorTotal || 0,
        count: f._count,
      })),
      vendasPorEmitente: vendasPorEmitente.map(e => ({
        emitente: e.emitente || 'Não informado',
        total: e._sum.valorTotal || 0,
        count: e._count,
      })),
      vendasPorUf: vendasPorUfRaw,
      topProdutos: topProdutosRaw,
    })
  } catch (error) {
    console.error('Error loading dashboard:', error)
    return NextResponse.json({ error: 'Erro ao carregar dashboard' }, { status: 500 })
  }
}
