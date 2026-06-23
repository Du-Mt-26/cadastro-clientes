import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── Linvix Vendas Bulk Sync (FAST, no per-NF-e detail) ─────
//
// Syncs the NF-e LIST from Linvix ERP → M-Tech WITHOUT fetching per-NF-e
// detail pages. This is ~100x faster than the detail-based sync because:
//   - List endpoint returns 350 NF-e per page in one request
//   - No 1-2s delay per NF-e for detail fetch
//   - All 9,039 NF-e can be synced in ~30s (vs. ~5h with details)
//
// Trade-off: VendaItem records are NOT populated (no products per sale).
// Those can be backfilled later via /api/sync/linvix-vendas?mode=backfill
// which fetches detail for vendas with 0 items.
//
// Auth:
//   - Vercel Cron: x-vercel-cron: true + authorization: Bearer <CRON_SECRET>
//   - External/manual: x-sync-secret header OR ?secret= query param
//
// Query params:
//   ?mode=auto    → Sync all pages (default)
//   ?pages=N      → Only fetch N pages (for testing)
//   ?dryRun=true  → Don't write to DB, just count

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || process.env.SYNC_SECRET || ''
const LINVIX_USER = process.env.LINVIX_USER || ''
const LINVIX_PASSWORD = process.env.LINVIX_PASSWORD || ''

const LINVIX_BASE = 'https://rp.erp.linvix.com'
const LINVIX_LOGIN_URL = `${LINVIX_BASE}/ajax/ajax-login.php`
const LINVIX_NFE_LIST_URL = `${LINVIX_BASE}/nota-fiscal-eletronica/ajax/ajax-notas-datatable.php`
const PAGE_SIZE = 350

// Same User-Agent rotation as the other sync routes
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
]
let sessionUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]

function browserHeaders(phpsessid: string): Record<string, string> {
  return {
    'Cookie': `PHPSESSID=${phpsessid}`,
    'User-Agent': sessionUA,
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://rp.erp.linvix.com/nota-fiscal-eletronica/',
    'Origin': 'https://rp.erp.linvix.com',
    'Connection': 'keep-alive',
  }
}

function loginHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': sessionUA,
    'Accept': '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Origin': 'https://rp.erp.linvix.com',
    'Referer': 'https://rp.erp.linvix.com/',
    'Connection': 'keep-alive',
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function stripHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/<[^>]*>/g, '').trim()
}

