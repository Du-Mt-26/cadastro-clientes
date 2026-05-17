import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── Combined Sync API ─────────────────────────────
// Runs clients sync + vendas sync in sequence.
// This is the single endpoint used by Vercel Cron and cron-job.org.
//
// Modes:
//   ?mode=trigger  → Respond immediately, sync both in background (for cron-job.org)
//   ?mode=auto     → Wait for both to complete (for Vercel Cron)

export const maxDuration = 300 // 5 minutes
export const dynamic = 'force-dynamic'

const SYNC_SECRET = process.env.SYNC_SECRET || ''
const LINVIX_USER = process.env.LINVIX_PASSWORD || ''

function validateSyncSecret(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron') === 'true') return true
  if (!SYNC_SECRET) return true
  const secret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret') || ''
  return secret === SYNC_SECRET
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode')

  // ─── Trigger mode: respond immediately, sync both in background ──
  if (mode === 'trigger') {
    if (!validateSyncSecret(request)) {
      return NextResponse.json({ error: 'Secret inválido' }, { status: 401 })
    }

    // Check if any sync is already running
    const runningSync = await db.linvixSyncLog.findFirst({
      where: { status: 'running' },
      orderBy: { startedAt: 'desc' },
    })

    if (runningSync && (Date.now() - runningSync.startedAt.getTime()) < 300000) {
      return NextResponse.json({
        status: 'already_running',
        message: 'Uma sincronização já está em andamento',
        startedAt: runningSync.startedAt,
      })
    }

    const triggeredAt = new Date().toISOString()
    const response = NextResponse.json({
      status: 'triggered',
      message: 'Sync de clientes + vendas iniciado em background',
      triggeredAt,
    })

    // Build internal URL for self-calls
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT || 3000}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Forward auth
    const syncSecret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret')
    if (syncSecret) {
      headers['x-sync-secret'] = syncSecret
    }

    // Fire and forget: call /api/sync/all?mode=auto internally
    // This way we reuse the blocking mode that already handles everything
    ;(async () => {
      try {
        const res = await fetch(`${baseUrl}/api/sync/all?mode=auto`, {
          headers,
          signal: AbortSignal.timeout(290_000), // just under 5 min
        })
        const data = await res.json()
        console.log(`[sync/all] Trigger concluído: clientes=${data.clientes?.status}, vendas=${data.vendas?.status}`)
      } catch (err: any) {
        console.error('[sync/all] Trigger falhou:', err.message)

        await db.linvixSyncLog.create({
          data: {
            syncType: 'all',
            status: 'error',
            errorMessage: `Trigger sync falhou: ${err.message?.substring(0, 400)}`,
          },
        })
      }
    })()

    return response
  }

  // ─── Auto mode: blocking, waits for both ──────────────
  if (mode === 'auto') {
    if (!validateSyncSecret(request)) {
      return NextResponse.json({ error: 'Secret inválido' }, { status: 401 })
    }

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT || 3000}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Forward auth headers
    const syncSecret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret')
    if (syncSecret) {
      headers['x-sync-secret'] = syncSecret
    }
    if (request.headers.get('x-vercel-cron')) {
      headers['x-vercel-cron'] = 'true'
    }

    const results: any = {
      clientes: null,
      vendas: null,
    }

    // 1. Sync clientes (fast, ~3-5s)
    try {
      console.log('[sync/all] Iniciando sync de clientes...')
      const clientRes = await fetch(`${baseUrl}/api/sync/linvix?mode=auto`, {
        headers,
        signal: AbortSignal.timeout(120_000), // 2 min timeout for clients
      })
      results.clientes = await clientRes.json()
      console.log(`[sync/all] Clientes: status=${results.clientes.status}, duration=${results.clientes.durationMs}ms`)
    } catch (err: any) {
      console.error('[sync/all] Erro no sync de clientes:', err.message)
      results.clientes = { status: 'error', error: err.message?.substring(0, 200) }
    }

    // 2. Sync vendas (incremental, fast if no new data)
    try {
      console.log('[sync/all] Iniciando sync de vendas (incremental)...')
      const vendasRes = await fetch(`${baseUrl}/api/sync/linvix-vendas?mode=auto`, {
        headers,
        signal: AbortSignal.timeout(180_000), // 3 min timeout for vendas
      })
      results.vendas = await vendasRes.json()
      console.log(`[sync/all] Vendas: status=${results.vendas.status}, duration=${results.vendas.durationMs}ms`)
    } catch (err: any) {
      console.error('[sync/all] Erro no sync de vendas:', err.message)
      results.vendas = { status: 'error', error: err.message?.substring(0, 200) }
    }

    const overallStatus = [
      results.clientes?.status,
      results.vendas?.status,
    ].every(s => s === 'success') ? 'success' : 'partial'

    return NextResponse.json({
      status: overallStatus,
      clientes: results.clientes,
      vendas: results.vendas,
    })
  }

  // ─── Default: status ──────────────────────────────────
  return NextResponse.json({
    message: 'Combined Sync API',
    modes: {
      trigger: 'Fire and forget — responds immediately, syncs both in background (for cron-job.org)',
      auto: 'Blocking — waits for clients + vendas to complete (for Vercel Cron)',
    },
  })
}
