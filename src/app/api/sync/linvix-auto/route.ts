import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Carteira } from '@prisma/client'

// ─── Linvix Auto-Sync (HTTP-based) ─────────────────────
// Logs in to Linvix ERP via HTTP, fetches all clients via the
// DataTables AJAX endpoint, and upserts them into M-Tech.
//
// No browser automation needed — works directly on Vercel.
// Triggered by Vercel Cron every 15 minutes, or manually.

export const maxDuration = 60 // 60 seconds (Vercel Pro/Hobby configurable)
export const dynamic = 'force-dynamic'

// ─── Config ────────────────────────────────────────────

const LINVIX_BASE = 'https://rp.erp.linvix.com'
const LINVIX_LOGIN_URL = `${LINVIX_BASE}/ajax/ajax-login.php`
const LINVIX_DATATABLE_URL = `${LINVIX_BASE}/cadastros/clientes/ajax/ajax-clientes-datatable.php`
const PAGE_SIZE = 350 // Max supported by Linvix
const PAGE_DELAY_MS = 2000 // 2s between pages (be gentle)

const LINVIX_USER = process.env.LINVIX_USER || ''
const LINVIX_PASSWORD = process.env.LINVIX_PASSWORD || ''

// Optional: protect the endpoint with a secret (cron auth)
const SYNC_SECRET = process.env.SYNC_SECRET || ''

// ─── Types ─────────────────────────────────────────────

interface LinvixLoginResponse {
  status: string
  mensagem: string
  usuario?: {
    id: number
    nome: string
  }
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

// ─── Helpers ───────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Strip all non-digit characters from CNPJ/CPF */
function normalizeCnpj(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/\D/g, '')
}

/** Strip HTML tags (Linvix returns raw HTML in some fields like CONVENIO_V2) */
function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').trim()
}

/** Clean phone number: keep digits, parens, spaces, hyphens, plus sign */
function cleanPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.trim()
}

/** Clean email: trim whitespace, lowercase */
function cleanEmail(raw: string | null | undefined): string {
  if (!raw) return ''
  // Linvix sometimes returns emails with leading spaces
  return raw.trim().toLowerCase()
}

/** Build DataTables query parameters for a given page */
function buildDataTableParams(draw: number, start: number, length: number): string {
  const params = new URLSearchParams()
  params.set('draw', String(draw))
  params.set('start', String(start))
  params.set('length', String(length))
  params.set('search[value]', '')
  params.set('search[regex]', 'false')

  // Column 0: CODIGO (not searchable)
  params.set('columns[0][data]', 'CODIGO')
  params.set('columns[0][name]', 'CODIGO')
  params.set('columns[0][searchable]', 'false')
  params.set('columns[0][orderable]', 'false')
  params.set('columns[0][search][value]', '')
  params.set('columns[0][search][regex]', 'false')

  // Column 1: CODIGO1 (searchable)
  params.set('columns[1][data]', 'CODIGO')
  params.set('columns[1][name]', 'CODIGO1')
  params.set('columns[1][searchable]', 'true')
  params.set('columns[1][orderable]', 'true')
  params.set('columns[1][search][value]', '')
  params.set('columns[1][search][regex]', 'false')

  // Column 2: NOME (searchable, sortable)
  params.set('columns[2][data]', 'NOME')
  params.set('columns[2][name]', 'NOME')
  params.set('columns[2][searchable]', 'true')
  params.set('columns[2][orderable]', 'true')
  params.set('columns[2][search][value]', '')
  params.set('columns[2][search][regex]', 'false')

  // Sort by NOME ascending
  params.set('order[0][column]', '2')
  params.set('order[0][dir]', 'asc')

  // Filters: show only active clients by default
  params.set('filtros_listagem_situacao_todos', 'false')
  params.set('filtros_listagem_listar_somente_ativos', 'true')
  params.set('filtros_listagem_listar_somente_inativos', 'false')

  return params.toString()
}

