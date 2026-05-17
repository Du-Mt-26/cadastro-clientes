import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── Combined Sync API ─────────────────────────────
// Runs clients sync + vendas sync in sequence.
//
// Modes:
//   ?mode=trigger  → Calls both /linvix?mode=trigger and /linvix-vendas?mode=trigger
//                    No auth required — each sub-endpoint handles its own auth
//   ?mode=auto     → Wait for both to complete (for Vercel Cron, requires auth)

export const maxDuration = 300 // 5 minutes
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || process.env.SYNC_SECRET || ''

function validateSyncSecret(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron') === 'true') return true
  if (!CRON_SECRET) return true
  const secret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret') || request.nextUrl.searchParams.get('cron-secret') || ''
  return secret === CRON_SECRET
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode')

  // ─── Trigger mode: NO AUTH REQUIRED ────────────────────
  // Calls both sync endpoints with mode=trigger
  // Each sub-endpoint will run its own sync in background
  if (mode === 'trigger') {
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

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT || 3000}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    const results: any = { clientes: null, vendas: null }

    // 1. Trigger client sync (responds immediately, runs in background)
    try {
      const clientRes = await fetch(`${baseUrl}/api/sync/linvix?mode=trigger`, {
        headers,
        signal: AbortSignal.timeout(10_000), // trigger should respond fast
      })
      results.clientes = await clientRes.json()
    } catch (err: any) {
      results.clientes = { status: 'error', error: err.message?.substring(0, 100) }
    }

    // 2. Trigger vendas sync (responds immediately, runs in background)
    try {
      const vendasRes = await fetch(`${baseUrl}/api/sync/linvix-vendas?mode=trigger`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      })
      results.vendas = await vendasRes.json()
    } catch (err: any) {
      results.vendas = { status: 'error', error: err.message?.substring(0, 100) }
    }

    return NextResponse.json({
      status: 'triggered',
      message: 'Sync de clientes + vendas disparado',
      clientes: results.clientes,
      vendas: results.vendas,
    })
  }

  // ─── Auto mode: blocking, waits for both (AUTH REQUIRED) ──
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
        signal: AbortSignal.timeout(120_000),
      })
      results.clientes = await clientRes.json()
      console.log(`[sync/all] Clientes: status=${results.clientes.status}`)
    } catch (err: any) {
      console.error('[sync/all] Erro no sync de clientes:', err.message)
      results.clientes = { status: 'error', error: err.message?.substring(0, 200) }
    }

    // 2. Sync vendas (incremental, fast if no new data)
    try {
      console.log('[sync/all] Iniciando sync de vendas (incremental)...')
      const vendasRes = await fetch(`${baseUrl}/api/sync/linvix-vendas?mode=auto`, {
        headers,
        signal: AbortSignal.timeout(180_000),
      })
      results.vendas = await vendasRes.json()
      console.log(`[sync/all] Vendas: status=${results.vendas.status}`)
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
      trigger: 'No auth — triggers both syncs in background (for cron-job.org)',
      auto: 'Auth required — waits for both (for Vercel Cron)',
    },
  })
}
