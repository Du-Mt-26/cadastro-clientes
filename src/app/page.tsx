'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import {
  Search,
  Users,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Building2,
  RefreshCw,
  AlertTriangle,
  PauseCircle,
  FileX2,
  LayoutGrid,
  Download,
  Pencil,
  ArrowUpAZ,
  ArrowDownZA,
  ArrowUpDown,
} from 'lucide-react'

interface ParsedFields {
  codigo: string
  ie_rg: string
  celular: string
  fax: string
  cadastro: string
  ultima_venda: string
  reg_simples: string
  vendedor: string
}

interface EditableFields {
  telefone1: string
  telefone2: string
  telefone3: string
  telefone4: string
  email1: string
  email2: string
  email3: string
  pessoaContato: string
}

interface ClienteRecord {
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
  parsed: ParsedFields
  editable: EditableFields
}

interface ApiResponse {
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
  }
  stats: {
    total: number
    situacao_cadastral: Record<string, number>
  }
}

// Column definition for sortable headers
interface ColumnDef {
  key: string
  label: string
  editable?: boolean
}

const COLUMNS: ColumnDef[] = [
  { key: 'codigo', label: 'Código' },
  { key: 'ie_rg', label: 'IE/RG' },
  { key: 'razao_social', label: 'Razão Social' },
  { key: 'nome_fantasia', label: 'Nome Fantasia' },
  { key: 'situacao_cadastral', label: 'Sit. Cadastral' },
  { key: 'cnpj', label: 'CNPJ' },
  { key: 'endereco', label: 'Endereço' },
  { key: 'numero', label: 'Número' },
  { key: 'complemento', label: 'Complemento' },
  { key: 'bairro', label: 'Bairro' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'cep', label: 'CEP' },
  { key: 'uf', label: 'UF' },
  { key: 'telefone1', label: 'Telefone 1', editable: true },
  { key: 'telefone2', label: 'Telefone 2', editable: true },
  { key: 'telefone3', label: 'Telefone 3', editable: true },
  { key: 'telefone4', label: 'Telefone 4', editable: true },
  { key: 'email1', label: 'Email 1', editable: true },
  { key: 'email2', label: 'Email 2', editable: true },
  { key: 'email3', label: 'Email 3', editable: true },
  { key: 'pessoa_contato', label: 'Pessoa Contato', editable: true },
  { key: 'data_situacao', label: 'Data Situação' },
  { key: 'data_abertura', label: 'Data Abertura' },
  { key: 'cnae_principal', label: 'CNAE Principal' },
  { key: 'natureza_juridica', label: 'Natureza Jurídica' },
  { key: 'porte', label: 'Porte' },
  { key: 'cadastro', label: 'Cadastro' },
  { key: 'ultima_venda', label: 'Última Venda' },
  { key: 'reg_simples', label: 'Reg. Simples' },
  { key: 'vendedor', label: 'Vendedor' },
]

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