function decodeHtmlEntities(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

// Parse "R$ 1.234,56" → 1234.56
function parseCurrency(s: string | null | undefined): number {
  if (!s) return 0
  const cleaned = stripHtml(s)
    .replace(/R\$\s*/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim()
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

// Parse "23/06/2026 18:00:45" → Date
function parseLinvixDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, dd, mm, yyyy, hh, mi, ss] = m
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`)
}

// ─── Auth ──────────────────────────────────────
function validateSyncSecret(request: NextRequest): boolean {
  if (!CRON_SECRET) {
    console.warn('[vendas-bulk] CRON_SECRET não configurado — permitindo (apenas dev)')
    return true
  }
  if (request.headers.get('x-vercel-cron') === 'true') {
    const auth = request.headers.get('authorization') || ''
    if (auth === `Bearer ${CRON_SECRET}`) return true
    return false
  }
  const secret =
    request.headers.get('x-sync-secret') ||
    request.nextUrl.searchParams.get('secret') ||
    request.nextUrl.searchParams.get('cron-secret') ||
    ''
  return secret === CRON_SECRET
}

// ─── Linvix login ──────────────────────────────
async function loginToLinvix(): Promise<string> {
  console.log('[vendas-bulk] Login Linvix...')
  sessionUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
  await sleep(500 + Math.random() * 1000)

  const body = new URLSearchParams()
  body.set('login', LINVIX_USER)
  body.set('senha', LINVIX_PASSWORD)
  body.set('redirect_url', '')

  const response = await fetch(LINVIX_LOGIN_URL, {
    method: 'POST',
    headers: loginHeaders(),
    body: body.toString(),
    redirect: 'manual',
  })

  const setCookieHeaders = response.headers.getSetCookie?.() || []
  const allCookies: string[] = [...setCookieHeaders]
  const rawSetCookie = response.headers.get('set-cookie')
  if (rawSetCookie && allCookies.length === 0) {
    allCookies.push(...rawSetCookie.split(','))
  }

  let phpsessid = ''
  for (const cookie of allCookies) {
    const match = cookie.match(/PHPSESSID=([^;]+)/)
    if (match) { phpsessid = match[1]; break }
  }
  if (!phpsessid) {
    throw new Error('Falha no login Linvix: PHPSESSID não encontrado')
  }

  try {
    const loginData = await response.json().catch(() => null)
    if (loginData && loginData.status !== 'SUCESSO') {
      throw new Error(`Login falhou: ${loginData.mensagem || loginData.status}`)
    }
  } catch (e: any) {
    if (e.message?.includes('Login falhou')) throw e
  }

  console.log('[vendas-bulk] Login OK')
  return phpsessid
}

// ─── Fetch one page of NF-e list ───────────────
async function fetchNfeListPage(phpsessid: string, draw: number, start: number): Promise<any> {
  const params = new URLSearchParams()
  params.set('draw', String(draw))
  params.set('start', String(start))
  params.set('length', String(PAGE_SIZE))
  params.set('search[value]', '')
  params.set('search[regex]', 'false')
  params.set('order[0][column]', '0')
  params.set('order[0][dir]', 'desc')
  const columns = ['ID', 'NUMERO', 'STATUS', 'CLIENTE', 'VALOR', 'DATA', 'OPERADOR', 'EMITENTE', 'ACOES']
  columns.forEach((col, i) => {
    params.set(`columns[${i}][data]`, String(i))
    params.set(`columns[${i}][name]`, col)
    params.set(`columns[${i}][searchable]`, 'true')
    params.set(`columns[${i}][orderable]`, 'true')
    params.set(`columns[${i}][search][value]`, '')
    params.set(`columns[${i}][search][regex]`, 'false')
  })

  const url = `${LINVIX_NFE_LIST_URL}?${params}`
  const response = await fetch(url, { method: 'GET', headers: browserHeaders(phpsessid) })
  if (!response.ok) {
    throw new Error(`Erro página ${draw}: HTTP ${response.status}`)
  }
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`JSON inválido na página ${draw}: ${text.substring(0, 200)}`)
  }
}

// ─── Map Linvix row → M-Tech Venda fields ──────
interface MappedVenda {
  linvixId: number
  uuid: string
  faturamento: number
  numeroPedido: number
  numero: string
  serie: string
  clienteCodigo: string
  finalidade: string
  situacao: string
  valorTotal: number
  dataEmissao: Date | null
  dataSaida: Date | null
  operador: string
  naturezaOperacao: string
  emitente: string
  chave: string
  transportadora: string
  devolvido: boolean
}

function mapLinvixRowToVenda(row: any): MappedVenda | null {
  const linvixId = parseInt(row.ID, 10)
  if (!linvixId) return null

  // CLIENTE comes as "000422 - SPEED INFORMATICA E CELULARES LTDA"
  // We need just the codigo part for the FK
  const clienteRaw = row.CLIENTE || row.CLIENTE_CODIGO_NOME || ''
  const clienteCodigo = (clienteRaw.match(/^(\d+)/) || [])[1] || ''

  if (!clienteCodigo) {
    // Skip NF-e without a valid client code (shouldn't happen, but defensive)
    return null
  }

  return {
    linvixId,
    uuid: row.UUID || '',
    faturamento: parseInt(row.FATURAMENTO, 10) || 0,
    numeroPedido: parseInt(row.NUMERO_PEDIDO, 10) || 0,
    numero: String(row.NUMERO || ''),
    serie: String(row.SERIE || '1'),
    clienteCodigo,
    finalidade: stripHtml(row.FINALIDADE),
    situacao: stripHtml(row.NFE_SITUACAO) || row.NFE_SITUACAO_STRING || '',
    valorTotal: parseCurrency(row.VALOR_TOT_NOTA),
    dataEmissao: parseLinvixDate(row.DATA_EMISSAO),
    dataSaida: parseLinvixDate(row.DATA_SAIDA),
    operador: decodeHtmlEntities(stripHtml(row.OPERADOR)),
    naturezaOperacao: decodeHtmlEntities(stripHtml(row.NATUREZA_OPERACAO)),
    emitente: decodeHtmlEntities(stripHtml(row.EMITENTE_NOME)),
    chave: String(row.NFE_CHAVE || ''),
    transportadora: decodeHtmlEntities(stripHtml(row.TRANSPORTADORA)),
    devolvido: !!row.DEVOLVIDO,
  }
}

// ─── Batch upsert using raw SQL (fast) ─────────
async function batchUpsertVendas(vendas: MappedVenda[]): Promise<{ created: number; updated: number; errors: number; errorDetails: string[] }> {
  if (vendas.length === 0) return { created: 0, updated: 0, errors: 0, errorDetails: [] }

  // Check existing
  const existing = await db.venda.findMany({
    where: { linvixId: { in: vendas.map(v => v.linvixId) } },
    select: { linvixId: true },
  })
  const existingSet = new Set(existing.map(v => v.linvixId))

  // Check that all clienteCodigo exist in DB (FK constraint)
  const codigos = [...new Set(vendas.map(v => v.clienteCodigo))]
  const existingClientes = await db.cliente.findMany({
    where: { codigo: { in: codigos } },
    select: { codigo: true },
  })
  const existingClienteSet = new Set(existingClientes.map(c => c.codigo))

  const valid = vendas.filter(v => existingClienteSet.has(v.clienteCodigo))
  const skippedFk = vendas.length - valid.length

  if (skippedFk > 0) {
    console.warn(`[vendas-bulk] ${skippedFk} NF-e com cliente não cadastrado — pulando`)
  }

  // Process in chunks of 100 to stay within PG parameter limits
  const CHUNK_SIZE = 100
  let created = 0
  let updated = 0
  let errors = 0
  const errorDetails: string[] = []

  for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
    const chunk = valid.slice(i, i + CHUNK_SIZE)

    try {
      const values: any[] = []
      const rowPlaceholders: string[] = []
      let paramIdx = 1

      for (const v of chunk) {
        const params = [
          v.linvixId,
          v.uuid,
          v.faturamento,
          v.numeroPedido,
          v.numero,
          v.serie,
          v.clienteCodigo,
          v.finalidade,
          v.situacao,
          v.valorTotal,
          v.dataEmissao,
          v.dataSaida,
          v.operador,
          v.naturezaOperacao,
          v.emitente,
          v.chave,
          v.transportadora,
          v.devolvido,
        ]
        values.push(...params)

        const placeholders = params.map(() => `$${paramIdx++}`).join(', ')
        rowPlaceholders.push(`(gen_random_uuid()::text, ${placeholders}, 'linvix', NOW(), NOW(), NOW())`)
      }

      const columns = [
        '"id"', '"linvixId"', '"uuid"', '"faturamento"', '"numeroPedido"',
        '"numero"', '"serie"', '"clienteCodigo"', '"finalidade"', '"situacao"',
        '"valorTotal"', '"dataEmissao"', '"dataSaida"', '"operador"',
        '"naturezaOperacao"', '"emitente"', '"chave"', '"transportadora"',
        '"devolvido"', '"source"', '"syncedAt"', '"createdAt"', '"updatedAt"',
      ].join(', ')

      const updateSet = [
        '"uuid" = COALESCE(NULLIF(EXCLUDED."uuid", \'\'), "Venda"."uuid")',
        '"faturamento" = EXCLUDED."faturamento"',
        '"numeroPedido" = EXCLUDED."numeroPedido"',
        '"numero" = EXCLUDED."numero"',
        '"serie" = EXCLUDED."serie"',
        '"clienteCodigo" = EXCLUDED."clienteCodigo"',
        '"finalidade" = COALESCE(NULLIF(EXCLUDED."finalidade", \'\'), "Venda"."finalidade")',
        '"situacao" = COALESCE(NULLIF(EXCLUDED."situacao", \'\'), "Venda"."situacao")',
        '"valorTotal" = EXCLUDED."valorTotal"',
        '"dataEmissao" = COALESCE(EXCLUDED."dataEmissao", "Venda"."dataEmissao")',
        '"dataSaida" = COALESCE(EXCLUDED."dataSaida", "Venda"."dataSaida")',
        '"operador" = COALESCE(NULLIF(EXCLUDED."operador", \'\'), "Venda"."operador")',
        '"naturezaOperacao" = COALESCE(NULLIF(EXCLUDED."naturezaOperacao", \'\'), "Venda"."naturezaOperacao")',
        '"emitente" = COALESCE(NULLIF(EXCLUDED."emitente", \'\'), "Venda"."emitente")',
        '"chave" = COALESCE(NULLIF(EXCLUDED."chave", \'\'), "Venda"."chave")',
        '"transportadora" = COALESCE(NULLIF(EXCLUDED."transportadora", \'\'), "Venda"."transportadora")',
        '"devolvido" = EXCLUDED."devolvido"',
        '"syncedAt" = NOW()',
        '"updatedAt" = NOW()',
      ].join(',\n          ')

      const sql = `
        INSERT INTO "Venda" (${columns})
        VALUES
          ${rowPlaceholders.join(',\n          ')}
        ON CONFLICT ("linvixId") DO UPDATE SET
          ${updateSet}
      `

      await db.$executeRawUnsafe(sql, ...values)

      for (const v of chunk) {
        if (existingSet.has(v.linvixId)) updated++
        else { created++; existingSet.add(v.linvixId) }
      }
    } catch (err: any) {
      errors += chunk.length
      if (errorDetails.length < 5) {
        errorDetails.push(`Chunk ${i / CHUNK_SIZE + 1}: ${err.message?.substring(0, 200)}`)
      }
      console.error(`[vendas-bulk] Chunk ${i / CHUNK_SIZE + 1} error:`, err.message?.substring(0, 200))
    }
  }

  return { created, updated, errors, errorDetails }
}

// ─── Main handler ──────────────────────────────
export async function GET(request: NextRequest) {
  if (!validateSyncSecret(request)) {
    return NextResponse.json({ error: 'Secret inválido' }, { status: 401 })
  }

  const mode = request.nextUrl.searchParams.get('mode') || 'auto'
  const maxPages = parseInt(request.nextUrl.searchParams.get('pages') || '0', 10)
  const startPageParam = parseInt(request.nextUrl.searchParams.get('startPage') || '1', 10)
  const startPage = Math.max(1, startPageParam)
  const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true'

  if (mode !== 'auto') {
    return NextResponse.json({
      message: 'Linvix Vendas Bulk Sync',
      modes: { auto: 'Sync all pages (default)' },
      params: { pages: 'Limit to N pages', dryRun: 'true to skip DB writes' },
    })
  }

  const startTime = Date.now()

  try {
    if (!LINVIX_USER || !LINVIX_PASSWORD) {
      throw new Error('LINVIX_USER / LINVIX_PASSWORD não configurados')
    }

    // 1. Login
    const phpsessid = await loginToLinvix()
    const loginMs = Date.now() - startTime

    // 2. Fetch pages starting from startPage
    const fetchStart = Date.now()
    const allRows: any[] = []
    let draw = startPage
    let start = (startPage - 1) * PAGE_SIZE
    let totalRecords = 0

    // First page
    const firstPage = await fetchNfeListPage(phpsessid, draw, start)
    totalRecords = firstPage.recordsTotal || 0
    allRows.push(...(firstPage.data || []))
    console.log(`[vendas-bulk] Página ${draw}: ${(firstPage.data || []).length} NF-e (total Linvix: ${totalRecords})`)

    draw++
    start += PAGE_SIZE

    // Remaining pages
    while (start < totalRecords) {
      if (maxPages > 0 && draw - startPage >= maxPages) break
      await sleep(400) // gentle on Linvix
      const page = await fetchNfeListPage(phpsessid, draw, start)
      const pageData = page.data || []
      allRows.push(...pageData)
      console.log(`[vendas-bulk] Página ${draw}: ${pageData.length} NF-e (acumulado: ${allRows.length})`)
      draw++
      start += PAGE_SIZE
    }

    const fetchMs = Date.now() - fetchStart

    // 3. Map rows to M-Tech format
    const mapped = allRows.map(mapLinvixRowToVenda).filter(Boolean) as MappedVenda[]
    const skippedMapping = allRows.length - mapped.length

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        totalRecords,
        fetched: allRows.length,
        validForUpsert: mapped.length,
        skippedMapping,
        durationMs: Date.now() - startTime,
        loginMs,
        fetchMs,
        pagesScraped: draw - 1,
        sample: mapped.slice(0, 3),
      })
    }

    // 4. Batch upsert
    const upsertStart = Date.now()
    const result = await batchUpsertVendas(mapped)
    const upsertMs = Date.now() - upsertStart

    // 5. Update sync log
    try {
      await db.linvixSyncLog.create({
        data: {
          syncType: 'vendas-bulk',
          status: result.errors > 0 ? (result.created + result.updated > 0 ? 'partial' : 'error') : 'success',
          startedAt: new Date(startTime),
          finishedAt: new Date(),
          totalClients: totalRecords,
          createdCount: result.created,
          updatedCount: result.updated,
          skippedCount: skippedMapping,
          errorCount: result.errors,
          errorMessage: result.errorDetails.join('\n').substring(0, 500),
          pagesScraped: draw - 1,
          durationMs: Date.now() - startTime,
        },
      })
    } catch (e: any) {
      console.warn('[vendas-bulk] Sync log write failed:', e.message?.substring(0, 80))
    }

    return NextResponse.json({
      status: result.errors > 0 ? (result.created + result.updated > 0 ? 'partial' : 'error') : 'success',
      totalRecords,
      fetched: allRows.length,
      validForUpsert: mapped.length,
      skippedMapping,
      created: result.created,
      updated: result.updated,
      errors: result.errors,
      errorDetails: result.errorDetails,
      durationMs: Date.now() - startTime,
      timing: { loginMs, fetchMs, upsertMs },
      pagesScraped: draw - startPage,
      startPage,
      nextStartPage: draw, // pass this as ?startPage= for the next run
    })
  } catch (err: any) {
    console.error('[vendas-bulk] Erro:', err)
    return NextResponse.json(
      { status: 'error', error: err.message?.substring(0, 200) || 'Erro desconhecido' },
      { status: 500 },
    )
  }
}
