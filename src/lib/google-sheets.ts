/**
 * Google Sheets Integration Module (Simple URL-based)
 *
 * Works with publicly shared spreadsheets — no credentials needed!
 * Just paste the URL and import data.
 *
 * Uses the public CSV export endpoint:
 * https://docs.google.com/spreadsheets/d/{ID}/export?format=csv
 */

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

export function parseSheetsUrl(url: string): { spreadsheetId: string; gid?: string } | null {
  const trimmed = url.trim()
  if (/^[a-zA-Z0-9_-]{44}$/.test(trimmed)) return { spreadsheetId: trimmed }
  const sheetsMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (sheetsMatch) {
    const gidMatch = trimmed.match(/[#&]gid=(\d+)/)
    return { spreadsheetId: sheetsMatch[1], gid: gidMatch?.[1] }
  }
  const driveMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (driveMatch) return { spreadsheetId: driveMatch[1] }
  return null
}

export async function resolveShortUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) })
    return response.url || url
  } catch { return url }
}

export async function parseFlexibleUrl(url: string): Promise<{ spreadsheetId: string; gid?: string } | null> {
  const trimmed = url.trim()
  const direct = parseSheetsUrl(trimmed)
  if (direct) return direct
  if (trimmed.startsWith('http') && !trimmed.includes('google.com')) {
    const resolved = await resolveShortUrl(trimmed)
    return parseSheetsUrl(resolved)
  }
  return null
}

// ─── Public CSV Fetch ─────────────────────────────────

