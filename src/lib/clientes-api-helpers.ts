/**
 * Shared helpers for the Clientes API endpoints.
 *
 * Used by both /api/clientes and /api/clientes/filtros to avoid
 * duplicating Prisma where-clause construction and filter/stats logic.
 */

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { calcDiasSemVenda } from '@/lib/clientes'
import { dbToRecord } from '@/lib/clientes-cache'
import {
  canSeeAllClients,
  canSeeListaFria,
  canSeeFornecedor,
  computeCarteira,
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
}

export const COMPUTED_SORT_FIELDS = new Set(['dias_sem_venda', 'carteira'])

// ─── Visibility where clause ────────────────────────────────────────

export function buildVisibilityWhere(
  role: Role,
  userId: string,
  userEmail: string,
  systemUserIds: { bolsao: string; listaFria: string; fornecedor: string },
): Prisma.ClienteWhereInput {
  if (canSeeAllClients(role)) return {}

  // VENDEDOR visibility
  const orConditions: Prisma.ClienteWhereInput[] = [
    { vendedorId: userId },                     // own clients
    { vendedorId: systemUserIds.bolsao },       // bolsão — all vendedores can see
  ]

  if (canSeeListaFria(role)) {
    orConditions.push({ vendedorId: systemUserIds.listaFria })
  }
  if (canSeeFornecedor(role, userEmail)) {
    orConditions.push({ vendedorId: systemUserIds.fornecedor })
  }

  return {
    AND: [
      { OR: orConditions },
      // Fornecedor-flagged clients hidden unless in FORNECEDOR carteira
      { OR: [{ fornecedor: false }, { vendedorId: systemUserIds.fornecedor }] },
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
  systemUserIds: { bolsao: string; listaFria: string; fornecedor: string }
  systemUserIdList: string[]
}): Prisma.ClienteWhereInput {
  const {
    situacaoCadastral, vendedor, cidade, uf,
    carteira, tipo, role, systemUserIds, systemUserIdList,
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

  // Carteira filter via vendedorId (carteira is computed, not stored)
  if (carteira) {
    if (carteira === 'COM_VENDEDOR') {
      and.push({ vendedorId: { not: null, notIn: systemUserIdList } })
    } else if (carteira === 'BOLSAO') {
      and.push({ vendedorId: systemUserIds.bolsao })
    } else if (carteira === 'LISTA_FRIA') {
      and.push({ vendedorId: systemUserIds.listaFria })
    } else if (carteira === 'FORNECEDOR') {
      and.push({ vendedorId: systemUserIds.fornecedor })
    } else if (carteira === 'SEM_VENDEDOR') {
      and.push({ vendedorId: null })
    }
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
  userEmail: string,
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
    // Single query for both vendedor + system users (merged & deduplicated)
    db.user.findMany({
      where: {
        active: true,
        OR: [
          { role: { in: ['VENDEDOR', 'DIRETOR_COMERCIAL'] } },
          { isSystemUser: true },
        ],
      },
      orderBy: [{ isSystemUser: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, role: true, isSystemUser: true, email: true },
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
  if (canSeeFornecedor(role, userEmail)) availableCarteiras.push('FORNECEDOR')

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
      isSystemUser: v.isSystemUser,
      email: v.email,
    })),
  }
}

// ─── Stats (from visibility-only where, no search/filter) ───────────

export async function fetchStats(
  role: Role,
  userId: string,
  systemUserIds: { bolsao: string; listaFria: string; fornecedor: string },
) {
  const isVendedor = role === 'VENDEDOR'
  const systemUserIdList = [systemUserIds.bolsao, systemUserIds.listaFria, systemUserIds.fornecedor]

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
    // situacaoCadastral stats (includes fornecedor records for non-VENDEDOR)
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
        ? { vendedorId: userId, fornecedor: false }
        : { vendedorId: { not: null, notIn: systemUserIdList }, fornecedor: false },
    }),
    // carteira: bolsao
    db.cliente.count({
      where: { vendedorId: systemUserIds.bolsao, fornecedor: false },
    }),
    // carteira: lista_fria (0 for VENDEDOR)
    isVendedor
      ? Promise.resolve(0)
      : db.cliente.count({
          where: { vendedorId: systemUserIds.listaFria, fornecedor: false },
        }),
    // carteira: fornecedores (0 for VENDEDOR)
    isVendedor
      ? Promise.resolve(0)
      : db.cliente.count({
          where: {
            OR: [{ fornecedor: true }, { vendedorId: systemUserIds.fornecedor }],
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

  // Process dias_sem_venda stats (0-45 verde, 46-90 amarelo, 91-150 laranja, 151+ vermelho)
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

// ─── Computed-sort handler (dias_sem_venda, carteira) ───────────────

export async function handleComputedSort(params: {
  fullWhere: Prisma.ClienteWhereInput
  sortBy: string
  sortOrder: string
  page: number
  limit: number
  showAll: boolean
  systemUserIds: { bolsao: string; listaFria: string; fornecedor: string }
}): Promise<{ records: ClienteRecord[]; total: number }> {
  const { fullWhere, sortBy, sortOrder, page, limit, showAll, systemUserIds } = params

  // Fetch minimal fields for all matching records to compute sort key
  const minimalRecords = await db.cliente.findMany({
    where: fullWhere,
    select: {
      id: true,
      ultimaVenda: true,
      vendedorId: true,
      tipo: true,
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
      // null sorts last in asc, first in desc
      if (a.dias === null && b.dias === null) return 0
      if (a.dias === null) return sortOrder === 'asc' ? 1 : -1
      if (b.dias === null) return sortOrder === 'asc' ? -1 : 1
      const cmp = a.dias - b.dias
      return sortOrder === 'desc' ? -cmp : cmp
    })
    sortedIds = withDias.map((r) => r.id)
  } else {
    // carteira
    const withCarteira = minimalRecords.map((r) => ({
      id: r.id,
      carteira: computeCarteira(r.vendedorId, r.tipo, systemUserIds),
    }))
    withCarteira.sort((a, b) => {
      const cmp = a.carteira.localeCompare(b.carteira, 'pt-BR')
      return sortOrder === 'desc' ? -cmp : cmp
    })
    sortedIds = withCarteira.map((r) => r.id)
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

  // Restore the computed sort order (findMany may return in different order)
  const idOrder = new Map(pageIds.map((id, i) => [id, i]))
  fullRecords.sort((a, b) => idOrder.get(a.id)! - idOrder.get(b.id)!)

  // Convert to ClienteRecord with carteira computed
  const records = fullRecords.map((c) => {
    const record = dbToRecord(c)
    record.carteira = computeCarteira(c.vendedorId, c.tipo, systemUserIds)
    return record
  })

  return { records, total }
}
