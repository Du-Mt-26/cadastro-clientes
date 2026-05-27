import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { db } from '@/lib/db'

// ─── Linvix Vendas (NF-e) Sync API ──────────────────
// Syncs NF-e/sales data from Linvix ERP → M-Tech
// Unidirectional: Linvix → M-Tech only
//
// Modes:
//   ?mode=incremental  → Only fetch NEW NF-e (stops at known IDs) + backfill missing items
//   ?mode=backfill     → Only fetch details for vendas with 0 items
//   ?mode=full         → Fetch ALL NF-e (original behavior, may timeout on large datasets)
//   ?mode=auto         → Same as incremental (used by cron)
//   (default)          → Return sync status

export const maxDuration = 60 // 60s (Vercel Hobby limit)
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || process.env.SYNC_SECRET || ''
const LINVIX_USER = process.env.LINVIX_USER || ''
const LINVIX_PASSWORD = process.env.LINVIX_PASSWORD || ''

const LINVIX_BASE = 'https://rp.erp.linvix.com'
const LINVIX_LOGIN_URL = `${LINVIX_BASE}/ajax/ajax-login.php`
const LINVIX_NFE_LIST_URL = `${LINVIX_BASE}/nota-fiscal-eletronica/ajax/ajax-notas-datatable.php`
const LINVIX_NFE_DETAIL_URL = `${LINVIX_BASE}/nota-fiscal-eletronica/ajax/ajax-pega-nota.php`
const PAGE_SIZE = 350
// ─── Stealth: randomized delays (jitter) to look like human browsing ──
const PAGE_DELAY_MIN = 1500
const PAGE_DELAY_MAX = 3500
const DETAIL_DELAY_MIN = 1000
const DETAIL_DELAY_MAX = 2500

function jitterDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs)
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Stealth: rotating User-Agents per session ───────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.112 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
]

let sessionUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]

// ─── Stealth: realistic browser headers ───────────────────
function browserHeaders(phpsessid: string): Record<string, string> {
  return {
    'Cookie': `PHPSESSID=${phpsessid}`,
    'User-Agent': sessionUA,
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://rp.erp.linvix.com/',
    'Origin': 'https://rp.erp.linvix.com',
    'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="122", "Chromium";v="122"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Connection': 'keep-alive',
  }
}

function loginHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': sessionUA,
    'Accept': '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Origin': 'https://rp.erp.linvix.com',
    'Referer': 'https://rp.erp.linvix.com/',
    'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="122", "Chromium";v="122"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  }
}

// Safety: max time we spend fetching details (leave 30s buffer for upserts)
const MAX_DETAIL_TIME_MS = 4 * 60 * 1000 // 4 minutes
// Max details to fetch per run (even if time allows)
const MAX_DETAILS_PER_RUN = 200

// ─── Auth helpers ──────────────────────────────────────

function validateSyncSecret(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron') === 'true') return true
  if (!CRON_SECRET) return true
  const secret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret') || request.nextUrl.searchParams.get('cron-secret') || ''
  return secret === CRON_SECRET
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').trim()
}

function parseDateTime(raw: string): Date | null {
  if (!raw) return null
  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/)
  if (brMatch) {
    const d = new Date(
      parseInt(brMatch[3]), parseInt(brMatch[2]) - 1, parseInt(brMatch[1]),
      parseInt(brMatch[4]), parseInt(brMatch[5]), parseInt(brMatch[6])
    )
    return isNaN(d.getTime()) ? null : d
  }
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/)
  if (isoMatch) {
    const d = new Date(
      parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]),
      parseInt(isoMatch[4]), parseInt(isoMatch[5]), parseInt(isoMatch[6])
    )
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

// ─── Linvix HTTP Operations ────────────────────────────

async function loginToLinvix(): Promise<string> {
  console.log('[sync/linvix-vendas] Fazendo login no Linvix...')

  // Rotate User-Agent for each new session
  sessionUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]

  // Small pre-login delay
  await jitterDelay(500, 1500)

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
    throw new Error('Falha ao fazer login no Linvix: PHPSESSID não encontrado')
  }

  try {
    const loginData = await response.json().catch(() => null)
    if (loginData && loginData.status !== 'SUCESSO') {
      throw new Error(`Login falhou: ${loginData.mensagem || 'status=' + loginData.status}`)
    }
  } catch (e: any) {
    if (e.message?.includes('Login falhou')) throw e
  }

  console.log('[sync/linvix-vendas] Login OK')
  return phpsessid
}

