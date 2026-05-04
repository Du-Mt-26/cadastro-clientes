'use client'

import { useState, useEffect, useCallback } from 'react'
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
  XCircle,
  ChevronLeft,
  ChevronRight,
  Building2,
  RefreshCw,
  AlertTriangle,
  PauseCircle,
  FileX2,
  LayoutGrid,
} from 'lucide-react'

interface ParsedFields {
  codigo: string
  fantasia: string
  ie_rg: string
  celular: string
  fax: string
  cadastro: string
  ultima_venda: string
  reg_simples: string
  situacao: string
  vendedor: string
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
  email: string
  pessoa_contato: string
  data_situacao: string
  data_abertura: string
  cnae_principal: string
  natureza_juridica: string
  porte: string
  parsed: ParsedFields
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
    situacoes: string[]
    vendedores: string[]
  }
  stats: {
    total: number
    ativos: number
    inativos: number
    situacao_cadastral: Record<string, number>
  }
}

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

function SituacaoBadge({ value }: { value: string }) {
  if (!value) return <span className="text-slate-400">—</span>
  const lower = value.toLowerCase()
  if (lower === 'ativo') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 text-xs">
        <CheckCircle2 className="size-3 mr-1" />
        Ativo
      </Badge>
    )
  }
  if (lower === 'inativo') {
    return (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200 text-xs">
        <XCircle className="size-3 mr-1" />
        Inativo
      </Badge>
    )
  }
  return <Badge variant="outline" className="text-xs">{value}</Badge>
}

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [situacaoCadastral, setSituacaoCadastral] = useState('all')
  const [situacao, setSituacao] = useState('all')
  const [vendedor, setVendedor] = useState('all')
  const [page, setPage] = useState(1)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const limit = 50

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (situacaoCadastral && situacaoCadastral !== 'all')
        params.set('situacao_cadastral', situacaoCadastral)
      if (situacao && situacao !== 'all') params.set('situacao', situacao)
      if (vendedor && vendedor !== 'all') params.set('vendedor', vendedor)

      const res = await fetch(`/api/clientes?${params.toString()}`)
      const json = await res.json()
      setData(json)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, situacaoCadastral, situacao, vendedor])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="self-start sm:self-auto"
            >
              <RefreshCw className={`size-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-[1800px] mx-auto w-full px-4 sm:px-6 py-6">
        {/* Stats Cards - Situação Cadastral */}
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
                  <SelectValue placeholder="Sit. Cadastral" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda Sit. Cadastral</SelectItem>
                  {data?.filters.situacao_cadastral.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={situacao}
                onValueChange={(val) => {
                  setSituacao(val)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Situação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda Situação</SelectItem>
                  {data?.filters.situacoes.map((s) => (
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="font-semibold text-slate-700 text-xs">Código</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">IE/RG</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs min-w-[140px]">Razão Social</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Nome Fantasia</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Sit. Cadastral</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">CNPJ</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Endereço</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Número</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Complemento</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Bairro</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Cidade</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">CEP</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">UF</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Telefone 1</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Telefone 2</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Celular</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Fax</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Email</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Pessoa Contato</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Data Situação</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Data Abertura</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">CNAE Principal</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Natureza Jurídica</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Porte</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Cadastro</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Última Venda</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Reg. Simples</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Situação</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Vendedor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 29 }).map((_, j) => (
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
                        <TableCell className="text-xs whitespace-nowrap">{r.telefone1 || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.telefone2 || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.parsed.celular || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.parsed.fax || '—'}</TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate" title={r.email}>{r.email || '—'}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate" title={r.pessoa_contato}>{r.pessoa_contato || '—'}</TableCell>
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
                        <TableCell className="whitespace-nowrap"><SituacaoBadge value={r.parsed.situacao} /></TableCell>
                        <TableCell className="text-xs font-medium whitespace-nowrap">{r.parsed.vendedor || '—'}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={29} className="h-24 text-center text-slate-500">
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
