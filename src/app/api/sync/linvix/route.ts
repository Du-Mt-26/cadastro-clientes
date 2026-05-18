import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { mapVendedorToUser } from '@/lib/vendedor-mapping'

// ─── Linvix Sync API Endpoint ───────────────────────
// Daily full sync from Linvix ERP → M-Tech
//
// Authentication:
// - Auto-sync: SYNC_SECRET via header/query OR Vercel Cron (x-vercel-cron)
// - Legacy push: API key via X-Sync-API-Key header
//
// Performance: Uses raw SQL INSERT...ON CONFLICT for batch upserts (~5s for 2K clients)
// Safety: 2-second delay between Linvix page requests to avoid detection

export const maxDuration = 60 // 60 seconds for auto-sync
export const dynamic = 'force-dynamic'

const SYNC_API_KEY = process.env.SYNC_API_KEY || ''
const CRON_SECRET = process.env.CRON_SECRET || process.env.SYNC_SECRET || ''
const LINVIX_USER = process.env.LINVIX_USER || ''
const LINVIX_PASSWORD = process.env.LINVIX_PASSWORD || ''

// ─── Linvix HTTP Config ───────────────────────────────

const LINVIX_BASE = 'https://rp.erp.linvix.com'
const LINVIX_LOGIN_URL = `${LINVIX_BASE}/ajax/ajax-login.php`
const LINVIX_DATATABLE_URL = `${LINVIX_BASE}/cadastros/clientes/ajax/ajax-clientes-datatable.php`
const PAGE_SIZE = 350
const PAGE_DELAY_MS = 2000 // Safe 2s delay between pages to avoid detection

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
  if (!CRON_SECRET) return true
  const secret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret') || request.nextUrl.searchParams.get('cron-secret') || ''
  return secret === CRON_SECRET
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

// ─── Batch Upsert (Raw SQL — optimized for Vercel 60s timeout) ────
// Uses PostgreSQL INSERT...ON CONFLICT DO UPDATE for batch operations.
// ~2,279 clients in ~12 chunks of 200 → completes in ~3-5 seconds
// (vs. ~40s with individual Prisma upsert calls)
//
// Safety: COALESCE(NULLIF(...)) preserves manually-entered M-Tech data
// when Linvix field is empty — same behavior as the previous Prisma upsert.