function getCsvExportUrl(spreadsheetId: string, gid?: string): string {
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`
  return gid ? `${base}&gid=${gid}` : base
}

function parseCsv(csvText: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  let i = 0
  while (i < csvText.length) {
    const char = csvText[i]
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < csvText.length && csvText[i + 1] === '"') { currentField += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      currentField += char; i++
    } else {
      if (char === '"') { inQuotes = true; i++ }
      else if (char === ',') { currentRow.push(currentField.trim()); currentField = ''; i++ }
      else if (char === '\r') { i++ }
      else if (char === '\n') {
        currentRow.push(currentField.trim())
        if (currentRow.some(f => f !== '')) rows.push(currentRow)
        currentRow = []; currentField = ''; i++
      } else { currentField += char; i++ }
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    if (currentRow.some(f => f !== '')) rows.push(currentRow)
  }
  return rows
}

// ─── Connection ───────────────────────────────────────

export async function connectToSheet(spreadsheetId: string, gid?: string): Promise<SheetsConnectionResult> {
  try {
    const csvUrl = getCsvExportUrl(spreadsheetId, gid)
    const response = await fetch(csvUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MtechCRM/1.0)' },
    })

    if (!response.ok) {
      if (response.status === 404) return { success: false, spreadsheetId, sheetName: '', title: '', rowCount: 0, headers: [], error: 'Planilha não encontrada. Verifique a URL.' }
      if (response.status === 403) return { success: false, spreadsheetId, sheetName: '', title: '', rowCount: 0, headers: [], error: 'Planilha não está acessível. Compartilhe como "Qualquer pessoa com o link".' }
      const text = await response.text()
      if (text.includes('<!DOCTYPE') || text.includes('<html')) return { success: false, spreadsheetId, sheetName: '', title: '', rowCount: 0, headers: [], error: 'Planilha não está acessível. Compartilhe como "Qualquer pessoa com o link".' }
      return { success: false, spreadsheetId, sheetName: '', title: '', rowCount: 0, headers: [], error: `Erro ao acessar planilha (HTTP ${response.status})` }
    }

    const csvText = await response.text()
    if (csvText.trimStart().startsWith('<!DOCTYPE') || csvText.trimStart().startsWith('<html'))
      return { success: false, spreadsheetId, sheetName: '', title: '', rowCount: 0, headers: [], error: 'Planilha não está acessível. Compartilhe como "Qualquer pessoa com o link".' }

    const rows = parseCsv(csvText)
    if (rows.length === 0) return { success: false, spreadsheetId, sheetName: '', title: '', rowCount: 0, headers: [], error: 'Planilha vazia ou sem dados.' }

    const headers = rows[0]
    const dataRowCount = rows.length - 1
    const sheetName = gid ? `Sheet (gid=${gid})` : 'Sheet1'
    let title = 'Planilha Google'
    if (headers.length > 0 && !HEADER_TO_FIELD[headers[0].toLowerCase().trim()]) title = headers[0]

    return { success: true, spreadsheetId, sheetName, title, rowCount: dataRowCount, headers }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('abort') || msg.includes('timeout')) return { success: false, spreadsheetId, sheetName: '', title: '', rowCount: 0, headers: [], error: 'Tempo esgotado ao conectar. Verifique sua conexão e a URL.' }
    return { success: false, spreadsheetId, sheetName: '', title: '', rowCount: 0, headers: [], error: `Erro ao conectar: ${msg}` }
  }
}

// ─── Column Mapping ───────────────────────────────────

const HEADER_TO_FIELD: Record<string, string> = {
  'código': 'codigo', 'codigo': 'codigo', 'cod': 'codigo', 'cód': 'codigo',
  'ie/rg': 'ieRg', 'ie_rg': 'ieRg', 'ie': 'ieRg', 'rg': 'ieRg',
  'razão social': 'razaoSocial', 'razao_social': 'razaoSocial', 'razao social': 'razaoSocial',
  'nome fantasia': 'nomeFantasia', 'nome_fantasia': 'nomeFantasia', 'fantasia': 'nomeFantasia',
  'situação cadastral': 'situacaoCadastral', 'situacao_cadastral': 'situacaoCadastral', 'situacao cadastral': 'situacaoCadastral', 'sit. cadastral': 'situacaoCadastral',
  'cnpj': 'cnpj',
  'endereço': 'endereco', 'endereco': 'endereco', 'endereço rua/avenida': 'endereco', 'logradouro': 'endereco',
  'número': 'numero', 'numero': 'numero', 'nº': 'numero',
  'complemento': 'complemento', 'bairro': 'bairro', 'cidade': 'cidade', 'cep': 'cep', 'uf': 'uf', 'estado': 'uf',
  'telefone 1': 'telefone1', 'telefone1': 'telefone1', 'tel. 1': 'telefone1', 'tel 1': 'telefone1',
  'telefone 2': 'telefone2', 'telefone2': 'telefone2', 'tel. 2': 'telefone2', 'tel 2': 'telefone2',
  'telefone 3': 'telefone3', 'telefone3': 'telefone3', 'tel. 3': 'telefone3', 'tel 3': 'telefone3', 'celular': 'telefone3',
  'telefone 4': 'telefone4', 'telefone4': 'telefone4', 'tel. 4': 'telefone4', 'tel 4': 'telefone4', 'fax': 'telefone4',
  'email 1': 'email1', 'email1': 'email1', 'email. 1': 'email1',
  'email 2': 'email2', 'email2': 'email2', 'email. 2': 'email2',
  'email 3': 'email3', 'email3': 'email3', 'email. 3': 'email3',
  'pessoa de contato': 'pessoaContato', 'pessoa_contato': 'pessoaContato', 'contato': 'pessoaContato',
  'data situação': 'dataSituacao', 'data_situacao': 'dataSituacao',
  'data abertura': 'dataAbertura', 'data_abertura': 'dataAbertura',
  'cnae principal': 'cnaePrincipal', 'cnae_principal': 'cnaePrincipal',
  'natureza jurídica': 'naturezaJuridica', 'natureza_juridica': 'naturezaJuridica',
  'porte': 'porte', 'cadastro': 'cadastro',
  'última venda': 'ultimaVenda', 'ultima_venda': 'ultimaVenda', 'ultima venda': 'ultimaVenda',
  'reg. simples': 'regSimples', 'reg_simples': 'regSimples', 'regime simples': 'regSimples',
  'vendedora': 'vendedor', 'vendedor': 'vendedor',
  'observações': 'observacoes', 'observacoes': 'observacoes', 'obs': 'observacoes', 'obs.': 'observacoes',
}

export function detectColumnMapping(headers: string[]): Record<number, string> {
  const mapping: Record<number, string> = {}
  for (let i = 0; i < headers.length; i++) {
    const field = HEADER_TO_FIELD[headers[i].toLowerCase().trim()]
    if (field) mapping[i] = field
  }
  return mapping
}

// ─── Pull (Sheets → DB) via public CSV ────────────────

export async function pullFromSheet(spreadsheetId: string, _sheetName: string, headerRow: number = 1, gid?: string): Promise<SyncResult> {
  const result: SyncResult = { success: false, pulled: 0, pushed: 0, created: 0, updated: 0, errors: [] }

  try {
    const csvUrl = getCsvExportUrl(spreadsheetId, gid)
    const response = await fetch(csvUrl, {
      signal: AbortSignal.timeout(30000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MtechCRM/1.0)' },
    })

    if (!response.ok) { result.errors.push(`Erro ao baixar planilha (HTTP ${response.status})`); return result }

    const csvText = await response.text()
    if (csvText.trimStart().startsWith('<!DOCTYPE') || csvText.trimStart().startsWith('<html')) {
      result.errors.push('Planilha não está acessível. Compartilhe como "Qualquer pessoa com o link".')
      return result
    }

    const rows = parseCsv(csvText)
    if (rows.length < headerRow) { result.errors.push('Planilha vazia ou sem cabeçalho'); return result }

    const headerRowIndex = headerRow - 1
    const headers = rows[headerRowIndex] || []
    const colMapping = detectColumnMapping(headers)
    const obsColIndex = headers.findIndex(h => h.toLowerCase().includes('observações') || h.toLowerCase().includes('observacoes'))

    if (Object.keys(colMapping).length === 0) { result.errors.push('Não foi possível mapear nenhuma coluna. Verifique os cabeçalhos.'); return result }

    for (let i = headerRow; i < rows.length; i++) {
      const row = rows[i]
      const dataRow = i + 1
      try {
        const record: Record<string, string> = {}
        for (const [colIdx, field] of Object.entries(colMapping)) {
          record[field] = String(row[parseInt(colIdx)] || '').trim()
        }
        if (obsColIndex >= 0 && row[obsColIndex]) {
          const parsed = parseObservacoesFields(String(row[obsColIndex]))
          for (const [key, value] of Object.entries(parsed)) {
            if (!record[key] && value) record[key] = value
          }
        }
        if (!record.codigo) continue

        const existing = await db.cliente.findUnique({ where: { codigo: record.codigo } })
        if (existing) {
          const updateData: Record<string, string> = {}
          for (const [field, value] of Object.entries(record)) {
            if (field === 'codigo') continue
            if (value) updateData[field] = value
          }
          if (Object.keys(updateData).length > 0) {
            await db.cliente.update({ where: { codigo: record.codigo }, data: { ...updateData, source: 'sheets', sheetsRow: dataRow } })
            result.updated++
          }
        } else {
          await db.cliente.create({
            data: {
              codigo: record.codigo, ieRg: record.ieRg || '', razaoSocial: record.razaoSocial || '',
              nomeFantasia: record.nomeFantasia || '', situacaoCadastral: record.situacaoCadastral || '',
              cnpj: (record.cnpj || '').replace(/\D/g, ''), endereco: record.endereco || '',
              numero: record.numero || '', complemento: record.complemento || '', bairro: record.bairro || '',
              cidade: record.cidade || '', cep: record.cep || '', uf: record.uf || '',
              telefone1: record.telefone1 || '', telefone2: record.telefone2 || '',
              telefone3: record.telefone3 || '', telefone4: record.telefone4 || '',
              email1: record.email1 || '', email2: record.email2 || '', email3: record.email3 || '',
              pessoaContato: record.pessoaContato || '', dataSituacao: record.dataSituacao || '',
              dataAbertura: record.dataAbertura || '', cnaePrincipal: record.cnaePrincipal || '',
              naturezaJuridica: record.naturezaJuridica || '', porte: record.porte || '',
              cadastro: record.cadastro || '', ultimaVenda: record.ultimaVenda || '',
              regSimples: record.regSimples || '', vendedor: record.vendedor || '',
              observacoes: record.observacoes || '', source: 'sheets', sheetsRow: dataRow,
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

// ─── Helpers ──────────────────────────────────────────

function parseObservacoesFields(obs: string): Record<string, string> {
  const fieldMap: Record<string, string> = {
    codigo: 'codigo', 'ie/rg': 'ieRg', ie_rg: 'ieRg', celular: 'telefone3', fax: 'telefone4',
    cadastro: 'cadastro', 'última venda': 'ultimaVenda', ultima_venda: 'ultimaVenda',
    'ultima venda': 'ultimaVenda', 'reg. simples': 'regSimples', reg_simples: 'regSimples',
    vendedor: 'vendedor', vendedora: 'vendedor',
  }
  const result: Record<string, string> = {}
  if (!obs) return result
  for (const pair of obs.split(';').map(s => s.trim()).filter(Boolean)) {
    const colonIdx = pair.indexOf(':')
    if (colonIdx === -1) continue
    const key = pair.substring(0, colonIdx).trim().toLowerCase().replace(/\s+/g, '_')
    const value = pair.substring(colonIdx + 1).trim()
    const dbField = fieldMap[key]
    if (dbField) result[dbField] = value
  }
  return result
}

export async function saveSyncConfig(config: {
  sheetsUrl: string; spreadsheetId: string; sheetName: string; connected: boolean
  headerRow?: number; dataStartRow?: number; columnMapping?: Record<number, string>; syncMode?: string
}): Promise<void> {
  const existing = await db.syncConfig.findFirst()
  if (existing) {
    await db.syncConfig.update({
      where: { id: existing.id },
      data: {
        sheetsUrl: config.sheetsUrl, spreadsheetId: config.spreadsheetId, sheetName: config.sheetName,
        connected: config.connected, headerRow: config.headerRow ?? existing.headerRow,
        dataStartRow: config.dataStartRow ?? existing.dataStartRow,
        columnMapping: config.columnMapping ? JSON.stringify(config.columnMapping) : existing.columnMapping,
        syncMode: config.syncMode ?? existing.syncMode,
      },
    })
  } else {
    await db.syncConfig.create({
      data: {
        sheetsUrl: config.sheetsUrl, spreadsheetId: config.spreadsheetId, sheetName: config.sheetName,
        connected: config.connected, headerRow: config.headerRow ?? 1, dataStartRow: config.dataStartRow ?? 2,
        columnMapping: config.columnMapping ? JSON.stringify(config.columnMapping) : '{}',
        syncMode: config.syncMode ?? 'pull',
      },
    })
  }
}

export async function getSyncConfig() { return db.syncConfig.findFirst() }

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
