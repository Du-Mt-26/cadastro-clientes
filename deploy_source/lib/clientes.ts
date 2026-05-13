// ─── Shared Utility Functions ─────────────────────
// This module must NOT import Node.js-specific modules (fs, path, etc.)
// since it is imported from client-side code too.

import type { ParsedFields, ClienteRecord, EditableFields } from '@/lib/types'

/** Convert Excel serial date number to dd/mm/aaaa string */
export function excelSerialToDate(serial: string): string {
  if (!serial) return ''
  const num = parseInt(serial, 10)
  if (isNaN(num) || num <= 0) return serial
  const epoch = new Date(1899, 11, 30)
  const date = new Date(epoch.getTime() + num * 86400000)
  if (isNaN(date.getTime())) return serial
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

/** Format YYYY-MM-DD date string to dd/mm/aaaa */
export function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`
  }
  return dateStr
}

/** Parse the semicolon-separated key-value Observações field */
export function parseObservacoes(obs: string): ParsedFields {
  const defaults: ParsedFields = {
    codigo: '',
    ie_rg: '',
    celular: '',
    fax: '',
    cadastro: '',
    ultima_venda: '',
    reg_simples: '',
    vendedor: '',
    data_atribuicao_vendedor: '',
  }

  if (!obs) return defaults

  const pairs = obs.split(';').map((s) => s.trim()).filter(Boolean)
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(':')
    if (colonIdx === -1) continue
    const key = pair.substring(0, colonIdx).trim().toLowerCase().replace(/\s+/g, '_')
    const value = pair.substring(colonIdx + 1).trim()
    if (key in defaults) {
      defaults[key] = value
    }
  }

  defaults.cadastro = excelSerialToDate(defaults.cadastro)
  defaults.ultima_venda = excelSerialToDate(defaults.ultima_venda)

  return defaults
}

/** Format a raw phone string into a readable format */
export function formatPhone(raw: string): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0800') && digits.length >= 11) return `0800-${digits.slice(4, 7)}-${digits.slice(7, 11)}`
  if (digits.startsWith('0800') && digits.length >= 7) return `0800-${digits.slice(4, 7)}`
  if (digits.length === 11 && digits[2] === '9') return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 10)}`
  if (digits.length === 9 && digits[0] === '9') return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 8)}`
  return raw
}

/** Get the current date/time in Brasília timezone (UTC-3) */
export function getNowBrasilia(): Date {
  const now = new Date()
  return new Date(now.getTime() + (now.getTimezoneOffset() + 180) * 60000)
}

/** Parse a dd/mm/yyyy date string into a Date object */
export function parseDdMmYyyy(dateStr: string): Date | null {
  if (!dateStr) return null
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  const d = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]))
  return isNaN(d.getTime()) ? null : d
}

/** Calculate days since last sale */
export function calcDiasSemVenda(ultimaVenda: string): number | null {
  if (!ultimaVenda) return null
  const saleDate = parseDdMmYyyy(ultimaVenda)
  if (!saleDate) return null
  const now = getNowBrasilia()
  const sale = new Date(saleDate.getFullYear(), saleDate.getMonth(), saleDate.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.floor((today.getTime() - sale.getTime()) / 86400000)
}

/** Get the value of a record field by key name */
export function getRecordValue(r: ClienteRecord, key: string): string {
  const map: Record<string, string> = {
    codigo: r.parsed.codigo, ie_rg: r.parsed.ie_rg, razao_social: r.razao_social,
    nome_fantasia: r.nome_fantasia, situacao_cadastral: r.situacao_cadastral, cnpj: r.cnpj,
    endereco: r.endereco, numero: r.numero, complemento: r.complemento, bairro: r.bairro,
    cidade: r.cidade, cep: r.cep, uf: r.uf, telefone1: r.telefone1, telefone2: r.telefone2,
    telefone3: r.telefone3, telefone4: r.telefone4, email1: r.email1, email2: r.email2,
    email3: r.email3, pessoa_contato: r.pessoa_contato, data_situacao: r.data_situacao,
    data_abertura: r.data_abertura, cnae_principal: r.cnae_principal, natureza_juridica: r.natureza_juridica,
    porte: r.porte, cadastro: r.parsed.cadastro, ultima_venda: r.parsed.ultima_venda,
    reg_simples: r.parsed.reg_simples, vendedor: r.parsed.vendedor,
    tipo: r.tipo, carteira: r.carteira,
    data_atribuicao_vendedor: r.parsed.data_atribuicao_vendedor,
    observacoes: r.editable.observacoes,
  }
  return map[key] || ''
}

/** Map a column key to the corresponding EditableFields key */
export function toEditableKey(key: string): keyof EditableFields | null {
  const map: Record<string, keyof EditableFields> = {
    telefone1: 'telefone1', telefone2: 'telefone2', telefone3: 'telefone3', telefone4: 'telefone4',
    email1: 'email1', email2: 'email2', email3: 'email3', pessoa_contato: 'pessoaContato',
    observacoes: 'observacoes',
  }
  return map[key] || null
}
