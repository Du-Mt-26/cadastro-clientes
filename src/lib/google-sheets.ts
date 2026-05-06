/**
 * Google Sheets Integration Module
 *
 * Handles:
 * - Parsing Google Sheets URLs (full, shortened, etc.)
 * - Connecting to spreadsheets via Google Sheets API v4
 * - Reading data (pull) and writing data (push)
 * - Bidirectional sync logic
 *
 * Authentication: Uses Service Account credentials.
 * The spreadsheet must be shared with the service account email.
 */

import { google } from 'googleapis'
import { db } from '@/lib/db'

// ─── Types ────────────────────────────────────────────

export interface SheetsConnectionResult {
  success: boolean
  spreadsheetId: string
  sheetName: string
  title: string
  rowCount: number
  headers: string[]
  error?: string
}

export interface SyncResult {
  success: boolean
  pulled: number
  pushed: number
  created: number
  updated: number
  errors: string[]
}

// ─── URL Parsing ──────────────────────────────────────

/**
 * Extract spreadsheet ID from various Google Sheets URL formats:
 * - https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
 * - https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0
 * - https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/
 * - https://drive.google.com/open?id=SPREADSHEET_ID
 * - Shortened URLs (bit.ly, etc.) — must be resolved first
 * - URLs with ?usp=sharing or ?usp=drive_web
 */
export function parseSheetsUrl(url: string): { spreadsheetId: string; gid?: string } | null {
  // Clean up the URL
  const trimmed = url.trim()

  // Direct spreadsheet ID (44-char base64)
  if (/^[a-zA-Z0-9_-]{44}$/.test(trimmed)) {
    return { spreadsheetId: trimmed }
  }

  // Standard Google Sheets URL
  const sheetsMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (sheetsMatch) {
    const spreadsheetId = sheetsMatch[1]
    const gidMatch = trimmed.match(/[#&]gid=(\d+)/)
    return { spreadsheetId, gid: gidMatch?.[1] }
  }

  // Google Drive open URL
  const driveMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (driveMatch) {
    return { spreadsheetId: driveMatch[1] }
  }

  return null
}

/**
 * Follow redirects for shortened URLs to get the actual Google Sheets URL.
 */
export async function resolveShortUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    })
    return response.url || url
  } catch {
    return url
  }
}

/**
 * Parse a Google Sheets URL that might be shortened.
 */
export async function parseFlexibleUrl(url: string): Promise<{ spreadsheetId: string; gid?: string } | null> {
  const trimmed = url.trim()

  // Try direct parsing first
  const direct = parseSheetsUrl(trimmed)
  if (direct) return direct

  // If it looks like a shortened URL, try to resolve it
  if (trimmed.startsWith('http') && !trimmed.includes('google.com')) {
    const resolved = await resolveShortUrl(trimmed)
    return parseSheetsUrl(resolved)
  }

  return null
}

// ─── Google Auth ──────────────────────────────────────

function getAuth() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!clientEmail || !privateKey) {
    return null
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

/**
 * Check if Google Sheets API credentials are configured.
 */
export function hasCredentials(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
}

/**
 * Get the service account email for sharing instructions.
 */
export function getServiceAccountEmail(): string | null {
  return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null
}

// ─── Connection ───────────────────────────────────────

/**
 * Test connection to a Google Spreadsheet.
 * Reads the first row to detect headers.
 */
export async function connectToSheet(spreadsheetId: string): Promise<SheetsConnectionResult> {
  const auth = getAuth()
  if (!auth) {
    return {
      success: false,
      spreadsheetId,
      sheetName: '',
      title: '',
      rowCount: 0,
      headers: [],
      error: 'Credenciais do Google não configuradas. Configure GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_PRIVATE_KEY no .env',
    }
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth })

    // Get spreadsheet metadata
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'properties.title,sheets.properties',
    })

    const title = meta.data.properties?.title || 'Sem título'
    const sheetName = meta.data.sheets?.[0]?.properties?.title || 'Sheet1'

    // Read first 2 rows to detect headers
    const range = `${sheetName}!1:2`
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    })

    const rows = response.data.values || []
    const headers = (rows[0] || []).map(h => String(h).trim())
    const rowCount = Math.max(0, (await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
    })).data.values?.length || 0)

    return {
      success: true,
      spreadsheetId,
      sheetName,
      title,
      rowCount: rowCount - 1, // Subtract header row
      headers,
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)

    if (msg.includes('403') || msg.includes('forbidden')) {
      return {
        success: false,
        spreadsheetId,
        sheetName: '',
        title: '',
        rowCount: 0,
        headers: [],
        error: 'Planilha não compartilhada. Compartilhe a planilha com o email da Service Account (permissão de Editor).',
      }
    }

    if (msg.includes('404') || msg.includes('not found')) {
      return {
        success: false,
        spreadsheetId,
        sheetName: '',
        title: '',
        rowCount: 0,
        headers: [],
        error: 'Planilha não encontrada. Verifique a URL.',
      }
    }

    return {
      success: false,
      spreadsheetId,
      sheetName: '',
      title: '',
      rowCount: 0,
      headers: [],
      error: `Erro ao conectar: ${msg}`,
    }
  }
}

