/**
 * Data access module for Clientes.
 *
 * All data now lives in the database (Cliente table).
 * No more XLSX file reading — works on Vercel (serverless) and locally.
 *
 * Data sources (all from DB):
 * 1. Cliente (source='xlsx') — records imported from XLSX
 * 2. Cliente (source='sheets') — records synced from Google Sheets
 * 3. Cliente (source='manual') — new clients created in the UI
 *
 * This module is server-only (uses db).
 */

import { db } from '@/lib/db'
import type { ClienteRecord, EditableFields } from '@/lib/types'

// ---------------------------------------------------------------------------
// Convert a DB Cliente record to ClienteRecord format
// ---------------------------------------------------------------------------

export function dbToRecord(c: {
  id: string
  codigo: string
  ieRg: string
  razaoSocial: string
  nomeFantasia: string
  situacaoCadastral: string
  cnpj: string
  endereco: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  cep: string
  uf: string
  telefone1: string
  telefone2: string
  telefone3: string
  telefone4: string
  email1: string
  email2: string
  email3: string
  pessoaContato: string
  dataSituacao: string
  dataAbertura: string
  cnaePrincipal: string
  naturezaJuridica: string
  porte: string
  cadastro: string
  ultimaVenda: string
  regSimples: string
  vendedor: string
  observacoes?: string
  carteira?: string
  vendedorId?: string | null
}): ClienteRecord {
  return {
    razao_social: c.razaoSocial,
    nome_fantasia: c.nomeFantasia,
    situacao_cadastral: c.situacaoCadastral,
    cnpj: c.cnpj,
    endereco: c.endereco,
    numero: c.numero,
    complemento: c.complemento,
    bairro: c.bairro,
    cidade: c.cidade,
    cep: c.cep,
    uf: c.uf,
    telefone1: c.telefone1,
    telefone2: c.telefone2,
    telefone3: c.telefone3,
    telefone4: c.telefone4,
    email1: c.email1,
    email2: c.email2,
    email3: c.email3,
    pessoa_contato: c.pessoaContato,
    data_situacao: c.dataSituacao,
    data_abertura: c.dataAbertura,
    cnae_principal: c.cnaePrincipal,
    natureza_juridica: c.naturezaJuridica,
    porte: c.porte,
    carteira: c.carteira || 'CARTEIRA_ATUAL',
    vendedor_id: c.vendedorId || '',
    parsed: {
      codigo: c.codigo,
      ie_rg: c.ieRg,
      celular: '',
      fax: '',
      cadastro: c.cadastro,
      ultima_venda: c.ultimaVenda,
      reg_simples: c.regSimples,
      vendedor: c.vendedor,
    },
    editable: {
      telefone1: c.telefone1,
      telefone2: c.telefone2,
      telefone3: c.telefone3,
      telefone4: c.telefone4,
      email1: c.email1,
      email2: c.email2,
      email3: c.email3,
      pessoaContato: c.pessoaContato,
      observacoes: c.observacoes || '',
    },
  }
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/** In-memory cache — invalidated on write operations */
let cachedRecords: ClienteRecord[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 60_000 // 1 minute — helps with serverless cold starts

/**
 * Load all client records from the database.
 *
 * Uses a short-lived in-memory cache to avoid hitting the DB
 * on every request within the same serverless function invocation.
 */
export async function getRecords(): Promise<ClienteRecord[]> {
  const now = Date.now()
  if (cachedRecords && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedRecords
  }

  const clientes = await db.cliente.findMany({
    orderBy: { codigo: 'asc' },
  })

  cachedRecords = clientes.map(dbToRecord)
  cacheTimestamp = Date.now()

  return cachedRecords
}

/**
 * Invalidate the in-memory cache.
 *
 * Call this after any write operation so that the next
 * `getRecords()` call re-reads from the DB.
 */
export function invalidateCache(): void {
  cachedRecords = null
  cacheTimestamp = 0
}

/**
 * Find a record by CNPJ (digits only) from the cached records.
 */
export async function findRecordByCnpj(cnpj: string): Promise<ClienteRecord | undefined> {
  const records = await getRecords()
  const digits = cnpj.replace(/\D/g, '')
  return records.find((r) => r.cnpj.replace(/\D/g, '') === digits)
}
