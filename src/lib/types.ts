// ─── Shared Types & Constants ─────────────────────
// This module must NOT import Node.js-specific modules (fs, path, etc.)
// since it is imported from client-side code too.

import type React from 'react'
import {
  Phone,
  Briefcase,
  MapPin,
  Building2,
  StickyNote,
  Clock,
} from 'lucide-react'

// ─── Interfaces ───────────────────────────────────

export interface ParsedFields {
  codigo: string
  ie_rg: string
  celular: string
  fax: string
  cadastro: string
  ultima_venda: string
  reg_simples: string
  vendedor: string
  data_atribuicao_vendedor: string
  [key: string]: string
}

export interface EditableFields {
  telefone1: string
  telefone2: string
  telefone3: string
  telefone4: string
  email1: string
  email2: string
  email3: string
  pessoaContato: string
  observacoes: string
  endereco: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  cep: string
  uf: string
}

export interface ClienteRecord {
  razao_social: string
  nome_fantasia: string
  situacao_cadastral: string
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
  pessoa_contato: string
  data_situacao: string
  data_abertura: string
  cnae_principal: string
  natureza_juridica: string
  porte: string
  tipo: string              // "REVENDA" | "CORPORATIVO"
  fornecedor: boolean       // true = fornecedor (não é cliente real, vendedores não veem)
  carteira: string          // computed: "COM_VENDEDOR" | "BOLSAO" | "LISTA_FRIA" | "FORNECEDOR" | "SEM_VENDEDOR"
  vendedor_id: string       // system-assigned vendor user ID
  parsed: ParsedFields
  editable: EditableFields
}

export interface ApiResponse {
  data: ClienteRecord[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    showAll: boolean
  }
  filters: {
    situacao_cadastral: string[]
    vendedores: string[]
    cidades: string[]
    ufs: string[]
    cidadesPorUf: Record<string, string[]>
    carteiras: string[]
    vendedorUsers: { id: string; name: string; role: string; email: string }[]
  }
  stats: {
    total: number
    situacao_cadastral: Record<string, number>
    dias_sem_venda: {
      verde: number    // 0–45 dias
      amarelo: number  // 46–90 dias
      laranja: number  // 91–150 dias
      vermelho: number // 151+ dias
    }
    carteira: {
      com_vendedor: number
      bolsao: number
      lista_fria: number
      fornecedores: number
    }
    tipo: {
      revendas: number
      corporativo: number
    }
  }
}

export interface AuditLogEntry {
  id: string
  codigo: string
  field: string
  oldValue: string
  newValue: string
  changedBy: string
  createdAt: string
}

export interface NewClientForm {
  cnpj: string
  ieRg: string
  razaoSocial: string
  nomeFantasia: string
  situacaoCadastral: string
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
  dataAbertura: string
  cnaePrincipal: string
  naturezaJuridica: string
  porte: string
  regSimples: string
  vendedor: string
  tipo: string   // "REVENDA" | "CORPORATIVO"
}

// ─── Column definitions ────────────────────────────

export interface ColumnDef {
  key: string
  label: string
  editable?: boolean
  sticky?: 'left'
  stickyOffset?: number
  minWidth?: string
  numericSort?: boolean
  centered?: boolean
}

