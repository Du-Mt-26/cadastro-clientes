import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Carteira } from '@prisma/client'

// ─── Linvix Sync API Endpoint ───────────────────────
// Two modes:
// 1. External push: POST with clients array + API key (legacy)
// 2. Auto-sync: GET with ?mode=auto (self-contained HTTP sync, triggered by Vercel Cron)
//
// Authentication:
// - External push: API key via X-Sync-API-Key header
// - Auto-sync: SYNC_SECRET via X-Sync-Secret header or ?secret= query param

export const maxDuration = 60 // 60 seconds for auto-sync
export const dynamic = 'force-dynamic'

const SYNC_API_KEY = process.env.SYNC_API_KEY || ''
const SYNC_SECRET = process.env.SYNC_SECRET || ''
const LINVIX_USER = process.env.LINVIX_USER || ''
const LINVIX_PASSWORD = process.env.LINVIX_PASSWORD || ''

// ─── Linvix HTTP Config ───────────────────────────────

const LINVIX_BASE = 'https://rp.erp.linvix.com'
const LINVIX_LOGIN_URL = `${LINVIX_BASE}/ajax/ajax-login.php`
const LINVIX_DATATABLE_URL = `${LINVIX_BASE}/cadastros/clientes/ajax/ajax-clientes-datatable.php`
const PAGE_SIZE = 350
const PAGE_DELAY_MS = 1000

// ─── Auth helpers ──────────────────────────────────────

function validateApiKey(request: NextRequest): boolean {
  if (!SYNC_API_KEY) {
    console.warn('[sync/linvix] SYNC_API_KEY not configured — rejecting all requests')
    return false
  }
  const key = request.headers.get('x-sync-api-key') || ''
  return key === SYNC_API_KEY
}

function validateSyncSecret(request: NextRequest): boolean {
  // Vercel Cron jobs send this header automatically
  if (request.headers.get('x-vercel-cron') === 'true') return true

  // If SYNC_SECRET is not configured, allow all (for development)
  if (!SYNC_SECRET) return true
  const secret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret') || ''
  return secret === SYNC_SECRET
}

// ─── Types ─────────────────────────────────────────────

interface LinvixClientData {
  codigo: string
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
  ieRg: string
  telefone1: string
  telefone2: string
  telefone3: string
  telefone4: string
  email1: string
  email2: string
  email3: string
  pessoaContato: string
  endereco: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  cep: string
  uf: string
  situacaoCadastral: string
  dataSituacao: string
  dataAbertura: string
  cnaePrincipal: string
  naturezaJuridica: string
  porte: string
  regSimples: string
  vendedor: string
  observacoes: string
}

interface LinvixDataRow {
  UUID: string
  CODIGO: string
  CODIGO1: string
  NOME: string
  FANTASIA: string | null
  TELEFONE: string | null
  CELULAR: string | null
  FAX: string | null
  EMAIL: string | null
  CNPJ_CNPF: string | null
  IE_RG: string | null
  VALOR_EM_ATRASO: number
  SITUACAO: string
  CIDADE: string | null
  BAIRRO: string | null
  UF: string | null
  CATEGORIA: string
  VENDEDOR: string
  VENDEDOR_NOME: string
  OBSERVACOES: string | null
}

interface LinvixDataTableResponse {
  draw: number
  recordsTotal: number
  recordsFiltered: number
  data: LinvixDataRow[]
}

// ─── Linvix HTTP Helpers ───────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeCnpj(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/\D/g, '')
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').trim()
}

function cleanPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.trim()
}

function cleanEmail(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.trim().toLowerCase()
}

