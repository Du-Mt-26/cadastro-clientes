import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── Linvix Sync Diagnostic Endpoint ──────────────────
// Public diagnostic endpoint for sync operations.
// Returns the last N sync attempts with full error messages,
// plus a boolean env-var health check (no secrets leaked).
//
// Usage:
//   GET /api/sync/diagnostic
//   GET /api/sync/diagnostic?limit=20
//
// This endpoint is intentionally public so operators can troubleshoot
// without logging in. It only exposes:
//   - Sync log records (which already contain error messages)
//   - Boolean env-var "is configured" flags (never the values themselves)

export const dynamic = 'force-dynamic'
export const maxDuration = 10

export async function GET(request: NextRequest) {
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get('limit') || '10', 10),
    50,
  )

  try {
    const recentSyncs = await db.linvixSyncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        syncType: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        totalClients: true,
        createdCount: true,
        updatedCount: true,
        skippedCount: true,
        errorCount: true,
        errorMessage: true,
        pagesScraped: true,
        durationMs: true,
      },
    })

    const envHealth = {
      LINVIX_USER: !!process.env.LINVIX_USER,
      LINVIX_PASSWORD: !!process.env.LINVIX_PASSWORD,
      CRON_SECRET: !!process.env.CRON_SECRET,
      SYNC_SECRET: !!process.env.SYNC_SECRET,
      SYNC_API_KEY: !!process.env.SYNC_API_KEY,
      DATABASE_URL: !!process.env.DATABASE_URL,
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
    }

    const last24h = recentSyncs.filter(
      s => Date.now() - s.startedAt.getTime() < 24 * 60 * 60 * 1000,
    )
    const last24hSuccess = last24h.filter(s => s.status === 'success')
    const last24hError = last24h.filter(s => s.status === 'error')
    const last24hPartial = last24h.filter(s => s.status === 'partial')

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      envHealth,
      summary: {
        last24h: {
          total: last24h.length,
          success: last24hSuccess.length,
          partial: last24hPartial.length,
          error: last24hError.length,
        },
        lastSync: recentSyncs[0]
          ? {
              syncType: recentSyncs[0].syncType,
              status: recentSyncs[0].status,
              startedAt: recentSyncs[0].startedAt,
              finishedAt: recentSyncs[0].finishedAt,
              durationMs: recentSyncs[0].durationMs,
              totalClients: recentSyncs[0].totalClients,
              created: recentSyncs[0].createdCount,
              updated: recentSyncs[0].updatedCount,
              errors: recentSyncs[0].errorCount,
              errorMessage: recentSyncs[0].errorMessage?.substring(0, 500),
            }
          : null,
      },
      recentSyncs: recentSyncs.map(s => ({
        id: s.id,
        syncType: s.syncType,
        status: s.status,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        durationMs: s.durationMs,
        totalClients: s.totalClients,
        created: s.createdCount,
        updated: s.updatedCount,
        errors: s.errorCount,
        errorMessage: s.errorMessage?.substring(0, 500),
        pagesScraped: s.pagesScraped,
      })),
      endpoints: {
        triggerClientes: '/api/sync/linvix?mode=auto',
        triggerVendas: '/api/sync/linvix-vendas?mode=auto',
        status: '/api/sync/all',
        cronModeClientes: '/api/sync/linvix?mode=cron',
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'Erro ao buscar diagnóstico',
        details: err.message?.substring(0, 200),
        envHealth: {
          DATABASE_URL: !!process.env.DATABASE_URL,
        },
      },
      { status: 500 },
    )
  }
}
