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

// The detail API returns the raw Prisma model (camelCase fields)
interface ClienteDetail {
  id: string
  codigo: string
  ieRg: string
  razaoSocial: string
  nomeFantasia: string
  situacaoCadastral: string
  cnpj: string
  cnpjBase: string
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
  dataSituacao: string
  dataAbertura: string
  cnaePrincipal: string
  naturezaJuridica: string
  porte: string
  cadastro: string
  ultimaVenda: string
  regSimples: string
  vendedor: string
  vendedorId: string | null
  carteira: string
  filial: string | null
  ativo: boolean
  tipo: string
  fornecedor: boolean
  observacoes: string | null
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

function ClienteDetailContent() {
  const params = useParams()
  const id = params.id as string

  const { data: cliente, isLoading, error } = useQuery<ClienteDetail>({
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

  if (error || !cliente) {
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
                  <p className="text-sm">{cliente.ieRg || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tipo</p>
                  <p className="text-sm">{cliente.tipo || '-'}</p>
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
                  <p className="text-sm">{cliente.telefone1 || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Email
                  </p>
                  <p className="text-sm">{cliente.email1 || '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Observações */}
          {cliente.observacoes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Observações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{cliente.observacoes}</p>
              </CardContent>
            </Card>
          )}
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
                  {cliente.vendedor && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Nome Linvix: {cliente.vendedor}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

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