// ─── Column Mapping ───────────────────────────────────

/**
 * Default mapping from Google Sheets column headers to DB fields.
 * Tries common header name variations.
 */
const HEADER_TO_FIELD: Record<string, string> = {
  // Direct mappings (header text → Prisma field name)
  'código': 'codigo',
  'codigo': 'codigo',
  'cod': 'codigo',
  'ie/rg': 'ieRg',
  'ie_rg': 'ieRg',
  'ie': 'ieRg',
  'rg': 'ieRg',
  'razão social': 'razaoSocial',
  'razao_social': 'razaoSocial',
  'razao social': 'razaoSocial',
  'nome fantasia': 'nomeFantasia',
  'nome_fantasia': 'nomeFantasia',
  'situação cadastral': 'situacaoCadastral',
  'situacao_cadastral': 'situacaoCadastral',
  'situacao cadastral': 'situacaoCadastral',
  'sit. cadastral': 'situacaoCadastral',
  'cnpj': 'cnpj',
  'endereço': 'endereco',
  'endereco': 'endereco',
  'endereço rua/avenida': 'endereco',
  'número': 'numero',
  'numero': 'numero',
  'complemento': 'complemento',
  'bairro': 'bairro',
  'cidade': 'cidade',
  'cep': 'cep',
  'uf': 'uf',
  'estado': 'uf',
  'telefone 1': 'telefone1',
  'telefone1': 'telefone1',
  'tel. 1': 'telefone1',
  'tel 1': 'telefone1',
  'telefone 2': 'telefone2',
  'telefone2': 'telefone2',
  'tel. 2': 'telefone2',
  'tel 2': 'telefone2',
  'telefone 3': 'telefone3',
  'telefone3': 'telefone3',
  'tel. 3': 'telefone3',
  'tel 3': 'telefone3',
  'celular': 'telefone3',
  'telefone 4': 'telefone4',
  'telefone4': 'telefone4',
  'tel. 4': 'telefone4',
  'tel 4': 'telefone4',
  'fax': 'telefone4',
  'email 1': 'email1',
  'email1': 'email1',
  'email. 1': 'email1',
  'email 2': 'email2',
  'email2': 'email2',
  'email. 2': 'email2',
  'email 3': 'email3',
  'email3': 'email3',
  'email. 3': 'email3',
  'pessoa de contato': 'pessoaContato',
  'pessoa_contato': 'pessoaContato',
  'contato': 'pessoaContato',
  'data situação': 'dataSituacao',
  'data_situacao': 'dataSituacao',
  'data abertura': 'dataAbertura',
  'data_abertura': 'dataAbertura',
  'cnae principal': 'cnaePrincipal',
  'cnae_principal': 'cnaePrincipal',
  'natureza jurídica': 'naturezaJuridica',
  'natureza_juridica': 'naturezaJuridica',
  'porte': 'porte',
  'cadastro': 'cadastro',
  'última venda': 'ultimaVenda',
  'ultima_venda': 'ultimaVenda',
  'ultima venda': 'ultimaVenda',
  'reg. simples': 'regSimples',
  'reg_simples': 'regSimples',
  'regime simples': 'regSimples',
  'vendedora': 'vendedor',
  'vendedor': 'vendedor',
  'observações': 'observacoes',
  'observacoes': 'observacoes',
  'obs': 'observacoes',
  'obs.': 'observacoes',
}