export const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'codigo', label: 'Código', sticky: 'left', stickyOffset: 0, minWidth: '90px' },
  { key: 'razao_social', label: 'Razão Social', sticky: 'left', stickyOffset: 90, minWidth: '220px' },
  { key: 'cnpj', label: 'CNPJ', minWidth: '150px' },
  { key: 'dias_sem_venda', label: 'Dias S/ Venda', minWidth: '110px', numericSort: true, centered: true },
  { key: 'pessoa_contato', label: 'Contato', editable: true, minWidth: '140px' },
  { key: 'telefone1', label: 'Tel. 1', editable: true, minWidth: '140px' },
  { key: 'telefone2', label: 'Tel. 2', editable: true, minWidth: '140px' },
  { key: 'telefone3', label: 'Tel. 3', editable: true, minWidth: '140px' },
  { key: 'email1', label: 'Email 1', editable: true, minWidth: '160px' },
  { key: 'email2', label: 'Email 2', editable: true, minWidth: '140px' },
  { key: 'email3', label: 'Email 3', editable: true, minWidth: '140px' },
  { key: 'vendedor', label: 'Vendedora', minWidth: '140px' },
  { key: 'tipo', label: 'Tipo', minWidth: '110px' },
  { key: 'carteira', label: 'Carteira', minWidth: '130px' },
  { key: 'situacao_cadastral', label: 'Sit. Cadastral', minWidth: '120px' },
  { key: 'nome_fantasia', label: 'Nome Fantasia', minWidth: '160px' },
  { key: 'ie_rg', label: 'IE/RG', minWidth: '100px' },
  { key: 'reg_simples', label: 'Reg. Simples', minWidth: '90px' },
  { key: 'observacoes', label: 'Obs.', editable: true, minWidth: '120px' },
  { key: 'telefone4', label: 'Tel. 4', editable: true, minWidth: '140px' },
  { key: 'endereco', label: 'Endereço', minWidth: '180px' },
  { key: 'numero', label: 'Número', minWidth: '70px' },
  { key: 'complemento', label: 'Complemento', minWidth: '110px' },
  { key: 'bairro', label: 'Bairro', minWidth: '130px' },
  { key: 'cidade', label: 'Cidade', minWidth: '120px' },
  { key: 'cep', label: 'CEP', minWidth: '90px' },
  { key: 'uf', label: 'Estado', minWidth: '80px' },
  { key: 'data_situacao', label: 'Data Situação', minWidth: '100px' },
  { key: 'data_abertura', label: 'Data Abertura', minWidth: '100px' },
  { key: 'cnae_principal', label: 'CNAE Principal', minWidth: '200px' },
  { key: 'natureza_juridica', label: 'Natureza Jurídica', minWidth: '160px' },
  { key: 'porte', label: 'Porte', minWidth: '100px' },
  { key: 'cadastro', label: 'Cadastro', minWidth: '100px' },
  { key: 'ultima_venda', label: 'Última Venda', minWidth: '100px' },
]

export const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

// ─── New Client Form defaults ─────────────────────

export const EMPTY_FORM: NewClientForm = {
  cnpj: '', ieRg: '', razaoSocial: '', nomeFantasia: '', situacaoCadastral: '',
  endereco: '', numero: '', complemento: '', bairro: '', cidade: '', cep: '', uf: '',
  telefone1: '', telefone2: '', telefone3: '', telefone4: '',
  email1: '', email2: '', email3: '', pessoaContato: '',
  dataAbertura: '', cnaePrincipal: '', naturezaJuridica: '', porte: '',
  regSimples: '', vendedor: '', tipo: 'REVENDA',
}

// ─── Detail Modal Tabs ────────────────────────────

export type DetailTab = 'contato' | 'comercial' | 'endereco' | 'fiscal' | 'obs' | 'historico'

export const DETAIL_TABS: { key: DetailTab; label: string; icon: React.ElementType }[] = [
  { key: 'contato', label: 'Contato', icon: Phone },
  { key: 'comercial', label: 'Comercial', icon: Briefcase },
  { key: 'endereco', label: 'Endereço', icon: MapPin },
  { key: 'fiscal', label: 'Fiscal', icon: Building2 },
  { key: 'obs', label: 'Obs.', icon: StickyNote },
  { key: 'historico', label: 'Histórico', icon: Clock },
]

// ─── Field constants ──────────────────────────────

export const PHONE_FIELDS = new Set(['telefone1', 'telefone2', 'telefone3', 'telefone4'])

export const EMAIL_FIELDS = new Set(['email1', 'email2', 'email3'])

export const FIELD_LABELS: Record<string, string> = {
  telefone1: 'Tel. 1',
  telefone2: 'Tel. 2',
  telefone3: 'Tel. 3',
  telefone4: 'Tel. 4',
  email1: 'Email 1',
  email2: 'Email 2',
  email3: 'Email 3',
  pessoaContato: 'Contato',
  observacoes: 'Observações',
  endereco: 'Endereço',
  numero: 'Número',
  complemento: 'Complemento',
  bairro: 'Bairro',
  cidade: 'Cidade',
  cep: 'CEP',
  uf: 'Estado',
}