/** Map Linvix data row to M-Tech fields */
function mapLinvixToMtech(row: LinvixDataRow): {
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
  bairro: string
  cidade: string
  uf: string
  vendedor: string
  observacoes: string
} {
  // Handle email splitting: Linvix may return comma-separated emails
  const rawEmail = cleanEmail(row.EMAIL)
  const emails = rawEmail ? rawEmail.split(',').map(e => e.trim()).filter(Boolean) : []
  // Linvix sometimes has "email1;email2" format too
  const allEmails = emails.flatMap(e => e.split(';').map(e2 => e2.trim())).filter(Boolean)

  return {
    codigo: row.CODIGO || '',
    razaoSocial: (row.NOME || '').trim(),
    nomeFantasia: (row.FANTASIA || '').trim(),
    cnpj: normalizeCnpj(row.CNPJ_CNPF),
    ieRg: stripHtml(row.IE_RG),
    telefone1: cleanPhone(row.TELEFONE),
    telefone2: cleanPhone(row.CELULAR),
    telefone3: cleanPhone(row.FAX), // Fax/WhatsApp in Linvix
    telefone4: '',
    email1: allEmails[0] || '',
    bairro: (row.BAIRRO || '').trim(),
    cidade: (row.CIDADE || '').trim(),
    uf: (row.UF || '').trim(),
    vendedor: (row.VENDEDOR_NOME || '').trim(),
    observacoes: (row.OBSERVACOES || '').trim(),
  }
}

// ─── Step 1: Login to Linvix ──────────────────────────

async function loginToLinvix(): Promise<string> {
  console.log('[linvix-auto] Fazendo login no Linvix...')

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
    redirect: 'manual', // Don't follow redirects — we want the Set-Cookie header
  })

  // Extract PHPSESSID from Set-Cookie header
  const setCookieHeaders = response.headers.getSetCookie?.() || []
  // Fallback for environments without getSetCookie
  const allCookies: string[] = [...setCookieHeaders]

  // Also try the raw header
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
    // Try reading the response body for error info
    const text = await response.text()
    console.error('[linvix-auto] Login response status:', response.status)
    console.error('[linvix-auto] Login response cookies:', allCookies)
    console.error('[linvix-auto] Login response body (first 500):', text.substring(0, 500))
    throw new Error('Falha ao fazer login no Linvix: PHPSESSID não encontrado')
  }

  // Verify login was successful by checking the response body
  try {
    const loginData: LinvixLoginResponse = await response.json().catch(() => null)
    if (loginData && loginData.status !== 'SUCESSO') {
      throw new Error(`Login falhou: ${loginData.mensagem || 'status=' + loginData.status}`)
    }
    console.log('[linvix-auto] Login bem-sucedido:', loginData?.mensagem || 'OK')
  } catch {
    // If we can't parse JSON but got the PHPSESSID, assume login worked
    // (the redirect response after login might not return JSON)
    console.log('[linvix-auto] PHPSESSID obtido, assumindo login OK')
  }

  return phpsessid
}

// ─── Step 2: Fetch all clients from Linvix ─────────────

async function fetchAllClients(phpsessid: string): Promise<LinvixDataRow[]> {
  console.log('[linvix-auto] Buscando clientes no Linvix...')

  const allClients: LinvixDataRow[] = []
  let draw = 1
  let start = 0
  let totalRecords = 0

  // Fetch first page to know total
  const firstPage = await fetchDataTablePage(phpsessid, draw, start)
  totalRecords = firstPage.recordsTotal
  allClients.push(...firstPage.data)
  console.log(`[linvix-auto] Página 1: ${firstPage.data.length} clientes (total: ${totalRecords})`)

  draw++
  start += PAGE_SIZE

  // Fetch remaining pages
  while (start < totalRecords) {
    await sleep(PAGE_DELAY_MS) // Be gentle with the server

    const page = await fetchDataTablePage(phpsessid, draw, start)
    allClients.push(...page.data)
    console.log(`[linvix-auto] Página ${draw}: ${page.data.length} clientes (acumulado: ${allClients.length}/${totalRecords})`)

    draw++
    start += PAGE_SIZE
  }

  console.log(`[linvix-auto] Total: ${allClients.length} clientes buscados em ${draw - 1} páginas`)
  return allClients
}

