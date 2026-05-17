import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── GET /api/clientes/diagnostic ────────────────────────
// Diagnostic: find clients without assigned vendedor
// Uses simple hardcoded secret for one-time diagnostic use

export async function GET(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get('secret')
    if (secret !== 'mtech-diag-2026') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    // 1. Clients with SEM_VENDEDOR carteira that have a vendedor name from Linvix
    const semVendedorComNome = await db.cliente.findMany({
      where: {
        carteira: 'SEM_VENDEDOR',
        vendedor: { not: '' },
      },
      select: { codigo: true, razaoSocial: true, vendedor: true, cidade: true, uf: true },
      orderBy: { vendedor: 'asc' },
    })

    // 2. Clients with empty vendedor entirely
    const semVendedorEmpty = await db.cliente.count({
      where: {
        carteira: 'SEM_VENDEDOR',
        vendedor: '',
      },
    })

    // 3. Count by carteira
    const carteiraCounts = await db.cliente.groupBy({
      by: ['carteira'],
      _count: true,
    })

    // 4. Vendedor names from Linvix for SEM_VENDEDOR clients
    const vendedorNames = await db.cliente.groupBy({
      by: ['vendedor'],
      where: { carteira: 'SEM_VENDEDOR', vendedor: { not: '' } },
      _count: true,
      orderBy: { _count: { vendedor: 'desc' } },
    })

    // 5. System users
    const systemUsers = await db.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    })

    // 6. All vendedor names from ALL clients
    const allVendedorNames = await db.cliente.groupBy({
      by: ['vendedor'],
      _count: true,
      orderBy: { _count: { vendedor: 'desc' } },
    })

    return NextResponse.json({
      semVendedorComNome: semVendedorComNome.length,
      semVendedorEmpty,
      carteiraCounts: carteiraCounts.map(c => ({ carteira: c.carteira, count: c._count })),
      vendedoresLinvixSemCarteira: vendedorNames.map(v => ({ nome: v.vendedor, clientes: v._count })),
      todosVendedoresLinvix: allVendedorNames.map(v => ({ nome: v.vendedor, clientes: v._count })),
      usuariosSistema: systemUsers,
      clientesSemVendedorAmostra: semVendedorComNome.slice(0, 100),
    })
  } catch (error) {
    console.error('Error in diagnostic:', error)
    return NextResponse.json({ error: 'Erro no diagnóstico' }, { status: 500 })
  }
}
