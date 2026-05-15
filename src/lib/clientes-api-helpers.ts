/**
 * Shared helpers for the Clientes API endpoints.
 *
 * Used by both /api/clientes and /api/clientes/filtros to avoid
 * duplicating Prisma where-clause construction and filter/stats logic.
 *
 * Updated: carteira is now an explicit enum field on Cliente (no longer computed).
 */

import { Prisma, Carteira } from '@prisma/client'
import { db } from '@/lib/db'
import { calcDiasSemVenda } from '@/lib/clientes'
import { dbToRecord } from '@/lib/clientes-cache'
import {
  canSeeAllClients,
  canSeeListaFria,
  canSeeFornecedor,
  type Role,
} from '@/lib/auth'
import type { ClienteRecord } from '@/lib/types'

// ─── Sort field mapping: API param name → Prisma field name ─────────

export const SORT_FIELD_MAP: Record<string, string> = {
  codigo: 'codigo',
  ie_rg: 'ieRg',
  razao_social: 'razaoSocial',
  nome_fantasia: 'nomeFantasia',
  situacao_cadastral: 'situacaoCadastral',
  cnpj: 'cnpj',
  endereco: 'endereco',
  numero: 'numero',
  complemento: 'complemento',
  bairro: 'bairro',
  cidade: 'cidade',
  cep: 'cep',
  uf: 'uf',
  telefone1: 'telefone1',
  telefone2: 'telefone2',
  telefone3: 'telefone3',
  telefone4: 'telefone4',
  email1: 'email1',
  email2: 'email2',
  email3: 'email3',
  pessoa_contato: 'pessoaContato',
  data_situacao: 'dataSituacao',
  data_abertura: 'dataAbertura',
  cnae_principal: 'cnaePrincipal',
  natureza_juridica: 'naturezaJuridica',
  porte: 'porte',
  cadastro: 'cadastro',
  ultima_venda: 'ultimaVenda',
  reg_simples: 'regSimples',
  vendedor: 'vendedor',
  tipo: 'tipo',
  carteira: 'carteira',  // Now a real DB field — can be sorted server-side!
}

export const COMPUTED_SORT_FIELDS = new Set(['dias_sem_venda']) // carteira removed — it's now a DB field

// ─── Visibility where clause ────────────────────────────────────────

export function buildVisibilityWhere(
  role: Role,
  userId: string,
  _userEmail?: string,
): Prisma.ClienteWhereInput {
  if (canSeeAllClients(role)) {
    // Non-VENDEDOR: can see all, but fornecedor-flagged clients only if they have permission
    if (canSeeFornecedor(role)) return {}
    return {
      OR: [
        { fornecedor: false },
        { carteira: 'FORNECEDOR' }, // can still see FORNECEDOR carteira clients
      ],
    }
  }

  // VENDEDOR visibility: own clients + BOLSAO
  const orConditions: Prisma.ClienteWhereInput[] = [
    { vendedorId: userId },             // own clients
    { carteira: 'BOLSAO' },             // bolsão — all vendedores can see
  ]

  return {
    AND: [
      { OR: orConditions },
      // Fornecedor-flagged clients hidden from VENDEDOR
      { fornecedor: false },
    ],
  }
}

// ─── Filter where clause ────────────────────────────────────────────

export function buildFilterWhere(params: {
  situacaoCadastral: string
  vendedor: string
  cidade: string
  uf: string
  carteira: string
  tipo: string
  role: Role
}): Prisma.ClienteWhereInput {
  const {
    situacaoCadastral, vendedor, cidade, uf,
    carteira, tipo, role,
  } = params

  const and: Prisma.ClienteWhereInput[] = []

  if (situacaoCadastral) {
    and.push({ situacaoCadastral: { equals: situacaoCadastral, mode: 'insensitive' } })
  }

  // For VENDEDOR role, skip vendedor filter — visibility already controls it
  if (vendedor && role !== 'VENDEDOR') {
    and.push({ vendedor: { equals: vendedor, mode: 'insensitive' } })
  }

  if (cidade) {
    and.push({ cidade: { equals: cidade, mode: 'insensitive' } })
  }

  if (uf) {
    and.push({ uf: { equals: uf, mode: 'insensitive' } })
  }

  // Carteira filter — now uses the explicit carteira field directly
  if (carteira) {
    and.push({ carteira: carteira as Carteira })
  }

  if (tipo) {
    and.push({ tipo })
  }

  if (and.length === 0) return {}
  return and.length === 1 ? and[0] : { AND: and }
}

// ─── Search where clause ────────────────────────────────────────────