/**
 * Auto-detect column mapping from header row.
 */
export function detectColumnMapping(headers: string[]): Record<number, string> {
  const mapping: Record<number, string> = {}

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].toLowerCase().trim()
    const field = HEADER_TO_FIELD[header]
    if (field) {
      mapping[i] = field
    }
  }

  return mapping
}

// ─── Pull (Sheets → DB) ──────────────────────────────

/**
 * Pull all data from a Google Sheet and upsert into the Cliente table.
 * Also updates ClienteEdit for editable fields of existing XLSX-sourced records.
 */
export async function pullFromSheet(spreadsheetId: string, sheetName: string, headerRow: number = 1): Promise<SyncResult> {
  const result: SyncResult = { success: false, pulled: 0, pushed: 0, created: 0, updated: 0, errors: [] }
  const auth = getAuth()

  if (!auth) {
    result.errors.push('Credenciais do Google não configuradas')
    return result
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth })

    // Read all data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
    })

    const rows = response.data.values || []
    if (rows.length < headerRow) {
      result.errors.push('Planilha vazia ou sem cabeçalho')
      return result
    }

    // Detect column mapping from header row
    const headerRowIndex = headerRow - 1
    const headers = (rows[headerRowIndex] || []).map(h => String(h).trim())
    const colMapping = detectColumnMapping(headers)

    // Also check for "Observações" column which contains parsed fields
    const obsColIndex = headers.findIndex(h =>
      h.toLowerCase().includes('observações') || h.toLowerCase().includes('observacoes')
    )

    if (Object.keys(colMapping).length === 0) {
      result.errors.push('Não foi possível mapear nenhuma coluna. Verifique os cabeçalhos.')
      return result
    }

    // Process data rows
    for (let i = headerRow; i < rows.length; i++) {
      const row = rows[i]
      const dataRow = i + 1 // 1-indexed for sheetsRow tracking

      try {
        // Extract fields from the row based on column mapping
        const record: Record<string, string> = {}
        for (const [colIdx, field] of Object.entries(colMapping)) {
          const value = row[parseInt(colIdx)] || ''
          record[field] = String(value).trim()
        }

        // If there's an "Observações" column, parse embedded fields
        if (obsColIndex >= 0 && row[obsColIndex]) {
          const parsed = parseObservacoesFields(String(row[obsColIndex]))
          // Only fill fields not already mapped by explicit columns
          for (const [key, value] of Object.entries(parsed)) {
            if (!record[key] && value) {
              record[key] = value
            }
          }
        }

        // Skip rows without codigo
        if (!record.codigo) continue

        // Upsert into the unified Cliente table
        const existing = await db.cliente.findUnique({ where: { codigo: record.codigo } })

        if (existing) {
          // Update the Cliente record with sheets data
          const updateData: Record<string, string> = {}
          for (const [field, value] of Object.entries(record)) {
            if (field === 'codigo') continue
            // Only update if the new value is non-empty
            if (value) {
              updateData[field] = value
            }
          }

          if (Object.keys(updateData).length > 0) {
            await db.cliente.update({
              where: { codigo: record.codigo },
              data: { ...updateData, source: 'sheets', sheetsRow: dataRow },
            })
            result.updated++
          }
        } else {
          await db.cliente.create({
            data: {
              codigo: record.codigo,
              ieRg: record.ieRg || '',
              razaoSocial: record.razaoSocial || '',
              nomeFantasia: record.nomeFantasia || '',
              situacaoCadastral: record.situacaoCadastral || '',
              cnpj: (record.cnpj || '').replace(/\D/g, ''),
              endereco: record.endereco || '',
              numero: record.numero || '',
              complemento: record.complemento || '',
              bairro: record.bairro || '',
              cidade: record.cidade || '',
              cep: record.cep || '',
              uf: record.uf || '',
              telefone1: record.telefone1 || '',
              telefone2: record.telefone2 || '',
              telefone3: record.telefone3 || '',
              telefone4: record.telefone4 || '',
              email1: record.email1 || '',
              email2: record.email2 || '',
              email3: record.email3 || '',
              pessoaContato: record.pessoaContato || '',
              dataSituacao: record.dataSituacao || '',
              dataAbertura: record.dataAbertura || '',
              cnaePrincipal: record.cnaePrincipal || '',
              naturezaJuridica: record.naturezaJuridica || '',
              porte: record.porte || '',
              cadastro: record.cadastro || '',
              ultimaVenda: record.ultimaVenda || '',
              regSimples: record.regSimples || '',
              vendedor: record.vendedor || '',
              observacoes: record.observacoes || '',
              source: 'sheets',
              sheetsRow: dataRow,
            },
          })
          result.created++
        }

        result.pulled++
      } catch (err) {
        result.errors.push(`Linha ${dataRow}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    result.success = result.errors.length === 0 || result.pulled > 0
    return result
  } catch (error: unknown) {
    result.errors.push(`Erro geral: ${error instanceof Error ? error.message : String(error)}`)
    return result
  }
}

// ─── Push (DB → Sheets) ──────────────────────────────

/**
 * Push records from DB to Google Sheets.
 * Uses the unified Cliente table (source='sheets') which contains
 * the most up-to-date data after pull+merge.
 */
export async function pushToSheet(spreadsheetId: string, sheetName: string, headerRow: number = 1): Promise<SyncResult> {
  const result: SyncResult = { success: false, pulled: 0, pushed: 0, created: 0, updated: 0, errors: [] }
  const auth = getAuth()

  if (!auth) {
    result.errors.push('Credenciais do Google não configuradas')
    return result
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth })

    // Get all sheets-sourced records that have a row number
    const modifiedRecords = await db.cliente.findMany({
      where: { source: 'sheets', sheetsRow: { gt: 0 } },
    })

    if (modifiedRecords.length === 0) {
      result.success = true
      return result
    }

    // Read current headers to build column mapping
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!${headerRow}:${headerRow}`,
    })
    const headers = (headerResponse.data.values?.[0] || []).map(h => String(h).trim())
    const colMapping = detectColumnMapping(headers)

    // Reverse mapping: field → column index
    const fieldToCol: Record<string, number> = {}
    for (const [colIdx, field] of Object.entries(colMapping)) {
      fieldToCol[field] = parseInt(colIdx)
    }

    // Build batch update requests
    const updates: { range: string; values: string[][] }[] = []

    // DB field order matching the Prisma schema fields we care about
    const dbFields = [
      'codigo', 'ieRg', 'razaoSocial', 'nomeFantasia', 'situacaoCadastral', 'cnpj',
      'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'cep', 'uf',
      'telefone1', 'telefone2', 'telefone3', 'telefone4',
      'email1', 'email2', 'email3', 'pessoaContato',
      'dataSituacao', 'dataAbertura', 'cnaePrincipal', 'naturezaJuridica', 'porte',
      'cadastro', 'ultimaVenda', 'regSimples', 'vendedor', 'observacoes',
    ]

    for (const record of modifiedRecords) {
      // Build row values based on column mapping
      const rowValues: string[] = new Array(headers.length).fill('')

      for (const field of dbFields) {
        const colIdx = fieldToCol[field]
        if (colIdx !== undefined) {
          const value = record[field as keyof typeof record]
          rowValues[colIdx] = typeof value === 'string' ? value : String(value || '')
        }
      }

      // Build range for this specific row
      const rowNumber = record.sheetsRow
      const endCol = headers.length <= 26
        ? String.fromCharCode(65 + headers.length - 1)
        : // For >26 columns, use a simple approach
          `AZ`
      const range = `${sheetName}!A${rowNumber}:${endCol}${rowNumber}`

      updates.push({ range, values: [rowValues] })
      result.pushed++
    }

    // Batch update
    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          data: updates,
          valueInputOption: 'USER_ENTERED',
        },
      })
    }

    result.success = true
    return result
  } catch (error: unknown) {
    result.errors.push(`Erro ao enviar: ${error instanceof Error ? error.message : String(error)}`)
    return result
  }
}