async function batchUpsertClients(clients: LinvixClientData[]): Promise<{
  created: number
  updated: number
  skipped: number
  errors: number
  errorDetails: string[]
}> {
  const validClients = clients.filter(c => c.codigo)
  const skipped = clients.length - validClients.length

  if (validClients.length === 0) {
    return { created: 0, updated: 0, skipped, errors: 0, errorDetails: [] }
  }

  console.log(`[sync/linvix] Batch upsert: ${validClients.length} clientes válidos`)

  // Check which codigos already exist (to track created vs updated)
  const existing = await db.cliente.findMany({
    where: { codigo: { in: validClients.map(c => c.codigo) } },
    select: { codigo: true },
  })
  const existingSet = new Set(existing.map(c => c.codigo))

  let created = 0
  let updated = 0
  let errors = 0
  const errorDetails: string[] = []

  // Process in chunks of 200 to stay within PostgreSQL parameter limits
  const CHUNK_SIZE = 200

  for (let i = 0; i < validClients.length; i += CHUNK_SIZE) {
    const chunk = validClients.slice(i, i + CHUNK_SIZE)
    try {
      const values: any[] = []
      const rowPlaceholders: string[] = []
      let paramIdx = 1

      for (const client of chunk) {
        const cnpj = (client.cnpj || '').replace(/\D/g, '')

        // Parameters that need to be passed as values
        const params = [
          client.codigo,
          client.razaoSocial || '',
          client.nomeFantasia || '',
          cnpj,
          cnpj.length === 14 ? cnpj.slice(0, 8) : '',   // cnpjBase
          client.ieRg || '',
          client.telefone1 || '',
          client.telefone2 || '',
          client.telefone3 || '',
          client.telefone4 || '',
          (client.email1 || '').toLowerCase().trim(),
          (client.email2 || '').toLowerCase().trim(),
          (client.email3 || '').toLowerCase().trim(),
          client.pessoaContato || '',
          client.endereco || '',
          client.numero || '',
          client.complemento || '',
          client.bairro || '',
          client.cidade || '',
          client.cep || '',
          client.uf || '',
          client.situacaoCadastral || '',
          client.dataSituacao || '',
          client.dataAbertura || '',
          client.cnaePrincipal || '',
          client.naturezaJuridica || '',
          client.porte || '',
          client.regSimples || '',
          client.vendedor || '',
          client.observacoes || '',
          'linvix',         // source
          'REVENDA',         // tipo
          'SEM_VENDEDOR',    // carteira
        ]

        values.push(...params)

        // Build row: gen_random_uuid()::text for id, $N for params, NOW() for timestamps
        const placeholders = [
          'gen_random_uuid()::text',  // id — PostgreSQL 13+ built-in
          ...params.slice(0, -1).map(() => `$${paramIdx++}`),  // All params except carteira
          `$${paramIdx++}::"Carteira"`,  // carteira — cast to enum type
          'NOW()',   // updatedAt
          'NOW()',   // createdAt
        ]

        rowPlaceholders.push(`(${placeholders.join(', ')})`)
      }

      const columns = [
        '"id"', '"codigo"', '"razaoSocial"', '"nomeFantasia"', '"cnpj"', '"cnpjBase"', '"ieRg"',
        '"telefone1"', '"telefone2"', '"telefone3"', '"telefone4"',
        '"email1"', '"email2"', '"email3"', '"pessoaContato"',
        '"endereco"', '"numero"', '"complemento"', '"bairro"', '"cidade"', '"cep"', '"uf"',
        '"situacaoCadastral"', '"dataSituacao"', '"dataAbertura"',
        '"cnaePrincipal"', '"naturezaJuridica"', '"porte"', '"regSimples"',
        '"vendedor"', '"observacoes"', '"source"', '"tipo"', '"carteira"', '"updatedAt"', '"createdAt"'
      ]

      // ON CONFLICT DO UPDATE SET:
      // - Data fields use COALESCE(NULLIF(...)) to only overwrite if new value is non-empty
      //   (preserves manually-entered M-Tech data when Linvix field is empty)
      // - System fields (source, tipo, carteira) always overwrite
      // - updatedAt always updates to NOW()
      // - id and createdAt are never changed on conflict
      const updateSet = [
        '"razaoSocial" = COALESCE(NULLIF(EXCLUDED."razaoSocial", \'\'), "Cliente"."razaoSocial")',
        '"nomeFantasia" = COALESCE(NULLIF(EXCLUDED."nomeFantasia", \'\'), "Cliente"."nomeFantasia")',
        '"cnpj" = COALESCE(NULLIF(EXCLUDED."cnpj", \'\'), "Cliente"."cnpj")',
        '"cnpjBase" = COALESCE(NULLIF(EXCLUDED."cnpjBase", \'\'), "Cliente"."cnpjBase")',
        '"ieRg" = COALESCE(NULLIF(EXCLUDED."ieRg", \'\'), "Cliente"."ieRg")',
        '"telefone1" = COALESCE(NULLIF(EXCLUDED."telefone1", \'\'), "Cliente"."telefone1")',
        '"telefone2" = COALESCE(NULLIF(EXCLUDED."telefone2", \'\'), "Cliente"."telefone2")',
        '"telefone3" = COALESCE(NULLIF(EXCLUDED."telefone3", \'\'), "Cliente"."telefone3")',
        '"telefone4" = COALESCE(NULLIF(EXCLUDED."telefone4", \'\'), "Cliente"."telefone4")',
        '"email1" = COALESCE(NULLIF(EXCLUDED."email1", \'\'), "Cliente"."email1")',
        '"email2" = COALESCE(NULLIF(EXCLUDED."email2", \'\'), "Cliente"."email2")',
        '"email3" = COALESCE(NULLIF(EXCLUDED."email3", \'\'), "Cliente"."email3")',
        '"pessoaContato" = COALESCE(NULLIF(EXCLUDED."pessoaContato", \'\'), "Cliente"."pessoaContato")',
        '"endereco" = COALESCE(NULLIF(EXCLUDED."endereco", \'\'), "Cliente"."endereco")',
        '"numero" = COALESCE(NULLIF(EXCLUDED."numero", \'\'), "Cliente"."numero")',
        '"complemento" = COALESCE(NULLIF(EXCLUDED."complemento", \'\'), "Cliente"."complemento")',
        '"bairro" = COALESCE(NULLIF(EXCLUDED."bairro", \'\'), "Cliente"."bairro")',
        '"cidade" = COALESCE(NULLIF(EXCLUDED."cidade", \'\'), "Cliente"."cidade")',
        '"cep" = COALESCE(NULLIF(EXCLUDED."cep", \'\'), "Cliente"."cep")',
        '"uf" = COALESCE(NULLIF(EXCLUDED."uf", \'\'), "Cliente"."uf")',
        '"situacaoCadastral" = COALESCE(NULLIF(EXCLUDED."situacaoCadastral", \'\'), "Cliente"."situacaoCadastral")',
        '"dataSituacao" = COALESCE(NULLIF(EXCLUDED."dataSituacao", \'\'), "Cliente"."dataSituacao")',
        '"dataAbertura" = COALESCE(NULLIF(EXCLUDED."dataAbertura", \'\'), "Cliente"."dataAbertura")',
        '"cnaePrincipal" = COALESCE(NULLIF(EXCLUDED."cnaePrincipal", \'\'), "Cliente"."cnaePrincipal")',
        '"naturezaJuridica" = COALESCE(NULLIF(EXCLUDED."naturezaJuridica", \'\'), "Cliente"."naturezaJuridica")',
        '"porte" = COALESCE(NULLIF(EXCLUDED."porte", \'\'), "Cliente"."porte")',
        '"regSimples" = COALESCE(NULLIF(EXCLUDED."regSimples", \'\'), "Cliente"."regSimples")',
        '"vendedor" = COALESCE(NULLIF(EXCLUDED."vendedor", \'\'), "Cliente"."vendedor")',
        '"observacoes" = COALESCE(NULLIF(EXCLUDED."observacoes", \'\'), "Cliente"."observacoes")',
        '"source" = EXCLUDED."source"',
        '"tipo" = EXCLUDED."tipo"',
        '"carteira" = CASE WHEN "Cliente"."carteira" = \'SEM_VENDEDOR\'::"Carteira" THEN EXCLUDED."carteira" ELSE "Cliente"."carteira" END',
        '"updatedAt" = NOW()',
      ].join(',\n          ')

      const sql = `
        INSERT INTO "Cliente" (${columns.join(', ')})
        VALUES
          ${rowPlaceholders.join(',\n          ')}
        ON CONFLICT ("codigo") DO UPDATE SET
          ${updateSet}
      `

      await db.$executeRawUnsafe(sql, ...values)

      // Count creates vs updates for this chunk
      for (const client of chunk) {
        if (existingSet.has(client.codigo)) {
          updated++
        } else {
          created++
          existingSet.add(client.codigo) // Track newly created for subsequent chunks
        }
      }

      console.log(`[sync/linvix] Chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${chunk.length} clientes processados (criados=${created}, atualizados=${updated})`)
    } catch (err: any) {
      errors += chunk.length
      if (errorDetails.length < 10) {
        errorDetails.push(err.message?.substring(0, 200) || 'Unknown error')
      }
      console.error('[sync/linvix] Batch upsert error:', err.message)
    }
  }

  console.log(`[sync/linvix] Batch upsert completo: criados=${created}, atualizados=${updated}, erros=${errors}`)
  return { created, updated, skipped, errors, errorDetails }
}

