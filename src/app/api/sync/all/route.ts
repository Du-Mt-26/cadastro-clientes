import { NextRequest, NextResponse } from 'next/server'

// ─── Combined Sync API ─────────────────────────────
// Runs clients sync + vendas sync in sequence.
// This is the single endpoint used by Vercel Cron.

export const maxDuration = 300 // 5 minutes
export const dynamic = 'force-dynamic'

const SYNC_SECRET = process.env.SYNC_SECRET || ''

function validateSyncSecret(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron') === 'true') return true
  if (!SYNC_SECRET) return true
  const secret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret') || ''
  return secret === SYNC_SECRET
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode')

  if (mode !== 'auto') {
    return NextResponse.json({
      message: 'Combined Sync API',
      mode: 'Use ?mode=auto to trigger client + vendas sync',
    })
  }

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
