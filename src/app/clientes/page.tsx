'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Building2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'

interface Cliente {
  id: string
  codigo: string
  razaoSocial: string
  nomeFantasia: string | null
  cnpj: string | null
  cidade: string | null
  uf: string | null
  vendedor: string | null
  vendedorId: string | null
  carteira: string
  filial: string | null
  ativo: boolean | undefined
  vendedorUser: {
    id: string
    name: string | null
    email: string
    role: string
  } | null
}

interface ClientesResponse {
  data: Cliente[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  filters: {
    vendedorUsers: { id: string; name: string; role: string; email: string }[]
  }
}

const CARTEIRA_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  SEM_VENDEDOR: { label: 'Sem Vendedor', variant: 'destructive' },
  COM_VENDEDOR: { label: 'Com Vendedor', variant: 'default' },
  LISTA_FRIA: { label: 'Lista Fria', variant: 'secondary' },
  BOLSAO: { label: 'Bolsão', variant: 'outline' },
  FORNECEDOR: { label: 'Fornecedor', variant: 'outline' },
}

function SortIcon({ column, sortBy }: { column: string; sortBy: string }) {
  return (
    <ArrowUpDown className={`ml-1 h-3 w-3 inline ${sortBy === column ? 'text-primary' : 'text-muted-foreground'}`} />
  )
}

function ClientesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [carteira, setCarteira] = useState(searchParams.get('carteira') || '')
  const [vendedorFilter, setVendedorFilter] = useState(searchParams.get('vendedorId') || '')
  const [ufFilter, setUfFilter] = useState(searchParams.get('uf') || '')
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'))
  const [sortBy, setSortBy] = useState(searchParams.get('sort_by') || 'codigo')
  const [sortOrder, setSortOrder] = useState(searchParams.get('sort_order') || 'desc')

  const { data, isLoading } = useQuery<ClientesResponse>({
    queryKey: ['clientes', search, carteira, vendedorFilter, ufFilter, page, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(search && { search }),
        ...(carteira && { carteira }),
        ...(vendedorFilter && { vendedorId: vendedorFilter }),
        ...(ufFilter && { uf: ufFilter }),
        sort_by: sortBy,
        sort_order: sortOrder,
      })
      const res = await fetch(`/api/clientes?${params}`)
      if (!res.ok) throw new Error('Failed to fetch clientes')
      return res.json()
    },
  })

  // Fetch users for vendedor filter
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error('Failed to fetch users')
      return res.json()
    },
  })

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
    setPage(1)
  }

  const handleSearch = useCallback((value: string) => {
    setSearch(value)
    setPage(1)
  }, [])

  const formatCNPJ = (cnpj: string | null) => {
    if (!cnpj) return '-'
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length === 14) {
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
    }
    return cnpj
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Clientes
          </h1>
          <p className="text-muted-foreground">
            {data ? `${data.pagination.total} clientes encontrados` : 'Carregando...'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search */}
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, CNPJ, código..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Carteira filter */}
            <Select value={carteira} onValueChange={(val) => { setCarteira(val === 'ALL' ? '' : val); setPage(1) }}>
              <SelectTrigger>
                <SelectValue placeholder="Carteira" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                <SelectItem value="SEM_VENDEDOR">Sem Vendedor</SelectItem>
                <SelectItem value="COM_VENDEDOR">Com Vendedor</SelectItem>
                <SelectItem value="LISTA_FRIA">Lista Fria</SelectItem>
                <SelectItem value="BOLSAO">Bolsão</SelectItem>
                <SelectItem value="FORNECEDOR">Fornecedor</SelectItem>
              </SelectContent>
            </Select>

            {/* Vendedor filter */}
            <Select value={vendedorFilter} onValueChange={(val) => { setVendedorFilter(val === 'ALL' ? '' : val); setPage(1) }}>
              <SelectTrigger>
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                {(data?.filters?.vendedorUsers || usersData?.users || []).map((user: { id: string; name: string | null }) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name || user.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* UF filter */}
            <Select value={ufFilter} onValueChange={(val) => { setUfFilter(val === 'ALL' ? '' : val); setPage(1) }}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear filters */}
            <Button
              variant="outline"
              onClick={() => {
                setSearch('')
                setCarteira('')
                setVendedorFilter('')
                setUfFilter('')
                setPage(1)
              }}
            >
              Limpar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !data?.data?.length ? (
            <div className="p-12 text-center">
              <Users className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Nenhum cliente encontrado</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Tente ajustar os filtros de busca
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('codigo')}>
                      Código <SortIcon column="codigo" sortBy={sortBy} />
                    </TableHead>
                    <TableHead className="cursor-pointer min-w-[200px]" onClick={() => handleSort('razao_social')}>
                      Razão Social <SortIcon column="razao_social" sortBy={sortBy} />
                    </TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('cidade')}>
                      Cidade/UF <SortIcon column="cidade" sortBy={sortBy} />
                    </TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('carteira')}>
                      Carteira <SortIcon column="carteira" sortBy={sortBy} />
                    </TableHead>
                    <TableHead>Filial</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((cliente) => {
                    const carteiraInfo = CARTEIRA_LABELS[cliente.carteira] || {
                      label: cliente.carteira,
                      variant: 'outline' as const,
                    }
                    return (
                      <TableRow
                        key={cliente.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/clientes/${cliente.id}`)}
                      >
                        <TableCell className="font-mono text-sm">
                          {cliente.codigo}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm truncate max-w-[250px]">
                              {cliente.razaoSocial}
                            </p>
                            {cliente.nomeFantasia && (
                              <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                                {cliente.nomeFantasia}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatCNPJ(cliente.cnpj)}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {cliente.cidade || '-'}
                            {cliente.uf && <span className="text-muted-foreground">/{cliente.uf}</span>}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {cliente.vendedorUser ? (
                              <>
                                <UserCheck className="h-3 w-3 text-emerald-500" />
                                <span className="text-sm truncate max-w-[120px]">
                                  {cliente.vendedorUser.name || 'N/A'}
                                </span>
                              </>
                            ) : (
                              <>
                                <UserX className="h-3 w-3 text-red-400" />
                                <span className="text-sm text-muted-foreground truncate max-w-[120px]">
                                  {cliente.vendedor || 'N/A'}
                                </span>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={carteiraInfo.variant} className="text-xs">
                            {carteiraInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {cliente.filial || '-'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {(data.pagination.page - 1) * data.pagination.limit + 1} a{' '}
            {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} de{' '}
            {data.pagination.total} clientes
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, data.pagination.totalPages) }, (_, i) => {
                let pageNum: number
                if (data.pagination.totalPages <= 5) {
                  pageNum = i + 1
                } else if (page <= 3) {
                  pageNum = i + 1
                } else if (page >= data.pagination.totalPages - 2) {
                  pageNum = data.pagination.totalPages - 4 + i
                } else {
                  pageNum = page - 2 + i
                }
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? 'default' : 'outline'}
                    size="sm"
                    className="w-8"
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= data.pagination.totalPages}
            >
              Próximo
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ClientesPage() {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (status === 'unauthenticated') return null

  return (
    <AppLayout>
      <ClientesContent />
    </AppLayout>
  )
}