// ─── Auto-assign vendedor ──────────────────────────────
// After upserting clients from Linvix, this function maps the
// Linvix vendedor name (text field) to the corresponding system User
// and sets carteira + vendedorId accordingly using the centralized
// mapVendedorToUser() function from vendedor-mapping.ts.
//
// Regras (definidas em vendedor-mapping.ts):
// - Vendedor vazio → Débora
// - Vendedor não mapeado → Débora (fallback)
// - M-TECH DISTRIBUIDORA → Débora
// - RAFAEL/WILLIAN → Débora
// - Vendedores conhecidos → seu respectivo usuário

async function autoAssignVendedores(): Promise<{ assigned: number; unchanged: number }> {
  console.log('[sync/linvix] Auto-assign vendedores...')

  // Get all system users for dynamic matching
  const users = await db.user.findMany({
    select: { id: true, name: true, role: true },
  })

  // Find ALL clients with SEM_VENDEDOR (including those with empty vendedor)
  const clientsNeedingAssignment = await db.cliente.findMany({
    where: {
      carteira: 'SEM_VENDEDOR',
    },
    select: { id: true, codigo: true, vendedor: true },
  })

  console.log(`[sync/linvix] ${clientsNeedingAssignment.length} clientes com SEM_VENDEDOR para atribuir`)

  let assigned = 0
  let unchanged = 0

  for (const client of clientsNeedingAssignment) {
    const { userId, carteira } = mapVendedorToUser(client.vendedor, users)

    if (userId) {
      await db.cliente.update({
        where: { id: client.id },
        data: {
          carteira: carteira as any,
          vendedorId: userId,
          dataAtribuicaoVendedor: new Date(),
        },
      })
      assigned++
    } else {
      unchanged++
    }
  }

  console.log(`[sync/linvix] Auto-assign: ${assigned} atribuídos, ${unchanged} sem alteração`)
  return { assigned, unchanged }
}