async function fetchDataTablePage(
  phpsessid: string,
  draw: number,
  start: number
): Promise<LinvixDataTableResponse> {
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
    console.error(`[linvix-auto] Erro na página ${draw}: HTTP ${response.status}`)
    console.error(`[linvix-auto] Response: ${text.substring(0, 300)}`)
    throw new Error(`Erro ao buscar página ${draw}: HTTP ${response.status}`)
  }

  const data: LinvixDataTableResponse = await response.json()
  return data
}

// ─── Step 3: Upsert clients into M-Tech ────────────────

async function upsertClients(clients: LinvixDataRow[]): Promise<{
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

  const BATCH_SIZE = 50
  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE)

    for (const row of batch) {
      try {
        const mapped = mapLinvixToMtech(row)

        // Skip if no codigo
        if (!mapped.codigo) {
          skipped++
          continue
        }

        // Check if client exists by codigo
        const existing = await db.cliente.findUnique({
          where: { codigo: mapped.codigo },
        })

        if (existing) {
          // Update: only overwrite fields that have new data from Linvix
          const updateData: Record<string, unknown> = { source: 'linvix' }
          let hasChanges = false

          const fieldsToCheck = [
            'razaoSocial', 'nomeFantasia', 'cnpj', 'ieRg',
            'telefone1', 'telefone2', 'telefone3', 'telefone4',
            'email1',
            'bairro', 'cidade', 'uf',
            'vendedor', 'observacoes',
          ] as const

          for (const field of fieldsToCheck) {
            const newValue = mapped[field]
            if (newValue !== '' && newValue !== undefined && newValue !== null) {
              const oldValue = String((existing as any)[field] ?? '')
              if (String(newValue) !== oldValue) {
                updateData[field] = newValue
                hasChanges = true
              }
            }
          }

          if (hasChanges) {
            await db.cliente.update({
              where: { codigo: mapped.codigo },
              data: updateData,
            })
            updated++
          } else {
            skipped++
          }
        } else {
          // Create new client
          await db.cliente.create({
            data: {
              codigo: mapped.codigo,
              razaoSocial: mapped.razaoSocial,
              nomeFantasia: mapped.nomeFantasia,
              cnpj: mapped.cnpj,
              ieRg: mapped.ieRg,
              telefone1: mapped.telefone1,
              telefone2: mapped.telefone2,
              telefone3: mapped.telefone3,
              telefone4: mapped.telefone4,
              email1: mapped.email1,
              email2: '',
              email3: '',
              pessoaContato: '',
              endereco: '',
              numero: '',
              complemento: '',
              bairro: mapped.bairro,
              cidade: mapped.cidade,
              cep: '',
              uf: mapped.uf,
              situacaoCadastral: '',
              dataSituacao: '',
              dataAbertura: '',
              cnaePrincipal: '',
              naturezaJuridica: '',
              porte: '',
              regSimples: '',
              vendedor: mapped.vendedor,
              observacoes: mapped.observacoes,
              source: 'linvix',
              tipo: 'REVENDA',
              carteira: Carteira.SEM_VENDEDOR,
            },
          })
          created++
        }
      } catch (err: any) {
        errors++
        const msg = `Cliente ${row.CODIGO}: ${err.message?.substring(0, 100)}`
        errorDetails.push(msg)
        if (errors <= 5) console.error(`[linvix-auto] ${msg}`)
      }
    }

    // Progress log
    if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= clients.length) {
      console.log(`[linvix-auto] Progresso: ${Math.min(i + BATCH_SIZE, clients.length)}/${clients.length} processados`)
    }
  }

  return { created, updated, skipped, errors, errorDetails }
}

// ─── Main Sync Function ───────────────────────────────

async function runSync(): Promise<{
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

  // Step 1: Login
  const phpsessid = await loginToLinvix()

  // Step 2: Fetch all clients
  const clients = await fetchAllClients(phpsessid)
  const pagesScraped = Math.ceil(clients.length / PAGE_SIZE) || 1

  // Step 3: Upsert into M-Tech
  const result = await upsertClients(clients)

  const durationMs = Date.now() - startTime

  return {
    success: result.errors === 0 || result.created + result.updated > 0,
    totalClients: clients.length,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    errors: result.errors,
    errorDetails: result.errorDetails,
    durationMs,
    pagesScraped,
  }
}