async function fetchNfeListPage(phpsessid: string, draw: number, start: number, length: number = PAGE_SIZE): Promise<any> {
  const params = new URLSearchParams()
  params.set('draw', String(draw))
  params.set('start', String(start))
  params.set('length', String(length))
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

  const response = await fetch(url, {
    method: 'GET',
    headers: browserHeaders(phpsessid),
  })

  if (!response.ok) {
    throw new Error(`Erro ao buscar NF-e lista página ${draw}: HTTP ${response.status}`)
  }

  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    console.error('[sync/linvix-vendas] Invalid JSON from list API (first 200 chars):', text.substring(0, 200))
    throw new Error(`Invalid JSON from NF-e list API`)
  }
}

async function fetchNfeDetail(phpsessid: string, nfeId: number): Promise<any> {
  const url = `${LINVIX_NFE_DETAIL_URL}?id=${nfeId}`

  const response = await fetch(url, {
    method: 'GET',
    headers: browserHeaders(phpsessid),
  })

  if (!response.ok) {
    throw new Error(`Erro ao buscar detalhe NF-e ${nfeId}: HTTP ${response.status}`)
  }

  return await response.json()
}

/**
 * Fetch NF-e list pages, stopping early if all records on a page are already known.
 * Returns: { nfeList, pagesScraped, stoppedEarly }
 */
async function fetchNewNfeFromLinvix(phpsessid: string, knownIds: Set<number>): Promise<{
  nfeList: any[]
  pagesScraped: number
  stoppedEarly: boolean
}> {
  console.log('[sync/linvix-vendas] Buscando lista de NF-e (incremental)...')

  const allNfe: any[] = []
  let draw = 1
  let start = 0
  let stoppedEarly = false

  const firstPage = await fetchNfeListPage(phpsessid, draw, start)
  const totalRecords = firstPage.recordsTotal || 0

  // Check first page for known IDs
  const firstPageData = firstPage.data || []
  const allKnown = firstPageData.every((row: any) => knownIds.has(parseInt(row.ID, 10)))

  if (allKnown && firstPageData.length > 0) {
    console.log(`[sync/linvix-vendas] Primeira página já totalmente conhecida — nenhum dado novo`)
    return { nfeList: [], pagesScraped: 1, stoppedEarly: true }
  }

  // Filter out already-known records from this page
  const newFromFirstPage = firstPageData.filter((row: any) => !knownIds.has(parseInt(row.ID, 10)))
  allNfe.push(...newFromFirstPage)
  console.log(`[sync/linvix-vendas] Página 1: ${newFromFirstPage.length} novas NF-e (total no Linvix: ${totalRecords})`)

  // If all records on the first page are new, continue to next pages
  // Stop when a page is entirely known
  draw++
  start += PAGE_SIZE

  while (start < totalRecords && !stoppedEarly) {
    await jitterDelay(PAGE_DELAY_MIN, PAGE_DELAY_MAX)
    const page = await fetchNfeListPage(phpsessid, draw, start)
    const pageData = page.data || []

    // Check if entire page is known
    const pageAllKnown = pageData.every((row: any) => knownIds.has(parseInt(row.ID, 10)))

    if (pageAllKnown && pageData.length > 0) {
      console.log(`[sync/linvix-vendas] Página ${draw} totalmente conhecida — parando paginação`)
      stoppedEarly = true
      break
    }

    // Add only new records
    const newFromPage = pageData.filter((row: any) => !knownIds.has(parseInt(row.ID, 10)))
    allNfe.push(...newFromPage)
    console.log(`[sync/linvix-vendas] Página ${draw}: ${newFromPage.length} novas NF-e`)

    draw++
    start += PAGE_SIZE
  }

  console.log(`[sync/linvix-vendas] Total: ${allNfe.length} NF-e novas para sincronizar`)
  return { nfeList: allNfe, pagesScraped: draw - 1, stoppedEarly }
}

/**
 * Fetch ALL NF-e list (for full mode)
 */
async function fetchAllNfeFromLinvix(phpsessid: string): Promise<any[]> {
  console.log('[sync/linvix-vendas] Buscando lista completa de NF-e...')

  const allNfe: any[] = []
  let draw = 1
  let start = 0

  const firstPage = await fetchNfeListPage(phpsessid, draw, start)
  const totalRecords = firstPage.recordsTotal || 0
  allNfe.push(...(firstPage.data || []))
  console.log(`[sync/linvix-vendas] Página 1: ${firstPage.data?.length || 0} NF-e (total: ${totalRecords})`)

  draw++
  start += PAGE_SIZE

  while (start < totalRecords) {
    await jitterDelay(PAGE_DELAY_MIN, PAGE_DELAY_MAX)
    const page = await fetchNfeListPage(phpsessid, draw, start)
    allNfe.push(...(page.data || []))
    console.log(`[sync/linvix-vendas] Página ${draw}: ${page.data?.length || 0} NF-e (acumulado: ${allNfe.length}/${totalRecords})`)
    draw++
    start += PAGE_SIZE
  }

  console.log(`[sync/linvix-vendas] Total: ${allNfe.length} NF-e buscadas`)
  return allNfe
}