function buildDataTableParams(draw: number, start: number, length: number): string {
  const params = new URLSearchParams()
  params.set('draw', String(draw))
  params.set('start', String(start))
  params.set('length', String(length))
  params.set('search[value]', '')
  params.set('search[regex]', 'false')

  params.set('columns[0][data]', 'CODIGO')
  params.set('columns[0][name]', 'CODIGO')
  params.set('columns[0][searchable]', 'false')
  params.set('columns[0][orderable]', 'false')
  params.set('columns[0][search][value]', '')
  params.set('columns[0][search][regex]', 'false')

  params.set('columns[1][data]', 'CODIGO')
  params.set('columns[1][name]', 'CODIGO1')
  params.set('columns[1][searchable]', 'true')
  params.set('columns[1][orderable]', 'true')
  params.set('columns[1][search][value]', '')
  params.set('columns[1][search][regex]', 'false')

  params.set('columns[2][data]', 'NOME')
  params.set('columns[2][name]', 'NOME')
  params.set('columns[2][searchable]', 'true')
  params.set('columns[2][orderable]', 'true')
  params.set('columns[2][search][value]', '')
  params.set('columns[2][search][regex]', 'false')

  params.set('order[0][column]', '2')
  params.set('order[0][dir]', 'asc')

  params.set('filtros_listagem_situacao_todos', 'false')
  params.set('filtros_listagem_listar_somente_ativos', 'true')
  params.set('filtros_listagem_listar_somente_inativos', 'false')

  return params.toString()
}

function mapLinvixRowToMtech(row: LinvixDataRow): LinvixClientData {
  const rawEmail = cleanEmail(row.EMAIL)
  const emails = rawEmail ? rawEmail.split(',').flatMap(e => e.split(';').map(e2 => e2.trim())).filter(Boolean) : []

  return {
    codigo: row.CODIGO || '',
    razaoSocial: (row.NOME || '').trim(),
    nomeFantasia: (row.FANTASIA || '').trim(),
    cnpj: normalizeCnpj(row.CNPJ_CNPF),
    ieRg: stripHtml(row.IE_RG),
    telefone1: cleanPhone(row.TELEFONE),
    telefone2: cleanPhone(row.CELULAR),
    telefone3: cleanPhone(row.FAX),
    telefone4: '',
    email1: emails[0] || '',
    email2: emails[1] || '',
    email3: emails[2] || '',
    pessoaContato: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: (row.BAIRRO || '').trim(),
    cidade: (row.CIDADE || '').trim(),
    cep: '',
    uf: (row.UF || '').trim(),
    situacaoCadastral: '',
    dataSituacao: '',
    dataAbertura: '',
    cnaePrincipal: '',
    naturezaJuridica: '',
    porte: '',
    regSimples: '',
    vendedor: (row.VENDEDOR_NOME || '').trim(),
    observacoes: (row.OBSERVACOES || '').trim(),
  }
}

// ─── Linvix HTTP Operations ────────────────────────────

async function loginToLinvix(): Promise<string> {
  console.log('[sync/linvix] Fazendo login no Linvix...')

  const body = new URLSearchParams()
  body.set('login', LINVIX_USER)
  body.set('senha', LINVIX_PASSWORD)
  body.set('redirect_url', '')

  const response = await fetch(LINVIX_LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
    if (match) {
      phpsessid = match[1]
      break
    }
  }

  if (!phpsessid) {
    const text = await response.text()
    console.error('[sync/linvix] Login response status:', response.status)
    console.error('[sync/linvix] Login response body (first 500):', text.substring(0, 500))
    throw new Error('Falha ao fazer login no Linvix: PHPSESSID não encontrado')
  }

  try {
    const loginData = await response.json().catch(() => null)
    if (loginData && loginData.status !== 'SUCESSO') {
      throw new Error(`Login falhou: ${loginData.mensagem || 'status=' + loginData.status}`)
    }
    console.log('[sync/linvix] Login bem-sucedido:', loginData?.mensagem || 'OK')
  } catch (e: any) {
    if (e.message?.includes('Login falhou')) throw e
    console.log('[sync/linvix] PHPSESSID obtido, assumindo login OK')
  }

  return phpsessid
}

async function fetchDataTablePage(phpsessid: string, draw: number, start: number): Promise<LinvixDataTableResponse> {
  const params = buildDataTableParams(draw, start, PAGE_SIZE)
  const url = `${LINVIX_DATATABLE_URL}?${params}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Cookie': `PHPSESSID=${phpsessid}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
    },
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(`[sync/linvix] Erro na página ${draw}: HTTP ${response.status}`)
    console.error(`[sync/linvix] Response: ${text.substring(0, 300)}`)
    throw new Error(`Erro ao buscar página ${draw}: HTTP ${response.status}`)
  }

  return await response.json()
}

