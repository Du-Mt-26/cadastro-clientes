'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  Building2, TrendingUp, ShoppingCart, DollarSign, FileText,
  ArrowLeft, RefreshCw, Loader2, Calendar, Users, MapPin,
  Package, CreditCard, Building, AlertTriangle, XCircle,
  Sun, Moon,
} from 'lucide-react'
import { AuthUserMenu } from '@/components/auth-user-menu'

// ─── Types ────────────────────────────────────────────

interface DashboardKPI {
  totalVendido: number
  totalNotas: number
  ticketMedio: number
  totalCancelado: number
  notasCanceladas: number
  aguardando: number
  valorProdutos: number
  valorDesconto: number
  valorFrete: number
}

interface MesData { mes: string; total: number; count: number }
interface ClienteData { codigo: string; razaoSocial: string; nomeFantasia: string; totalVendido: number; totalNotas: number }
interface VendedorData { vendedor: string; total: number; count: number }
interface FormaPagData { forma: string; total: number; count: number }
interface EmitenteData { emitente: string; total: number; count: number }
interface UfData { uf: string; total: number; count: number }
interface ProdutoData { codigo: string; descricao: string; total: number; quantidade: number }

interface DashboardData {
  kpi: DashboardKPI
  vendasPorMes: MesData[]
  topClientes: ClienteData[]
  vendasPorVendedor: VendedorData[]
  vendasPorFormaPagamento: FormaPagData[]
  vendasPorEmitente: EmitenteData[]
  vendasPorUf: UfData[]
  topProdutos: ProdutoData[]
}

// ─── Colors ───────────────────────────────────────────

const CHART_COLORS = [
  '#0d9488', '#f59e0b', '#6366f1', '#ec4899', '#8b5cf6',
  '#14b8a6', '#f97316', '#3b82f6', '#ef4444', '#22c55e',
]

// ─── Helpers ──────────────────────────────────────────

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatShortCurrency(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}K`
  return formatCurrency(value)
}

function formatMes(mes: string): string {
  const [year, month] = mes.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(month) - 1]}/${year.slice(2)}`
}

// ─── Custom Tooltips ──────────────────────────────────

function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-1">
          <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}

function CountTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-1">
          <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: {p.value.toLocaleString('pt-BR')}
        </p>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────