// ─── Bidirectional Sync ───────────────────────────────

/**
 * Perform bidirectional sync:
 * 1. Pull latest from Sheets → update DB
 * 2. Push DB changes → update Sheets
 */
export async function bidirectionalSync(spreadsheetId: string, sheetName: string, headerRow: number = 1): Promise<SyncResult> {
  const pullResult = await pullFromSheet(spreadsheetId, sheetName, headerRow)
  const pushResult = await pushToSheet(spreadsheetId, sheetName, headerRow)

  return {
    success: pullResult.success && pushResult.success,
    pulled: pullResult.pulled,
    pushed: pushResult.pushed,
    created: pullResult.created,
    updated: pullResult.updated,
    errors: [...pullResult.errors, ...pushResult.errors],
  }
}

// ─── Helpers ──────────────────────────────────────────

/**
 * Parse the semicolon-separated key-value fields from the "Observações" column.
 * This is specific to the Mtech data format where embedded fields like
 * "Código:000002; IE/RG:83482407; ..." are stored in a single column.
 */
function parseObservacoesFields(obs: string): Record<string, string> {
  const fieldMap: Record<string, string> = {
    codigo: 'codigo',
    'ie/rg': 'ieRg',
    ie_rg: 'ieRg',
    celular: 'telefone3',
    fax: 'telefone4',
    cadastro: 'cadastro',
    'última venda': 'ultimaVenda',
    ultima_venda: 'ultimaVenda',
    'ultima venda': 'ultimaVenda',
    'reg. simples': 'regSimples',
    reg_simples: 'regSimples',
    vendedor: 'vendedor',
    vendedora: 'vendedor',
  }

  const result: Record<string, string> = {}
  if (!obs) return result

  const pairs = obs.split(';').map(s => s.trim()).filter(Boolean)
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(':')
    if (colonIdx === -1) continue
    const key = pair.substring(0, colonIdx).trim().toLowerCase().replace(/\s+/g, '_')
    const value = pair.substring(colonIdx + 1).trim()
    const dbField = fieldMap[key]
    if (dbField) {
      result[dbField] = value
    }
  }

  return result
}

