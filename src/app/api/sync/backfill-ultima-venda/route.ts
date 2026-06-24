import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── Backfill ultimaVenda for all clients ─────────────
// One-time fix: after bulk vendas sync, the Cliente.ultimaVenda field
// was not updated. This endpoint computes the most recent AUTORIZADA
// venda for each client and updates the field.
//
// The frontend's "Dias S/ Venda" column depends on this field.
// Without it, clients show as "151+ dias" even if they bought today.
//
// Auth: same as other sync endpoints (CRON_SECRET / SYNC_SECRET)

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || process.env.SYNC_SECRET || ''

function validateSyncSecret(request: NextRequest): boolean {
  if (!CRON_SECRET) return true
  if (request.headers.get('x-vercel-cron') === 'true') {
    const auth = request.headers.get('authorization') || ''
    return auth === `Bearer ${CRON_SECRET}`
  }
  const secret =
    request.headers.get('x-sync-secret') ||
    request.nextUrl.searchParams.get('secret') ||
    ''
  return secret === CRON_SECRET
}

export async function GET(request: NextRequest) {
  if (!validateSyncSecret(request)) {
    return NextResponse.json({ error: 'Secret inválido' }, { status: 401 })
  }

  const startTime = Date.now()

  try {
    // ─── Strategy: use raw SQL for speed ───────────
    // For each Cliente, find the most recent Venda with situacao containing 'AUTORIZADO'
    // and update ultimaVenda to the formatted date (DD/MM/YYYY)
    //
    // This runs as a single SQL UPDATE with subquery — fast even for 2,365 clients.

    // First, get all clienteCodigo that have at least one AUTORIZADA venda
    const clientsWithVendas = await db.venda.groupBy({
      by: ['clienteCodigo'],
      where: { situacao: { contains: 'AUTORIZADO' } },
      _max: { dataEmissao: true },
    })

    console.log(`[backfill-ultima-venda] ${clientsWithVendas.length} clientes com vendas AUTORIZADAS`)

    // Update each client's ultimaVenda field
    // Use raw SQL for batch efficiency
    let updated = 0
    let errors = 0
    const errorDetails: string[] = []

    // Process in chunks to avoid long transactions
    const CHUNK_SIZE = 200
    for (let i = 0; i < clientsWithVendas.length; i += CHUNK_SIZE) {
      const chunk = clientsWithVendas.slice(i, i + CHUNK_SIZE)

      try {
        // Build UPDATE statements
        const updates = chunk.map(async (c) => {
          const maxDate = c._max.dataEmissao
          if (!maxDate) return

          // Format as DD/MM/YYYY (same format as calcDiasSemVenda expects)
          const formatted = maxDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

          await db.cliente.update({
            where: { codigo: c.clienteCodigo },
            data: { ultimaVenda: formatted },
          })
          updated++
        })

        await Promise.all(updates)
      } catch (err: any) {
        errors += chunk.length
        if (errorDetails.length < 5) {
          errorDetails.push(`Chunk ${i / CHUNK_SIZE + 1}: ${err.message?.substring(0, 200)}`)
        }
      }
    }

    // Also clear ultimaVenda for clients that have NO vendas (so they don't show stale data)
    const clientsWithoutVendas = await db.cliente.count({
      where: {
        vendas: { none: {} },
        ultimaVenda: { not: '' },
      },
    })

    if (clientsWithoutVendas > 0) {
      await db.cliente.updateMany({
        where: {
          vendas: { none: {} },
          ultimaVenda: { not: '' },
        },
        data: { ultimaVenda: '' },
      })
      console.log(`[backfill-ultima-venda] Limpo ultimaVenda para ${clientsWithoutVendas} clientes sem vendas`)
    }

    // Get final stats
    const totalClientes = await db.cliente.count()
    const comUltimaVenda = await db.cliente.count({
      where: { ultimaVenda: { not: '' } },
    })

    // Log to sync log
    try {
      await db.linvixSyncLog.create({
        data: {
          syncType: 'backfill-ultima-venda',
          status: errors > 0 ? 'partial' : 'success',
          startedAt: new Date(startTime),
          finishedAt: new Date(),
          totalClients: totalClientes,
          createdCount: 0,
          updatedCount: updated,
          skippedCount: clientsWithoutVendas,
          errorCount: errors,
          errorMessage: errorDetails.join('\n').substring(0, 500),
          durationMs: Date.now() - startTime,
        },
      })
    } catch {}

    return NextResponse.json({
      status: errors > 0 ? 'partial' : 'success',
      totalClientes,
      clientsWithVendas: clientsWithVendas.length,
      updated,
      clientsWithoutVendasCleared: clientsWithoutVendas,
      comUltimaVendaAgora: comUltimaVenda,
      errors,
      errorDetails,
      durationMs: Date.now() - startTime,
    })
  } catch (err: any) {
    console.error('[backfill-ultima-venda] Erro:', err)
    return NextResponse.json(
      { status: 'error', error: err.message?.substring(0, 200) },
      { status: 500 },
    )
  }
}