// ─── API Route Handlers ───────────────────────────────

/**
 * GET /api/sync/linvix-auto — Get last sync status
 */
export async function GET(request: NextRequest) {
  // Allow both authenticated users and cron (with secret)
  const syncSecret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret')

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
    console.error('[linvix-auto] Error getting sync status:', error)
    return NextResponse.json({ error: 'Erro ao buscar status de sync' }, { status: 500 })
  }
}

/**
 * POST /api/sync/linvix-auto — Trigger a full sync
 *
 * This endpoint does the entire sync in one request:
 * 1. Login to Linvix via HTTP
 * 2. Fetch all clients via DataTables AJAX
 * 3. Upsert into M-Tech database
 *
 * Can be triggered by:
 * - Vercel Cron (uses x-sync-secret header)
 * - Manual trigger from admin UI (requires auth)
 * - External service (uses x-sync-secret header)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Check authorization: either SYNC_SECRET or NextAuth session
  const syncSecret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret')

  // Vercel Cron jobs send this header automatically — trust it
  if (request.headers.get('x-vercel-cron') === 'true') {
    // Allow Vercel cron through without secret
  } else
  if (SYNC_SECRET && syncSecret !== SYNC_SECRET) {
    // If SYNC_SECRET is configured, validate it
    // (if not configured, allow all — for development)
    return NextResponse.json({ error: 'Secret inválido' }, { status: 401 })
  }

  // Check if a sync is already running (prevent concurrent syncs)
  const runningSync = await db.linvixSyncLog.findFirst({
    where: { status: 'running' },
    orderBy: { startedAt: 'desc' },
  })

  if (runningSync && (Date.now() - runningSync.startedAt.getTime()) < 300000) {
    // Another sync is running and it's less than 5 minutes old
    return NextResponse.json({
      status: 'already_running',
      message: 'Uma sincronização já está em andamento',
      runningSyncId: runningSync.id,
      startedAt: runningSync.startedAt,
    }, { status: 409 })
  } else if (runningSync) {
    // Stale running sync — mark it as error
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

  // Create sync log entry
  const syncLog = await db.linvixSyncLog.create({
    data: {
      status: 'running',
      totalClients: 0,
    },
  })

  console.log(`[linvix-auto] Iniciando sync #${syncLog.id}`)

  try {
    // Validate credentials
    if (!LINVIX_USER || !LINVIX_PASSWORD) {
      throw new Error('Credenciais do Linvix não configuradas (LINVIX_USER / LINVIX_PASSWORD)')
    }

    // Run the sync
    const result = await runSync()

    // Update sync log
    await db.linvixSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: result.errors > 0
          ? (result.created + result.updated > 0 ? 'partial' : 'error')
          : 'success',
        finishedAt: new Date(),
        totalClients: result.totalClients,
        createdCount: result.created,
        updatedCount: result.updated,
        skippedCount: result.skipped,
        errorCount: result.errors,
        errorMessage: result.errorDetails.slice(0, 10).join('\n'),
        pagesScraped: result.pagesScraped,
        detailsScraped: 0,
        durationMs: result.durationMs,
      },
    })

    console.log(`[linvix-auto] Sync #${syncLog.id} concluído:`, {
      total: result.totalClients,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      durationMs: result.durationMs,
    })

    return NextResponse.json({
      syncLogId: syncLog.id,
      status: result.success ? 'success' : 'partial',
      total: result.totalClients,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      errorDetails: result.errorDetails.slice(0, 20),
      durationMs: result.durationMs,
    })
  } catch (err: any) {
    console.error(`[linvix-auto] Sync #${syncLog.id} falhou:`, err)

    // Update sync log with error
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
      {
        syncLogId: syncLog.id,
        status: 'error',
        error: err.message?.substring(0, 200) || 'Erro na sincronização',
      },
      { status: 500 }
    )
  }
}