async function fetchAllClientsFromLinvix(phpsessid: string): Promise<LinvixDataRow[]> {
  console.log('[sync/linvix] Buscando clientes no Linvix...')

  const allClients: LinvixDataRow[] = []
  let draw = 1
  let start = 0

  const firstPage = await fetchDataTablePage(phpsessid, draw, start)
  const totalRecords = firstPage.recordsTotal
  allClients.push(...firstPage.data)
  console.log(`[sync/linvix] Página 1: ${firstPage.data.length} clientes (total: ${totalRecords})`)

  draw++
  start += PAGE_SIZE

  while (start < totalRecords) {
    await sleep(PAGE_DELAY_MS)
    const page = await fetchDataTablePage(phpsessid, draw, start)
    allClients.push(...page.data)
    console.log(`[sync/linvix] Página ${draw}: ${page.data.length} clientes (acumulado: ${allClients.length}/${totalRecords})`)
    draw++
    start += PAGE_SIZE
  }

  console.log(`[sync/linvix] Total: ${allClients.length} clientes buscados em ${draw - 1} páginas`)
  return allClients
}

// ─── Upsert Logic (Page-by-page for Vercel 60s timeout) ────────

async function upsertClients(clients: LinvixClientData[]): Promise<{
  created: number
  updated: number
  skipped: number
  errors: number
  errorDetails: string[]
}> {
  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0
  const errorDetails: string[] = []

  const validClients = clients.filter(c => c.codigo)
  skipped += clients.length - validClients.length

  // Process in batches of 50 parallel upserts
  const BATCH_SIZE = 50
  for (let i = 0; i < validClients.length; i += BATCH_SIZE) {
    const batch = validClients.slice(i, i + BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (clientData) => {
        const cnpjNormalized = (clientData.cnpj || '').replace(/\D/g, '')

        const data: Record<string, unknown> = {}
        const fieldsToMap: Array<{ linvix: keyof LinvixClientData; mtech: string }> = [
          { linvix: 'razaoSocial', mtech: 'razaoSocial' },
          { linvix: 'nomeFantasia', mtech: 'nomeFantasia' },
          { linvix: 'cnpj', mtech: 'cnpj' },
          { linvix: 'ieRg', mtech: 'ieRg' },
          { linvix: 'telefone1', mtech: 'telefone1' },
          { linvix: 'telefone2', mtech: 'telefone2' },
          { linvix: 'telefone3', mtech: 'telefone3' },
          { linvix: 'telefone4', mtech: 'telefone4' },
          { linvix: 'email1', mtech: 'email1' },
          { linvix: 'email2', mtech: 'email2' },
          { linvix: 'email3', mtech: 'email3' },
          { linvix: 'pessoaContato', mtech: 'pessoaContato' },
          { linvix: 'endereco', mtech: 'endereco' },
          { linvix: 'numero', mtech: 'numero' },
          { linvix: 'complemento', mtech: 'complemento' },
          { linvix: 'bairro', mtech: 'bairro' },
          { linvix: 'cidade', mtech: 'cidade' },
          { linvix: 'cep', mtech: 'cep' },
          { linvix: 'uf', mtech: 'uf' },
          { linvix: 'situacaoCadastral', mtech: 'situacaoCadastral' },
          { linvix: 'dataSituacao', mtech: 'dataSituacao' },
          { linvix: 'dataAbertura', mtech: 'dataAbertura' },
          { linvix: 'cnaePrincipal', mtech: 'cnaePrincipal' },
          { linvix: 'naturezaJuridica', mtech: 'naturezaJuridica' },
          { linvix: 'porte', mtech: 'porte' },
          { linvix: 'regSimples', mtech: 'regSimples' },
          { linvix: 'vendedor', mtech: 'vendedor' },
          { linvix: 'observacoes', mtech: 'observacoes' },
        ]

        for (const { linvix, mtech } of fieldsToMap) {
          const value = clientData[linvix]
          if (value !== undefined && value !== null && value !== '') {
            if (mtech.startsWith('email')) {
              data[mtech] = String(value).toLowerCase().trim()
            } else if (mtech === 'cnpj') {
              data[mtech] = cnpjNormalized
            } else {
              data[mtech] = String(value)
            }
          }
        }

        data.source = 'linvix'

        return db.cliente.upsert({
          where: { codigo: String(clientData.codigo) },
          create: {
            codigo: String(clientData.codigo),
            razaoSocial: String(data.razaoSocial || ''),
            nomeFantasia: String(data.nomeFantasia || ''),
            cnpj: cnpjNormalized,
            ieRg: String(data.ieRg || ''),
            telefone1: String(data.telefone1 || ''),
            telefone2: String(data.telefone2 || ''),
            telefone3: String(data.telefone3 || ''),
            telefone4: String(data.telefone4 || ''),
            email1: String(data.email1 || '').toLowerCase().trim(),
            email2: String(data.email2 || '').toLowerCase().trim(),
            email3: String(data.email3 || '').toLowerCase().trim(),
            pessoaContato: String(data.pessoaContato || ''),
            endereco: String(data.endereco || ''),
            numero: String(data.numero || ''),
            complemento: String(data.complemento || ''),
            bairro: String(data.bairro || ''),
            cidade: String(data.cidade || ''),
            cep: String(data.cep || ''),
            uf: String(data.uf || ''),
            situacaoCadastral: String(data.situacaoCadastral || ''),
            dataSituacao: String(data.dataSituacao || ''),
            dataAbertura: String(data.dataAbertura || ''),
            cnaePrincipal: String(data.cnaePrincipal || ''),
            naturezaJuridica: String(data.naturezaJuridica || ''),
            porte: String(data.porte || ''),
            regSimples: String(data.regSimples || ''),
            vendedor: String(data.vendedor || ''),
            observacoes: String(data.observacoes || ''),
            source: 'linvix',
            tipo: 'REVENDA',
            carteira: Carteira.SEM_VENDEDOR,
          },
          update: {
            ...(data.razaoSocial ? { razaoSocial: String(data.razaoSocial) } : {}),
            ...(data.nomeFantasia ? { nomeFantasia: String(data.nomeFantasia) } : {}),
            ...(data.cnpj ? { cnpj: cnpjNormalized } : {}),
            ...(data.ieRg ? { ieRg: String(data.ieRg) } : {}),
            ...(data.telefone1 ? { telefone1: String(data.telefone1) } : {}),
            ...(data.telefone2 ? { telefone2: String(data.telefone2) } : {}),
            ...(data.telefone3 ? { telefone3: String(data.telefone3) } : {}),
            ...(data.telefone4 ? { telefone4: String(data.telefone4) } : {}),
            ...(data.email1 ? { email1: String(data.email1).toLowerCase().trim() } : {}),
            ...(data.email2 ? { email2: String(data.email2).toLowerCase().trim() } : {}),
            ...(data.email3 ? { email3: String(data.email3).toLowerCase().trim() } : {}),
            ...(data.pessoaContato ? { pessoaContato: String(data.pessoaContato) } : {}),
            ...(data.endereco ? { endereco: String(data.endereco) } : {}),
            ...(data.numero ? { numero: String(data.numero) } : {}),
            ...(data.complemento ? { complemento: String(data.complemento) } : {}),
            ...(data.bairro ? { bairro: String(data.bairro) } : {}),
            ...(data.cidade ? { cidade: String(data.cidade) } : {}),
            ...(data.cep ? { cep: String(data.cep) } : {}),
            ...(data.uf ? { uf: String(data.uf) } : {}),
            ...(data.situacaoCadastral ? { situacaoCadastral: String(data.situacaoCadastral) } : {}),
            ...(data.dataSituacao ? { dataSituacao: String(data.dataSituacao) } : {}),
            ...(data.dataAbertura ? { dataAbertura: String(data.dataAbertura) } : {}),
            ...(data.cnaePrincipal ? { cnaePrincipal: String(data.cnaePrincipal) } : {}),
            ...(data.naturezaJuridica ? { naturezaJuridica: String(data.naturezaJuridica) } : {}),
            ...(data.porte ? { porte: String(data.porte) } : {}),
            ...(data.regSimples ? { regSimples: String(data.regSimples) } : {}),
            ...(data.vendedor ? { vendedor: String(data.vendedor) } : {}),
            ...(data.observacoes ? { observacoes: String(data.observacoes) } : {}),
            source: 'linvix',
          },
        })
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const record = result.value as any
        if (record.createdAt && record.updatedAt &&
            Math.abs(record.createdAt.getTime() - record.updatedAt.getTime()) < 2000) {
          created++
        } else {
          updated++
        }
      } else {
        errors++
        if (errorDetails.length < 10) {
          errorDetails.push(result.reason?.message?.substring(0, 150) || 'Unknown error')
        }
      }
    }
  }

  return { created, updated, skipped, errors, errorDetails }
}