export function buildSearchWhere(search: string): Prisma.ClienteWhereInput {
  if (!search) return {}

  return {
    OR: [
      { razaoSocial: { contains: search, mode: 'insensitive' } },
      { nomeFantasia: { contains: search, mode: 'insensitive' } },
      { cnpj: { contains: search } },
      { codigo: { contains: search } },
      { cidade: { contains: search, mode: 'insensitive' } },
      { vendedor: { contains: search, mode: 'insensitive' } },
      { email1: { contains: search, mode: 'insensitive' } },
      { bairro: { contains: search, mode: 'insensitive' } },
      { uf: { contains: search, mode: 'insensitive' } },
    ],
  }
}

// ─── Combine where clauses ──────────────────────────────────────────

export function combineWhere(
  ...clauses: Prisma.ClienteWhereInput[]
): Prisma.ClienteWhereInput {
  const parts = clauses.filter((w) => Object.keys(w).length > 0)
  if (parts.length === 0) return {}
  if (parts.length === 1) return parts[0]
  return { AND: parts }
}

// ─── Filter options (from visibility-only where) ────────────────────

export async function fetchFilterOptions(
  visibilityWhere: Prisma.ClienteWhereInput,
  role: Role,
  _userEmail?: string,
) {
  const [
    situacaoResult,
    vendedorResult,
    cidadeResult,
    ufResult,
    cityUfPairs,
    vendedorUsers,
  ] = await Promise.all([
    db.cliente.findMany({
      where: visibilityWhere,
      select: { situacaoCadastral: true },
      distinct: ['situacaoCadastral'],
    }),
    db.cliente.findMany({
      where: visibilityWhere,
      select: { vendedor: true },
      distinct: ['vendedor'],
    }),
    db.cliente.findMany({
      where: visibilityWhere,
      select: { cidade: true },
      distinct: ['cidade'],
    }),
    db.cliente.findMany({
      where: visibilityWhere,
      select: { uf: true },
      distinct: ['uf'],
    }),
    db.cliente.findMany({
      where: visibilityWhere,
      select: { cidade: true, uf: true },
      distinct: ['cidade', 'uf'],
    }),
    // Only real vendor users (no system users anymore)
    db.user.findMany({
      where: {
        active: true,
        role: { in: ['VENDEDOR', 'DIRETOR_COMERCIAL'] },
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true, email: true },
    }),
  ])

  const systemUserNames = new Set(['BOLSÃO', 'LISTA FRIA', 'FORNECEDOR'])

  const uniqueSituacaoCadastral = situacaoResult
    .map((r) => r.situacaoCadastral)
    .filter(Boolean)
    .sort()

  const uniqueVendedores = vendedorResult
    .map((r) => r.vendedor)
    .filter((v) => v && !systemUserNames.has(v.toUpperCase()))
    .sort()

  const uniqueCidades = cidadeResult
    .map((r) => r.cidade)
    .filter(Boolean)
    .sort()

  const uniqueUfs = ufResult
    .map((r) => r.uf)
    .filter(Boolean)
    .sort()

  // Build cidadesPorUf (cascading filter)
  const cidadesPorUf: Record<string, string[]> = {}
  for (const r of cityUfPairs) {
    if (r.uf && r.cidade) {
      if (!cidadesPorUf[r.uf]) cidadesPorUf[r.uf] = []
      if (!cidadesPorUf[r.uf].includes(r.cidade)) cidadesPorUf[r.uf].push(r.cidade)
    }
  }
  for (const ufKey of Object.keys(cidadesPorUf)) {
    cidadesPorUf[ufKey].sort()
  }

  // Available carteiras based on user role
  const availableCarteiras = ['COM_VENDEDOR', 'BOLSAO', 'SEM_VENDEDOR']
  if (canSeeListaFria(role)) availableCarteiras.push('LISTA_FRIA')
  if (canSeeFornecedor(role)) availableCarteiras.push('FORNECEDOR')

  return {
    situacao_cadastral: uniqueSituacaoCadastral,
    vendedores: uniqueVendedores,
    cidades: uniqueCidades,
    ufs: uniqueUfs,
    cidadesPorUf,
    carteiras: availableCarteiras,
    vendedorUsers: vendedorUsers.map((v) => ({
      id: v.id,
      name: v.name,
      role: v.role,
      email: v.email,
    })),
  }
}

// ─── Stats (from visibility-only where, no search/filter) ───────────

