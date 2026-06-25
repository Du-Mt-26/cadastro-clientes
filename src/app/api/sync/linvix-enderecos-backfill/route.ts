import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── Linvix Endereços Backfill ────────────────────────
// O DataTable do Linvix só retorna cidade/bairro/uf — não traz
// endereco/numero/complemento/cep. Esses campos ficam vazios no M-Tech.
//
// Este endpoint busca a página editar.php?codigo=XXX para cada cliente,
// faz parse do HTML e extrai os campos de endereço completos.
//
// Como cada chamada demora ~2s e o limite Vercel é 60s, processamos
// em chunks de 25 clientes por run. São necessários ~95 runs para
// completar 2.365 clientes.
//
// Auth: CRON_SECRET / SYNC_SECRET (mesmo modelo dos outros syncs)
// Query params:
//   ?startIdx=N   → Offset no banco (default 0)
//   ?count=N      → Quantos clientes processar (default 25, max 30)
//   ?onlyEmpty=true → Só processar clientes com endereco vazio (default true)

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || process.env.SYNC_SECRET || ''
const LINVIX_USER = process.env.LINVIX_USER || ''
const LINVIX_PASSWORD = process.env.LINVIX_PASSWORD || ''
const LINVIX_BASE = 'https://rp.erp.linvix.com'
const LINVIX_LOGIN_URL = `${LINVIX_BASE}/ajax/ajax-login.php`
const LINVIX_EDIT_URL = `${LINVIX_BASE}/cadastros/clientes/editar.php`

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

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function decodeHtmlEntities(text: string): string {
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

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
]
let sessionUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]

function loginHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': sessionUA,
    'Accept': '*/*',
    'Origin': LINVIX_BASE,
    'Referer': `${LINVIX_BASE}/`,
  }
}

function editHeaders(phpsessid: string): Record<string, string> {
  return {
    'Cookie': `PHPSESSID=${phpsessid}`,
    'User-Agent': sessionUA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': `${LINVIX_BASE}/cadastros/clientes/`,
    'Connection': 'keep-alive',
  }
}

async function loginToLinvix(): Promise<string> {
  sessionUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
  await sleep(300 + Math.random() * 700)

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
  if (!phpsessid) throw new Error('Falha no login Linvix: PHPSESSID não encontrado')
  return phpsessid
}

// Extract address fields from editar.php HTML using regex
function parseEnderecoFromHtml(html: string): {
  cep: string
  endereco: string
  numero: string
  bairro: string
  complemento: string
} {
  function extractField(field: string): string {
    // Try id before value (most common pattern in Linvix)
    const re1 = new RegExp(`<input[^>]*\\sid="${field}"[^>]*\\svalue="([^"]*)"`, 'i')
    const m1 = html.match(re1)
    if (m1) return decodeHtmlEntities(m1[1])
    // Try value before id
    const re2 = new RegExp(`<input[^>]*\\svalue="([^"]*)"[^>]*\\sid="${field}"`, 'i')
    const m2 = html.match(re2)
    if (m2) return decodeHtmlEntities(m2[1])
    return ''
  }

  return {
    cep: extractField('cep'),
    endereco: extractField('endereco'),
    numero: extractField('numero'),
    bairro: extractField('bairro'),
    complemento: extractField('complemento'),
  }
}

