import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Dashboard stats
    // Note: `ativo` field may not exist yet (migration pending), so we use situacaoCadastral as fallback
    const [
      totalClientes,
      ativos,
      semVendedor,
      comVendedor,
      listaFria,
      bolsao,
      fornecedor,
      recentSyncs,
      topVendedores,
      topUfs,
    ] = await Promise.all([
      db.cliente.count(),
      // Count active = total - (EXCLUÍDO + BAIXADA)
      db.cliente.count({
        where: {
          situacaoCadastral: { notIn: ['EXCLUÍDO', 'BAIXADA'] }
        }
      }),
      db.cliente.count({ where: { carteira: 'SEM_VENDEDOR' } }),
      db.cliente.count({ where: { carteira: 'COM_VENDEDOR' } }),
      db.cliente.count({ where: { carteira: 'LISTA_FRIA' } }),
      db.cliente.count({ where: { carteira: 'BOLSAO' } }),
      db.cliente.count({ where: { carteira: 'FORNECEDOR' } }),
      db.linvixSyncLog.findMany({ take: 5, orderBy: { startedAt: 'desc' } }),
      db.cliente.groupBy({
        by: ['vendedorId'],
        _count: { id: true },
        where: { vendedorId: { not: null } },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      db.cliente.groupBy({
        by: ['uf'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
    ])

    // Get vendedor user names
    const vendedorIds = topVendedores.map(v => v.vendedorId).filter(Boolean) as string[]
    const vendedorUsers = await db.user.findMany({
      where: { id: { in: vendedorIds } },
      select: { id: true, name: true },
    })
    const vendedorMap = Object.fromEntries(vendedorUsers.map(u => [u.id, u.name]))

    return NextResponse.json({
      counts: {
        total: totalClientes,
        ativos,
        inativos: totalClientes - ativos,
        semVendedor,
        comVendedor,
        listaFria,
        bolsao,
        fornecedor,
      },
      topVendedores: topVendedores.map(v => ({
        vendedorId: v.vendedorId,
        name: vendedorMap[v.vendedorId!] || 'Unknown',
        count: v._count.id,
      })),
      topUfs: topUfs.map(u => ({
        uf: u.uf,
        count: u._count.id,
      })),
      recentSyncs,
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to fetch dashboard data',
    }, { status: 500 })
  }
}