// Phone formatting: (XX) XXXXX-XXXX or (XX) XXXX-XXXX or 0800-NNN-NNNN
function formatPhone(raw: string): string {
  if (!raw) return ''
  // Strip all non-digit chars
  const digits = raw.replace(/\D/g, '')
  
  // 0800 format: 0800-NNN-NNNN (11 digits starting with 0800)
  if (digits.startsWith('0800') && digits.length >= 11) {
    return `0800-${digits.slice(4, 7)}-${digits.slice(7, 11)}`
  }
  if (digits.startsWith('0800') && digits.length >= 7) {
    return `0800-${digits.slice(4, 7)}`
  }
  
  // Celular: (XX) XXXXX-XXXX — 11 digits (DDD 2 + 9 digit number starting with 9)
  if (digits.length === 11 && digits[2] === '9') {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
  }
  
  // Fixo: (XX) XXXX-XXXX — 10 digits (DDD 2 + 8 digit number starting with 3)
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 10)}`
  }
  
  // 9 digits only (no DDD, celular)
  if (digits.length === 9 && digits[0] === '9') {
    return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`
  }
  
  // 8 digits only (no DDD, fixo)
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}`
  }
  
  // Fallback: return original
  return raw
}

// Get raw value from a record for a given column key
function getRecordValue(r: ClienteRecord, key: string): string {
  const map: Record<string, string> = {
    codigo: r.parsed.codigo,
    ie_rg: r.parsed.ie_rg,
    razao_social: r.razao_social,
    nome_fantasia: r.nome_fantasia,
    situacao_cadastral: r.situacao_cadastral,
    cnpj: r.cnpj,
    endereco: r.endereco,
    numero: r.numero,
    complemento: r.complemento,
    bairro: r.bairro,
    cidade: r.cidade,
    cep: r.cep,
    uf: r.uf,
    telefone1: r.telefone1,
    telefone2: r.telefone2,
    telefone3: r.telefone3,
    telefone4: r.telefone4,
    email1: r.email1,
    email2: r.email2,
    email3: r.email3,
    pessoa_contato: r.pessoa_contato,
    data_situacao: r.data_situacao,
    data_abertura: r.data_abertura,
    cnae_principal: r.cnae_principal,
    natureza_juridica: r.natureza_juridica,
    porte: r.porte,
    cadastro: r.parsed.cadastro,
    ultima_venda: r.parsed.ultima_venda,
    reg_simples: r.parsed.reg_simples,
    vendedor: r.parsed.vendedor,
  }
  return map[key] || ''
}

// Map column key to EditableFields key
function toEditableKey(key: string): keyof EditableFields | null {
  const map: Record<string, keyof EditableFields> = {
    telefone1: 'telefone1',
    telefone2: 'telefone2',
    telefone3: 'telefone3',
    telefone4: 'telefone4',
    email1: 'email1',
    email2: 'email2',
    email3: 'email3',
    pessoa_contato: 'pessoaContato',
  }
  return map[key] || null
}

// Phone fields set
const PHONE_FIELDS = new Set(['telefone1', 'telefone2', 'telefone3', 'telefone4'])

function SituacaoCadastralBadge({ value }: { value: string }) {
  if (!value) return <span className="text-slate-400">—</span>
  const lower = value.toLowerCase()
  if (lower === 'ativa') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 text-xs">
        <CheckCircle2 className="size-3 mr-1" />
        ATIVA
      </Badge>
    )
  }
  if (lower === 'baixada') {
    return (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200 text-xs">
        <FileX2 className="size-3 mr-1" />
        BAIXADA
      </Badge>
    )
  }
  if (lower === 'inapta') {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 text-xs">
        <AlertTriangle className="size-3 mr-1" />
        INAPTA
      </Badge>
    )
  }
  if (lower === 'suspensa') {
    return (
      <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 border-orange-200 text-xs">
        <PauseCircle className="size-3 mr-1" />
        SUSPENSA
      </Badge>
    )
  }
  return <Badge variant="outline" className="text-xs">{value}</Badge>
}

// Editable cell component
function EditableCell({
  value,
  codigo,
  field,
  onSave,
  isPhone,
}: {
  value: string
  codigo: string
  field: keyof EditableFields
  onSave: (codigo: string, field: keyof EditableFields, value: string) => void
  isPhone: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditValue(value)
  }, [value])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleSave = () => {
    if (editValue !== value) {
      onSave(codigo, field, editValue)
    }
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setEditValue(value)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-7 text-xs w-full min-w-[100px] border-teal-400 focus:border-teal-600"
        placeholder={isPhone ? '(XX) XXXXX-XXXX' : ''}
      />
    )
  }

  const displayValue = isPhone ? formatPhone(value) : (value || '—')

  return (
    <span
      className="cursor-pointer group flex items-center gap-1"
      onClick={() => setEditing(true)}
      title="Clique para editar"
    >
      <span className="text-xs">{displayValue}</span>
      <Pencil className="size-2.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </span>
  )
}

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [situacaoCadastral, setSituacaoCadastral] = useState('all')
  const [vendedor, setVendedor] = useState('all')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<string>('50')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const tableContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams()
    if (situacaoCadastral && situacaoCadastral !== 'all')
      params.set('situacao_cadastral', situacaoCadastral)
    if (vendedor && vendedor !== 'all')
      params.set('vendedor', vendedor)
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (sortBy) {
      params.set('sort_by', sortBy)
      params.set('sort_order', sortOrder)
    }
    return params
  }, [situacaoCadastral, vendedor, debouncedSearch, sortBy, sortOrder])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = buildFilterParams()
      params.set('page', page.toString())
      params.set('limit', limit)

      const res = await fetch(`/api/clientes?${params.toString()}`)
      const json = await res.json()
      setData(json)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }, [page, limit, buildFilterParams])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0
    }
  }, [page])

  const handleSort = (key: string) => {
    if (sortBy === key) {
      if (sortOrder === 'asc') {
        setSortOrder('desc')
      } else {
        // Third click: remove sort
        setSortBy('')
        setSortOrder('asc')
      }
    } else {
      setSortBy(key)
      setSortOrder('asc')
    }
    setPage(1)
  }

  const handleLimitChange = (val: string) => {
    setLimit(val)
    setPage(1)
  }

  const handleSave = async (codigo: string, field: keyof EditableFields, value: string) => {
    setSaving(codigo + field)
    try {
      const res = await fetch('/api/clientes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, [field]: value }),
      })
      if (!res.ok) throw new Error('Erro ao salvar')

      // Update local data
      if (data) {
        setData({
          ...data,
          data: data.data.map((r) =>
            r.parsed.codigo === codigo
              ? {
                  ...r,
                  [field === 'pessoaContato' ? 'pessoa_contato' : field]: value,
                  editable: { ...r.editable, [field]: value },
                }
              : r
          ),
        })
      }
    } catch (error) {
      console.error('Error saving:', error)
    } finally {
      setSaving(null)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = buildFilterParams()
      const res = await fetch(`/api/clientes/export?${params.toString()}`)
      if (!res.ok) throw new Error('Erro na exportação')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Cadastro_Clientes_Mtech_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting:', error)
    } finally {
      setExporting(false)
    }
  }

  const totalPages = data?.pagination.totalPages ?? 0
  const scStats = data?.stats.situacao_cadastral ?? {}
  const showingAll = limit === 'all'

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-md">
                <Building2 className="size-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Cadastro de Clientes
                </h1>
                <p className="text-sm text-slate-500">
                  Mtech Geral — Ativos e Inativos
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting}
                className="bg-teal-600 text-white hover:bg-teal-700 border-teal-600"
              >
                <Download className={`size-4 mr-1.5 ${exporting ? 'animate-bounce' : ''}`} />
                {exporting ? 'Exportando...' : 'Exportar XLSX'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                disabled={loading}
              >
                <RefreshCw className={`size-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-[1800px] mx-auto w-full px-4 sm:px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-2">
              <div className="flex items-center justify-center size-9 rounded-lg bg-slate-100 text-slate-600 shrink-0">
                <Users className="size-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-lg font-bold text-slate-900">
                  {data?.stats.total.toLocaleString('pt-BR') ?? '—'}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-2">
              <div className="flex items-center justify-center size-9 rounded-lg bg-emerald-100 text-emerald-600 shrink-0">
                <CheckCircle2 className="size-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Ativa</p>
                <p className="text-lg font-bold text-emerald-700">
                  {(scStats['ATIVA'] ?? 0).toLocaleString('pt-BR')}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-2">
              <div className="flex items-center justify-center size-9 rounded-lg bg-red-100 text-red-600 shrink-0">
                <FileX2 className="size-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Baixada</p>
                <p className="text-lg font-bold text-red-700">
                  {(scStats['BAIXADA'] ?? 0).toLocaleString('pt-BR')}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-2">
              <div className="flex items-center justify-center size-9 rounded-lg bg-amber-100 text-amber-600 shrink-0">
                <AlertTriangle className="size-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Inapta</p>
                <p className="text-lg font-bold text-amber-700">
                  {(scStats['INAPTA'] ?? 0).toLocaleString('pt-BR')}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-2">
              <div className="flex items-center justify-center size-9 rounded-lg bg-orange-100 text-orange-600 shrink-0">
                <PauseCircle className="size-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Suspensa</p>
                <p className="text-lg font-bold text-orange-700">
                  {(scStats['SUSPENSA'] ?? 0).toLocaleString('pt-BR')}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-2">
              <div className="flex items-center justify-center size-9 rounded-lg bg-teal-100 text-teal-600 shrink-0">
                <LayoutGrid className="size-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Página</p>
                <p className="text-lg font-bold text-teal-700">
                  {showingAll ? 'Todos' : `${page}/${totalPages || 1}`}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Edit hint */}
        <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
          <Pencil className="size-3" />
          <span>Clique nos campos de <strong>telefone, email e pessoa de contato</strong> para editar</span>
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  placeholder="Buscar por razão social, CNPJ, código, cidade, vendedor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={situacaoCadastral}
                onValueChange={(val) => {
                  setSituacaoCadastral(val)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Situação Cadastral" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Situação Cadastral</SelectItem>
                  {data?.filters.situacao_cadastral.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={vendedor}
                onValueChange={(val) => {
                  setVendedor(val)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Vendedores</SelectItem>
                  {data?.filters.vendedores.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={limit}
                onValueChange={handleLimitChange}
              >
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Por página" />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={String(n)} value={String(n)}>
                      {n} por página
                    </SelectItem>
                  ))}
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Data Table */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div
              ref={tableContainerRef}
              className="overflow-auto custom-scrollbar"
              style={{ maxHeight: showingAll ? '80vh' : '60vh', minHeight: '200px' }}
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50 sticky top-0 z-[5]">
                    {COLUMNS.map((col) => {
                      const isActive = sortBy === col.key
                      const isEditable = col.editable
                      const headerBg = isEditable ? 'bg-teal-50' : 'bg-slate-50'
                      const headerText = isEditable ? 'text-teal-700' : 'text-slate-700'
                      const borderClass = isEditable ? 'border-b-2 border-teal-300' : ''

                      return (
                        <TableHead
                          key={col.key}
                          className={`font-semibold ${headerText} text-xs ${headerBg} ${borderClass} cursor-pointer select-none hover:bg-slate-100 transition-colors`}
                          onClick={() => handleSort(col.key)}
                        >
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            {col.label}
                            {isEditable && ' ✏️'}
                            {isActive ? (
                              sortOrder === 'asc' ? (
                                <ArrowUpAZ className="size-3.5 text-teal-600 shrink-0" />
                              ) : (
                                <ArrowDownZA className="size-3.5 text-teal-600 shrink-0" />
                              )
                            ) : (
                              <ArrowUpDown className="size-3 text-slate-300 shrink-0" />
                            )}
                          </span>
                        </TableHead>
                      )
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: COLUMNS.length }).map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-3 bg-slate-100 rounded animate-pulse w-16" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data?.data && data.data.length > 0 ? (
                    data.data.map((r, idx) => (
                      <TableRow key={idx} className="hover:bg-slate-50/80">
                        {COLUMNS.map((col) => {
                          const val = getRecordValue(r, col.key)
                          const editableKey = toEditableKey(col.key)

                          // Special rendering for situacao_cadastral
                          if (col.key === 'situacao_cadastral') {
                            return (
                              <TableCell key={col.key} className="whitespace-nowrap">
                                <SituacaoCadastralBadge value={val} />
                              </TableCell>
                            )
                          }

                          // Special rendering for reg_simples
                          if (col.key === 'reg_simples') {
                            return (
                              <TableCell key={col.key} className="whitespace-nowrap">
                                {val ? <Badge variant="secondary" className="text-xs">{val}</Badge> : '—'}
                              </TableCell>
                            )
                          }

                          // Editable cells
                          if (col.editable && editableKey) {
                            const isPhone = PHONE_FIELDS.has(col.key)
                            return (
                              <TableCell key={col.key} className="bg-teal-50/40 whitespace-nowrap">
                                <EditableCell
                                  value={val}
                                  codigo={r.parsed.codigo}
                                  field={editableKey}
                                  onSave={handleSave}
                                  isPhone={isPhone}
                                />
                              </TableCell>
                            )
                          }

                          // Default cell rendering
                          const isMono = ['codigo', 'ie_rg', 'cnpj', 'cep'].includes(col.key)
                          const isTruncate = ['razao_social', 'nome_fantasia', 'endereco', 'complemento', 'bairro', 'cnae_principal', 'natureza_juridica'].includes(col.key)
                          const truncateMax: Record<string, string> = {
                            razao_social: 'max-w-[200px]',
                            nome_fantasia: 'max-w-[140px]',
                            endereco: 'max-w-[160px]',
                            complemento: 'max-w-[100px]',
                            bairro: 'max-w-[120px]',
                            cnae_principal: 'max-w-[200px]',
                            natureza_juridica: 'max-w-[140px]',
                          }

                          return (
                            <TableCell
                              key={col.key}
                              className={`text-xs whitespace-nowrap ${isMono ? 'font-mono' : ''} ${isTruncate ? truncateMax[col.key] + ' truncate' : ''}`}
                              title={isTruncate ? val : undefined}
                            >
                              {col.key === 'codigo' ? (
                                <span className="font-medium text-teal-700">{val || '—'}</span>
                              ) : col.key === 'vendedor' ? (
                                <span className="font-medium">{val || '—'}</span>
                              ) : (
                                val || '—'
                              )}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={COLUMNS.length} className="h-24 text-center text-slate-500">
                        Nenhum registro encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-slate-50/50">
              <p className="text-sm text-slate-500">
                Mostrando <span className="font-medium text-slate-700">{data?.data?.length ?? 0}</span> de{' '}
                <span className="font-medium text-slate-700">{(data?.pagination.total ?? 0).toLocaleString('pt-BR')}</span> registros
                {sortBy && (
                  <span className="ml-2 text-xs text-slate-400">
                    Ordenado por {COLUMNS.find(c => c.key === sortBy)?.label} {sortOrder === 'asc' ? '↑ A-Z' : '↓ Z-A'}
                  </span>
                )}
              </p>
              {!showingAll && (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => setPage(1)} disabled={page <= 1 || loading} className="hidden sm:inline-flex">
                    Primeira
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="text-sm px-3 py-1">
                    <span className="font-semibold">{page}</span> / <span className="font-semibold">{totalPages || 1}</span>
                  </span>
                  <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}>
                    <ChevronRight className="size-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(totalPages)} disabled={page >= totalPages || loading} className="hidden sm:inline-flex">
                    Última
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="mt-auto bg-white border-t py-4">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6">
          <p className="text-center text-sm text-slate-400">
            Cadastro de Clientes — Mtech Geral © {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  )
}