// ─── Auto-Sync (Page-by-page for Vercel 60s timeout) ───────────
// Each run processes ONE page of clients from Linvix (~350 clients).
// The cron runs daily, so a full sync completes every 7 days.
// Manual trigger with ?mode=auto&full=true does all pages at once (may timeout).

async function runAutoSync(request: NextRequest): Promise<{
  success: boolean
  totalClients: number
  created: number
  updated: number
  skipped: number
  errors: number
  errorDetails: string[]
  durationMs: number
  pagesScraped: number
}> {
  const startTime = Date.now()
  const isFullSync = request.nextUrl.searchParams.get('full') === 'true'

  const phpsessid = await loginToLinvix()

  if (isFullSync) {
    // Full sync: fetch ALL pages (may timeout on Vercel Hobby)
    const rawClients = await fetchAllClientsFromLinvix(phpsessid)
    const clients = rawClients.map(mapLinvixRowToMtech)
    const pagesScraped = Math.ceil(rawClients.length / PAGE_SIZE) || 1
    const result = await upsertClients(clients)
    return { success: true, totalClients: rawClients.length, ...result, durationMs: Date.now() - startTime, pagesScraped }
  }

  // Page-by-page sync: fetch only ONE page per cron run
  // Determine which page to process next
  const lastSync = await db.linvixSyncLog.findFirst({
    where: { status: { in: ['success', 'partial'] } },
    orderBy: { startedAt: 'desc' },
  })

  let nextPage = 1
  if (lastSync) {
    const lastPage = lastSync.pagesScraped || 0
    // Calculate total pages from last sync
    const totalPages = Math.ceil((lastSync.totalClients || 2279) / PAGE_SIZE) || 7
    nextPage = (lastPage % totalPages) + 1
  }

  const start = (nextPage - 1) * PAGE_SIZE
  console.log(`[sync/linvix] Page-by-page sync: fetching page ${nextPage} (start=${start})`)

  const pageData = await fetchDataTablePage(phpsessid, nextPage, start)
  const clients = pageData.data.map(mapLinvixRowToMtech)
  const result = await upsertClients(clients)

  return {
    success: true,
    totalClients: pageData.recordsTotal,
    ...result,
    durationMs: Date.now() - startTime,
    pagesScraped: nextPage,
  }
}

