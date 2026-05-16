// ─── Vendas (NF-e) Types & Constants ─────────────────
// Shared types for the Vendas module
// This module must NOT import Node.js-specific modules

// ─── Interfaces ───────────────────────────────────

export interface VendaItemRecord {
  id: string
  vendaId: string
  item: number
  codigoProduto: string
  descricao: string
  unidade: string
  quantidade: number
  precoVenda: number
  valorDesconto: number
  valorCusto: number
  valorTotal: number
  vendedor: string
  ncm: string
  cfop: string
}

export interface VendaRecord {
  id: string
  linvixId: number
  uuid: string
  faturamento: number
  numeroPedido: number
  numero: string
  serie: string
  clienteCodigo: string
  finalidade: string
  situacao: string
  valorTotal: number
  dataEmissao: string | null
  dataSaida: string | null
  operador: string
  naturezaOperacao: string
  emitente: string
  chave: string
  transportadora: string
  devolvido: boolean
  observacoes: string
  valorVenda: number
  valorPago: number
  valorProdutos: number
  valorFrete: number
  valorDesconto: number
  valorFinal: number
  formaPagamento: string
  source: string
  syncedAt: string
  createdAt: string
  updatedAt: string
  itens?: VendaItemRecord[]
}

export interface VendaListResponse {
  data: VendaRecord[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  stats: {
    totalVendido: number
    totalNotas: number
    autorizadas: number
    canceladas: number
    aguardando: number
  }
}

export interface VendaStatsResponse {
  totalVendidoMes: number
  totalNotasMes: number
  ticketMedio: number
  porVendedor: Array<{ vendedor: string; total: number; quantidade: number }>
  porDia: Array<{ data: string; total: number; quantidade: number }>
  topClientes: Array<{ codigo: string; nome: string; total: number; quantidade: number }>
}

// ─── Linvix NF-e API types (raw data from Linvix) ──

export interface LinvixNfeListRow {
  ID: string
  UUID: string
  FATURAMENTO: string
  NUMERO_PEDIDO: string
  NUMERO_OS: string
  NUMERO: string
  SERIE: string
  INFO_COMPLEMENTARES: string
  CLIENTE: string
  CLIENTE_NOME: string
  FANTASIA: string
  EMAIL_ENCAMINHADO: string
  CLIENTE_CODIGO_NOME: string
  FINALIDADE: string
  NFE_SITUACAO_STRING: string
  NFE_SITUACAO: string
  VALOR_TOT_NOTA: string
  DATA_HORA_EMISSAO: string
  DATA_HORA_SAIDA: string
  OPERADOR: string
  NATUREZA_OPERACAO: string
  EMITENTE_NOME: string
  NFE_CHAVE: string
  TRANSPORTADORA: string
  REPLICADA: string
  REPLICACAO: string
  TELEFONE: string
  CELULAR: string
  FAX: string
  NFE_REFERENCIADA: string
  DEVOLVIDO: string
  CONTAGEM: string
}

export interface LinvixNfeDetail {
  ID: number
  UUID: string
  NUMERO: string
  FATURAMENTO: number
  FATURAMENTO_DADOS: {
    NUMERO_PEDIDO: number | null
    NUMERO_OS: number | null
    TIPO: string
    SITUACAO: string
    DATA_HORA: string
  }
  NFE_CHAVE: string
  STATUS: string
  DADOS_NOTA: {
    OPERACAO: string
    FINALIDADE: string
    NATUREZA_OPERACAO: string
  }
  CLIENTE: {
    CODIGO: string
    NOME: string
    CNPJ_CNPF: string
    UF: string
  }
  TRANSPORTE: {
    MODALIDADE_FRETE: string
    TRANSPORTADORA: string
  }
  OBSERVACOES: {
    OBSERVACOES_INFO: string
    OBSERVACOES_FISCAL: string
  }
  PAGAMENTO_NOVO: {
    valor_venda: number
    valor_pago: number
    valor_prod: number
    valor_frete: number
    valor_desconto: number
    valor_final: number
    config_parcelamento_nome: string
  } | null
  PRODUTOS: Array<{
    ITEM: number
    CODIGO: string
    DESCRICAO: string
    UND: string
    QTD: number
    VENDEDOR: string
    PRECO_VENDA: number
    VALOR_DESCONTO_TOTAL: number
    VALOR_CUSTO_UNITARIO: number
    VALOR_TOTAL: number
    TRIBUTACAO: {
      COD_NCM: string
      ICMS: { CFOP: string }
    }
  }>
  VALOR_TOTAL_PRODUTOS: number
  VALOR_TOTAL_NOTA: number
  DATA_SAIDA: string
  DATA_EMISSAO: string
  _pedidoDetail?: {
    VENDEDOR: string
    DATA_HORA: string
  }
}

// ─── Constants ──────────────────────────────────────

export const SITUACAO_COLORS: Record<string, string> = {
  'AUTORIZADO': 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700',
  'CANCELAMENTO HOMOLOGADO': 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700',
  'AGUARDANDO EMISSÃO': 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700',
  'EMITIDA EM CONTINGÊNCIA': 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-700',
}

export const SITUACAO_LABELS: Record<string, string> = {
  'AUTORIZADO O USO DA NF-E': 'Autorizada',
  'CANCELAMENTO HOMOLOGADO': 'Cancelada',
  'AGUARDANDO EMISSÃO': 'Aguardando',
  'EMITIDA EM CONTINGÊNCIA': 'Contingência',
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDateSafe(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  } catch {
    return dateStr
  }
}

export function formatDateTimeSafe(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('pt-BR', { 
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return dateStr
  }
}