// ─── Upsert Logic ─────────────────────────────────────

async function upsertVenda(nfeDetail: any): Promise<{ created: boolean; updated: boolean }> {
  const linvixId = nfeDetail.ID
  if (!linvixId) return { created: false, updated: false }

  const clienteCodigo = nfeDetail.CLIENTE?.CODIGO || ''
  if (!clienteCodigo) return { created: false, updated: false }

  // Check if cliente exists in Mtech
  const clienteExists = await db.cliente.findUnique({ where: { codigo: clienteCodigo } })
  if (!clienteExists) {
    console.log(`[sync/linvix-vendas] Cliente ${clienteCodigo} não encontrado na Mtech, pulando NF-e ${linvixId}`)
    return { created: false, updated: false }
  }

  const pagamento = nfeDetail.PAGAMENTO_NOVO
  const dataEmissao = parseDateTime(nfeDetail.DATA_EMISSAO)
  const dataSaida = parseDateTime(nfeDetail.DATA_SAIDA)
  const situacao = stripHtml(nfeDetail.STATUS) || ''
  const finalidade = stripHtml(nfeDetail.DADOS_NOTA?.FINALIDADE) || ''
  const observacoes = [
    nfeDetail.OBSERVACOES?.OBSERVACOES_INFO || '',
    nfeDetail.OBSERVACOES?.OBSERVACOES_FISCAL || '',
  ].filter(Boolean).join('\n').trim()

  const vendaData = {
    linvixId,
    uuid: nfeDetail.UUID || '',
    faturamento: nfeDetail.FATURAMENTO || 0,
    numeroPedido: nfeDetail.FATURAMENTO_DADOS?.NUMERO_PEDIDO || 0,
    numero: nfeDetail.NUMERO || '',
    serie: nfeDetail.FATURAMENTO_DADOS?.SERIE || '1',
    clienteCodigo,
    finalidade,
    situacao,
    valorTotal: nfeDetail.VALOR_TOTAL_NOTA || 0,
    dataEmissao,
    dataSaida,
    operador: '',
    naturezaOperacao: nfeDetail.DADOS_NOTA?.NATUREZA_OPERACAO || '',
    emitente: '',
    chave: nfeDetail.NFE_CHAVE || '',
    transportadora: nfeDetail.TRANSPORTE?.TRANSPORTADORA || '',
    devolvido: false,
    observacoes,
    valorVenda: pagamento?.valor_venda || 0,
    valorPago: pagamento?.valor_pago || 0,
    valorProdutos: pagamento?.valor_prod || nfeDetail.VALOR_TOTAL_PRODUTOS || 0,
    valorFrete: pagamento?.valor_frete || 0,
    valorDesconto: pagamento?.valor_desconto || 0,
    valorFinal: pagamento?.valor_final || nfeDetail.VALOR_TOTAL_NOTA || 0,
    formaPagamento: pagamento?.config_parcelamento_nome || '',
    source: 'linvix',
    syncedAt: new Date(),
  }

  const existing = await db.venda.findUnique({ where: { linvixId } })

  if (existing) {
    await db.venda.update({
      where: { linvixId },
      data: vendaData,
    })
    await db.vendaItem.deleteMany({ where: { vendaId: existing.id } })

    const produtos = nfeDetail.PRODUTOS || []
    for (const p of produtos) {
      const tributacao = p.TRIBUTACAO
      await db.vendaItem.create({
        data: {
          vendaId: existing.id,
          item: p.ITEM || 0,
          codigoProduto: p.CODIGO || '',
          descricao: p.DESCRICAO || '',
          unidade: p.UND || '',
          quantidade: p.QTD || 0,
          precoVenda: p.PRECO_VENDA || 0,
          valorDesconto: p.VALOR_DESCONTO_TOTAL || 0,
          valorCusto: p.VALOR_CUSTO_UNITARIO || 0,
          valorTotal: p.VALOR_TOTAL || 0,
          vendedor: p.VENDEDOR || '',
          ncm: tributacao?.COD_NCM || '',
          cfop: tributacao?.ICMS?.CFOP || '',
        },
      })
    }
    return { created: false, updated: true }
  } else {
    const produtos = nfeDetail.PRODUTOS || []
    const itensData = produtos.map((p: any) => ({
      item: p.ITEM || 0,
      codigoProduto: p.CODIGO || '',
      descricao: p.DESCRICAO || '',
      unidade: p.UND || '',
      quantidade: p.QTD || 0,
      precoVenda: p.PRECO_VENDA || 0,
      valorDesconto: p.VALOR_DESCONTO_TOTAL || 0,
      valorCusto: p.VALOR_CUSTO_UNITARIO || 0,
      valorTotal: p.VALOR_TOTAL || 0,
      vendedor: p.VENDEDOR || '',
      ncm: p.TRIBUTACAO?.COD_NCM || '',
      cfop: p.TRIBUTACAO?.ICMS?.CFOP || '',
    }))

    await db.venda.create({
      data: {
        ...vendaData,
        itens: { create: itensData },
      },
    })
    return { created: true, updated: false }
  }
}