// ─── API Route Handlers ───────────────────────────────

/**
 * GET /api/sync/linvix — Get sync status OR trigger auto-sync
 *
 * Query params:
 *   mode=auto   → Trigger auto-sync (login to Linvix, fetch clients, upsert)
 *   secret=xxx  → SYNC_SECRET for auto-sync auth
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode')

  // ─── Auto-sync mode ───────────────────────────────
  if (mode === 'auto') {
    if (!validateSyncSecret(request)) {
      return NextResponse.json({ error: 'Secret inválido' }, { status: 401 })
    }

    const startTime = Date.now()

    // Check if a sync is already running
    const runningSync = await db.linvixSyncLog.findFirst({
      where: { status: 'running' },
      orderBy: { startedAt: 'desc' },
    })

    if (runningSync && (Date.now() - runningSync.startedAt.getTime()) < 300000) {
      return NextResponse.json({
        status: 'already_running',
        message: 'Uma sincronização já está em andamento',
        runningSyncId: runningSync.id,
        startedAt: runningSync.startedAt,
      }, { status: 409 })
    } else if (runningSync) {
      await db.linvixSyncLog.update({
        where: { id: runningSync.id },
        data: {
          status: 'error',
          finishedAt: new Date(),
          errorMessage: 'Sync expirou (timeout)',
          durationMs: Date.now() - runningSync.startedAt.getTime(),
        },
      })
    }

    const syncLog = await db.linvixSyncLog.create({
      data: { status: 'running', totalClients: 0 },
    })

    console.log(`[sync/linvix] Iniciando auto-sync #${syncLog.id}`)

    try {
      if (!LINVIX_USER || !LINVIX_PASSWORD) {
        throw new Error('Credenciais do Linvix não configuradas (LINVIX_USER / LINVIX_PASSWORD)')
      }

      const result = await runAutoSync(request)

      await db.linvixSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: result.errors > 0 ? (result.created + result.updated > 0 ? 'partial' : 'error') : 'success',
          finishedAt: new Date(),
          totalClients: result.totalClients,
          createdCount: result.created,
          updatedCount: result.updated,
          skippedCount: result.skipped,
          errorCount: result.errors,
          errorMessage: result.errorDetails.slice(0, 10).join('\n'),
          pagesScraped: result.pagesScraped,
          durationMs: result.durationMs,
        },
      })

      console.log(`[sync/linvix] Auto-sync #${syncLog.id} concluído:`, result)

      return NextResponse.json({
        syncLogId: syncLog.id,
        status: result.success ? 'success' : 'partial',
        total: result.totalClients,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
        durationMs: result.durationMs,
      })
    } catch (err: any) {
      console.error(`[sync/linvix] Auto-sync #${syncLog.id} falhou:`, err)

      await db.linvixSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'error',
          finishedAt: new Date(),
          errorMessage: err.message?.substring(0, 500) || 'Erro desconhecido',
          durationMs: Date.now() - startTime,
        },
      })

      return NextResponse.json(
        { syncLogId: syncLog.id, status: 'error', error: err.message?.substring(0, 200) || 'Erro na sincronização' },
        { status: 500 }
      )
    }
  }

  // ─── Status mode (default GET) ─────────────────────
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: 'API key inválida' }, { status: 401 })
  }

  try {
    const lastSync = await db.linvixSyncLog.findFirst({
      orderBy: { startedAt: 'desc' },
    })

    const recentSyncs = await db.linvixSyncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
    })

    return NextResponse.json({
      lastSync: lastSync ? {
        id: lastSync.id,
        status: lastSync.status,
        startedAt: lastSync.startedAt,
        finishedAt: lastSync.finishedAt,
        totalClients: lastSync.totalClients,
        createdCount: lastSync.createdCount,
        updatedCount: lastSync.updatedCount,
        skippedCount: lastSync.skippedCount,
        errorCount: lastSync.errorCount,
        errorMessage: lastSync.errorMessage,
        pagesScraped: lastSync.pagesScraped,
        durationMs: lastSync.durationMs,
      } : null,
      recentSyncs: recentSyncs.map(s => ({
        id: s.id,
        status: s.status,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        totalClients: s.totalClients,
        createdCount: s.createdCount,
        updatedCount: s.updatedCount,
        durationMs: s.durationMs,
      })),
    })
  } catch (error) {
    console.error('[sync/linvix] Error getting sync status:', error)
    return NextResponse.json({ error: 'Erro ao buscar status de sync' }, { status: 500 })
  }
}

/**
 * POST /api/sync/linvix — Upsert clients from Linvix (legacy push mode)
 */
