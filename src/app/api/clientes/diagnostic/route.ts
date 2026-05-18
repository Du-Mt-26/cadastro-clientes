import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── GET /api/clientes/diagnostic ────────────────────────
// Diagnostic: various database checks
// Uses simple hardcoded secret for one-time diagnostic use

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

    // ─── Duplicate phone numbers ─────────────────
    const duplicatePhones = await db.$queryRaw<Array<{ telefone: string; count: bigint }>>`
      SELECT telefone1 as telefone, COUNT(*) as count
      FROM "Cliente"
      WHERE telefone1 != '' AND telefone1 = telefone2
      GROUP BY telefone1
      ORDER BY count DESC
      LIMIT 20
    `

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

    // ─── Check if 'ativo' column exists (it doesn't in schema) ─────────────────
    let ativoColumnExists = false
    try {
      await db.$queryRaw`SELECT ativo FROM "Cliente" LIMIT 1`
      ativoColumnExists = true
    } catch {
      ativoColumnExists = false
    }

    // ─── Clients by situacaoCadastral that are "irregular" ─────────────────
    const baixada = situacaoGroup.find(g => g.situacaoCadastral.toUpperCase() === 'BAIXADA')?._count ?? 0
    const inapta = situacaoGroup.find(g => g.situacaoCadastral.toUpperCase() === 'INAPTA')?._count ?? 0
    const suspensa = situacaoGroup.find(g => g.situacaoCadastral.toUpperCase() === 'SUSPENSA')?._count ?? 0
    const ativa = situacaoGroup.find(g => g.situacaoCadastral.toUpperCase() === 'ATIVA')?._count ?? 0
    const nula = situacaoGroup.find(g => g.situacaoCadastral === '')?._count ?? 0

    return NextResponse.json({
      totalClientes,
      ativoColumnExists,
      situacaoCadastral: situacaoGroup.map(g => ({ valor: g.situacaoCadastral || '(vazio)', count: g._count })),
      resumoSituacao: { ativa, baixada, inapta, suspensa, semInfo: nula },
      carteiraCounts: carteiraCounts.map(c => ({ carteira: c.carteira, count: c._count })),
      listaFriaClients,
      bolsaoCount,
      obsComApi,
      usuarios: users.map(u => ({ nome: u.name, email: u.email, role: u.role, ativo: u.active })),
      duplicatePhoneExamples: duplicatePhones.map(d => ({ telefone: d.telefone, count: Number(d.count) })),
    })
  } catch (error) {
    console.error('Error in diagnostic:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