// ─── Update ultimaVenda for affected clients ─────────

async function updateUltimaVendaForClients(clienteCodigos: string[]): Promise<void> {
  for (const codigo of clienteCodigos) {
    try {
      const lastVenda = await db.venda.findFirst({
        where: {
          clienteCodigo: codigo,
          situacao: { contains: 'AUTORIZADO' },
        },
        orderBy: { dataEmissao: 'desc' },
        select: { dataEmissao: true },
      })

      const ultimaVendaStr = lastVenda?.dataEmissao
        ? lastVenda.dataEmissao.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        : ''

      await db.cliente.update({
        where: { codigo },
        data: { ultimaVenda: ultimaVendaStr },
      })
    } catch {
      // Skip if client doesn't exist
    }
  }
}

// ─── Get known linvixIds from our DB ──────────────────

async function getKnownLinvixIds(): Promise<Set<number>> {
  const existing = await db.venda.findMany({
    select: { linvixId: true },
  })
  return new Set(existing.map(v => v.linvixId))
}

// ─── Get vendas missing items (need detail backfill) ──

async function getVendasMissingItems(limit: number = MAX_DETAILS_PER_RUN): Promise<{ id: string; linvixId: number }[]> {
  // Find vendas that have 0 items
  const vendas = await db.venda.findMany({
    where: { itens: { none: {} } },
    select: { id: true, linvixId: true },
    take: limit,
  })
  return vendas
}

// ─── Sync Modes ──────────────────────────────────────

/**
 * Incremental sync: Only fetch NEW NF-e + backfill missing items
 * This is the recommended mode for daily/hourly cron runs.
 */