// ─── Auto-Sync (Full Daily Sync) ───────────────────────
// Fetches ALL clients from Linvix and upserts them in one run.
// With batch SQL operations, this completes in ~30-40s for ~2,279 clients.
//
// Flow: Login → Fetch all pages (2s delay between pages) → Batch upsert

async function runAutoSync(): Promise<{
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

  // 1. Login to Linvix
  const phpsessid = await loginToLinvix()
  const loginMs = Date.now() - startTime
  console.log(`[sync/linvix] Login: ${loginMs}ms`)

  // 2. Fetch all pages with safe delays between them
  const fetchStart = Date.now()
  const rawClients = await fetchAllClientsFromLinvix(phpsessid)
  const fetchMs = Date.now() - fetchStart
  const pagesScraped = Math.ceil(rawClients.length / PAGE_SIZE) || 1
  console.log(`[sync/linvix] Fetch: ${fetchMs}ms (${pagesScraped} páginas)`)

  // 3. Map Linvix data to M-Tech format
  const clients = rawClients.map(mapLinvixRowToMtech)

  // 4. Batch upsert all clients using raw SQL
  const upsertStart = Date.now()
  const result = await batchUpsertClients(clients)
  const upsertMs = Date.now() - upsertStart
  console.log(`[sync/linvix] Upsert: ${upsertMs}ms`)

  // 5. Auto-assign vendedores (map Linvix vendedor name → system User)
  const assignStart = Date.now()
  const assignResult = await autoAssignVendedores()
  const assignMs = Date.now() - assignStart
  console.log(`[sync/linvix] Auto-assign: ${assignMs}ms`)

  const totalMs = Date.now() - startTime
  console.log(`[sync/linvix] Sync completo: ${totalMs}ms (login=${loginMs}, fetch=${fetchMs}, upsert=${upsertMs})`)

  return {
    success: result.errors === 0,
    totalClients: rawClients.length,
    ...result,
    durationMs: totalMs,
    pagesScraped,
  }
}

// ─── API Route Handlers ───────────────────────────────

/**
 * GET /api/sync/linvix — Get sync status OR trigger auto-sync
 *
 * Query params:
 *   mode=auto   → Trigger full daily sync (login to Linvix, fetch all clients, batch upsert)
 *   secret=xxx  → SYNC_SECRET for auto-sync auth
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode')

  // ─── Trigger mode: run sync inline, no auth required ────
  if (mode === 'trigger') {
    if (!LINVIX_USER || !LINVIX_PASSWORD) {
      return NextResponse.json(
        { error: 'Credenciais do Linvix não configuradas' },
        { status: 500 }
      )
    }

    // Check if a clientes sync is already running
    const runningSync = await db.linvixSyncLog.findFirst({
      where: { syncType: 'clientes', status: 'running' },
      orderBy: { startedAt: 'desc' },
    })

    if (runningSync && (Date.now() - runningSync.startedAt.getTime()) < 300000) {
      return NextResponse.json({
        status: 'already_running',
        message: 'Um sync de clientes já está em andamento',
      })
    }

    // Run sync inline (Vercel keeps function alive until response is sent)
    const syncLog = await db.linvixSyncLog.create({
      data: { syncType: 'clientes', status: 'running', totalClients: 0 },
    })

    try {
      const result = await runAutoSync()

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

      return NextResponse.json({
        status: result.errors > 0 ? 'partial' : 'success',
        total: result.totalClients,
        created: result.created,
        updated: result.updated,
        durationMs: result.durationMs,
      })
    } catch (err: any) {
      await db.linvixSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'error',
          finishedAt: new Date(),
          errorMessage: err.message?.substring(0, 500) || 'Erro desconhecido',
        },
      })

      return NextResponse.json(
        { status: 'error', error: err.message?.substring(0, 200) },
        { status: 500 }
      )
    }
  }

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
      data: { syncType: 'clientes', status: 'running', totalClients: 0 },
    })

    console.log(`[sync/linvix] Iniciando auto-sync #${syncLog.id}`)

    try {
      if (!LINVIX_USER || !LINVIX_PASSWORD) {
        throw new Error('Credenciais do Linvix não configuradas (LINVIX_USER / LINVIX_PASSWORD)')
      }

      const result = await runAutoSync()

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
        pagesScraped: result.pagesScraped,
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
      data: { syncType: 'clientes', status: 'running', totalClients: clients.length },
    })

    const result = await batchUpsertClients(clients)

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
