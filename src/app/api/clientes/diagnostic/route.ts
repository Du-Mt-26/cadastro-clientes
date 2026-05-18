import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── GET /api/clientes/diagnostic ────────────────────────
// Diagnostic: various database checks
// Uses simple hardcoded secret for one-time diagnostic use
//
// POST /api/clientes/diagnostic?secret=...&mode=backfill-ativo
// Backfill: set ativo=false for EXCLUÍDO/BAIXADA clients

export async function GET(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get('secret')
    if (secret !== 'mtech-diag-2026') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const mode = request.nextUrl.searchParams.get('mode') || 'full'

    // ─── situacaoCadastral values ─────────────────
    const situacaoGroup = await db.cliente.groupBy({
      by: ['situacaoCadastral'],
      _count: true,
      orderBy: { _count: { situacaoCadastral: 'desc' } },
    })

    // ─── Count by carteira ─────────────────
    const carteiraCounts = await db.cliente.groupBy({
      by: ['carteira'],
      _count: true,
    })

    // ─── LISTA_FRIA clients ─────────────────
    const listaFriaClients = await db.cliente.findMany({
      where: { carteira: 'LISTA_FRIA' },
      select: { codigo: true, razaoSocial: true, cidade: true, uf: true },
      take: 20,
    })

    // ─── BOLSAO clients (could be moved to LISTA_FRIA) ─────────────────
    const bolsaoCount = await db.cliente.count({ where: { carteira: 'BOLSAO' } })

    // ─── Observacoes with "Cadastrado via API" ─────────────────
    const obsComApi = await db.cliente.count({
      where: {
        observacoes: { contains: 'Cadastrado via API' }
      }
    })

    // ─── Total counts ─────────────────
    const totalClientes = await db.cliente.count()

    // ─── Users and roles ─────────────────
    const users = await db.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true },
      orderBy: { name: 'asc' },
    })

    // ─── ativo stats ─────────────────
    const ativoTrue = await db.cliente.count({ where: { ativo: true } })
    const ativoFalse = await db.cliente.count({ where: { ativo: false } })

    // ─── Clients by situacaoCadastral that are "irregular" ─────────────────
    const baixada = situacaoGroup.find(g => g.situacaoCadastral.toUpperCase() === 'BAIXADA')?._count ?? 0
    const inapta = situacaoGroup.find(g => g.situacaoCadastral.toUpperCase() === 'INAPTA')?._count ?? 0
    const suspensa = situacaoGroup.find(g => g.situacaoCadastral.toUpperCase() === 'SUSPENSA')?._count ?? 0
    const ativa = situacaoGroup.find(g => g.situacaoCadastral.toUpperCase() === 'ATIVA')?._count ?? 0
    const nula = situacaoGroup.find(g => g.situacaoCadastral === '')?._count ?? 0

    return NextResponse.json({
      totalClientes,
      ativoStats: { ativos: ativoTrue, inativos: ativoFalse },
      situacaoCadastral: situacaoGroup.map(g => ({ valor: g.situacaoCadastral || '(vazio)', count: g._count })),
      resumoSituacao: { ativa, baixada, inapta, suspensa, semInfo: nula },
      carteiraCounts: carteiraCounts.map(c => ({ carteira: c.carteira, count: c._count })),
      listaFriaClients,
      bolsaoCount,
      obsComApi,
      usuarios: users.map(u => ({ nome: u.name, email: u.email, role: u.role, ativo: u.active })),
    })
  } catch (error) {
    console.error('Error in diagnostic:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// ─── POST for backfill operations ─────────────────
export async function POST(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get('secret')
    if (secret !== 'mtech-diag-2026') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const mode = request.nextUrl.searchParams.get('mode') || ''
    const results: string[] = []

    if (mode === 'backfill-ativo') {
      // Set ativo=false for EXCLUÍDO and BAIXADA clients
      const updateResult = await db.cliente.updateMany({
        where: {
          situacaoCadastral: { in: ['EXCLUÍDO', 'BAIXADA'] }
        },
        data: { ativo: false }
      })
      results.push(`${updateResult.count} clientes marcados como inativos`)

      // Ensure all others are ativo=true
      const updateResult2 = await db.cliente.updateMany({
        where: {
          situacaoCadastral: { notIn: ['EXCLUÍDO', 'BAIXADA'] },
          ativo: false
        },
        data: { ativo: true }
      })
      results.push(`${updateResult2.count} clientes reativados`)

      // Verify
      const ativoTrue = await db.cliente.count({ where: { ativo: true } })
      const ativoFalse = await db.cliente.count({ where: { ativo: false } })
      results.push(`Verificação: ${ativoTrue} ativos, ${ativoFalse} inativos`)
    } else {
      return NextResponse.json({ error: 'Modo inválido. Use: backfill-ativo' }, { status: 400 })
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Error in diagnostic POST:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