export async function fetchStats(
  role: Role,
  userId: string,
) {
  const isVendedor = role === 'VENDEDOR'

  // Stats base where: own clients for VENDEDOR, all for others
  const statsBaseWhere: Prisma.ClienteWhereInput = isVendedor
    ? { vendedorId: userId }
    : {}

  const [
    situacaoGroup,
    diasRecords,
    comVendedorCount,
    bolsaoCount,
    listaFriaCount,
    fornecedoresCount,
    tipoGroup,
    totalCount,
  ] = await Promise.all([
    // situacaoCadastral stats
    db.cliente.groupBy({
      by: ['situacaoCadastral'],
      where: statsBaseWhere,
      _count: true,
    }),
    // dias_sem_venda: fetch only ultimaVenda for non-fornecedor records
    db.cliente.findMany({
      where: { ...statsBaseWhere, fornecedor: false },
      select: { ultimaVenda: true },
    }),
    // carteira: com_vendedor
    db.cliente.count({
      where: isVendedor
        ? { vendedorId: userId, fornecedor: false, carteira: 'COM_VENDEDOR' }
        : { carteira: 'COM_VENDEDOR', fornecedor: false },
    }),
    // carteira: bolsao
    db.cliente.count({
      where: { carteira: 'BOLSAO', fornecedor: false },
    }),
    // carteira: lista_fria (0 for VENDEDOR)
    isVendedor
      ? Promise.resolve(0)
      : db.cliente.count({
          where: { carteira: 'LISTA_FRIA', fornecedor: false },
        }),
    // carteira: fornecedores (0 for VENDEDOR)
    isVendedor
      ? Promise.resolve(0)
      : db.cliente.count({
          where: {
            OR: [{ fornecedor: true }, { carteira: 'FORNECEDOR' }],
          },
        }),
    // tipo stats (non-fornecedor only)
    db.cliente.groupBy({
      by: ['tipo'],
      where: { ...statsBaseWhere, fornecedor: false },
      _count: true,
    }),
    // total non-fornecedor
    db.cliente.count({
      where: { ...statsBaseWhere, fornecedor: false },
    }),
  ])

  // Process situacaoCadastral stats
  const situacaoCadastralStats: Record<string, number> = {}
  for (const g of situacaoGroup) {
    const key = g.situacaoCadastral || 'Sem info'
    situacaoCadastralStats[key] = g._count
  }

  // Process dias_sem_venda stats
  let verde = 0, amarelo = 0, laranja = 0, vermelho = 0
  for (const r of diasRecords) {
    const dias = calcDiasSemVenda(r.ultimaVenda)
    if (dias === null) { vermelho++; continue }
    if (dias <= 45) verde++
    else if (dias <= 90) amarelo++
    else if (dias <= 150) laranja++
    else vermelho++
  }

  // Process tipo stats
  let revendas = 0, corporativo = 0
  for (const g of tipoGroup) {
    if (g.tipo === 'CORPORATIVO') corporativo += g._count
    else revendas += g._count
  }

  return {
    total: totalCount,
    situacao_cadastral: situacaoCadastralStats,
    dias_sem_venda: { verde, amarelo, laranja, vermelho },
    carteira: {
      com_vendedor: comVendedorCount,
      bolsao: bolsaoCount,
      lista_fria: listaFriaCount as number,
      fornecedores: fornecedoresCount as number,
    },
    tipo: { revendas, corporativo },
  }
}

// ─── Computed-sort handler (dias_sem_venda only — carteira is now a DB field) ───

export async function handleComputedSort(params: {
  fullWhere: Prisma.ClienteWhereInput
  sortBy: string
  sortOrder: string
  page: number
  limit: number
  showAll: boolean
}): Promise<{ records: ClienteRecord[]; total: number }> {
  const { fullWhere, sortBy, sortOrder, page, limit, showAll } = params

  // Fetch minimal fields for all matching records to compute sort key
  const minimalRecords = await db.cliente.findMany({
    where: fullWhere,
    select: {
      id: true,
      ultimaVenda: true,
    },
  })

  const total = minimalRecords.length

  // Compute the sort field and sort
  let sortedIds: string[]

  if (sortBy === 'dias_sem_venda') {
    const withDias = minimalRecords.map((r) => ({
      id: r.id,
      dias: calcDiasSemVenda(r.ultimaVenda),
    }))
    withDias.sort((a, b) => {
      if (a.dias === null && b.dias === null) return 0
      if (a.dias === null) return sortOrder === 'asc' ? 1 : -1
      if (b.dias === null) return sortOrder === 'asc' ? -1 : 1
      const cmp = a.dias - b.dias
      return sortOrder === 'desc' ? -cmp : cmp
    })
    sortedIds = withDias.map((r) => r.id)
  } else {
    sortedIds = minimalRecords.map((r) => r.id)
  }

  // Paginate the sorted IDs
  const start = showAll ? 0 : (page - 1) * limit
  const pageIds = showAll ? sortedIds : sortedIds.slice(start, start + limit)

  if (pageIds.length === 0) {
    return { records: [], total }
  }

  // Fetch full records for just the page
  const fullRecords = await db.cliente.findMany({
    where: { id: { in: pageIds } },
  })

  // Restore the computed sort order
  const idOrder = new Map(pageIds.map((id, i) => [id, i]))
  fullRecords.sort((a, b) => idOrder.get(a.id)! - idOrder.get(b.id)!)

  // Convert to ClienteRecord — carteira now comes from the DB field
  const records = fullRecords.map((c) => {
    const record = dbToRecord(c)
    record.carteira = c.carteira
    return record
  })

  return { records, total }
}
