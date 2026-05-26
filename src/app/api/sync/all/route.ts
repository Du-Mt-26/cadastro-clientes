import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── Combined Sync Status API ──────────────────────────
// Shows status of both clientes and vendas syncs.
//
// NOTE: To trigger syncs, use the individual endpoints:
//   /api/sync/linvix?mode=trigger      → Clientes (returns immediately, runs in background)
//   /api/sync/linvix-vendas?mode=trigger → Vendas (returns immediately, runs in background)
//
// For cron-jobs.org, set up TWO separate jobs pointing to the above URLs.
// The Vercel Cron calls /api/sync/linvix?mode=auto directly (backup).

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const lastClientesSync = await db.linvixSyncLog.findFirst({
      where: { syncType: 'clientes' },
      orderBy: { startedAt: 'desc' },
    })

    const lastVendasSync = await db.linvixSyncLog.findFirst({
      where: { syncType: { startsWith: 'vendas' } },
      orderBy: { startedAt: 'desc' },
    })

    return NextResponse.json({
      message: 'M-Tech Sync Status',
      endpoints: {
        clientes: '/api/sync/linvix?mode=trigger',
        vendas: '/api/sync/linvix-vendas?mode=trigger',
      },
      lastSync: {
        clientes: lastClientesSync ? {
          status: lastClientesSync.status,
          startedAt: lastClientesSync.startedAt,
          finishedAt: lastClientesSync.finishedAt,
          durationMs: lastClientesSync.durationMs,
          created: lastClientesSync.createdCount,
          updated: lastClientesSync.updatedCount,
        } : null,
        vendas: lastVendasSync ? {
          status: lastVendasSync.status,
          startedAt: lastVendasSync.startedAt,
          finishedAt: lastVendasSync.finishedAt,
          durationMs: lastVendasSync.durationMs,
          created: lastVendasSync.createdCount,
          updated: lastVendasSync.updatedCount,
        } : null,
      },
    })
  } catch (err: any) {
    // Neon DB may be waking up from cold start
    return NextResponse.json({
      message: 'M-Tech Sync Status',
      error: 'Database temporarily unavailable (cold start)',
      endpoints: {
        clientes: '/api/sync/linvix?mode=trigger',
        vendas: '/api/sync/linvix-vendas?mode=trigger',
      },
    })
  }
}
