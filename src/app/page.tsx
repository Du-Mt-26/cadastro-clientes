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
  Save,
  Pencil,
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

// Editable cell key mapping
const EDITABLE_FIELDS: { key: keyof EditableFields; label: string }[] = [
  { key: 'telefone1', label: 'Telefone 1' },
  { key: 'telefone2', label: 'Telefone 2' },
  { key: 'telefone3', label: 'Telefone 3' },
  { key: 'telefone4', label: 'Telefone 4' },
  { key: 'email1', label: 'Email 1' },
  { key: 'email2', label: 'Email 2' },
  { key: 'email3', label: 'Email 3' },
  { key: 'pessoaContato', label: 'Pessoa Contato' },
]

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
}: {
  value: string
  codigo: string
  field: keyof EditableFields
  onSave: (codigo: string, field: keyof EditableFields, value: string) => void
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
        className="h-7 text-xs w-full min-w-[80px] border-teal-400 focus:border-teal-600"
      />
    )
  }

  return (
    <span
      className="cursor-pointer group flex items-center gap-1"
      onClick={() => setEditing(true)}
      title="Clique para editar"
    >
      <span className="text-xs">{value || '—'}</span>
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
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)

  const limit = 50

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
    return params
  }, [situacaoCadastral, vendedor, debouncedSearch])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = buildFilterParams()
      params.set('page', page.toString())
      params.set('limit', limit.toString())

      const res = await fetch(`/api/clientes?${params.toString()}`)
      const json = await res.json()
      setData(json)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }, [page, buildFilterParams])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0
    }
  }, [page])

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
                  {page}/{totalPages || 1}
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
            </div>
          </CardContent>
        </Card>

        {/* Data Table */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div
              ref={tableContainerRef}
              className="overflow-auto custom-scrollbar"
              style={{ maxHeight: '60vh', minHeight: '200px' }}
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50 sticky top-0 z-[5]">
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Código</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">IE/RG</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs min-w-[140px] bg-slate-50">Razão Social</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Nome Fantasia</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Sit. Cadastral</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">CNPJ</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Endereço</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Número</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Complemento</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Bairro</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Cidade</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">CEP</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">UF</TableHead>
                    <TableHead className="font-semibold text-teal-700 text-xs bg-teal-50 border-b-2 border-teal-300">Telefone 1 ✏️</TableHead>
                    <TableHead className="font-semibold text-teal-700 text-xs bg-teal-50 border-b-2 border-teal-300">Telefone 2 ✏️</TableHead>
                    <TableHead className="font-semibold text-teal-700 text-xs bg-teal-50 border-b-2 border-teal-300">Telefone 3 ✏️</TableHead>
                    <TableHead className="font-semibold text-teal-700 text-xs bg-teal-50 border-b-2 border-teal-300">Telefone 4 ✏️</TableHead>
                    <TableHead className="font-semibold text-teal-700 text-xs bg-teal-50 border-b-2 border-teal-300">Email 1 ✏️</TableHead>
                    <TableHead className="font-semibold text-teal-700 text-xs bg-teal-50 border-b-2 border-teal-300">Email 2 ✏️</TableHead>
                    <TableHead className="font-semibold text-teal-700 text-xs bg-teal-50 border-b-2 border-teal-300">Email 3 ✏️</TableHead>
                    <TableHead className="font-semibold text-teal-700 text-xs bg-teal-50 border-b-2 border-teal-300">Pessoa Contato ✏️</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Data Situação</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Data Abertura</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">CNAE Principal</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Natureza Jurídica</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Porte</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Cadastro</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Última Venda</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Reg. Simples</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs bg-slate-50">Vendedor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 30 }).map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-3 bg-slate-100 rounded animate-pulse w-16" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data?.data && data.data.length > 0 ? (
                    data.data.map((r, idx) => (
                      <TableRow key={idx} className="hover:bg-slate-50/80">
                        <TableCell className="font-mono text-xs font-medium text-teal-700 whitespace-nowrap">{r.parsed.codigo || '—'}</TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{r.parsed.ie_rg || '—'}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate" title={r.razao_social}>{r.razao_social || '—'}</TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate" title={r.nome_fantasia}>{r.nome_fantasia || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap"><SituacaoCadastralBadge value={r.situacao_cadastral} /></TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{r.cnpj || '—'}</TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate" title={r.endereco}>{r.endereco || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.numero || '—'}</TableCell>
                        <TableCell className="text-xs max-w-[100px] truncate" title={r.complemento}>{r.complemento || '—'}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate" title={r.bairro}>{r.bairro || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.cidade || '—'}</TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{r.cep || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.uf || '—'}</TableCell>
                        {/* Editable fields */}
                        <TableCell className="bg-teal-50/40 whitespace-nowrap">
                          <EditableCell value={r.telefone1} codigo={r.parsed.codigo} field="telefone1" onSave={handleSave} />
                        </TableCell>
                        <TableCell className="bg-teal-50/40 whitespace-nowrap">
                          <EditableCell value={r.telefone2} codigo={r.parsed.codigo} field="telefone2" onSave={handleSave} />
                        </TableCell>
                        <TableCell className="bg-teal-50/40 whitespace-nowrap">
                          <EditableCell value={r.telefone3} codigo={r.parsed.codigo} field="telefone3" onSave={handleSave} />
                        </TableCell>
                        <TableCell className="bg-teal-50/40 whitespace-nowrap">
                          <EditableCell value={r.telefone4} codigo={r.parsed.codigo} field="telefone4" onSave={handleSave} />
                        </TableCell>
                        <TableCell className="bg-teal-50/40 whitespace-nowrap">
                          <EditableCell value={r.email1} codigo={r.parsed.codigo} field="email1" onSave={handleSave} />
                        </TableCell>
                        <TableCell className="bg-teal-50/40 whitespace-nowrap">
                          <EditableCell value={r.email2} codigo={r.parsed.codigo} field="email2" onSave={handleSave} />
                        </TableCell>
                        <TableCell className="bg-teal-50/40 whitespace-nowrap">
                          <EditableCell value={r.email3} codigo={r.parsed.codigo} field="email3" onSave={handleSave} />
                        </TableCell>
                        <TableCell className="bg-teal-50/40 whitespace-nowrap">
                          <EditableCell value={r.pessoa_contato} codigo={r.parsed.codigo} field="pessoaContato" onSave={handleSave} />
                        </TableCell>
                        {/* Read-only fields */}
                        <TableCell className="text-xs whitespace-nowrap">{r.data_situacao || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.data_abertura || '—'}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate" title={r.cnae_principal}>{r.cnae_principal || '—'}</TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate" title={r.natureza_juridica}>{r.natureza_juridica || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.porte || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.parsed.cadastro || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.parsed.ultima_venda || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.parsed.reg_simples ? <Badge variant="secondary" className="text-xs">{r.parsed.reg_simples}</Badge> : '—'}
                        </TableCell>
                        <TableCell className="text-xs font-medium whitespace-nowrap">{r.parsed.vendedor || '—'}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={30} className="h-24 text-center text-slate-500">
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
              </p>
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