export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: 'API key inválida' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { clients, isFullSync = false } = body as {
      clients: LinvixClientData[]
      isFullSync?: boolean
    }

    if (!Array.isArray(clients) || clients.length === 0) {
      return NextResponse.json({ error: 'Array de clientes vazio ou inválido' }, { status: 400 })
    }

    console.log(`[sync/linvix] Recebidos ${clients.length} clientes do Linvix (fullSync=${isFullSync})`)

    const syncLog = await db.linvixSyncLog.create({
      data: { status: 'running', totalClients: clients.length },
    })

    const result = await upsertClients(clients)

    await db.linvixSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: result.errors > 0 ? (result.created + result.updated > 0 ? 'partial' : 'error') : 'success',
        finishedAt: new Date(),
        createdCount: result.created,
        updatedCount: result.updated,
        skippedCount: result.skipped,
        errorCount: result.errors,
        errorMessage: result.errorDetails.slice(0, 10).join('\n'),
        durationMs: Date.now() - syncLog.startedAt.getTime(),
      },
    })

    return NextResponse.json({
      syncLogId: syncLog.id,
      total: clients.length,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
    })
  } catch (err: any) {
    console.error('[sync/linvix] Erro geral:', err)
    return NextResponse.json(
      { error: 'Erro na sincronização', details: err.message?.substring(0, 200) },
      { status: 500 }
    )
  }
}