export async function GET(request: NextRequest) {
  if (!validateSyncSecret(request)) {
    return NextResponse.json({ error: 'Secret inválido' }, { status: 401 })
  }

  const startIdx = Math.max(0, parseInt(request.nextUrl.searchParams.get('startIdx') || '0', 10))
  const count = Math.min(30, Math.max(1, parseInt(request.nextUrl.searchParams.get('count') || '25', 10)))
  const onlyEmpty = request.nextUrl.searchParams.get('onlyEmpty') !== 'false'

  const startTime = Date.now()

  try {
    if (!LINVIX_USER || !LINVIX_PASSWORD) {
      throw new Error('LINVIX_USER / LINVIX_PASSWORD não configurados')
    }

    // 1. Get clientes from M-Tech (ordered by codigo ASC, paginated)
    const where = onlyEmpty
      ? { OR: [{ endereco: '' }, { cep: '' }] }
      : {}
    const clientes = await db.cliente.findMany({
      where,
      orderBy: { codigo: 'asc' },
      skip: startIdx,
      take: count,
      select: { id: true, codigo: true, razaoSocial: true },
    })

    if (clientes.length === 0) {
      return NextResponse.json({
        status: 'complete',
        message: 'Todos os clientes já têm endereço preenchido',
        startIdx,
        processed: 0,
        durationMs: Date.now() - startTime,
      })
    }

    // 2. Login to Linvix
    const phpsessid = await loginToLinvix()
    const loginMs = Date.now() - startTime
    console.log(`[enderecos-backfill] Login: ${loginMs}ms — processando ${clientes.length} clientes a partir do offset ${startIdx}`)

    // 3. For each client, fetch editar.php and extract address
    const results: any[] = []
    let updated = 0
    let unchanged = 0
    let errors = 0
    const errorDetails: string[] = []

    for (const cliente of clientes) {
      try {
        await sleep(150 + Math.random() * 200)

        const url = `${LINVIX_EDIT_URL}?codigo=${cliente.codigo}`
        const response = await fetch(url, { headers: editHeaders(phpsessid) })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const html = await response.text()
        const parsed = parseEnderecoFromHtml(html)

        const hasNewData = parsed.endereco || parsed.cep || parsed.numero || parsed.complemento || parsed.bairro

        if (!hasNewData) {
          unchanged++
          results.push({ codigo: cliente.codigo, status: 'no_data' })
          continue
        }

        // Use COALESCE-like logic: only overwrite if new value is non-empty
        await db.cliente.update({
          where: { id: cliente.id },
          data: {
            cep: parsed.cep || undefined,
            endereco: parsed.endereco || undefined,
            numero: parsed.numero || undefined,
            bairro: parsed.bairro || undefined,
            complemento: parsed.complemento || undefined,
          },
        })

        updated++
        results.push({
          codigo: cliente.codigo,
          status: 'updated',
          endereco: parsed.endereco,
          numero: parsed.numero,
          bairro: parsed.bairro,
        })
      } catch (err: any) {
        errors++
        const msg = `Cliente ${cliente.codigo}: ${err.message?.substring(0, 100)}`
        if (errorDetails.length < 5) errorDetails.push(msg)
        console.error(`[enderecos-backfill] ${msg}`)
      }
    }

    const totalMs = Date.now() - startTime

    // Log to sync log
    try {
      await db.linvixSyncLog.create({
        data: {
          syncType: 'enderecos-backfill',
          status: errors > 0 ? (updated > 0 ? 'partial' : 'error') : 'success',
          startedAt: new Date(startTime),
          finishedAt: new Date(),
          totalClients: clientes.length,
          createdCount: 0,
          updatedCount: updated,
          skippedCount: unchanged,
          errorCount: errors,
          errorMessage: errorDetails.join('\n').substring(0, 500),
          durationMs: totalMs,
        },
      })
    } catch {}

    return NextResponse.json({
      status: errors > 0 ? (updated > 0 ? 'partial' : 'error') : 'success',
      startIdx,
      count,
      processed: clientes.length,
      updated,
      unchanged,
      errors,
      errorDetails,
      nextStartIdx: startIdx + clientes.length,
      durationMs: totalMs,
      loginMs,
      sample: results.slice(0, 3),
    })
  } catch (err: any) {
    console.error('[enderecos-backfill] Erro:', err)
    return NextResponse.json(
      { status: 'error', error: err.message?.substring(0, 200) },
      { status: 500 },
    )
  }
}