export default function VendasDashboard() {
  const { theme, setTheme } = useTheme()
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login')
    }
  }, [sessionStatus, router])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dataInicio) params.set('dataInicio', dataInicio)
      if (dataFim) params.set('dataFim', dataFim)
      const res = await fetch(`/api/vendas/dashboard?${params.toString()}`)
      const json = await res.json()
      if (res.ok) {
        setData(json)
      }
    } catch (error) {
      console.error('Error fetching dashboard:', error)
    } finally {
      setLoading(false)
    }
  }, [dataInicio, dataFim])

  useEffect(() => { fetchData() }, [fetchData])

  const clearFilters = () => { setDataInicio(''); setDataFim('') }

  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="size-8 animate-spin text-teal-600" />
      </div>
    )
  }

  if (!session) return null

  const kpi = data?.kpi
  const isDark = mounted && theme === 'dark'

  // Chart data transformations
  const mesChartData = (data?.vendasPorMes || []).map(m => ({
    name: formatMes(m.mes),
    Valor: m.total,
    Notas: m.count,
  }))

  const clienteChartData = (data?.topClientes || []).map(c => ({
    name: c.nomeFantasia || c.razaoSocial || c.codigo,
    Valor: c.totalVendido,
    Notas: c.totalNotas,
  }))

  const vendedorChartData = (data?.vendasPorVendedor || []).map(v => ({
    name: v.vendedor,
    Valor: v.total,
    Notas: v.count,
  }))

  const formaPagChartData = (data?.vendasPorFormaPagamento || []).map(f => ({
    name: f.forma.length > 25 ? f.forma.slice(0, 22) + '…' : f.forma,
    Valor: f.total,
  }))

  const ufChartData = (data?.vendasPorUf || []).map(u => ({
    name: u.uf,
    Valor: u.total,
    Notas: u.count,
  }))

  const produtoChartData = (data?.topProdutos || []).map(p => ({
    name: p.descricao.length > 30 ? p.descricao.slice(0, 27) + '…' : p.descricao,
    Valor: p.total,
    Qtd: p.quantidade,
  }))

  const pieData = (data?.vendasPorEmitente || []).map(e => ({
    name: e.emitente || 'Não informado',
    value: e.total,
  }))

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b dark:border-slate-700 shadow-sm sticky top-0 z-10">
        <div className="max-w-[1900px] mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => router.push('/')} className="text-slate-600 dark:text-slate-400">
                <ArrowLeft className="size-4 mr-1.5" />Clientes
              </Button>
              <div className="flex items-center justify-center size-10 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-md">
                <TrendingUp className="size-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Dashboard de Vendas</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">M-Tech Distribuidora — NF-e & Vendas</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Calendar className="size-4 text-slate-400" />
                  <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="h-8 text-xs w-[140px]" placeholder="Início" />
                  <span className="text-slate-400 text-xs">até</span>
                  <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="h-8 text-xs w-[140px]" placeholder="Fim" />
                </div>
                {(dataInicio || dataFim) && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs text-slate-500">
                    Limpar
                  </Button>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                <RefreshCw className={`size-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />Atualizar
              </Button>
              {mounted && (
                <Button variant="outline" size="sm" onClick={() => setTheme(isDark ? 'light' : 'dark')} className="text-slate-600 dark:text-slate-400">
                  {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
                </Button>
              )}
              <AuthUserMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1900px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-8 animate-spin text-teal-600" />
          </div>
        ) : !data ? (
          <div className="text-center py-20 text-slate-500">
            <AlertTriangle className="size-8 mx-auto mb-2" />
            <p>Erro ao carregar dados do dashboard</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <Card className="border-l-4 border-l-teal-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="size-4 text-teal-600" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Vendido</span>
                  </div>
                  <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatCurrency(kpi?.totalVendido || 0)}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="size-4 text-blue-600" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Notas Autorizadas</span>
                  </div>
                  <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{(kpi?.totalNotas || 0).toLocaleString('pt-BR')}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ShoppingCart className="size-4 text-purple-600" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Ticket Médio</span>
                  </div>
                  <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatCurrency(kpi?.ticketMedio || 0)}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="size-4 text-red-600" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Canceladas</span>
                  </div>
                  <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{(kpi?.notasCanceladas || 0).toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-slate-500">{formatCurrency(kpi?.totalCancelado || 0)}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="size-4 text-amber-600" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Aguardando</span>
                  </div>
                  <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{(kpi?.aguardando || 0).toLocaleString('pt-BR')}</p>
                </CardContent>
              </Card>
            </div>

            {/* Secondary KPI row */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Valor Produtos</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{formatCurrency(kpi?.valorProdutos || 0)}</p>
                  </div>
                  <Package className="size-5 text-slate-300 dark:text-slate-600" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Descontos Concedidos</p>
                    <p className="text-sm font-bold text-red-600 dark:text-red-400">{formatCurrency(kpi?.valorDesconto || 0)}</p>
                  </div>
                  <CreditCard className="size-5 text-slate-300 dark:text-slate-600" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Frete Total</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{formatCurrency(kpi?.valorFrete || 0)}</p>
                  </div>
                  <MapPin className="size-5 text-slate-300 dark:text-slate-600" />
                </CardContent>
              </Card>
            </div>

            {/* Charts - Tabs */}
            <Tabs defaultValue="mensal" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:w-auto lg:inline-grid lg:grid-cols-4">
                <TabsTrigger value="mensal">Mensal</TabsTrigger>
                <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
                <TabsTrigger value="clientes">Clientes</TabsTrigger>
                <TabsTrigger value="produtos">Produtos</TabsTrigger>
              </TabsList>

              {/* Tab: Vendas por Mês */}
              <TabsContent value="mensal" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <TrendingUp className="size-4 text-teal-600" />
                        Evolução Mensal (Valor)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={mesChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                            <YAxis tickFormatter={(v) => formatShortCurrency(v)} tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                            <Tooltip content={<CurrencyTooltip />} />
                            <Line type="monotone" dataKey="Valor" stroke="#0d9488" strokeWidth={2} dot={{ fill: '#0d9488', r: 4 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <FileText className="size-4 text-blue-600" />
                        Evolução Mensal (Notas)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={mesChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                            <YAxis tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                            <Tooltip content={<CountTooltip />} />
                            <Bar dataKey="Notas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Emitente + Forma de Pagamento */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Building className="size-4 text-purple-600" />
                        Vendas por Emitente
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                              {pieData.map((_, i) => (
                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v: number) => formatCurrency(v)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <CreditCard className="size-4 text-amber-600" />
                        Vendas por Forma de Pagamento
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={formaPagChartData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                            <XAxis type="number" tickFormatter={(v) => formatShortCurrency(v)} tick={{ fontSize: 10, fill: isDark ? '#94a3b8' : '#64748b' }} />
                            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: isDark ? '#94a3b8' : '#64748b' }} />
                            <Tooltip content={<CurrencyTooltip />} />
                            <Bar dataKey="Valor" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Mapa por UF */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <MapPin className="size-4 text-emerald-600" />
                      Vendas por Estado (UF)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={ufChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                          <YAxis yAxisId="left" tickFormatter={(v) => formatShortCurrency(v)} tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                          <Tooltip content={<CurrencyTooltip />} />
                          <Bar yAxisId="left" dataKey="Valor" fill="#0d9488" radius={[4, 4, 0, 0]} />
                          <Bar yAxisId="right" dataKey="Notas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab: Vendedores */}
              <TabsContent value="vendedores" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Users className="size-4 text-teal-600" />
                      Vendas por Vendedor
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={vendedorChartData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                          <XAxis type="number" tickFormatter={(v) => formatShortCurrency(v)} tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                          <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                          <Tooltip content={<CurrencyTooltip />} />
                          <Bar dataKey="Valor" fill="#0d9488" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Vendedores Table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Detalhamento por Vendedor</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[300px]">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white dark:bg-slate-900">
                          <tr className="border-b dark:border-slate-700">
                            <th className="text-left py-2 px-3 font-medium text-slate-500">#</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-500">Vendedor</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-500">Total Vendido</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-500">Notas</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-500">Ticket Médio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data?.vendasPorVendedor || []).map((v, i) => (
                            <tr key={v.vendedor} className="border-b dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="py-2 px-3 text-slate-400">{i + 1}</td>
                              <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">{v.vendedor}</td>
                              <td className="py-2 px-3 text-right font-mono">{formatCurrency(v.total)}</td>
                              <td className="py-2 px-3 text-right">{v.count.toLocaleString('pt-BR')}</td>
                              <td className="py-2 px-3 text-right font-mono">{formatCurrency(v.count > 0 ? v.total / v.count : 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab: Clientes */}
              <TabsContent value="clientes" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Building2 className="size-4 text-teal-600" />
                      Top 10 Clientes por Valor
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={clienteChartData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                          <XAxis type="number" tickFormatter={(v) => formatShortCurrency(v)} tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                          <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10, fill: isDark ? '#94a3b8' : '#64748b' }} />
                          <Tooltip content={<CurrencyTooltip />} />
                          <Bar dataKey="Valor" fill="#6366f1" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Clientes Table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Detalhamento por Cliente</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[350px]">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white dark:bg-slate-900">
                          <tr className="border-b dark:border-slate-700">
                            <th className="text-left py-2 px-3 font-medium text-slate-500">#</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-500">Código</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-500">Cliente</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-500">Total Vendido</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-500">Notas</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-500">Ticket Médio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data?.topClientes || []).map((c, i) => (
                            <tr key={c.codigo} className="border-b dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="py-2 px-3 text-slate-400">{i + 1}</td>
                              <td className="py-2 px-3 font-mono text-xs">{c.codigo}</td>
                              <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">{c.nomeFantasia || c.razaoSocial}</td>
                              <td className="py-2 px-3 text-right font-mono">{formatCurrency(c.totalVendido)}</td>
                              <td className="py-2 px-3 text-right">{c.totalNotas.toLocaleString('pt-BR')}</td>
                              <td className="py-2 px-3 text-right font-mono">{formatCurrency(c.totalNotas > 0 ? c.totalVendido / c.totalNotas : 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab: Produtos */}
              <TabsContent value="produtos" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Package className="size-4 text-teal-600" />
                      Top 10 Produtos por Valor
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={produtoChartData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                          <XAxis type="number" tickFormatter={(v) => formatShortCurrency(v)} tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                          <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 9, fill: isDark ? '#94a3b8' : '#64748b' }} />
                          <Tooltip content={<CurrencyTooltip />} />
                          <Bar dataKey="Valor" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Produtos Table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Detalhamento por Produto</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[350px]">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white dark:bg-slate-900">
                          <tr className="border-b dark:border-slate-700">
                            <th className="text-left py-2 px-3 font-medium text-slate-500">#</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-500">Código</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-500">Descrição</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-500">Qtd</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-500">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data?.topProdutos || []).map((p, i) => (
                            <tr key={p.codigo + p.descricao} className="border-b dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="py-2 px-3 text-slate-400">{i + 1}</td>
                              <td className="py-2 px-3 font-mono text-xs">{p.codigo}</td>
                              <td className="py-2 px-3 text-slate-900 dark:text-slate-100">{p.descricao}</td>
                              <td className="py-2 px-3 text-right">{p.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td>
                              <td className="py-2 px-3 text-right font-mono">{formatCurrency(p.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  )
}