async function runIncrementalSync(): Promise<{
  success: boolean
  totalNfe: number
  created: number
  updated: number
  skipped: number
  errors: number
  errorDetails: string[]
  durationMs: number
  detailsScraped: number
  pagesScraped: number
  backfilledItems: number
  newNfeFound: number
}> {
  const startTime = Date.now()

  // 1. Get known IDs from our DB
  const knownIds = await getKnownLinvixIds()
  console.log(`[sync/linvix-vendas] Incremental: ${knownIds.size} NF-e já conhecidas no banco`)

  // 2. Login
  const phpsessid = await loginToLinvix()

  // 3. Fetch only new NF-e from list (stops at known IDs)
  const { nfeList, pagesScraped, stoppedEarly } = await fetchNewNfeFromLinvix(phpsessid, knownIds)
  const newNfeFound = nfeList.length

  // Build map of list data for enrichment
  const listMap = new Map<string, any>()
  for (const row of nfeList) {
    const id = row.ID
    if (id) listMap.set(String(id), row)
  }

  // 4. Fetch details and upsert each NEW NF-e (with time limit)
  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0
  let detailsScraped = 0
  const errorDetails: string[] = []
  const affectedClientes = new Set<string>()

  const detailStartTime = Date.now()

  for (let i = 0; i < nfeList.length; i++) {
    // Check time limit
    if (Date.now() - detailStartTime > MAX_DETAIL_TIME_MS) {
      console.log(`[sync/linvix-vendas] Limite de tempo atingido após ${detailsScraped} detalhes. Restantes: ${nfeList.length - i}`)
      skipped += nfeList.length - i
      break
    }

    // Check count limit
    if (detailsScraped >= MAX_DETAILS_PER_RUN) {
      console.log(`[sync/linvix-vendas] Limite de ${MAX_DETAILS_PER_RUN} detalhes atingido. Restantes: ${nfeList.length - i}`)
      skipped += nfeList.length - i
      break
    }

    const nfeRow = nfeList[i]
    const nfeId = parseInt(nfeRow.ID, 10)

    if (!nfeId) { skipped++; continue }

    try {
      await jitterDelay(DETAIL_DELAY_MIN, DETAIL_DELAY_MAX)
      const detail = await fetchNfeDetail(phpsessid, nfeId)
      detailsScraped++

      // Enrich with list data
      const listData = listMap.get(String(nfeId))
      if (listData) {
        if (!detail.OPERADOR) detail.OPERADOR = stripHtml(listData.OPERADOR)
        if (!detail.EMITENTE_NOME && listData.EMITENTE_NOME) {
          detail.emitente = stripHtml(listData.EMITENTE_NOME)
        }
      }

      const result = await upsertVenda(detail)
      if (result.created) { created++; affectedClientes.add(detail.CLIENTE?.CODIGO) }
      else if (result.updated) { updated++; affectedClientes.add(detail.CLIENTE?.CODIGO) }
      else skipped++

      if ((detailsScraped) % 10 === 0) {
        console.log(`[sync/linvix-vendas] Progresso: ${detailsScraped} detalhes buscados (criadas=${created}, atualizadas=${updated})`)
      }
    } catch (err: any) {
      errors++
      if (errorDetails.length < 10) errorDetails.push(`NF-e ${nfeId}: ${err.message?.substring(0, 100)}`)
      console.error(`[sync/linvix-vendas] Erro na NF-e ${nfeId}:`, err.message)
    }
  }

  // 5. Backfill missing items for existing vendas (if time allows)
  let backfilledItems = 0
  const timeRemaining = MAX_DETAIL_TIME_MS - (Date.now() - detailStartTime)
  if (timeRemaining > 30000) { // Only if at least 30s left
    const vendasMissingItems = await getVendasMissingItems(MAX_DETAILS_PER_RUN - detailsScraped)
    if (vendasMissingItems.length > 0) {
      console.log(`[sync/linvix-vendas] Backfill: ${vendasMissingItems.length} vendas sem itens, buscando detalhes...`)
      for (const v of vendasMissingItems) {
        if (Date.now() - detailStartTime > MAX_DETAIL_TIME_MS) break
        if (detailsScraped >= MAX_DETAILS_PER_RUN) break

        try {
          await jitterDelay(DETAIL_DELAY_MIN, DETAIL_DELAY_MAX)
          const detail = await fetchNfeDetail(phpsessid, v.linvixId)
          detailsScraped++

          if (detail.PRODUTOS && detail.PRODUTOS.length > 0) {
            // Delete any leftover items and re-create
            await db.vendaItem.deleteMany({ where: { vendaId: v.id } })
            for (const p of detail.PRODUTOS) {
              await db.vendaItem.create({
                data: {
                  vendaId: v.id,
                  item: p.ITEM || 0,
                  codigoProduto: p.CODIGO || '',
                  descricao: p.DESCRICAO || '',
                  unidade: p.UND || '',
                  quantidade: p.QTD || 0,
                  precoVenda: p.PRECO_VENDA || 0,
                  valorDesconto: p.VALOR_DESCONTO_TOTAL || 0,
                  valorCusto: p.VALOR_CUSTO_UNITARIO || 0,
                  valorTotal: p.VALOR_TOTAL || 0,
                  vendedor: p.VENDEDOR || '',
                  ncm: p.TRIBUTACAO?.COD_NCM || '',
                  cfop: p.TRIBUTACAO?.ICMS?.CFOP || '',
                },
              })
            }
            backfilledItems++
            affectedClientes.add(detail.CLIENTE?.CODIGO)
          }

          // Also update the venda record itself with any missing data
          const situacao = stripHtml(detail.STATUS) || ''
          const dataEmissao = parseDateTime(detail.DATA_EMISSAO)
          const pagamento = detail.PAGAMENTO_NOVO
          await db.venda.update({
            where: { id: v.id },
            data: {
              situacao,
              dataEmissao,
              valorVenda: pagamento?.valor_venda || undefined,
              valorPago: pagamento?.valor_pago || undefined,
              valorProdutos: pagamento?.valor_prod || undefined,
              valorFrete: pagamento?.valor_frete || undefined,
              valorDesconto: pagamento?.valor_desconto || undefined,
              valorFinal: pagamento?.valor_final || undefined,
              formaPagamento: pagamento?.config_parcelamento_nome || undefined,
              syncedAt: new Date(),
            },
          })
        } catch (err: any) {
          errors++
          if (errorDetails.length < 10) errorDetails.push(`Backfill NF-e ${v.linvixId}: ${err.message?.substring(0, 100)}`)
        }
      }
    }
  }

  // 6. Update ultimaVenda for affected clients
  if (affectedClientes.size > 0) {
    console.log(`[sync/linvix-vendas] Atualizando ultimaVenda para ${affectedClientes.size} clientes...`)
    await updateUltimaVendaForClients([...affectedClientes].filter(Boolean))
  }

  const totalMs = Date.now() - startTime
  console.log(`[sync/linvix-vendas] Incremental sync completo: ${totalMs}ms (novas=${created}, atualizadas=${updated}, backfill=${backfilledItems}, erros=${errors})`)

  return {
    success: errors === 0,
    totalNfe: nfeList.length,
    created,
    updated,
    skipped,
    errors,
    errorDetails,
    durationMs: totalMs,
    detailsScraped,
    pagesScraped,
    backfilledItems,
    newNfeFound,
  }
}

