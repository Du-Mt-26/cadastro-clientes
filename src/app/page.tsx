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
  Phone,
  FileText,
  RefreshCw,
} from 'lucide-react'

interface ParsedFields {
  codigo: string
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
  cnpj: string
  cidade: string
  uf: string
  situacao_cadastral: string
  email: string
  telefone: string
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
    situacoes: string[]
    vendedores: string[]
  }
  stats: {
    total: number
    ativos: number
    inativos: number
  }
}

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [situacao, setSituacao] = useState('all')
  const [vendedor, setVendedor] = useState('all')
  const [page, setPage] = useState(1)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const limit = 50

  // Debounce search
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
  }, [page, debouncedSearch, situacao, vendedor])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const totalRecords = data?.pagination.total ?? 0
  const totalPages = data?.pagination.totalPages ?? 0

  const situacaoBadge = (situacao: string) => {
    if (!situacao) return <Badge variant="outline">—</Badge>
    const lower = situacao.toLowerCase()
    if (lower === 'ativo') {
      return (
        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">
          <CheckCircle2 className="size-3 mr-1" />
          Ativo
        </Badge>
      )
    }
    if (lower === 'inativo') {
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200">
          <XCircle className="size-3 mr-1" />
          Inativo
        </Badge>
      )
    }
    return <Badge variant="outline">{situacao}</Badge>
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
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

      {/* Main Content */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-lg bg-slate-100 text-slate-600">
                <Users className="size-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Registros</p>
                <p className="text-xl font-bold text-slate-900">
                  {data?.stats.total.toLocaleString('pt-BR') ?? '—'}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-lg bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Ativos</p>
                <p className="text-xl font-bold text-emerald-700">
                  {data?.stats.ativos.toLocaleString('pt-BR') ?? '—'}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-lg bg-red-100 text-red-600">
                <XCircle className="size-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Inativos</p>
                <p className="text-xl font-bold text-red-700">
                  {data?.stats.inativos.toLocaleString('pt-BR') ?? '—'}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-lg bg-amber-100 text-amber-600">
                <FileText className="size-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Página</p>
                <p className="text-xl font-bold text-amber-700">
                  {page} / {totalPages || 1}
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
                value={situacao}
                onValueChange={(val) => {
                  setSituacao(val)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Situação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Situações</SelectItem>
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
                    <TableHead className="font-semibold text-slate-700">
                      Código
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">
                      IE/RG
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 min-w-[140px]">
                      Razão Social
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">
                      CNPJ
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">
                      Celular
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">
                      Fax
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">
                      Cadastro
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">
                      Última Venda
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">
                      Reg. Simples
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">
                      Situação
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">
                      Vendedor
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">
                      Cidade/UF
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 12 }).map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 bg-slate-100 rounded animate-pulse" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data?.data && data.data.length > 0 ? (
                    data.data.map((record, idx) => (
                      <TableRow key={idx} className="hover:bg-slate-50/80">
                        <TableCell className="font-mono text-sm font-medium text-teal-700">
                          {record.parsed.codigo || '—'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {record.parsed.ie_rg || '—'}
                        </TableCell>
                        <TableCell
                          className="text-sm max-w-[220px] truncate"
                          title={record.razao_social}
                        >
                          {record.razao_social || '—'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {record.cnpj || '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {record.parsed.celular ? (
                            <span className="flex items-center gap-1">
                              <Phone className="size-3 text-slate-400" />
                              {record.parsed.celular}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {record.parsed.fax || '—'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {record.parsed.cadastro || '—'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {record.parsed.ultima_venda || '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {record.parsed.reg_simples ? (
                            <Badge variant="secondary" className="text-xs">
                              {record.parsed.reg_simples}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          {situacaoBadge(record.parsed.situacao)}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {record.parsed.vendedor || '—'}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {record.cidade ? `${record.cidade}/${record.uf}` : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={12}
                        className="h-24 text-center text-slate-500"
                      >
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
                Mostrando{' '}
                <span className="font-medium text-slate-700">
                  {data?.data?.length ?? 0}
                </span>{' '}
                de{' '}
                <span className="font-medium text-slate-700">
                  {totalRecords.toLocaleString('pt-BR')}
                </span>{' '}
                registros
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(1)}
                  disabled={page <= 1 || loading}
                  className="hidden sm:inline-flex"
                >
                  Primeira
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-sm px-3 py-1">
                  Página <span className="font-semibold">{page}</span> de{' '}
                  <span className="font-semibold">{totalPages || 1}</span>
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                >
                  <ChevronRight className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages || loading}
                  className="hidden sm:inline-flex"
                >
                  Última
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="mt-auto bg-white border-t py-4">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
          <p className="text-center text-sm text-slate-400">
            Cadastro de Clientes — Mtech Geral © {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  )
}