/**
 * Save/update sync configuration in the database.
 */
export async function saveSyncConfig(config: {
  sheetsUrl: string
  spreadsheetId: string
  sheetName: string
  connected: boolean
  headerRow?: number
  dataStartRow?: number
  columnMapping?: Record<number, string>
  syncMode?: string
}): Promise<void> {
  const existing = await db.syncConfig.findFirst()

  if (existing) {
    await db.syncConfig.update({
      where: { id: existing.id },
      data: {
        sheetsUrl: config.sheetsUrl,
        spreadsheetId: config.spreadsheetId,
        sheetName: config.sheetName,
        connected: config.connected,
        headerRow: config.headerRow ?? existing.headerRow,
        dataStartRow: config.dataStartRow ?? existing.dataStartRow,
        columnMapping: config.columnMapping ? JSON.stringify(config.columnMapping) : existing.columnMapping,
        syncMode: config.syncMode ?? existing.syncMode,
      },
    })
  } else {
    await db.syncConfig.create({
      data: {
        sheetsUrl: config.sheetsUrl,
        spreadsheetId: config.spreadsheetId,
        sheetName: config.sheetName,
        connected: config.connected,
        headerRow: config.headerRow ?? 1,
        dataStartRow: config.dataStartRow ?? 2,
        columnMapping: config.columnMapping ? JSON.stringify(config.columnMapping) : '{}',
        syncMode: config.syncMode ?? 'pull',
      },
    })
  }
}

/**
 * Get the current sync configuration.
 */
export async function getSyncConfig() {
  return db.syncConfig.findFirst()
}

/**
 * Update sync status after a sync operation.
 */
export async function updateSyncStatus(configId: string, syncResult: SyncResult) {
  return db.syncConfig.update({
    where: { id: configId },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: syncResult.success ? 'success' : (syncResult.pulled > 0 ? 'partial' : 'error'),
      lastSyncCount: syncResult.pulled,
      lastSyncError: syncResult.errors.join('; ') || '',
    },
  })
}