/**
 * Backfill-only mode: Only fetch details for vendas that have 0 items
 * Used to gradually fill in missing product data without fetching the whole list
 */
async function runBackfillSync(): Promise<{
  success: boolean
  backfilledItems: number
  errors: number
  errorDetails: string[]
  durationMs: number
  detailsScraped: number
}> {
  const startTime = Date.now()

  const vendasMissingItems = await getVendasMissingItems()
  console.log(`[sync/linvix-vendas] Backfill: ${vendasMissingItems.length} vendas sem itens`)

  if (vendasMissingItems.length === 0) {
    return { success: true, backfilledItems: 0, errors: 0, errorDetails: [], durationMs: 0, detailsScraped: 0 }
  }

  const phpsessid = await loginToLinvix()

  let backfilledItems = 0
  let errors = 0
  let detailsScraped = 0
  const errorDetails: string[] = []
  const affectedClientes = new Set<string>()

  for (const v of vendasMissingItems) {
    if (Date.now() - startTime > MAX_DETAIL_TIME_MS) break
    if (detailsScraped >= MAX_DETAILS_PER_RUN) break

    try {
      await jitterDelay(DETAIL_DELAY_MIN, DETAIL_DELAY_MAX)
      const detail = await fetchNfeDetail(phpsessid, v.linvixId)
      detailsScraped++

      if (detail.PRODUTOS && detail.PRODUTOS.length > 0) {
        await db.vendaItem.deleteMany({ where: { vendaId: v.id } })
        for (const p of detail.PRODUTOS) {
          await db.vendaItem.create({
            data: {
              vendaId: v.id,
              item: p.ITEM || 0,
              codigoProduto: p.CODIGO || '',
              descricao: p.DESCRICAO || '',
              unidade: p.UND || '',
              quantidade: p.QTD || 0,
              precoVenda: p.PRECO_VENDA || 0,
              valorDesconto: p.VALOR_DESCONTO_TOTAL || 0,
              valorCusto: p.VALOR_CUSTO_UNITARIO || 0,
              valorTotal: p.VALOR_TOTAL || 0,
              vendedor: p.VENDEDOR || '',
              ncm: p.TRIBUTACAO?.COD_NCM || '',
              cfop: p.TRIBUTACAO?.ICMS?.CFOP || '',
            },
          })
        }
        backfilledItems++
        affectedClientes.add(detail.CLIENTE?.CODIGO)

        // Update venda record
        const situacao = stripHtml(detail.STATUS) || ''
        const dataEmissao = parseDateTime(detail.DATA_EMISSAO)
        const pagamento = detail.PAGAMENTO_NOVO
        await db.venda.update({
          where: { id: v.id },
          data: {
            situacao,
            dataEmissao,
            valorVenda: pagamento?.valor_venda || undefined,
            valorPago: pagamento?.valor_pago || undefined,
            valorProdutos: pagamento?.valor_prod || undefined,
            valorFrete: pagamento?.valor_frete || undefined,
            valorDesconto: pagamento?.valor_desconto || undefined,
            valorFinal: pagamento?.valor_final || undefined,
            formaPagamento: pagamento?.config_parcelamento_nome || undefined,
            syncedAt: new Date(),
          },
        })
      }
    } catch (err: any) {
      errors++
      if (errorDetails.length < 10) errorDetails.push(`Backfill NF-e ${v.linvixId}: ${err.message?.substring(0, 100)}`)
    }
  }

  if (affectedClientes.size > 0) {
    await updateUltimaVendaForClients([...affectedClientes].filter(Boolean))
  }

  const totalMs = Date.now() - startTime
  console.log(`[sync/linvix-vendas] Backfill completo: ${totalMs}ms (itens preenchidos=${backfilledItems}, erros=${errors})`)

  return { success: errors === 0, backfilledItems, errors, errorDetails, durationMs: totalMs, detailsScraped }
}

/**
 * Full sync: Fetch ALL NF-e (original behavior)
 * WARNING: Will timeout for large datasets on Vercel
 */
