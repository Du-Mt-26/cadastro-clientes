'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Building2,
  MapPin,
  Phone,
  Mail,
  User,
  FileText,
  Package,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'

interface ClienteDetail {
  cliente: {
    id: string
    codigo: string
    razaoSocial: string
    nomeFantasia: string | null
    cnpj: string | null
    cnpjBase: string | null
    ie: string | null
    endereco: string | null
    numero: string | null
    complemento: string | null
    bairro: string | null
    cidade: string | null
    uf: string | null
    cep: string | null
    telefone: string | null
    email: string | null
    vendedor: string | null
    vendedorId: string | null
    carteira: string
    filial: string | null
    ativo: boolean
    ultimaSincronizacao: string | null
    createdAt: string
    updatedAt: string
    vendedorUser: {
      id: string
      name: string | null
      email: string
      role: string
    } | null
  }
  filiais: Array<{
    id: string
    codigo: string
    razaoSocial: string
    nomeFantasia: string | null
    cnpj: string | null
    cidade: string | null
    uf: string | null
  }>
  vendas: Array<{
    id: string
    numeroNF: string | null
    serie: string | null
    dataEmissao: string | null
    descricaoProduto: string | null
    quantidade: number | null
    valorTotal: number | null
    vendedorNome: string | null
  }>
}

const CARTEIRA_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  SEM_VENDEDOR: { label: 'Sem Vendedor', variant: 'destructive' },
  COM_VENDEDOR: { label: 'Com Vendedor', variant: 'default' },
  LISTA_FRIA: { label: 'Lista Fria', variant: 'secondary' },
  BOLSAO: { label: 'Bolsão', variant: 'outline' },
  FORNECEDOR: { label: 'Fornecedor', variant: 'outline' },
}

function formatCNPJ(cnpj: string | null) {
  if (!cnpj) return '-'
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
  }
  return cnpj
}

function formatCEP(cep: string | null) {
  if (!cep) return '-'
  const digits = cep.replace(/\D/g, '')
  if (digits.length === 8) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`
  }
  return cep
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return '-'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function ClienteDetailContent() {
  const params = useParams()
  const id = params.id as string

  const { data, isLoading, error } = useQuery<ClienteDetail>({
    queryKey: ['cliente', id],
    queryFn: async () => {
      const res = await fetch(`/api/clientes/${id}`)
      if (!res.ok) throw new Error('Failed to fetch cliente')
      return res.json()
    },
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Erro ao carregar dados do cliente.</p>
            <Button variant="outline" className="mt-4" onClick={() => window.history.back()}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { cliente, filiais, vendas } = data
  const carteiraInfo = CARTEIRA_LABELS[cliente.carteira] || {
    label: cliente.carteira,
    variant: 'outline' as const,
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/clientes">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{cliente.razaoSocial}</h1>
            <Badge variant={cliente.ativo ? 'default' : 'secondary'}>
              {cliente.ativo ? 'Ativo' : 'Inativo'}
            </Badge>
            <Badge variant={carteiraInfo.variant}>{carteiraInfo.label}</Badge>
          </div>
          {cliente.nomeFantasia && (
            <p className="text-muted-foreground">{cliente.nomeFantasia}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Company info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Dados da Empresa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Código</p>
                  <p className="font-mono text-sm">{cliente.codigo}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CNPJ</p>
                  <p className="font-mono text-sm">{formatCNPJ(cliente.cnpj)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Inscrição Estadual</p>
                  <p className="text-sm">{cliente.ie || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Filial</p>
                  <p className="text-sm">{cliente.filial || '-'}</p>
                </div>
              </div>

              <Separator className="my-4" />

              {/* Address */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Endereço
                </p>
                <p className="text-sm">
                  {[
                    cliente.endereco,
                    cliente.numero,
                    cliente.complemento,
                  ].filter(Boolean).join(', ') || '-'}
                </p>
                <p className="text-sm">
                  {[
                    cliente.bairro,
                    cliente.cidade,
                    cliente.uf,
                  ].filter(Boolean).join(', ')}
                  {cliente.cep && ` - CEP: ${formatCEP(cliente.cep)}`}
                </p>
              </div>

              <Separator className="my-4" />

              {/* Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Telefone
                  </p>
                  <p className="text-sm">{cliente.telefone || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Email
                  </p>
                  <p className="text-sm">{cliente.email || '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Vendas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" />
                Últimas Vendas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vendas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma venda encontrada</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {vendas.map((venda) => (
                    <div
                      key={venda.id}
                      className="flex items-center justify-between border-b pb-3 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            NF {venda.numeroNF || '-'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {venda.dataEmissao
                              ? new Date(venda.dataEmissao).toLocaleDateString('pt-BR')
                              : '-'}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {venda.descricaoProduto || '-'}
                        </p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-sm font-medium">
                          {formatCurrency(venda.valorTotal)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Qtd: {venda.quantidade ?? '-'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Vendedor */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Vendedor
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cliente.vendedorUser ? (
                <div>
                  <p className="font-medium text-sm">{cliente.vendedorUser.name}</p>
                  <p className="text-xs text-muted-foreground">{cliente.vendedorUser.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {cliente.vendedorUser.role === 'ADMIN' ? 'Administrador' :
                     cliente.vendedorUser.role === 'SUPERVISORA' ? 'Supervisora' :
                     cliente.vendedorUser.role === 'GERENTE_COMERCIAL' ? 'Gerente Comercial' :
                     'Vendedor'}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground">
                    {cliente.vendedor || 'Nenhum vendedor atribuído'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Nome Linvix: {cliente.vendedor || 'N/A'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Filiais */}
          {filiais.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Filiais ({filiais.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filiais.map((filial) => (
                    <Link
                      key={filial.id}
                      href={`/clientes/${filial.id}`}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{filial.razaoSocial}</p>
                        <p className="text-xs text-muted-foreground">
                          {filial.codigo} • {formatCNPJ(filial.cnpj)}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground ml-2" />
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sync info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações do Sistema</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Última Sincronização</p>
                <p className="text-sm">
                  {cliente.ultimaSincronizacao
                    ? new Date(cliente.ultimaSincronizacao).toLocaleString('pt-BR')
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Criado em</p>
                <p className="text-sm">{new Date(cliente.createdAt).toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Atualizado em</p>
                <p className="text-sm">{new Date(cliente.updatedAt).toLocaleString('pt-BR')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function ClienteDetailPage() {
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
      <ClienteDetailContent />
    </AppLayout>
  )
}
