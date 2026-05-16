import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── Linvix Vendas (NF-e) Sync API ──────────────────
// Syncs NF-e/sales data from Linvix ERP → M-Tech
// Unidirectional: Linvix → M-Tech only

export const maxDuration = 300 // 5 minutes for full NF-e sync
export const dynamic = 'force-dynamic'

const SYNC_SECRET = process.env.SYNC_SECRET || ''
const LINVIX_USER = process.env.LINVIX_USER || ''
const LINVIX_PASSWORD = process.env.LINVIX_PASSWORD || ''

const LINVIX_BASE = 'https://rp.erp.linvix.com'
const LINVIX_LOGIN_URL = `${LINVIX_BASE}/ajax/ajax-login.php`
const LINVIX_NFE_LIST_URL = `${LINVIX_BASE}/nota-fiscal-eletronica/ajax/ajax-notas-datatable-v2.php`
const LINVIX_NFE_DETAIL_URL = `${LINVIX_BASE}/nota-fiscal-eletronica/ajax/ajax-pega-nota.php`
const PAGE_SIZE = 350
const PAGE_DELAY_MS = 2000
const DETAIL_DELAY_MS = 1500

// ─── Auth helpers ──────────────────────────────────────

function validateSyncSecret(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron') === 'true') return true
  if (!SYNC_SECRET) return true
  const secret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret') || ''
  return secret === SYNC_SECRET
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').trim()
}

function parseValorTotal(raw: string): number {
  if (!raw) return 0
  const cleaned = raw.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function parseDateTime(raw: string): Date | null {
  if (!raw) return null
  // Format: "15/05/2026 20:19:45" or "2026-05-15 20:19:45"
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

  const body = new URLSearchParams()
  body.set('login', LINVIX_USER)
  body.set('senha', LINVIX_PASSWORD)
  body.set('redirect_url', '')

  const response = await fetch(LINVIX_LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
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

  const url = `${LINVIX_NFE_LIST_URL}?${params}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Cookie': `PHPSESSID=${phpsessid}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
    },
  })

  if (!response.ok) {
    throw new Error(`Erro ao buscar NF-e lista página ${draw}: HTTP ${response.status}`)
  }

  return await response.json()
}

async function fetchNfeDetail(phpsessid: string, nfeId: number): Promise<any> {
  const url = `${LINVIX_NFE_DETAIL_URL}?id=${nfeId}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Cookie': `PHPSESSID=${phpsessid}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
    },
  })

  if (!response.ok) {
    throw new Error(`Erro ao buscar detalhe NF-e ${nfeId}: HTTP ${response.status}`)
  }

  return await response.json()
}

async function fetchAllNfeFromLinvix(phpsessid: string): Promise<any[]> {
  console.log('[sync/linvix-vendas] Buscando lista de NF-e...')

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
    await sleep(PAGE_DELAY_MS)
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
    operador: '', // filled from list data if available
    naturezaOperacao: nfeDetail.DADOS_NOTA?.NATUREZA_OPERACAO || '',
    emitente: '', // filled from list data
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

  // Check if venda already exists
  const existing = await db.venda.findUnique({ where: { linvixId } })

  if (existing) {
    // Update existing venda (mainly situacao might change)
    await db.venda.update({
      where: { linvixId },
      data: vendaData,
    })

    // Delete old items and re-insert (simpler than diffing)
    await db.vendaItem.deleteMany({ where: { vendaId: existing.id } })

    // Insert new items
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
    // Create new venda with items
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

// ─── Main Sync Function ──────────────────────────────

async function runVendasSync(): Promise<{
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

  // 1. Login
  const phpsessid = await loginToLinvix()

  // 2. Fetch all NF-e list data
  const nfeList = await fetchAllNfeFromLinvix(phpsessid)
  const totalNfe = nfeList.length

  // Build a map of list data for enrichment (operador, emitente, etc.)
  const listMap = new Map<string, any>()
  for (const row of nfeList) {
    const id = row.ID
    if (id) listMap.set(String(id), row)
  }

  // 3. Fetch details and upsert each NF-e
  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0
  let detailsScraped = 0
  const errorDetails: string[] = []
  const affectedClientes = new Set<string>()

  for (let i = 0; i < nfeList.length; i++) {
    const nfeRow = nfeList[i]
    const nfeId = parseInt(nfeRow.ID, 10)

    if (!nfeId) { skipped++; continue }

    try {
      // Fetch detail
      await sleep(DETAIL_DELAY_MS)
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

      if ((i + 1) % 10 === 0) {
        console.log(`[sync/linvix-vendas] Progresso: ${i + 1}/${totalNfe} (criadas=${created}, atualizadas=${updated})`)
      }
    } catch (err: any) {
      errors++
      if (errorDetails.length < 10) errorDetails.push(`NF-e ${nfeId}: ${err.message?.substring(0, 100)}`)
      console.error(`[sync/linvix-vendas] Erro na NF-e ${nfeId}:`, err.message)
    }
  }

  // 4. Update ultimaVenda for affected clients
  console.log(`[sync/linvix-vendas] Atualizando ultimaVenda para ${affectedClientes.size} clientes...`)
  await updateUltimaVendaForClients([...affectedClientes])

  const totalMs = Date.now() - startTime
  console.log(`[sync/linvix-vendas] Sync completo: ${totalMs}ms (criadas=${created}, atualizadas=${updated}, erros=${errors})`)

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

  if (mode === 'auto') {
    if (!validateSyncSecret(request)) {
      return NextResponse.json({ error: 'Secret inválido' }, { status: 401 })
    }

    if (!LINVIX_USER || !LINVIX_PASSWORD) {
      return NextResponse.json(
        { error: 'Credenciais do Linvix não configuradas' },
        { status: 500 }
      )
    }

    const startTime = Date.now()

    try {
      const result = await runVendasSync()

      // Log to LinvixSyncLog (reuse existing model)
      await db.linvixSyncLog.create({
        data: {
          status: result.errors > 0 ? 'partial' : 'success',
          totalClients: result.totalNfe,
          createdCount: result.created,
          updatedCount: result.updated,
          skippedCount: result.skipped,
          errorCount: result.errors,
          errorMessage: result.errorDetails.join('\n'),
          detailsScraped: result.detailsScraped,
          durationMs: result.durationMs,
        },
      })

      return NextResponse.json({
        status: result.success ? 'success' : 'partial',
        total: result.totalNfe,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
        detailsScraped: result.detailsScraped,
        durationMs: result.durationMs,
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
  return NextResponse.json({
    message: 'Linvix Vendas Sync API',
    mode: 'Use ?mode=auto to trigger sync',
  })
}