async function runFullSync(): Promise<{
  success: boolean
  totalNfe: number
  created: number
  updated: number
  skipped: number
  errors: number
  errorDetails: string[]
  durationMs: number
  detailsScraped: number
}> {
  const startTime = Date.now()

  const phpsessid = await loginToLinvix()
  const nfeList = await fetchAllNfeFromLinvix(phpsessid)
  const totalNfe = nfeList.length

  const listMap = new Map<string, any>()
  for (const row of nfeList) {
    const id = row.ID
    if (id) listMap.set(String(id), row)
  }

  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0
  let detailsScraped = 0
  const errorDetails: string[] = []
  const affectedClientes = new Set<string>()

  for (let i = 0; i < nfeList.length; i++) {
    // Safety: time limit for full mode too
    if (Date.now() - startTime > MAX_DETAIL_TIME_MS) {
      console.log(`[sync/linvix-vendas] Tempo limite atingido. ${nfeList.length - i} NF-e restantes.`)
      skipped += nfeList.length - i
      break
    }

    const nfeRow = nfeList[i]
    const nfeId = parseInt(nfeRow.ID, 10)

    if (!nfeId) { skipped++; continue }

    try {
      await jitterDelay(DETAIL_DELAY_MIN, DETAIL_DELAY_MAX)
      const detail = await fetchNfeDetail(phpsessid, nfeId)
      detailsScraped++

      const listData = listMap.get(String(nfeId))
      if (listData) {
        if (!detail.OPERADOR) detail.OPERADOR = stripHtml(listData.OPERADOR)
        if (!detail.EMITENTE_NOME && listData.EMITENTE_NOME) {
          detail.emitente = stripHtml(listData.EMITENTE_NOME)
        }
      }

      const result = await upsertVenda(detail)
      if (result.created) { created++; affectedClientes.add(detail.CLIENTE?.CODIGO) }
      else if (result.updated) { updated++; affectedClientes.add(detail.CLIENTE?.CODIGO) }
      else skipped++

      if ((i + 1) % 10 === 0) {
        console.log(`[sync/linvix-vendas] Progresso: ${i + 1}/${totalNfe} (criadas=${created}, atualizadas=${updated})`)
      }
    } catch (err: any) {
      errors++
      if (errorDetails.length < 10) errorDetails.push(`NF-e ${nfeId}: ${err.message?.substring(0, 100)}`)
      console.error(`[sync/linvix-vendas] Erro na NF-e ${nfeId}:`, err.message)
    }
  }

  if (affectedClientes.size > 0) {
    await updateUltimaVendaForClients([...affectedClientes].filter(Boolean))
  }

  const totalMs = Date.now() - startTime
  console.log(`[sync/linvix-vendas] Full sync completo: ${totalMs}ms (criadas=${created}, atualizadas=${updated}, erros=${errors})`)

  return {
    success: errors === 0,
    totalNfe,
    created,
    updated,
    skipped,
    errors,
    errorDetails,
    durationMs: totalMs,
    detailsScraped,
  }
}

// ─── API Route Handlers ───────────────────────────────

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode')

  // ─── Cron mode: fire-and-forget for external cron services (cron-jobs.org) ─
  // Uses waitUntil() to return HTTP 200 immediately while the sync
  // continues running in the background. This solves the 30-second
  // timeout limit on cron-jobs.org — the response goes out instantly,
  // and the sync runs for up to maxDuration (60s) on the Vercel side.
  // Results are saved to LinvixSyncLog for later inspection.
  if (mode === 'cron') {
    if (!LINVIX_USER || !LINVIX_PASSWORD) {
      return NextResponse.json({
        status: 'error',
        message: 'Credenciais do Linvix não configuradas',
      })
    }

    // Check if already running (quick DB check before responding)
    try {
      const runningSync = await db.linvixSyncLog.findFirst({
        where: { syncType: { startsWith: 'vendas' }, status: 'running' },
        orderBy: { startedAt: 'desc' },
      })

      if (runningSync && (Date.now() - runningSync.startedAt.getTime()) < 300000) {
        return NextResponse.json({
          status: 'already_running',
          message: 'Um sync de vendas já está em andamento',
          startedAt: runningSync.startedAt,
        })
      }

      // Mark stale running syncs as error
      if (runningSync && (Date.now() - runningSync.startedAt.getTime()) >= 300000) {
        try {
          await db.linvixSyncLog.update({
            where: { id: runningSync.id },
            data: { status: 'error', finishedAt: new Date(), errorMessage: 'Sync expirou (stale)', durationMs: Date.now() - runningSync.startedAt.getTime() },
          })
        } catch {}
      }
    } catch (dbErr: any) {
      console.warn('[sync/linvix-vendas] DB check failed (cold start?):', dbErr.message?.substring(0, 80))
    }

    // Create sync log entry
    const syncStartTime = Date.now()
    let syncLogId: string | undefined

    try {
      const syncLog = await db.linvixSyncLog.create({
        data: { syncType: 'vendas', status: 'running', totalClients: 0 },
      })
      syncLogId = syncLog.id
    } catch (dbErr: any) {
      console.warn('[sync/linvix-vendas] DB create failed (cold start?):', dbErr.message?.substring(0, 80))
    }

    // ─── Return 200 IMMEDIATELY, run sync in background via waitUntil() ───
    waitUntil(
      (async () => {
        try {
          const result = await runIncrementalSync()

          if (syncLogId) {
            try {
              await db.linvixSyncLog.update({
                where: { id: syncLogId },
                data: {
                  status: result.errors > 0 ? 'partial' : 'success',
                  finishedAt: new Date(),
                  totalClients: result.totalNfe || 0,
                  createdCount: result.created || 0,
                  updatedCount: result.updated || 0,
                  skippedCount: result.skipped || 0,
                  errorCount: result.errors,
                  errorMessage: result.errorDetails?.join('\n') || '',
                  detailsScraped: result.detailsScraped,
                  durationMs: Date.now() - syncStartTime,
                },
              })
            } catch {}
          }

          console.log(`[sync/linvix-vendas] Cron background sync completed:`, {
            status: result.success ? 'success' : 'partial',
            created: result.created,
            updated: result.updated,
            detailsScraped: result.detailsScraped,
            durationMs: Date.now() - syncStartTime,
          })
        } catch (err: any) {
          console.error('[sync/linvix-vendas] Cron background sync failed:', err.message)

          if (syncLogId) {
            try {
              await db.linvixSyncLog.update({
                where: { id: syncLogId },
                data: {
                  status: 'error',
                  finishedAt: new Date(),
                  errorMessage: err.message?.substring(0, 500) || 'Erro desconhecido',
                  durationMs: Date.now() - syncStartTime,
                },
              })
            } catch {}
          }
        }
      })()
    )

    // Respond immediately — cron-jobs.org gets 200 right away
    return NextResponse.json({
      status: 'triggered',
      message: 'Sync de vendas iniciado em background',
      syncLogId,
      triggeredAt: new Date().toISOString(),
    })
  }

  // ─── Blocking modes (wait for completion) ────────────────
  if (mode === 'auto' || mode === 'incremental' || mode === 'backfill' || mode === 'full') {
    if (!validateSyncSecret(request)) {
      return NextResponse.json({ error: 'Secret inválido' }, { status: 401 })
    }

    if (!LINVIX_USER || !LINVIX_PASSWORD) {
      return NextResponse.json(
        { error: 'Credenciais do Linvix não configuradas' },
        { status: 500 }
      )
    }

    try {
      let result: any
      let syncType = 'vendas'

      if (mode === 'auto' || mode === 'incremental') {
        result = await runIncrementalSync()
        syncType = 'vendas'
      } else if (mode === 'backfill') {
        result = await runBackfillSync()
        syncType = 'vendas-backfill'
      } else {
        result = await runFullSync()
        syncType = 'vendas-full'
      }

      // Log to LinvixSyncLog
      await db.linvixSyncLog.create({
        data: {
          syncType,
          status: result.errors > 0 ? 'partial' : 'success',
          totalClients: result.totalNfe || result.backfilledItems || 0,
          createdCount: result.created || 0,
          updatedCount: result.updated || 0,
          skippedCount: result.skipped || 0,
          errorCount: result.errors,
          errorMessage: result.errorDetails?.join('\n') || '',
          detailsScraped: result.detailsScraped,
          durationMs: result.durationMs,
        },
      })

      return NextResponse.json({
        status: result.success ? 'success' : 'partial',
        mode,
        ...result,
      })
    } catch (err: any) {
      console.error('[sync/linvix-vendas] Sync falhou:', err)
      return NextResponse.json(
        { status: 'error', error: err.message?.substring(0, 200) || 'Erro na sincronização' },
        { status: 500 }
      )
    }
  }

  // Default: return sync status
  const lastVendasSync = await db.linvixSyncLog.findFirst({
    where: { syncType: { startsWith: 'vendas' } },
    orderBy: { startedAt: 'desc' },
  })

  return NextResponse.json({
    message: 'Linvix Vendas Sync API',
    modes: {
      trigger: 'Fire and forget — responds immediately, syncs in background (for cron-job.org)',
      incremental: 'Only new NF-e + backfill missing items (waits for completion)',
      backfill: 'Only fetch details for vendas with 0 items',
      full: 'Fetch ALL NF-e (may timeout)',
      auto: 'Same as incremental',
    },
    lastSync: lastVendasSync ? {
      status: lastVendasSync.status,
      startedAt: lastVendasSync.startedAt,
      finishedAt: lastVendasSync.finishedAt,
      durationMs: lastVendasSync.durationMs,
    } : null,
  })
}
