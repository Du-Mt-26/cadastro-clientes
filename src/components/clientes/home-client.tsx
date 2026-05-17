'use client'

import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import { useTheme } from 'next-themes'
import { useSearchParams, useRouter } from 'next/navigation'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from '@/hooks/use-toast'
import {
  Search,
  Users,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Building2,
  RefreshCw,
  AlertTriangle,
  PauseCircle,
  FileX2,
  Download,
  Pencil,
  ArrowUpAZ,
  ArrowDownZA,
  ArrowUpDown,
  ArrowUpNarrowWide,
  ArrowDownWideNarrow,
  UserPlus,
  Loader2,
  Clock,
  TrendingDown,
  GripVertical,
  AlertCircle,
  XCircle,
  Moon,
  Sun,
  MapPin,
  Phone,
  Mail,
  User,
  StickyNote,
  Briefcase,
  RotateCcw,
  Sheet as SheetIcon,
  Shield,
  LogOut,
  UserCog,
  Package,
  MessageCircle,
  Star,
  ShoppingCart,
} from 'lucide-react'
import { SheetsSyncModal } from '@/components/clientes/sheets-sync-modal'
import { useSession } from 'next-auth/react'
import { AuthUserMenu } from '@/components/auth-user-menu'
import { UserManagementModal } from '@/components/user-management-modal'
import { PermissionManagementModal } from '@/components/permission-management-modal'
import { TwoFactorSetupModal } from '@/components/two-factor-setup-modal'
import { CARTEIRA_LABELS, CARTEIRA_COLORS } from '@/lib/auth'
import type {
  ParsedFields,
  EditableFields,
  ClienteRecord,
  ApiResponse,
  AuditLogEntry,
  ColumnDef,
  NewClientForm,
  DetailTab,
} from '@/lib/types'
import {
  DEFAULT_COLUMNS,
  PAGE_SIZE_OPTIONS,
  EMPTY_FORM,
  DETAIL_TABS,
  PHONE_FIELDS,
  EMAIL_FIELDS,
  FIELD_LABELS,
} from '@/lib/types'
import {
  calcDiasSemVenda,
  formatPhone,
  getNowBrasilia,
  getRecordValue,
  toEditableKey,
} from '@/lib/clientes'
import { useVirtualizer } from '@tanstack/react-virtual'

// ─── Client-only helpers ──────────────────────────

function getDiasSemVendaBg(dias: number | null): string {
  if (dias === null) return 'bg-red-600 text-white border-red-700 dark:bg-red-700 dark:text-white dark:border-red-800'
  if (dias <= 45) return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700'
  if (dias <= 90) return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700'
  if (dias <= 150) return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-700'
  return 'bg-red-600 text-white border-red-700 dark:bg-red-700 dark:text-white dark:border-red-800'
}

function formatDocumento(raw: string): { formatted: string; tipo: 'CNPJ' | 'CPF' | 'INVALIDO' } {
  const d = raw.replace(/\D/g, '')
  if (d.length === 14) {
    return { formatted: `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`, tipo: 'CNPJ' }
  }
  if (d.length === 11) {
    return { formatted: `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`, tipo: 'CPF' }
  }
  return { formatted: raw, tipo: 'INVALIDO' }
}

// Backward-compatible helper that returns just the formatted string
function formatCnpj(raw: string): string {
  return formatDocumento(raw).formatted
}

function formatCep(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length !== 8) return raw
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

// ─── Sub-components ────────────────────────────────

function SituacaoCadastralBadge({ value }: { value: string }) {
  if (!value) return <span className="text-slate-400 dark:text-slate-500">—</span>
  const lower = value.toLowerCase()
  if (lower === 'ativa') return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700 text-xs"><CheckCircle2 className="size-3 mr-1" />ATIVA</Badge>
  if (lower === 'baixada') return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700 text-xs"><FileX2 className="size-3 mr-1" />BAIXADA</Badge>
  if (lower === 'inapta') return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700 text-xs"><AlertTriangle className="size-3 mr-1" />INAPTA</Badge>
  if (lower === 'suspensa') return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 border-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-700 text-xs"><PauseCircle className="size-3 mr-1" />SUSPENSA</Badge>
  return <Badge variant="outline" className="text-xs">{value}</Badge>
}

function DiasSemVendaBadge({ dias, ultimaVenda }: { dias: number | null; ultimaVenda: string }) {
  if (dias === null) return (
    <Badge className="bg-red-600 text-white border-red-700 dark:bg-red-700 dark:text-white dark:border-red-800 text-xs font-bold border tabular-nums" title="Sem informação de última venda">151+</Badge>
  )
  return (
    <Badge className={`${getDiasSemVendaBg(dias)} text-xs font-bold border tabular-nums`} title={ultimaVenda ? `Última venda: ${ultimaVenda}` : undefined}>{dias}</Badge>
  )
}

function EditableCell({ value, codigo, field, onSave, isPhone, isEmail, isObservacoes }: {
  value: string; codigo: string; field: keyof EditableFields;
  onSave: (codigo: string, field: keyof EditableFields, value: string) => void; isPhone: boolean;
  isEmail?: boolean; isObservacoes?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setEditValue(value) }, [value])
  useEffect(() => {
    if (editing && isObservacoes && textareaRef.current) { textareaRef.current.focus() }
    else if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
  }, [editing, isObservacoes])

  const handleSave = () => {
    const saveValue = isEmail ? editValue.toLowerCase().trim() : editValue
    if (saveValue !== value) onSave(codigo, field, saveValue)
    setEditing(false)
  }
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isObservacoes) handleSave()
    else if (e.key === 'Escape') { setEditValue(value); setEditing(false) }
  }

  if (editing && isObservacoes) {
    return (
      <textarea
        ref={textareaRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => { if (e.key === 'Escape') { setEditValue(value); setEditing(false) } }}
        className="w-full min-w-[120px] min-h-[80px] text-xs border border-teal-400 focus:border-teal-600 rounded-md p-1.5 bg-white dark:bg-slate-900 dark:text-slate-100 resize-y"
        placeholder="Observações..."
      />
    )
  }

  if (editing) return <Input ref={inputRef} value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleSave} onKeyDown={handleKeyDown} className="h-7 text-xs w-full min-w-[100px] border-teal-400 focus:border-teal-600" placeholder={isPhone ? '(XX) XXXXX-XXXX' : ''} />

  const displayValue = isPhone ? formatPhone(value) : (isObservacoes ? (value ? (value.length > 30 ? value.slice(0, 30) + '…' : value) : '—') : (value || '—'))
  const emailDisplay = isEmail && value ? value.toLowerCase() : null
  return (
    <span className="cursor-pointer group flex items-center gap-1 min-w-0" onClick={(e) => { e.stopPropagation(); setEditing(true) }} title={isObservacoes && value ? value : (isEmail && value ? value : "Clique para editar")}>
      {isPhone && value && (
        <a
          href={`https://wa.me/55${value.replace(/\D/g, '').replace(/^0+/, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="size-4 text-green-600 hover:text-green-700 dark:text-green-400 shrink-0"
          onClick={(e) => e.stopPropagation()}
          title="Abrir no WhatsApp"
        >
          <MessageCircle className="size-3.5" />
        </a>
      )}
      {emailDisplay ? (
        <a
          href={`mailto:${emailDisplay}`}
          className="text-xs text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-300 underline underline-offset-2 decoration-teal-300 dark:decoration-teal-700 truncate"
          onClick={(e) => e.stopPropagation()}
          title={`Enviar email para ${emailDisplay}`}
        >
          {emailDisplay}
        </a>
      ) : (
        <span className="text-xs">{displayValue}</span>
      )}
      <Pencil className="size-2.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </span>
  )
}

// ─── Main Component ────────────────────────────────

export default function HomeClient() {
  const { theme, setTheme } = useTheme()
  const { data: session, status: sessionStatus } = useSession()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | null>(null)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [situacaoCadastral, setSituacaoCadastral] = useState(searchParams.get('situacao') || 'all')
  const [vendedor, setVendedor] = useState(searchParams.get('vendedor') || 'all')
  const [cidade, setCidade] = useState(searchParams.get('cidade') || 'all')
  const [uf, setUf] = useState(searchParams.get('uf') || 'all')
  const [diasSemVendaFilter, setDiasSemVendaFilter] = useState(searchParams.get('dias') || 'all')
  const [carteiraFilter, setCarteiraFilter] = useState(searchParams.get('carteira') || 'all')
  const [tipoFilter, setTipoFilter] = useState(searchParams.get('tipo') || 'all')
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'))
  const [limit, setLimit] = useState<string>(searchParams.get('limit') || '50')
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const [saving, setSaving] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState(searchParams.get('sort_by') || '')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>((searchParams.get('sort_order') as 'asc' | 'desc') || 'asc')
  const [favoritos, setFavoritos] = useState<string[]>([])
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const focusedRowRef = useRef(-1)
  const focusedColRef = useRef(-1)

  const [focusedCell, setFocusedCell] = useState({ row: -1, col: -1 })
  const [pageJump, setPageJump] = useState('')

  // Column ordering state
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('columnOrder')
      if (saved) {
        try { return JSON.parse(saved) } catch { /* ignore */ }
      }
    }
    return DEFAULT_COLUMNS.map(c => c.key)
  })

  const [dragKey, setDragKey] = useState<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  // New client modal
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientTab, setNewClientTab] = useState<'empresa' | 'endereco' | 'contato'>('empresa')
  const [form, setForm] = useState<NewClientForm>(EMPTY_FORM)
  const [consulting, setConsulting] = useState(false)
  const [consultError, setConsultError] = useState('')
  const [consultWarning, setConsultWarning] = useState('')
  const [savingNew, setSavingNew] = useState(false)

  // Google Sheets sync modal
  const [showSheetsSync, setShowSheetsSync] = useState(false)
  const [sheetsConnected, setSheetsConnected] = useState(false)

  // Auth modals
  const [showUserManagement, setShowUserManagement] = useState(false)
  const [showPermissions, setShowPermissions] = useState(false)
  const [show2FASetup, setShow2FASetup] = useState(false)

  // Load sheets connection status
  useEffect(() => {
    fetch('/api/sync')
      .then(res => res.json())
      .then(data => setSheetsConnected(data.connected && data.config?.connected))
      .catch(() => {})
  }, [showSheetsSync])

  // Load favorites
  useEffect(() => {
    fetch('/api/clientes/favoritos')
      .then(res => res.json())
      .then(data => { if (data.data) setFavoritos(data.data) })
      .catch(() => {})
  }, [])

  // Toggle favorite
  const toggleFavorito = async (codigo: string) => {
    try {
      const res = await fetch('/api/clientes/favoritos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
      })
      const data = await res.json()
      if (data.ok) {
        setFavoritos(prev =>
          data.favorited
            ? [...prev, codigo]
            : prev.filter(c => c !== codigo)
        )
      } else if (data.error) {
        toast({ title: 'Limite atingido', description: data.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível atualizar favorito', variant: 'destructive' })
    }
  }

  // Client detail modal
  const [detailClient, setDetailClient] = useState<ClienteRecord | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('contato')
  const [detailObs, setDetailObs] = useState('')
  const [savingObs, setSavingObs] = useState(false)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  // Client vendas (NF-e) state
  const [clienteVendas, setClienteVendas] = useState<any[]>([])
  const [clienteVendasStats, setClienteVendasStats] = useState<any>(null)
  const [loadingVendas, setLoadingVendas] = useState(false)
  const [vendaDetail, setVendaDetail] = useState<any>(null)
  const [loadingVendaDetail, setLoadingVendaDetail] = useState(false)

  // Auth guard - redirect to login if not authenticated
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login')
    }
  }, [sessionStatus, router])

  // Dark mode mounted
  useEffect(() => { setMounted(true) }, [])

  // URL sync
  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (situacaoCadastral !== 'all') params.set('situacao', situacaoCadastral)
    if (vendedor !== 'all' && !isVendedor) params.set('vendedor', vendedor)
    if (cidade !== 'all') params.set('cidade', cidade)
    if (uf !== 'all') params.set('uf', uf)
    if (diasSemVendaFilter !== 'all') params.set('dias', diasSemVendaFilter)
    if (carteiraFilter !== 'all') params.set('carteira', carteiraFilter)
    if (tipoFilter !== 'all') params.set('tipo', tipoFilter)
    if (page > 1) params.set('page', page.toString())
    if (limit !== 'all') params.set('limit', limit)
    if (sortBy) { params.set('sort_by', sortBy); params.set('sort_order', sortOrder) }
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [search, situacaoCadastral, vendedor, cidade, uf, diasSemVendaFilter, carteiraFilter, tipoFilter, page, limit, sortBy, sortOrder, router])

  // Reorder columns
  const columns = useMemo(() => {
    const colMap = new Map(DEFAULT_COLUMNS.map(c => [c.key, c]))
    const stickyKeys = columnOrder.filter(k => { const c = colMap.get(k); return c?.sticky === 'left' })
    const normalKeys = columnOrder.filter(k => { const c = colMap.get(k); return !c?.sticky })
    const allKeys = [...stickyKeys, ...normalKeys]
    const missing = DEFAULT_COLUMNS.filter(c => !allKeys.includes(c.key)).map(c => c.key)
    return [...allKeys, ...missing].map(k => colMap.get(k)!).filter(Boolean)
  }, [columnOrder])

  // Grid template for CSS Grid — ensures perfect column alignment like Excel
  const gridTemplate = useMemo(() => {
    return `36px ${columns.map(c => c.minWidth || '100px').join(' ')}`
  }, [columns])

  // Save column order to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('columnOrder', JSON.stringify(columnOrder))
    }
  }, [columnOrder])

  // Drag handlers
  const handleDragStart = (_e: React.DragEvent, key: string) => { setDragKey(key) }
  const handleDragOver = (_e: React.DragEvent, key: string) => { setDragOverKey(key) }
  const handleDrop = (_e: React.DragEvent, key: string) => {
    if (!dragKey || dragKey === key) { setDragKey(null); setDragOverKey(null); return }
    const targetCol = DEFAULT_COLUMNS.find(c => c.key === key)
    if (targetCol?.sticky) { setDragKey(null); setDragOverKey(null); return }
    const sourceIdx = columnOrder.indexOf(dragKey)
    const targetIdx = columnOrder.indexOf(key)
    if (sourceIdx === -1 || targetIdx === -1) { setDragKey(null); setDragOverKey(null); return }
    const newOrder = [...columnOrder]
    newOrder.splice(sourceIdx, 1)
    newOrder.splice(targetIdx > sourceIdx ? targetIdx - 1 : targetIdx, 0, dragKey)
    setColumnOrder(newOrder)
    setDragKey(null)
    setDragOverKey(null)
  }

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const CLIENT_SORT_KEYS = new Set(['dias_sem_venda'])

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams()
    if (situacaoCadastral && situacaoCadastral !== 'all') params.set('situacao_cadastral', situacaoCadastral)
    // For VENDEDOR role, don't send vendedor filter - visibility is controlled by backend role rules
    if (vendedor && vendedor !== 'all' && !isVendedor) params.set('vendedor', vendedor)
    if (cidade !== 'all') params.set('cidade', cidade)
    if (uf !== 'all') params.set('uf', uf)
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (sortBy && !CLIENT_SORT_KEYS.has(sortBy)) { params.set('sort_by', sortBy); params.set('sort_order', sortOrder) }
    if (carteiraFilter && carteiraFilter !== 'all') params.set('carteira', carteiraFilter)
    if (tipoFilter && tipoFilter !== 'all') params.set('tipo', tipoFilter)
    return params
  }, [situacaoCadastral, vendedor, cidade, uf, debouncedSearch, sortBy, sortOrder, carteiraFilter, tipoFilter])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = buildFilterParams()
      params.set('page', page.toString())
      params.set('limit', limit)
      const res = await fetch(`/api/clientes?${params.toString()}`)
      const json = await res.json()
      setData(json)
    } catch (error) { console.error('Error fetching data:', error) }
    finally { setLoading(false) }
  }, [page, limit, buildFilterParams])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { if (tableContainerRef.current) tableContainerRef.current.scrollTop = 0 }, [page])

  // Pre-compute diasSemVenda for each record — avoids recalculating in multiple places
  const dataWithDias = useMemo(() => {
    if (!data?.data) return []
    return data.data.map(r => ({
      ...r,
      _diasSemVenda: calcDiasSemVenda(r.parsed.ultima_venda),
    }))
  }, [data?.data])

  // Client-side filter for dias sem venda
  const filteredData = useMemo(() => {
    if (diasSemVendaFilter === 'all') return dataWithDias
    return dataWithDias.filter((r) => {
      const dias = r._diasSemVenda
      switch (diasSemVendaFilter) {
        case '0-45': return dias !== null && dias <= 45
        case '46-90': return dias !== null && dias > 45 && dias <= 90
        case '91-150': return dias !== null && dias > 90 && dias <= 150
        case '151+': return dias === null || dias > 150
        default: return true
      }
    })
  }, [dataWithDias, diasSemVendaFilter])

  // Client-side sort for computed fields
  const sortedData = useMemo(() => {
    let result = filteredData
    // Client-side sort for computed fields
    if (sortBy && CLIENT_SORT_KEYS.has(sortBy)) {
      result = [...result].sort((a, b) => {
        if (sortBy === 'dias_sem_venda') {
          const aVal = a._diasSemVenda
          const bVal = b._diasSemVenda
          if (aVal === null && bVal === null) return 0
          if (aVal === null) return 1
          if (bVal === null) return -1
          return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
        }
        return 0
      })
    }
    // Bring favorites to top (respecting their order)
    if (favoritos.length > 0) {
      const favSet = new Set(favoritos)
      const favOrder = new Map(favoritos.map((c, i) => [c, i]))
      const favs = result.filter(r => favSet.has(r.parsed.codigo))
      const rest = result.filter(r => !favSet.has(r.parsed.codigo))
      // Sort favorites by their favoritos order
      favs.sort((a, b) => (favOrder.get(a.parsed.codigo) ?? 0) - (favOrder.get(b.parsed.codigo) ?? 0))
      result = [...favs, ...rest]
    }
    return result
  }, [filteredData, sortBy, sortOrder, favoritos])

  // Row virtualizer — only renders visible rows for massive DOM savings
  const ROW_HEIGHT = 44
  const rowVirtualizer = useVirtualizer({
    count: sortedData.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  // Use server-side dsvStats
  const dsvStats = data?.stats.dias_sem_venda ?? { verde: 0, amarelo: 0, laranja: 0, vermelho: 0 }
  const isVendedor = (session?.user as any)?.role === 'VENDEDOR'

  const handleSort = (key: string) => {
    if (sortBy === key) {
      if (sortOrder === 'asc') setSortOrder('desc')
      else { setSortBy(''); setSortOrder('asc') }
    } else { setSortBy(key); setSortOrder('asc') }
    setPage(1)
  }

  const handleLimitChange = (val: string) => { setLimit(val); setPage(1) }

  const handleSave = async (codigo: string, field: keyof EditableFields, value: string) => {
    setSaving(codigo + field)
    try {
      const res = await fetch('/api/clientes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo, [field]: value }) })
      if (!res.ok) throw new Error('Erro ao salvar')
      toast({ title: '✓ Salvo', description: `${FIELD_LABELS[field] || field} atualizado com sucesso` })
      if (data) {
        setData({ ...data, data: data.data.map((r) => {
          if (r.parsed.codigo !== codigo) return r
          const topKey = field === 'pessoaContato' ? 'pessoa_contato' : field === 'observacoes' ? null : field
          return topKey
            ? { ...r, [topKey]: value, editable: { ...r.editable, [field]: value } }
            : { ...r, editable: { ...r.editable, [field]: value } }
        }) })
      }
    } catch (error) {
      console.error('Error saving:', error)
      toast({ title: '✗ Erro', description: 'Não foi possível salvar', variant: 'destructive' })
    }
    finally { setSaving(null) }
  }

  // Client detail modal
  const openDetail = (r: ClienteRecord) => {
    setShowNewClient(false)
    setDetailClient(r)
    setDetailTab('contato')
    setDetailObs(r.editable.observacoes)
    setAuditLogs([])
  }

  // Fetch audit logs when historico tab is active
  useEffect(() => {
    if (detailTab === 'historico' && detailClient) {
      setLoadingAudit(true)
      fetch(`/api/clientes/audit?codigo=${detailClient.parsed.codigo}`)
        .then(res => res.json())
        .then(json => setAuditLogs(json.data || []))
        .catch(() => setAuditLogs([]))
        .finally(() => setLoadingAudit(false))
    }
  }, [detailTab, detailClient])

  // Fetch vendas when vendas tab is active
  useEffect(() => {
    if (detailTab === 'vendas' && detailClient) {
      setLoadingVendas(true)
      setVendaDetail(null)
      fetch(`/api/clientes/${detailClient.parsed.codigo}/vendas`)
        .then(res => res.json())
        .then(json => {
          setClienteVendas(json.data || [])
          setClienteVendasStats(json.stats || null)
        })
        .catch(() => { setClienteVendas([]); setClienteVendasStats(null) })
        .finally(() => setLoadingVendas(false))
    }
  }, [detailTab, detailClient])

  const handleSaveObs = async () => {
    if (!detailClient) return
    setSavingObs(true)
    try {
      const res = await fetch('/api/clientes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: detailClient.parsed.codigo, observacoes: detailObs })
      })
      if (!res.ok) throw new Error('Erro ao salvar')
      toast({ title: '✓ Observações salvas', description: 'Atualizado com sucesso' })
      if (data) {
        setData({
          ...data,
          data: data.data.map(r => r.parsed.codigo === detailClient.parsed.codigo
            ? { ...r, editable: { ...r.editable, observacoes: detailObs } }
            : r
          )
        })
      }
      setDetailClient({ ...detailClient, editable: { ...detailClient.editable, observacoes: detailObs } })
    } catch (e) {
      console.error(e)
      toast({ title: '✗ Erro', description: 'Não foi possível salvar', variant: 'destructive' })
    }
    finally { setSavingObs(false) }
  }

  // Clear filters
  const hasActiveFilters = search !== '' || situacaoCadastral !== 'all' || vendedor !== 'all' || cidade !== 'all' || uf !== 'all' || diasSemVendaFilter !== 'all' || carteiraFilter !== 'all' || tipoFilter !== 'all'

  const clearFilters = () => {
    setSearch('')
    setSituacaoCadastral('all')
    setVendedor('all')
    setCidade('all')
    setUf('all')
    setDiasSemVendaFilter('all')
    setCarteiraFilter('all')
    setTipoFilter('all')
    setSortBy('')
    setSortOrder('asc')
    setPage(1)
  }

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(format)
    toast({ title: '⏳ Preparando exportação...', description: 'Aguarde enquanto o arquivo é gerado' })
    try {
      const params = buildFilterParams()
      params.set('format', format)
      const res = await fetch(`/api/clientes/export?${params.toString()}`)
      if (!res.ok) throw new Error('Erro na exportação')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `Cadastro_Clientes_Mtech_${new Date().toISOString().slice(0, 10)}.${format}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url)
      const count = data?.pagination.total ?? 0
      const label = format === 'csv' ? 'CSV (para Google Sheets)' : 'XLSX'
      toast({ title: `✓ ${count.toLocaleString('pt-BR')} clientes exportados`, description: `Arquivo ${label} baixado com sucesso` })
    } catch (error) {
      console.error('Error exporting:', error)
      toast({ title: '✗ Erro na exportação', description: 'Não foi possível gerar o arquivo', variant: 'destructive' })
    }
    finally { setExporting(null) }
  }

  const maskCnpj = (val: string) => {
    const d = val.replace(/\D/g, '').slice(0, 14)
    if (d.length <= 2) return d
    if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
    if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
    if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  }

  const consultReceita = async (cnpj: string) => {
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length !== 14) { setConsultError('CNPJ deve conter 14 dígitos'); return }
    setConsulting(true); setConsultError(''); setConsultWarning('')
    try {
      const res = await fetch(`/api/clientes/receita?cnpj=${digits}`)
      const json = await res.json()
      if (!res.ok) { setConsultError(json.error || 'Erro ao consultar'); return }
      if (json.exists) { setConsultWarning(json.message || 'Cliente já cadastrado'); return }
      const d = json.data
      if (d) {
        setForm((f) => ({
          ...f,
          razaoSocial: d.razao_social || f.razaoSocial,
          nomeFantasia: d.nome_fantasia || f.nomeFantasia,
          situacaoCadastral: d.situacao_cadastral || f.situacaoCadastral,
          endereco: d.endereco || f.endereco, numero: d.numero || f.numero,
          complemento: d.complemento || f.complemento, bairro: d.bairro || f.bairro,
          cidade: d.cidade || f.cidade, cep: d.cep || f.cep, uf: d.uf || f.uf,
          telefone1: d.telefone1 || f.telefone1, email1: d.email1 || f.email1,
          dataAbertura: d.data_abertura || f.dataAbertura,
          cnaePrincipal: d.cnae_principal || f.cnaePrincipal,
          naturezaJuridica: d.natureza_juridica || f.naturezaJuridica,
          porte: d.porte || f.porte,
        }))
      }
    } catch { setConsultError('Erro ao consultar a Receita Federal') }
    finally { setConsulting(false) }
  }

  const handleSaveNewClient = async () => {
    if (!form.cnpj.replace(/\D/g, '')) { setConsultError('CNPJ é obrigatório'); return }
    setSavingNew(true); setConsultError('')
    try {
      const res = await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const json = await res.json()
      if (!res.ok) { setConsultError(json.error || 'Erro ao criar cliente'); return }
      toast({ title: '✓ Cliente criado', description: 'Novo cliente cadastrado com sucesso' })
      setShowNewClient(false); setForm(EMPTY_FORM); setConsultWarning(''); fetchData()
    } catch { setConsultError('Erro ao criar cliente') }
    finally { setSavingNew(false) }
  }

  const openNewClient = () => { setForm(EMPTY_FORM); setConsultError(''); setConsultWarning(''); setNewClientTab('empresa'); setShowNewClient(true) }
  const updateForm = (field: keyof NewClientForm, value: string) => setForm((f) => ({ ...f, [field]: value }))

  // Keyboard navigation (Excel-style: arrow keys move cell, Enter opens detail)
  // Uses refs for focused position to avoid re-rendering the entire table on every key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!sortedData.length) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return

      const maxRow = sortedData.length - 1
      const maxCol = columns.length - 1
      let row = focusedRowRef.current
      let col = focusedColRef.current
      let changed = false

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        row = row < 0 ? 0 : Math.min(row + 1, maxRow)
        if (col < 0) col = 0
        changed = true
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        row = row <= 0 ? 0 : row - 1
        if (col < 0) col = 0
        changed = true
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        col = col < 0 ? 0 : Math.min(col + 1, maxCol)
        if (row < 0) row = 0
        changed = true
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        col = col <= 0 ? 0 : col - 1
        if (row < 0) row = 0
        changed = true
      } else if (e.key === 'Enter' && row >= 0 && row < sortedData.length) {
        e.preventDefault()
        if (col >= 0 && col < columns.length) {
          const column = columns[col]
          const editableKey = toEditableKey(column.key)
          if (column.editable && editableKey) {
            const cell = document.querySelector(`[data-cell="${row}-${col}"]`) as HTMLElement
            if (cell) { cell.click(); return }
          }
        }
        openDetail(sortedData[row])
        return
      } else if (e.key === 'Escape') {
        focusedRowRef.current = -1
        focusedColRef.current = -1
        setFocusedCell({ row: -1, col: -1 })
        return
      }

      if (changed) {
        focusedRowRef.current = row
        focusedColRef.current = col
        setFocusedCell({ row, col })
        // Scroll virtualized row into view if not currently visible
        rowVirtualizer.scrollToIndex(row, { align: 'auto' })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sortedData, columns, rowVirtualizer])

  // Auto-scroll focused cell into view (considering sticky columns)
  useEffect(() => {
    if (focusedCell.row < 0 || focusedCell.col < 0) return
    const cell = document.querySelector(`[data-cell="${focusedCell.row}-${focusedCell.col}"]`) as HTMLElement | null
    const container = tableContainerRef.current
    if (!cell || !container) return

    const cellRect = cell.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    // Calculate sticky width (frozen left columns)
    const stickyWidth = 36 + columns.filter(c => c.sticky === 'left').reduce((sum, c) => sum + (parseInt(c.minWidth || '0')), 0)

    // Horizontal scroll adjustment
    const cellLeft = cellRect.left - containerRect.left
    const cellRight = cellRect.right - containerRect.left
    const visibleLeft = stickyWidth + 4 // 4px padding
    const visibleRight = containerRect.width - container.clientWidth + container.scrollWidth - container.scrollLeft

    if (cellLeft < visibleLeft) {
      // Cell is behind sticky columns — scroll left to reveal it
      container.scrollLeft += cellLeft - visibleLeft - 8
    } else if (cellRight > containerRect.width - 4) {
      // Cell is past right edge — scroll right
      container.scrollLeft += cellRight - containerRect.width + 8
    }

    // Vertical scroll adjustment
    const cellTop = cellRect.top - containerRect.top
    const cellBottom = cellRect.bottom - containerRect.top
    if (cellTop < 0) {
      container.scrollTop += cellTop - 2
    } else if (cellBottom > containerRect.height) {
      container.scrollTop += cellBottom - containerRect.height + 2
    }
  }, [focusedCell, columns])

  const totalPages = data?.pagination.totalPages ?? 0
  const scStats = data?.stats.situacao_cadastral ?? {}
  const showingAll = limit === 'all'
  const nowBrasilia = getNowBrasilia()
  // For client-side display, always use America/Sao_Paulo timezone explicitly
  const brasiliaOpts: Intl.DateTimeFormatOptions = { timeZone: 'America/Sao_Paulo' }
  const todayStr = new Date().toLocaleDateString('pt-BR', { ...brasiliaOpts, day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = new Date().toLocaleTimeString('pt-BR', { ...brasiliaOpts, hour: '2-digit', minute: '2-digit' })

  const handlePageJump = () => {
    const num = parseInt(pageJump)
    if (num >= 1 && num <= totalPages) {
      setPage(num)
      setPageJump('')
    }
  }

  // Reset focused cell when data changes
  useEffect(() => { focusedRowRef.current = -1; focusedColRef.current = -1; setFocusedCell({ row: -1, col: -1 }) }, [data?.data])

  // Show loading while checking session
  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="size-8 animate-spin text-teal-600" />
      </div>
    )
  }

  if (!session) return null

  const handleBolsaoCheck = async () => {
    try {
      const res = await fetch('/api/clientes/bolsao', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({
        title: '✓ Bolsão atualizado',
        description: `${data.movedToBolsao} clientes movidos para o Bolsão`,
      })
      fetchData()
    } catch (e: any) {
      toast({ title: '✗ Erro', description: e.message, variant: 'destructive' })
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <header className="bg-white dark:bg-slate-900 border-b dark:border-slate-700 shadow-sm sticky top-0 z-10">
        <div className="max-w-[1900px] mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-md"><Building2 className="size-5" /></div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Cadastro de Clientes</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">M-Tech Distribuidora de Informática Ltda — {todayStr} {timeStr}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              <Button variant="outline" size="sm" onClick={openNewClient} className="bg-teal-600 text-white hover:bg-teal-700 border-teal-600"><UserPlus className="size-4 mr-1.5" />Novo Cliente</Button>
              {!isVendedor && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={exporting !== null} className="bg-slate-700 text-white hover:bg-slate-800 border-slate-700 dark:bg-slate-600 dark:hover:bg-slate-500 dark:border-slate-600">
                      <Download className={`size-4 mr-1.5 ${exporting ? 'animate-bounce' : ''}`} />
                      {exporting ? 'Exportando...' : 'Exportar'}
                      <ChevronDown className="size-3.5 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => handleExport('xlsx')} disabled={exporting !== null}>
                      <Download className="size-4 mr-2" />
                      Exportar XLSX
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport('csv')} disabled={exporting !== null}>
                      <Download className="size-4 mr-2" />
                      Exportar CSV (Google Sheets)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button variant="outline" size="sm" onClick={() => { setColumnOrder(DEFAULT_COLUMNS.map(c => c.key)); localStorage.removeItem('columnOrder') }} className="text-slate-600 dark:text-slate-400"><RotateCcw className="size-4 mr-1.5" />Restaurar Colunas</Button>
              {!isVendedor && <Button variant="outline" size="sm" onClick={() => setShowSheetsSync(true)} className={`text-teal-600 dark:text-teal-400 border-teal-300 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/30 ${sheetsConnected ? 'ring-1 ring-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20' : ''}`}><SheetIcon className="size-4 mr-1.5" />Google Sheets{sheetsConnected && <span className="ml-1.5 size-2 rounded-full bg-emerald-500 inline-block animate-pulse" title="Conectado" />}</Button>}
              <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}><RefreshCw className={`size-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />Atualizar</Button>
              {session && (session.user as any).role !== 'VENDEDOR' && (
                <Button variant="outline" size="sm" onClick={handleBolsaoCheck} className="text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"><AlertCircle className="size-4 mr-1.5" />Verificar Bolsão</Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}>
                {mounted && (theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />)}
              </Button>
            </div>
            {/* Auth user menu — always pinned to the right, never wraps */}
            <div className="flex-shrink-0 ml-auto sm:ml-2">
              <AuthUserMenu onOpen2FA={() => setShow2FASetup(true)} onOpenUserManagement={() => setShowUserManagement(true)} onOpenPermissions={() => setShowPermissions(true)} />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1900px] mx-auto w-full px-4 sm:px-6 py-4">
        {/* Compact Stats Bar */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm px-4 py-2 mb-3 overflow-hidden">
          {isVendedor ? (
            <>
              {/* VENDEDOR VIEW: Own stats only */}
              {/* Row 1: Key stats — clicáveis como filtros */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <button className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all ${tipoFilter === 'all' && carteiraFilter === 'all' ? 'bg-slate-200 dark:bg-slate-700 ring-1 ring-slate-400 dark:ring-slate-500' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}`} onClick={() => { setTipoFilter('all'); setCarteiraFilter('all'); setPage(1) }} title="Mostrar todos">
                  <Users className="size-3.5 text-slate-500 dark:text-slate-400" /><span className="text-slate-700 dark:text-slate-300">Total</span> <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{data?.stats.total.toLocaleString('pt-BR') ?? '—'}</span>
                </button>
                <span className="text-slate-300 dark:text-slate-600">│</span>
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tipos</span>
                <button className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all ${tipoFilter === 'CORPORATIVO' && carteiraFilter === 'COM_VENDEDOR' ? 'bg-purple-100 dark:bg-purple-900/40 ring-1 ring-purple-400' : 'hover:bg-purple-50 dark:hover:bg-purple-950/20'}`} onClick={() => { if (tipoFilter === 'CORPORATIVO' && carteiraFilter === 'COM_VENDEDOR') { setTipoFilter('all'); setCarteiraFilter('all') } else { setTipoFilter('CORPORATIVO'); setCarteiraFilter('COM_VENDEDOR') }; setPage(1) }} title="Meus Clientes Corporativos">
                  <Building2 className="size-3 text-purple-500 dark:text-purple-400" /><span className="text-purple-700 dark:text-purple-400">Corp.</span> <span className="font-bold text-purple-700 dark:text-purple-400">{(data?.stats.tipo?.corporativo ?? 0).toLocaleString('pt-BR')}</span>
                </button>
                <button className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all ${tipoFilter === 'REVENDA' && carteiraFilter === 'COM_VENDEDOR' ? 'bg-teal-100 dark:bg-teal-900/40 ring-1 ring-teal-400' : 'hover:bg-teal-50 dark:hover:bg-teal-950/20'}`} onClick={() => { if (tipoFilter === 'REVENDA' && carteiraFilter === 'COM_VENDEDOR') { setTipoFilter('all'); setCarteiraFilter('all') } else { setTipoFilter('REVENDA'); setCarteiraFilter('COM_VENDEDOR') }; setPage(1) }} title="Meus Clientes Revenda">
                  <Briefcase className="size-3 text-teal-500 dark:text-teal-400" /><span className="text-teal-700 dark:text-teal-400">Rev.</span> <span className="font-bold text-teal-700 dark:text-teal-400">{(data?.stats.tipo?.revendas ?? 0).toLocaleString('pt-BR')}</span>
                </button>
                <span className="text-slate-300 dark:text-slate-600">│</span>
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Carteiras</span>
                <button className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all ${carteiraFilter === 'BOLSAO' ? 'bg-amber-100 dark:bg-amber-900/40 ring-1 ring-amber-400' : 'hover:bg-amber-50 dark:hover:bg-amber-950/20'}`} onClick={() => { if (carteiraFilter === 'BOLSAO') { setCarteiraFilter('all'); setTipoFilter('all') } else { setCarteiraFilter('BOLSAO'); setTipoFilter('all') }; setPage(1) }} title="Clientes do Bolsão">
                  <Package className="size-3 text-amber-500 dark:text-amber-400" /><span className="text-amber-700 dark:text-amber-400">BOLSÃO</span> <span className="font-bold text-amber-700 dark:text-amber-400">{(data?.stats.carteira?.bolsao ?? 0).toLocaleString('pt-BR')}</span>
                </button>
              </div>
              {/* Row 2: Clientes (DSV) com labels explícitos + Bolsão */}
              <div className="flex flex-wrap items-center gap-2 mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700/60 text-xs">
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">Clientes</span>
                <button className={`flex items-center gap-1.5 rounded px-2 py-1 transition-all ${diasSemVendaFilter === '0-45' ? 'bg-emerald-100 dark:bg-emerald-900/40 ring-1 ring-emerald-400' : 'hover:bg-emerald-50 dark:hover:bg-emerald-950/20'}`} onClick={() => { setDiasSemVendaFilter(diasSemVendaFilter === '0-45' ? 'all' : '0-45'); setPage(1) }} title="1–45 dias sem venda">
                  <span className="size-2.5 rounded-full bg-emerald-500" /><span className="text-emerald-700 dark:text-emerald-400 font-bold">{dsvStats.verde.toLocaleString('pt-BR')}</span><span className="text-slate-500 dark:text-slate-400">1-45 dias</span>
                </button>
                <button className={`flex items-center gap-1.5 rounded px-2 py-1 transition-all ${diasSemVendaFilter === '46-90' ? 'bg-amber-100 dark:bg-amber-900/40 ring-1 ring-amber-400' : 'hover:bg-amber-50 dark:hover:bg-amber-950/20'}`} onClick={() => { setDiasSemVendaFilter(diasSemVendaFilter === '46-90' ? 'all' : '46-90'); setPage(1) }} title="46–90 dias sem venda">
                  <span className="size-2.5 rounded-full bg-amber-500" /><span className="text-amber-600 dark:text-amber-400 font-bold">{dsvStats.amarelo.toLocaleString('pt-BR')}</span><span className="text-slate-500 dark:text-slate-400">46-90 dias</span>
                </button>
                <button className={`flex items-center gap-1.5 rounded px-2 py-1 transition-all ${diasSemVendaFilter === '91-150' ? 'bg-orange-100 dark:bg-orange-900/40 ring-1 ring-orange-400' : 'hover:bg-orange-50 dark:hover:bg-orange-950/20'}`} onClick={() => { setDiasSemVendaFilter(diasSemVendaFilter === '91-150' ? 'all' : '91-150'); setPage(1) }} title="91–150 dias sem venda">
                  <span className="size-2.5 rounded-full bg-orange-500" /><span className="text-orange-600 dark:text-orange-400 font-bold">{dsvStats.laranja.toLocaleString('pt-BR')}</span><span className="text-slate-500 dark:text-slate-400">91-150 dias</span>
                </button>
                <button className={`flex items-center gap-1.5 rounded px-2 py-1 transition-all ${diasSemVendaFilter === '151+' ? 'bg-red-100 dark:bg-red-900/40 ring-1 ring-red-400' : 'hover:bg-red-50 dark:hover:bg-red-950/20'}`} onClick={() => { setDiasSemVendaFilter(diasSemVendaFilter === '151+' ? 'all' : '151+'); setPage(1) }} title="151+ dias sem venda">
                  <span className="size-2.5 rounded-full bg-red-500" /><span className="text-red-600 dark:text-red-400 font-bold">{dsvStats.vermelho.toLocaleString('pt-BR')}</span><span className="text-slate-500 dark:text-slate-400">151+ dias</span>
                </button>

              </div>
            </>
          ) : (
            <>
              {/* ADMIN / DIRETOR / GERENTE VIEW: Company-wide stats */}
              {/* Row 1: Key stats — clicáveis como filtros */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <button className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all ${tipoFilter === 'all' && carteiraFilter === 'all' ? 'bg-slate-200 dark:bg-slate-700 ring-1 ring-slate-400 dark:ring-slate-500' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}`} onClick={() => { setTipoFilter('all'); setCarteiraFilter('all'); setPage(1) }} title="Mostrar todos">
                  <Users className="size-3.5 text-slate-500 dark:text-slate-400" /><span className="text-slate-700 dark:text-slate-300">Total</span> <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{data?.stats.total.toLocaleString('pt-BR') ?? '—'}</span>
                </button>
                <span className="text-slate-300 dark:text-slate-600">│</span>
                <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400"><AlertTriangle className="size-3.5" />Irreg. <span className="font-bold">{((scStats['BAIXADA'] ?? 0) + (scStats['INAPTA'] ?? 0) + (scStats['SUSPENSA'] ?? 0)).toLocaleString('pt-BR')}</span></span>
                <span className="text-slate-300 dark:text-slate-600">│</span>
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tipos</span>
                <button className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all ${tipoFilter === 'CORPORATIVO' ? 'bg-purple-100 dark:bg-purple-900/40 ring-1 ring-purple-400' : 'hover:bg-purple-50 dark:hover:bg-purple-950/20'}`} onClick={() => { setTipoFilter(tipoFilter === 'CORPORATIVO' ? 'all' : 'CORPORATIVO'); setPage(1) }} title="Filtrar Corporativo">
                  <Building2 className="size-3 text-purple-500 dark:text-purple-400" /><span className="text-purple-700 dark:text-purple-400">Corp.</span> <span className="font-bold text-purple-700 dark:text-purple-400">{(data?.stats.tipo?.corporativo ?? 0).toLocaleString('pt-BR')}</span>
                </button>
                <button className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all ${tipoFilter === 'REVENDA' ? 'bg-teal-100 dark:bg-teal-900/40 ring-1 ring-teal-400' : 'hover:bg-teal-50 dark:hover:bg-teal-950/20'}`} onClick={() => { setTipoFilter(tipoFilter === 'REVENDA' ? 'all' : 'REVENDA'); setPage(1) }} title="Filtrar Revenda">
                  <Briefcase className="size-3 text-teal-500 dark:text-teal-400" /><span className="text-teal-700 dark:text-teal-400">Rev.</span> <span className="font-bold text-teal-700 dark:text-teal-400">{(data?.stats.tipo?.revendas ?? 0).toLocaleString('pt-BR')}</span>
                </button>
                <span className="text-slate-300 dark:text-slate-600">│</span>
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Carteiras</span>
                <button className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all ${carteiraFilter === 'COM_VENDEDOR' ? 'bg-teal-100 dark:bg-teal-900/40 ring-1 ring-teal-400' : 'hover:bg-teal-50 dark:hover:bg-teal-950/20'}`} onClick={() => { setCarteiraFilter(carteiraFilter === 'COM_VENDEDOR' ? 'all' : 'COM_VENDEDOR'); setPage(1) }} title="Filtrar Com Vendedor">
                  <User className="size-3 text-teal-500 dark:text-teal-400" /><span className="text-teal-700 dark:text-teal-400">c/ Vended.</span> <span className="font-bold text-teal-700 dark:text-teal-400">{(data?.stats.carteira?.com_vendedor ?? 0).toLocaleString('pt-BR')}</span>
                </button>
                <button className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all ${carteiraFilter === 'BOLSAO' ? 'bg-amber-100 dark:bg-amber-900/40 ring-1 ring-amber-400' : 'hover:bg-amber-50 dark:hover:bg-amber-950/20'}`} onClick={() => { setCarteiraFilter(carteiraFilter === 'BOLSAO' ? 'all' : 'BOLSAO'); setPage(1) }} title="Filtrar Bolsão">
                  <Package className="size-3 text-amber-500 dark:text-amber-400" /><span className="text-amber-700 dark:text-amber-400">BOLSÃO</span> <span className="font-bold text-amber-700 dark:text-amber-400">{(data?.stats.carteira?.bolsao ?? 0).toLocaleString('pt-BR')}</span>
                </button>
                <button className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all ${carteiraFilter === 'LISTA_FRIA' ? 'bg-slate-200 dark:bg-slate-700 ring-1 ring-slate-400' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}`} onClick={() => { setCarteiraFilter(carteiraFilter === 'LISTA_FRIA' ? 'all' : 'LISTA_FRIA'); setPage(1) }} title="Filtrar Lista Fria">
                  <Users className="size-3 text-slate-500 dark:text-slate-400" /><span className="text-slate-600 dark:text-slate-400">LISTA FRIA</span> <span className="font-bold text-slate-600 dark:text-slate-400">{(data?.stats.carteira?.lista_fria ?? 0).toLocaleString('pt-BR')}</span>
                </button>
                <button className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all ${carteiraFilter === 'FORNECEDOR' ? 'bg-orange-100 dark:bg-orange-900/40 ring-1 ring-orange-400' : 'hover:bg-orange-50 dark:hover:bg-orange-950/20'}`} onClick={() => { setCarteiraFilter(carteiraFilter === 'FORNECEDOR' ? 'all' : 'FORNECEDOR'); setPage(1) }} title="Filtrar Fornecedores">
                  <Package className="size-3 text-orange-500 dark:text-orange-400" /><span className="text-orange-700 dark:text-orange-400">FORNEC.</span> <span className="font-bold text-orange-700 dark:text-orange-400">{(data?.stats.carteira?.fornecedores ?? 0).toLocaleString('pt-BR')}</span>
                </button>
              </div>
              {/* Row 2: DSV filter buttons */}
              <div className="flex flex-wrap items-center gap-2 mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700/60 text-xs">
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">Clientes</span>
                <button className={`flex items-center gap-1.5 rounded px-2 py-1 transition-all ${diasSemVendaFilter === '0-45' ? 'bg-emerald-100 dark:bg-emerald-900/40 ring-1 ring-emerald-400' : 'hover:bg-emerald-50 dark:hover:bg-emerald-950/20'}`} onClick={() => { setDiasSemVendaFilter(diasSemVendaFilter === '0-45' ? 'all' : '0-45'); setPage(1) }} title="1–45 dias sem venda">
                  <span className="size-2.5 rounded-full bg-emerald-500" /><span className="text-emerald-700 dark:text-emerald-400 font-bold">{dsvStats.verde.toLocaleString('pt-BR')}</span><span className="text-slate-500 dark:text-slate-400">1-45 dias</span>
                </button>
                <button className={`flex items-center gap-1.5 rounded px-2 py-1 transition-all ${diasSemVendaFilter === '46-90' ? 'bg-amber-100 dark:bg-amber-900/40 ring-1 ring-amber-400' : 'hover:bg-amber-50 dark:hover:bg-amber-950/20'}`} onClick={() => { setDiasSemVendaFilter(diasSemVendaFilter === '46-90' ? 'all' : '46-90'); setPage(1) }} title="46–90 dias sem venda">
                  <span className="size-2.5 rounded-full bg-amber-500" /><span className="text-amber-600 dark:text-amber-400 font-bold">{dsvStats.amarelo.toLocaleString('pt-BR')}</span><span className="text-slate-500 dark:text-slate-400">46-90 dias</span>
                </button>
                <button className={`flex items-center gap-1.5 rounded px-2 py-1 transition-all ${diasSemVendaFilter === '91-150' ? 'bg-orange-100 dark:bg-orange-900/40 ring-1 ring-orange-400' : 'hover:bg-orange-50 dark:hover:bg-orange-950/20'}`} onClick={() => { setDiasSemVendaFilter(diasSemVendaFilter === '91-150' ? 'all' : '91-150'); setPage(1) }} title="91–150 dias sem venda">
                  <span className="size-2.5 rounded-full bg-orange-500" /><span className="text-orange-600 dark:text-orange-400 font-bold">{dsvStats.laranja.toLocaleString('pt-BR')}</span><span className="text-slate-500 dark:text-slate-400">91-150 dias</span>
                </button>
                <button className={`flex items-center gap-1.5 rounded px-2 py-1 transition-all ${diasSemVendaFilter === '151+' ? 'bg-red-100 dark:bg-red-900/40 ring-1 ring-red-400' : 'hover:bg-red-50 dark:hover:bg-red-950/20'}`} onClick={() => { setDiasSemVendaFilter(diasSemVendaFilter === '151+' ? 'all' : '151+'); setPage(1) }} title="151+ dias sem venda">
                  <span className="size-2.5 rounded-full bg-red-500" /><span className="text-red-600 dark:text-red-400 font-bold">{dsvStats.vermelho.toLocaleString('pt-BR')}</span><span className="text-slate-500 dark:text-slate-400">151+ dias</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Hint */}
        <div className="flex items-center gap-2 mb-3 text-xs text-slate-500 dark:text-slate-400">
          <Pencil className="size-3" />
          <span>Clique nos campos com <Pencil className="size-2.5 inline text-teal-500 dark:text-teal-400" /> para editar · Arraste <GripVertical className="size-3 inline" /> para reordenar colunas · Clique na linha para ver ficha · <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px]">↑↓←→</kbd> navegar · <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px]">Enter</kbd> abrir/editar · <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px]">Esc</kbd> sair</span>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm px-4 py-2 mb-3">
            <div className="flex flex-col sm:flex-row gap-2 flex-wrap items-center">              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 dark:text-slate-500" />
                <Input placeholder="Buscar por razão social, CNPJ, código, cidade..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={situacaoCadastral} onValueChange={(val) => { setSituacaoCadastral(val); setPage(1) }}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Situação Cadastral" /></SelectTrigger><SelectContent><SelectItem value="all">Situação Cadastral</SelectItem>{data?.filters.situacao_cadastral.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent></Select>
              {isVendedor ? (
                <div className="flex items-center gap-2 px-3 h-9 rounded-md border bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800 min-w-[140px]">
                  <User className="size-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span className="text-sm font-semibold text-teal-800 dark:text-teal-300 truncate">{session?.user?.name || 'Vendedor'}</span>
                </div>
              ) : (
                <Select value={vendedor} onValueChange={(val) => { setVendedor(val); setPage(1) }}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Vendedor" /></SelectTrigger><SelectContent><SelectItem value="all">Todos Vendedores</SelectItem>{data?.filters.vendedores.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}</SelectContent></Select>
              )}
              <div className="flex gap-1.5 w-full sm:w-auto">
                <Select value={uf} onValueChange={(val) => { setUf(val); setCidade('all'); setPage(1) }}><SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="Estado" /></SelectTrigger><SelectContent><SelectItem value="all">Todos Estados</SelectItem>{data?.filters.ufs.map((u) => (<SelectItem key={u} value={u}>{u}</SelectItem>))}</SelectContent></Select>
                <Select value={cidade} onValueChange={(val) => { setCidade(val); setPage(1) }}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Cidade" /></SelectTrigger><SelectContent><SelectItem value="all">Todas Cidades</SelectItem>{(uf === 'all' ? (data?.filters.cidades || []) : (data?.filters.cidadesPorUf?.[uf] || [])).map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent></Select>
              </div>
              {isVendedor ? (
                <Select value={carteiraFilter} onValueChange={(val) => { setCarteiraFilter(val); setPage(1) }}><SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Carteira" /></SelectTrigger><SelectContent><SelectItem value="all">Todas Carteiras</SelectItem><SelectItem value="COM_VENDEDOR">Meus Clientes</SelectItem><SelectItem value="BOLSAO">BOLSÃO</SelectItem></SelectContent></Select>
              ) : (
                <Select value={carteiraFilter} onValueChange={(val) => { setCarteiraFilter(val); setPage(1) }}><SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Carteira" /></SelectTrigger><SelectContent><SelectItem value="all">Todas Carteiras</SelectItem>{data?.filters.carteiras?.includes('COM_VENDEDOR') && <SelectItem value="COM_VENDEDOR">COM VENDEDOR</SelectItem>}{data?.filters.carteiras?.includes('BOLSAO') && <SelectItem value="BOLSAO">BOLSÃO</SelectItem>}{data?.filters.carteiras?.includes('LISTA_FRIA') && <SelectItem value="LISTA_FRIA">LISTA FRIA</SelectItem>}{data?.filters.carteiras?.includes('FORNECEDOR') && <SelectItem value="FORNECEDOR">FORNECEDOR</SelectItem>}</SelectContent></Select>
              )}
              <Select value={tipoFilter} onValueChange={(val) => { setTipoFilter(val); setPage(1) }}><SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Tipo" /></SelectTrigger><SelectContent><SelectItem value="all">Todos Tipos</SelectItem><SelectItem value="REVENDA">Revenda</SelectItem><SelectItem value="CORPORATIVO">Corporativo</SelectItem></SelectContent></Select>
              <Select value={diasSemVendaFilter} onValueChange={(val) => { setDiasSemVendaFilter(val); setPage(1) }}><SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Dias S/ Venda" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="0-45">🟢 1–45 dias</SelectItem><SelectItem value="46-90">🟡 46–90 dias</SelectItem><SelectItem value="91-150">🟠 91–150 dias</SelectItem><SelectItem value="151+">🔴 151+ dias</SelectItem></SelectContent></Select>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="shrink-0 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400">
                  <XCircle className="size-4 mr-1.5" />Limpar Filtros
                </Button>
              )}
            </div>
        </div>

        {/* Data Table — CSS Grid for perfect column alignment with virtualization */}
        <Card className="border-0 shadow-sm dark:bg-slate-800">
          <CardContent className="p-0">
            <div ref={tableContainerRef} className="overflow-auto custom-scrollbar" style={{ maxHeight: showingAll ? '80vh' : '60vh', minHeight: '200px' }}>
              {/* Header row — sticky at top */}
              <div
                className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700"
                style={{ display: 'grid', gridTemplateColumns: gridTemplate, minWidth: 'max-content' }}
              >
                {/* Favorite header */}
                <div className="flex items-center justify-center px-1 py-2.5 text-slate-500 dark:text-slate-400">
                  <Star className="size-3.5 text-amber-500 dark:text-amber-400" />
                </div>
                {columns.map((col) => {
                  const isSticky = col.sticky === 'left'
                  const isEditable = col.editable
                  let headerBg = 'bg-slate-50 dark:bg-slate-800'
                  let headerText = 'text-slate-700 dark:text-slate-200'
                  if (isEditable) { headerBg = 'bg-teal-50 dark:bg-teal-900'; headerText = 'text-teal-800 dark:text-teal-200' }
                  if (isSticky) headerBg = 'bg-slate-100 dark:bg-slate-800'
                  const isDragging = dragKey === col.key
                  const isDragOver = dragOverKey === col.key
                  if (isDragging) { headerBg = 'bg-teal-100 dark:bg-teal-900'; headerText = 'text-teal-900 dark:text-teal-200' }
                  if (isDragOver) headerBg = 'bg-amber-100 dark:bg-amber-900'

                  return (
                    <div
                      key={col.key}
                      className={`font-semibold ${headerText} text-xs ${headerBg} cursor-pointer select-none transition-colors flex items-center gap-1 px-3 py-2.5 ${isDragging ? 'opacity-60' : ''} ${col.centered ? 'justify-center' : ''} ${isSticky ? 'sticky z-[7]' : ''}`}
                      style={isSticky ? { left: col.stickyOffset } : undefined}
                      onClick={() => handleSort(col.key)}
                      draggable={!isSticky}
                      onDragStart={(e) => !isSticky && handleDragStart(e, col.key)}
                      onDragOver={(e) => { e.preventDefault(); if (!isSticky) handleDragOver(e, col.key) }}
                      onDrop={(e) => !isSticky && handleDrop(e, col.key)}
                    >
                      {!isSticky && <GripVertical className="size-3 text-slate-300 dark:text-slate-600 shrink-0 cursor-grab active:cursor-grabbing" />}
                      {col.label}
                      {isEditable && <Pencil className="size-2.5 text-teal-600 dark:text-teal-300 shrink-0" />}
                      {sortBy === col.key ? (
                        col.numericSort ? (
                          sortOrder === 'asc' ? <ArrowUpNarrowWide className="size-3.5 text-teal-700 dark:text-teal-300 shrink-0" /> : <ArrowDownWideNarrow className="size-3.5 text-teal-700 dark:text-teal-300 shrink-0" />
                        ) : (
                          sortOrder === 'asc' ? <ArrowUpAZ className="size-3.5 text-teal-700 dark:text-teal-300 shrink-0" /> : <ArrowDownZA className="size-3.5 text-teal-700 dark:text-teal-300 shrink-0" />
                        )
                      ) : <ArrowUpDown className="size-3 text-slate-400 dark:text-slate-500 shrink-0" />}
                    </div>
                  )
                })}
              </div>

              {/* Body rows — virtualized with CSS Grid */}
              <div style={{ position: 'relative', height: loading ? undefined : `${rowVirtualizer.getTotalSize()}px` }}>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: gridTemplate, minWidth: 'max-content' }}>
                      <div className="px-1 py-2 flex items-center justify-center"><div className="h-3 w-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" /></div>
                      {columns.map((col) => (<div key={col.key} className="px-3 py-2"><div className="h-3 bg-slate-100 dark:bg-slate-700 rounded animate-pulse w-16" /></div>))}
                    </div>
                  ))
                ) : sortedData.length > 0 ? (
                  rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const idx = virtualRow.index
                    const r = sortedData[idx]
                    const isEven = idx % 2 === 0
                    const rowBg = isEven ? 'bg-white dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-800'
                    const diasSemVenda = r._diasSemVenda

                    return (
                      <div
                        key={idx}
                        data-index={idx}
                        className={`${rowBg} ${favoritos.includes(r.parsed.codigo) ? 'border-l-2 border-l-amber-400 dark:border-l-amber-500' : ''} hover:bg-teal-50/40 dark:hover:bg-teal-900/30 transition-colors cursor-pointer`}
                        onClick={() => openDetail(r)}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                          display: 'grid',
                          gridTemplateColumns: gridTemplate,
                          minWidth: 'max-content',
                        }}
                      >
                        {/* Favorite star cell */}
                        <div className={`flex items-center justify-center px-1 sticky left-0 z-[5] ${isEven ? 'bg-white dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-800'}`} onClick={(e) => { e.stopPropagation(); toggleFavorito(r.parsed.codigo) }}>
                          <button className="p-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors" title={favoritos.includes(r.parsed.codigo) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}>
                            <Star className={`size-4 ${favoritos.includes(r.parsed.codigo) ? 'fill-amber-400 text-amber-500 dark:fill-amber-400 dark:text-amber-400' : 'text-slate-300 dark:text-slate-600 hover:text-amber-400 dark:hover:text-amber-400'} transition-colors`} />
                          </button>
                        </div>
                        {columns.map((col, colIdx) => {
                          const isSticky = col.sticky === 'left'
                          const editableKey = toEditableKey(col.key)
                          const isCellFocused = focusedCell.row === idx && focusedCell.col === colIdx
                          const cellFocus = isCellFocused ? 'ring-2 ring-inset ring-teal-500 dark:ring-teal-400 bg-teal-50/80 dark:bg-teal-900/50' : ''

                          if (col.key === 'dias_sem_venda') {
                            return <div key={col.key} data-cell={`${idx}-${colIdx}`} className={`flex items-center whitespace-nowrap px-3 py-2 ${col.centered ? 'justify-center' : ''} ${cellFocus}`} onClick={(e) => e.stopPropagation()}><DiasSemVendaBadge dias={diasSemVenda} ultimaVenda={r.parsed.ultima_venda} /></div>
                          }

                          const val = getRecordValue(r, col.key)

                          if (col.key === 'situacao_cadastral') return <div key={col.key} data-cell={`${idx}-${colIdx}`} className={`flex items-center whitespace-nowrap px-3 py-2 ${cellFocus}`} onClick={(e) => e.stopPropagation()}><SituacaoCadastralBadge value={val} /></div>
                          if (col.key === 'carteira') {
                            const carteiraValue = r.carteira || 'COM_VENDEDOR'
                            const label = CARTEIRA_LABELS[carteiraValue] || carteiraValue
                            const colorClass = CARTEIRA_COLORS[carteiraValue] || ''
                            return (
                              <div key={col.key} data-cell={`${idx}-${colIdx}`} className={`flex items-center whitespace-nowrap px-3 py-2 ${cellFocus}`} onClick={(e) => e.stopPropagation()}>
                                <Badge variant="outline" className={`text-[11px] ${colorClass}`}>
                                  {label}
                                </Badge>
                              </div>
                            )
                          }
                          if (col.key === 'tipo') {
                            return (
                              <div key={col.key} data-cell={`${idx}-${colIdx}`} className={`flex items-center whitespace-nowrap px-3 py-2 ${cellFocus}`} onClick={(e) => e.stopPropagation()}>
                                <Badge className={`${r.tipo === 'CORPORATIVO' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300'} text-xs border`}>
                                  {r.tipo === 'CORPORATIVO' ? 'Corporativo' : 'Revenda'}
                                </Badge>
                              </div>
                            )
                          }
                          if (col.key === 'reg_simples') return <div key={col.key} data-cell={`${idx}-${colIdx}`} className={`flex items-center whitespace-nowrap px-3 py-2 ${cellFocus}`} onClick={(e) => e.stopPropagation()}>{val ? <Badge variant="secondary" className="text-xs">{val}</Badge> : <span className="text-xs text-slate-400">—</span>}</div>

                          if (col.editable && editableKey) {
                            const isPhone = PHONE_FIELDS.has(col.key)
                            const isEmailCell = EMAIL_FIELDS.has(col.key)
                            const isObs = col.key === 'observacoes'
                            return <div key={col.key} data-cell={`${idx}-${colIdx}`} className={`flex items-center bg-teal-50/30 dark:bg-teal-900/20 whitespace-nowrap truncate px-3 py-2 ${cellFocus}`} onClick={(e) => e.stopPropagation()} title={val || undefined}><EditableCell value={val} codigo={r.parsed.codigo} field={editableKey} onSave={handleSave} isPhone={isPhone} isEmail={isEmailCell} isObservacoes={isObs} /></div>
                          }

                          if (isSticky) {
                            return (
                              <div key={col.key} data-cell={`${idx}-${colIdx}`} className={`flex items-center whitespace-nowrap sticky z-[4] ${rowBg} ${col.key === 'codigo' ? 'font-mono font-medium text-teal-700 dark:text-teal-400 text-xs' : 'text-xs truncate dark:text-slate-200'} px-3 py-2 relative ${cellFocus} after:absolute after:top-0 after:right-0 after:bottom-0 after:w-3 after:bg-gradient-to-r after:from-transparent ${isEven ? 'after:to-white dark:after:to-slate-900' : 'after:to-slate-100 dark:after:to-slate-800'}`} style={isSticky ? { left: col.stickyOffset } : undefined} title={col.key === 'razao_social' ? val : undefined}>
                                {val || '—'}
                              </div>
                            )
                          }

                          const isMono = ['ie_rg', 'cep', 'cnpj'].includes(col.key)
                          // All text columns use truncate to prevent overflow, like Excel
                          const noTruncateKeys = new Set(['dias_sem_venda', 'situacao_cadastral', 'carteira', 'tipo', 'reg_simples'])
                          const isTruncate = !noTruncateKeys.has(col.key) && !col.editable && !isSticky

                          let displayVal = val || '—'
                          let docTipo: 'CNPJ' | 'CPF' | 'INVALIDO' | null = null
                          if (col.key === 'cnpj' && val) {
                            const doc = formatDocumento(val)
                            displayVal = doc.formatted
                            docTipo = doc.tipo
                          } else if (col.key === 'cep' && val) {
                            displayVal = formatCep(val)
                          }

                          // Build tooltip: show full value for truncated cells, and document info for cnpj
                          let cellTitle: string | undefined
                          if (col.key === 'cnpj' && val) {
                            cellTitle = `${docTipo === 'CPF' ? 'CPF' : 'CNPJ'}: ${val}`
                          } else if (isTruncate && val) {
                            cellTitle = val
                          }

                          return (
                            <div key={col.key} data-cell={`${idx}-${colIdx}`} className={`flex items-center text-xs whitespace-nowrap px-3 py-2 ${isMono ? 'font-mono' : ''} ${isTruncate ? 'truncate' : ''} ${col.centered ? 'justify-center' : ''} dark:text-slate-300 ${cellFocus}`} title={cellTitle}>
                              {col.key === 'vendedor' ? <span className="font-medium">{displayVal}</span> : displayVal}
                              {col.key === 'cnpj' && docTipo === 'CPF' && <span className="ml-1 text-[9px] text-amber-600 dark:text-amber-400 font-bold">CPF</span>}
                              {col.key === 'cnpj' && docTipo === 'INVALIDO' && val && <span className="ml-1 text-[9px] text-red-500 dark:text-red-400 font-bold" title="Documento com tamanho inválido">⚠</span>}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })
                ) : (
                  <div className="flex items-center justify-center h-24 text-slate-500 dark:text-slate-400 text-sm">Nenhum registro encontrado.</div>
                )}
              </div>
            </div>

          </CardContent>
        </Card>
      </main>

      <footer className="mt-auto bg-white dark:bg-slate-900 border-t dark:border-slate-700 sticky bottom-0 z-10">
        <div className="max-w-[1900px] mx-auto px-4 sm:px-6 py-2.5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Exibindo {showingAll ? 'todos' : `${(page - 1) * parseInt(limit) + 1}–${Math.min(page * parseInt(limit), data?.pagination.total ?? 0)}`} de {(data?.pagination.total ?? 0).toLocaleString('pt-BR')} clientes
                {sortBy && <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">Ordenado por {columns.find(c => c.key === sortBy)?.label} {sortBy === 'dias_sem_venda' ? (sortOrder === 'asc' ? '↑ Menor→Maior' : '↓ Maior→Menor') : (sortOrder === 'asc' ? '↑ A-Z' : '↓ Z-A')}</span>}
                {diasSemVendaFilter !== 'all' && <span className="ml-2 text-xs text-teal-600 dark:text-teal-400 font-medium">Filtro: Dias S/ Venda ({diasSemVendaFilter})</span>}
              </p>
              <Select value={limit} onValueChange={handleLimitChange}><SelectTrigger className="w-[110px] h-7 text-xs"><SelectValue placeholder="Por página" /></SelectTrigger><SelectContent>{PAGE_SIZE_OPTIONS.map((n) => (<SelectItem key={String(n)} value={String(n)}>{n}/pág</SelectItem>))}<SelectItem value="all">Todos</SelectItem></SelectContent></Select>
              <p className="text-xs text-slate-400 dark:text-slate-500">{isVendedor ? `${session?.user?.name || 'Vendedor'}` : 'M-Tech Distribuidora'} © {new Date().getFullYear()} · v{process.env.NEXT_PUBLIC_APP_VERSION || '0.3.0'}</p>
            </div>
            {!showingAll && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setPage(1)} disabled={page <= 1 || loading} className="hidden sm:inline-flex h-8 text-xs">Primeira</Button>
                <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="h-8 w-8"><ChevronLeft className="size-3.5" /></Button>
                <span className="text-sm px-2 dark:text-slate-300"><span className="font-semibold">{page}</span> / <span className="font-semibold">{totalPages || 1}</span></span>
                <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} className="h-8 w-8"><ChevronRight className="size-3.5" /></Button>
                <Button variant="outline" size="sm" onClick={() => setPage(totalPages)} disabled={page >= totalPages || loading} className="hidden sm:inline-flex h-8 text-xs">Última</Button>
                <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">Ir para</span>
                <Input
                  className="w-14 h-8 text-xs text-center"
                  value={pageJump}
                  onChange={(e) => setPageJump(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePageJump() }}
                  placeholder="—"
                />
              </div>
            )}
          </div>
        </div>
      </footer>

      {/* Unified Client Dialog — New or Existing */}
      <Dialog open={showNewClient || !!detailClient} onOpenChange={(open) => { if (!open) { setShowNewClient(false); setDetailClient(null) } }}>
        <DialogContent className="gap-0 p-0 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          {(() => {
            const isNew = showNewClient && !detailClient
            const r = detailClient
            const diasSemVenda = r ? calcDiasSemVenda(r.parsed.ultima_venda) : null
            const activeTab = isNew ? newClientTab : detailTab

            const UNIFIED_TABS = isNew
              ? [
                  { key: 'empresa', label: 'Empresa', icon: Building2 },
                  { key: 'endereco', label: 'Endereço', icon: MapPin },
                  { key: 'contato', label: 'Contato', icon: Phone },
                ]
              : [
                  { key: 'empresa', label: 'Empresa', icon: Building2 },
                  { key: 'contato', label: 'Contato', icon: Phone },
                  { key: 'endereco', label: 'Endereço', icon: MapPin },
                  { key: 'comercial', label: 'Comercial', icon: Briefcase },
                  { key: 'obs', label: 'Observações', icon: StickyNote },
                  { key: 'vendas', label: 'Vendas', icon: ShoppingCart },
                  { key: 'historico', label: 'Histórico', icon: Clock },
                ]

            return (
              <>
                {/* Header */}
                <DialogHeader className="px-6 pt-6 pb-2">
                  {isNew ? (
                    <>
                      <DialogTitle className="flex items-center gap-2 text-lg"><UserPlus className="size-5 text-teal-600 dark:text-teal-400" />Novo Cliente</DialogTitle>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Preencha os dados do cliente para cadastrá-lo no sistema</p>
                    </>
                  ) : r && (
                    <>
                      <DialogTitle className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="size-5 text-teal-600 dark:text-teal-400 shrink-0" />
                          <span className="text-base sm:text-lg break-words">{r.razao_social || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">DSV</span>
                          <DiasSemVendaBadge dias={diasSemVenda!} ultimaVenda={r.parsed.ultima_venda} />
                          <SituacaoCadastralBadge value={r.situacao_cadastral} />
                        </div>
                      </DialogTitle>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {r.nome_fantasia && <span className="font-medium">{r.nome_fantasia}</span>}
                        {r.nome_fantasia && ' · '}
                        Código: <span className="font-mono font-medium text-teal-700 dark:text-teal-400">{r.parsed.codigo}</span>
                        {r.cnpj && <> · {formatDocumento(r.cnpj).tipo === 'CPF' ? 'CPF' : 'CNPJ'}: <span className="font-mono">{formatCnpj(r.cnpj)}</span>{formatDocumento(r.cnpj).tipo === 'CPF' && <span className="ml-1 text-[9px] text-amber-600 dark:text-amber-400 font-bold">CPF</span>}{formatDocumento(r.cnpj).tipo === 'INVALIDO' && <span className="ml-1 text-[9px] text-red-500 dark:text-red-400 font-bold" title="Documento com tamanho inválido">⚠</span>}</>}
                      </p>
                    </>
                  )}
                </DialogHeader>

                {/* Tabs */}
                <div className="px-6 border-b dark:border-slate-700">
                  <div className="flex gap-1 overflow-x-auto">
                    {UNIFIED_TABS.map(tab => {
                      const Icon = tab.icon
                      const isActive = activeTab === tab.key
                      return (
                        <button
                          key={tab.key}
                          onClick={() => isNew ? setNewClientTab(tab.key as any) : setDetailTab(tab.key as DetailTab)}
                          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${isActive ? 'border-teal-500 text-teal-700 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'}`}
                        >
                          <Icon className="size-3.5" />
                          {tab.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Content */}
                <ScrollArea className="max-h-[55vh] px-6">
                  <div className="py-4">

                    {/* ═══ EMPRESA TAB ═══ */}
                    {activeTab === 'empresa' && (
                      isNew ? (
                        <div className="space-y-4">
                          <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                            <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><Building2 className="size-3.5" />Identificação</legend>
                            <div className="space-y-2">
                              <label className="text-xs text-slate-500 dark:text-slate-400">CNPJ <span className="text-red-500">*</span></label>
                              <div className="flex gap-2">
                                <Input placeholder="00.000.000/0000-00" value={form.cnpj} onChange={(e) => { updateForm('cnpj', maskCnpj(e.target.value)); setConsultError(''); setConsultWarning('') }} className="flex-1 font-mono" maxLength={18} />
                                <Button type="button" onClick={() => consultReceita(form.cnpj)} disabled={consulting || form.cnpj.replace(/\D/g, '').length !== 14} className="bg-teal-600 hover:bg-teal-700 text-white shrink-0">
                                  {consulting ? <><Loader2 className="size-4 mr-1.5 animate-spin" />Consultando...</> : 'Consultar Receita'}
                                </Button>
                              </div>
                              {consultError && <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg"><AlertCircle className="size-4 text-red-500 shrink-0" /><p className="text-xs text-red-700 dark:text-red-400">{consultError}</p></div>}
                              {consultWarning && <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg"><AlertCircle className="size-4 text-amber-500 shrink-0" /><p className="text-xs text-amber-800 dark:text-amber-400 font-medium">{consultWarning}</p></div>}
                              {!consultError && !consultWarning && <p className="text-xs text-slate-400 dark:text-slate-500">Digite o CNPJ e clique em &quot;Consultar Receita&quot; para preencher automaticamente</p>}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="sm:col-span-2"><label className="text-xs text-slate-500 dark:text-slate-400">Razão Social</label><Input value={form.razaoSocial} onChange={(e) => updateForm('razaoSocial', e.target.value)} /></div>
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">Nome Fantasia</label><Input value={form.nomeFantasia} onChange={(e) => updateForm('nomeFantasia', e.target.value)} /></div>
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">IE/RG</label><Input value={form.ieRg} onChange={(e) => updateForm('ieRg', e.target.value)} /></div>
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">Situação Cadastral</label><Input value={form.situacaoCadastral} onChange={(e) => updateForm('situacaoCadastral', e.target.value)} /></div>
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">Data Abertura</label><Input value={form.dataAbertura} onChange={(e) => updateForm('dataAbertura', e.target.value)} placeholder="dd/mm/aaaa" /></div>
                            </div>
                          </fieldset>
                          <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                            <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><Briefcase className="size-3.5" />Comercial</legend>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">CNAE Principal</label><Input value={form.cnaePrincipal} onChange={(e) => updateForm('cnaePrincipal', e.target.value)} /></div>
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">Natureza Jurídica</label><Input value={form.naturezaJuridica} onChange={(e) => updateForm('naturezaJuridica', e.target.value)} /></div>
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">Porte</label><Input value={form.porte} onChange={(e) => updateForm('porte', e.target.value)} /></div>
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">Reg. Simples</label><Select value={form.regSimples || '_empty'} onValueChange={(v) => updateForm('regSimples', v === '_empty' ? '' : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="_empty">—</SelectItem><SelectItem value="SIMPLES">SIMPLES</SelectItem><SelectItem value="NÃO">NÃO</SelectItem></SelectContent></Select></div>
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">Vendedor</label><Select value={form.vendedor || '_empty'} onValueChange={(v) => updateForm('vendedor', v === '_empty' ? '' : v)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="_empty">—</SelectItem>{data?.filters.vendedores.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}</SelectContent></Select></div>
                            </div>
                          </fieldset>
                        </div>
                      ) : r && (
                        <div className="space-y-4">
                          <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                            <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><Building2 className="size-3.5" />Identificação</legend>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                              <div><span className="text-xs text-slate-500 dark:text-slate-400 block">{r.cnpj && formatDocumento(r.cnpj).tipo === 'CPF' ? 'CPF' : 'CNPJ/CPF'}</span><span className="font-mono text-slate-800 dark:text-slate-200">{r.cnpj ? formatCnpj(r.cnpj) : '—'}</span>{r.cnpj && formatDocumento(r.cnpj).tipo === 'CPF' && <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400 font-bold">CPF</span>}{r.cnpj && formatDocumento(r.cnpj).tipo === 'INVALIDO' && <span className="ml-1.5 text-[10px] text-red-500 dark:text-red-400 font-bold" title="Documento com tamanho inválido">⚠ Inválido</span>}</div>
                              <div className="sm:col-span-2"><span className="text-xs text-slate-500 dark:text-slate-400 block">Razão Social</span><span className="text-slate-800 dark:text-slate-200 font-medium">{r.razao_social || '—'}</span></div>
                              <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Nome Fantasia</span><span className="text-slate-800 dark:text-slate-200">{r.nome_fantasia || '—'}</span></div>
                              <div><span className="text-xs text-slate-500 dark:text-slate-400 block">IE/RG</span><span className="font-mono text-slate-800 dark:text-slate-200">{r.parsed.ie_rg || '—'}</span></div>
                              <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Situação Cadastral</span><SituacaoCadastralBadge value={r.situacao_cadastral} /></div>
                              <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Data Abertura</span><span className="text-slate-800 dark:text-slate-200">{r.data_abertura || '—'}</span></div>
                              <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Data Situação</span><span className="text-slate-800 dark:text-slate-200">{r.data_situacao || '—'}</span></div>
                              <div><span className="text-xs text-slate-500 dark:text-slate-400 block">CNAE Principal</span><span className="text-slate-800 dark:text-slate-200">{r.cnae_principal || '—'}</span></div>
                              <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Natureza Jurídica</span><span className="text-slate-800 dark:text-slate-200">{r.natureza_juridica || '—'}</span></div>
                              <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Porte</span><span className="text-slate-800 dark:text-slate-200">{r.porte || '—'}</span></div>
                            </div>
                          </fieldset>
                        </div>
                      )
                    )}

                    {/* ═══ CONTATO TAB (editable for existing) ═══ */}
                    {activeTab === 'contato' && (
                      isNew ? (
                        <div className="space-y-4">
                          <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                            <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><Phone className="size-3.5" />Telefones</legend>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">Telefone 1</label><Input value={form.telefone1} onChange={(e) => updateForm('telefone1', e.target.value)} placeholder="(XX) XXXXX-XXXX" /></div>
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">Telefone 2</label><Input value={form.telefone2} onChange={(e) => updateForm('telefone2', e.target.value)} placeholder="(XX) XXXXX-XXXX" /></div>
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">Telefone 3</label><Input value={form.telefone3} onChange={(e) => updateForm('telefone3', e.target.value)} placeholder="(XX) XXXXX-XXXX" /></div>
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">Telefone 4</label><Input value={form.telefone4} onChange={(e) => updateForm('telefone4', e.target.value)} placeholder="(XX) XXXXX-XXXX" /></div>
                            </div>
                          </fieldset>
                          <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                            <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><Mail className="size-3.5" />Emails</legend>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">Email 1</label><Input value={form.email1} onChange={(e) => updateForm('email1', e.target.value.toLowerCase())} type="email" /></div>
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">Email 2</label><Input value={form.email2} onChange={(e) => updateForm('email2', e.target.value.toLowerCase())} type="email" /></div>
                              <div><label className="text-xs text-slate-500 dark:text-slate-400">Email 3</label><Input value={form.email3} onChange={(e) => updateForm('email3', e.target.value.toLowerCase())} type="email" /></div>
                            </div>
                          </fieldset>
                          <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                            <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><User className="size-3.5" />Pessoa de Contato</legend>
                            <div><Input value={form.pessoaContato} onChange={(e) => updateForm('pessoaContato', e.target.value)} placeholder="Nome da pessoa de contato" /></div>
                          </fieldset>
                        </div>
                      ) : r && (
                        <div className="space-y-4">
                          <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                            <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><Phone className="size-3.5" />Telefones</legend>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="flex items-end gap-2">{r.editable.telefone1 && <a href={`https://wa.me/55${r.editable.telefone1.replace(/\D/g, '').replace(/^0+/, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 dark:text-green-400 mb-0.5 shrink-0" title="WhatsApp"><MessageCircle className="size-4" /></a>}<div className="flex-1"><label className="text-xs text-slate-500 dark:text-slate-400">Telefone 1</label><Input value={r.editable.telefone1} onChange={(e) => handleSave(r.parsed.codigo, 'telefone1', e.target.value)} onBlur={() => {}} className="font-mono" placeholder="(XX) XXXXX-XXXX" /></div></div>
                              <div className="flex items-end gap-2">{r.editable.telefone2 && <a href={`https://wa.me/55${r.editable.telefone2.replace(/\D/g, '').replace(/^0+/, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 dark:text-green-400 mb-0.5 shrink-0" title="WhatsApp"><MessageCircle className="size-4" /></a>}<div className="flex-1"><label className="text-xs text-slate-500 dark:text-slate-400">Telefone 2</label><Input value={r.editable.telefone2} onChange={(e) => handleSave(r.parsed.codigo, 'telefone2', e.target.value)} className="font-mono" placeholder="(XX) XXXXX-XXXX" /></div></div>
                              <div className="flex items-end gap-2">{r.editable.telefone3 && <a href={`https://wa.me/55${r.editable.telefone3.replace(/\D/g, '').replace(/^0+/, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 dark:text-green-400 mb-0.5 shrink-0" title="WhatsApp"><MessageCircle className="size-4" /></a>}<div className="flex-1"><label className="text-xs text-slate-500 dark:text-slate-400">Telefone 3</label><Input value={r.editable.telefone3} onChange={(e) => handleSave(r.parsed.codigo, 'telefone3', e.target.value)} className="font-mono" placeholder="(XX) XXXXX-XXXX" /></div></div>
                              <div className="flex items-end gap-2">{r.editable.telefone4 && <a href={`https://wa.me/55${r.editable.telefone4.replace(/\D/g, '').replace(/^0+/, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 dark:text-green-400 mb-0.5 shrink-0" title="WhatsApp"><MessageCircle className="size-4" /></a>}<div className="flex-1"><label className="text-xs text-slate-500 dark:text-slate-400">Telefone 4</label><Input value={r.editable.telefone4} onChange={(e) => handleSave(r.parsed.codigo, 'telefone4', e.target.value)} className="font-mono" placeholder="(XX) XXXXX-XXXX" /></div></div>
                            </div>
                          </fieldset>
                          <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                            <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><Mail className="size-3.5" />Emails</legend>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="flex items-end gap-2">{r.editable.email1 && <a href={`mailto:${r.editable.email1.toLowerCase()}`} className="text-teal-600 hover:text-teal-700 dark:text-teal-400 mb-0.5 shrink-0" title="Enviar email"><Mail className="size-4" /></a>}<div className="flex-1"><label className="text-xs text-slate-500 dark:text-slate-400">Email 1</label><Input value={r.editable.email1} onChange={(e) => handleSave(r.parsed.codigo, 'email1', e.target.value.toLowerCase())} type="email" /></div></div>
                              <div className="flex items-end gap-2">{r.editable.email2 && <a href={`mailto:${r.editable.email2.toLowerCase()}`} className="text-teal-600 hover:text-teal-700 dark:text-teal-400 mb-0.5 shrink-0" title="Enviar email"><Mail className="size-4" /></a>}<div className="flex-1"><label className="text-xs text-slate-500 dark:text-slate-400">Email 2</label><Input value={r.editable.email2} onChange={(e) => handleSave(r.parsed.codigo, 'email2', e.target.value.toLowerCase())} type="email" /></div></div>
                              <div className="flex items-end gap-2">{r.editable.email3 && <a href={`mailto:${r.editable.email3.toLowerCase()}`} className="text-teal-600 hover:text-teal-700 dark:text-teal-400 mb-0.5 shrink-0" title="Enviar email"><Mail className="size-4" /></a>}<div className="flex-1"><label className="text-xs text-slate-500 dark:text-slate-400">Email 3</label><Input value={r.editable.email3} onChange={(e) => handleSave(r.parsed.codigo, 'email3', e.target.value.toLowerCase())} type="email" /></div></div>
                            </div>
                          </fieldset>
                          <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                            <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><User className="size-3.5" />Pessoa de Contato</legend>
                            <div><Input value={r.editable.pessoaContato} onChange={(e) => handleSave(r.parsed.codigo, 'pessoaContato', e.target.value)} placeholder="Nome da pessoa de contato" /></div>
                          </fieldset>
                        </div>
                      )
                    )}

                    {/* ═══ ENDEREÇO TAB (editable for existing) ═══ */}
                    {activeTab === 'endereco' && (
                      isNew ? (
                        <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                          <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><MapPin className="size-3.5" />Endereço</legend>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="sm:col-span-2"><label className="text-xs text-slate-500 dark:text-slate-400">Endereço</label><Input value={form.endereco} onChange={(e) => updateForm('endereco', e.target.value)} /></div>
                            <div><label className="text-xs text-slate-500 dark:text-slate-400">Número</label><Input value={form.numero} onChange={(e) => updateForm('numero', e.target.value)} /></div>
                            <div><label className="text-xs text-slate-500 dark:text-slate-400">Complemento</label><Input value={form.complemento} onChange={(e) => updateForm('complemento', e.target.value)} /></div>
                            <div><label className="text-xs text-slate-500 dark:text-slate-400">Bairro</label><Input value={form.bairro} onChange={(e) => updateForm('bairro', e.target.value)} /></div>
                            <div><label className="text-xs text-slate-500 dark:text-slate-400">Cidade</label><Input value={form.cidade} onChange={(e) => updateForm('cidade', e.target.value)} /></div>
                            <div><label className="text-xs text-slate-500 dark:text-slate-400">CEP</label><Input value={form.cep} onChange={(e) => updateForm('cep', e.target.value)} placeholder="00000-000" /></div>
                            <div><label className="text-xs text-slate-500 dark:text-slate-400">Estado</label><Input value={form.uf} onChange={(e) => updateForm('uf', e.target.value)} maxLength={2} className="uppercase" /></div>
                          </div>
                        </fieldset>
                      ) : r && (
                        <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                          <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><MapPin className="size-3.5" />Endereço</legend>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="sm:col-span-2"><label className="text-xs text-slate-500 dark:text-slate-400">Endereço</label><Input value={r.endereco || ''} onChange={(e) => handleSave(r.parsed.codigo, 'endereco', e.target.value)} /></div>
                            <div><label className="text-xs text-slate-500 dark:text-slate-400">Número</label><Input value={r.numero || ''} onChange={(e) => handleSave(r.parsed.codigo, 'numero', e.target.value)} /></div>
                            <div><label className="text-xs text-slate-500 dark:text-slate-400">Complemento</label><Input value={r.complemento || ''} onChange={(e) => handleSave(r.parsed.codigo, 'complemento', e.target.value)} /></div>
                            <div><label className="text-xs text-slate-500 dark:text-slate-400">Bairro</label><Input value={r.bairro || ''} onChange={(e) => handleSave(r.parsed.codigo, 'bairro', e.target.value)} /></div>
                            <div><label className="text-xs text-slate-500 dark:text-slate-400">Cidade</label><Input value={r.cidade || ''} onChange={(e) => handleSave(r.parsed.codigo, 'cidade', e.target.value)} /></div>
                            <div><label className="text-xs text-slate-500 dark:text-slate-400">CEP</label><Input value={r.cep || ''} onChange={(e) => handleSave(r.parsed.codigo, 'cep', e.target.value)} placeholder="00000-000" /></div>
                            <div><label className="text-xs text-slate-500 dark:text-slate-400">Estado</label><Input value={r.uf || ''} onChange={(e) => handleSave(r.parsed.codigo, 'uf', e.target.value)} maxLength={2} className="uppercase" /></div>
                          </div>
                        </fieldset>
                      )
                    )}

                    {/* ═══ COMERCIAL TAB (existing only, read-only) ═══ */}
                    {activeTab === 'comercial' && r && (
                      <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                        <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><Briefcase className="size-3.5" />Comercial</legend>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                          {/* Tipo: Revenda / Corporativo */}
                          <div>
                            <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Tipo</span>
                            {(session?.user as any)?.role !== 'VENDEDOR' ? (
                              <Select
                                value={r.tipo || 'REVENDA'}
                                onValueChange={async (val) => {
                                  try {
                                    const res = await fetch('/api/clientes', {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ codigo: r.parsed.codigo, tipo: val }),
                                    })
                                    if (!res.ok) throw new Error('Erro ao alterar tipo')
                                    toast({ title: '✓ Tipo atualizado', description: `Cliente alterado para ${val === 'CORPORATIVO' ? 'Corporativo' : 'Revenda'}` })
                                    fetchData()
                                  } catch (e) {
                                    toast({ title: '✗ Erro', description: 'Não foi possível alterar o tipo', variant: 'destructive' })
                                  }
                                }}
                              >
                                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="REVENDA">Revenda</SelectItem>
                                  <SelectItem value="CORPORATIVO">Corporativo</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge className={`${r.tipo === 'CORPORATIVO' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300'} text-xs border`}>
                                {r.tipo === 'CORPORATIVO' ? 'Corporativo' : 'Revenda'}
                              </Badge>
                            )}
                          </div>
                          {/* Vendedor / Carteira */}
                          <div>
                            <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Vendedor / Carteira</span>
                            {(session?.user as any)?.role !== 'VENDEDOR' && data?.filters.vendedorUsers ? (
                              <Select
                                value={r.vendedor_id || '_none'}
                                onValueChange={async (val) => {
                                  try {
                                    const res = await fetch('/api/vendedores/assign', {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ clienteCodigo: r.parsed.codigo, vendedorId: val === '_none' ? null : val }),
                                    })
                                    if (!res.ok) throw new Error('Erro ao atribuir')
                                    const selectedUser = data.filters.vendedorUsers.find(v => v.id === val)
                                    const label = val === '_none' ? 'Sem vendedor' : (selectedUser?.name || 'Vendedor')
                                    toast({ title: '✓ Atualizado', description: `Cliente movido para: ${label}` })
                                    fetchData()
                                  } catch (e) {
                                    toast({ title: '✗ Erro', description: 'Não foi possível atribuir vendedor', variant: 'destructive' })
                                  }
                                }}
                              >
                                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sem vendedor" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_none">— Sem Usuário —</SelectItem>
                                  {(() => {
                                    return (
                                      <>
                                        {data.filters.vendedorUsers.map((v) => (
                                          <SelectItem key={v.id} value={v.id}>👤 {v.name}</SelectItem>
                                        ))}
                                      </>
                                    )
                                  })()}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="font-medium text-slate-800 dark:text-slate-200">{r.parsed.vendedor || session?.user?.name || '—'}</span>
                            )}
                          </div>
                          {/* Carteira badge (read-only, computed) */}
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Carteira</span><Badge variant="outline" className={`text-[11px] ${CARTEIRA_COLORS[r.carteira || 'COM_VENDEDOR'] || ''}`}>{CARTEIRA_LABELS[r.carteira || 'COM_VENDEDOR']}</Badge></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Reg. Simples</span><span className="text-slate-800 dark:text-slate-200">{r.parsed.reg_simples ? <Badge variant="secondary" className="text-xs">{r.parsed.reg_simples}</Badge> : '—'}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Dias Sem Venda</span><DiasSemVendaBadge dias={diasSemVenda!} ultimaVenda={r.parsed.ultima_venda} /></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Última Venda</span><span className="text-slate-800 dark:text-slate-200">{r.parsed.ultima_venda || '—'}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Cadastro</span><span className="text-slate-800 dark:text-slate-200">{r.parsed.cadastro || '—'}</span></div>
                        </div>
                      </fieldset>
                    )}

                    {/* ═══ OBSERVAÇÕES TAB (existing only, editable) ═══ */}
                    {activeTab === 'obs' && r && (
                      <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                        <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><StickyNote className="size-3.5" />Observações</legend>
                        <textarea
                          value={detailObs}
                          onChange={(e) => setDetailObs(e.target.value)}
                          className="w-full min-h-[300px] text-sm border rounded-md p-4 bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 resize-y focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 leading-relaxed"
                          placeholder="Escreva observações sobre o cliente aqui..."
                        />
                      </fieldset>
                    )}

                    {/* ═══ VENDAS TAB (NF-e data from Linvix) ═══ */}
                    {activeTab === 'vendas' && r && (
                      <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                        <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><ShoppingCart className="size-3.5" />Vendas (NF-e)</legend>
                        {loadingVendas ? (
                          <div className="flex items-center gap-2 py-4 text-slate-500 dark:text-slate-400"><Loader2 className="size-4 animate-spin" /><span className="text-sm">Carregando vendas...</span></div>
                        ) : (
                          <>
                            {/* Stats summary */}
                            {clienteVendasStats && (
                              <div className="grid grid-cols-3 gap-3 mb-4">
                                <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-lg p-3 text-center">
                                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Total Vendido</div>
                                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{(clienteVendasStats.totalVendido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                                </div>
                                <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-3 text-center">
                                  <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">NF-e Autorizadas</div>
                                  <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{clienteVendasStats.totalNotas || 0}</div>
                                </div>
                                <div className="bg-amber-50 dark:bg-amber-900/30 rounded-lg p-3 text-center">
                                  <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">Última Venda</div>
                                  <div className="text-lg font-bold text-amber-700 dark:text-amber-300">
                                    {clienteVendasStats.ultimaVenda
                                      ? new Date(clienteVendasStats.ultimaVenda).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                                      : '—'}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Vendas list */}
                            {clienteVendas.length > 0 ? (
                              <div className="space-y-2 max-h-96 overflow-y-auto">
                                {clienteVendas.map((venda: any) => {
                                  const isAutorizada = venda.situacao?.includes('AUTORIZADO')
                                  const isCancelada = venda.situacao?.includes('CANCELAMENTO')
                                  return (
                                    <div
                                      key={venda.id}
                                      className={`p-3 rounded-lg border cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                                        isCancelada ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/20' :
                                        isAutorizada ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/20' :
                                        'border-slate-200 dark:border-slate-700'
                                      }`}
                                      onClick={() => {
                                        setLoadingVendaDetail(true)
                                        fetch(`/api/vendas/${venda.id}`)
                                          .then(res => res.json())
                                          .then(json => setVendaDetail(json.data))
                                          .catch(() => setVendaDetail(null))
                                          .finally(() => setLoadingVendaDetail(false))
                                      }}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <Badge className={`text-[10px] font-semibold ${
                                            isAutorizada ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' :
                                            isCancelada ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' :
                                            'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                                          }`}>
                                            {isAutorizada ? 'Autorizada' : isCancelada ? 'Cancelada' : 'Aguardando'}
                                          </Badge>
                                          <span className="text-xs text-slate-500 dark:text-slate-400">NF {venda.numero}</span>
                                        </div>
                                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 shrink-0">
                                          {(venda.valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between gap-2 mt-1">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                          {venda.dataEmissao ? new Date(venda.dataEmissao).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}
                                          {venda.itens?.length > 0 && ` · ${venda.itens.length} item(ns)`}
                                        </span>
                                        {venda.itens?.[0]?.vendedor && (
                                          <span className="text-xs text-teal-600 dark:text-teal-400">{venda.itens[0].vendedor}</span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400 dark:text-slate-500 py-4">Nenhuma venda encontrada para este cliente.</p>
                            )}

                            {/* Venda detail modal */}
                            {vendaDetail && (
                              <div className="mt-4 p-4 bg-white dark:bg-slate-900 rounded-lg border dark:border-slate-700">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                    NF-e {vendaDetail.numero} — Detalhe
                                  </h4>
                                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setVendaDetail(null)}>Fechar</Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                  <div><span className="text-slate-500 dark:text-slate-400">Faturamento:</span> <span className="font-medium">{vendaDetail.faturamento}</span></div>
                                  <div><span className="text-slate-500 dark:text-slate-400">Pedido:</span> <span className="font-medium">{vendaDetail.numeroPedido || '—'}</span></div>
                                  <div><span className="text-slate-500 dark:text-slate-400">Emissão:</span> <span className="font-medium">{vendaDetail.dataEmissao ? new Date(vendaDetail.dataEmissao).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}</span></div>
                                  <div><span className="text-slate-500 dark:text-slate-400">Natureza:</span> <span className="font-medium">{vendaDetail.naturezaOperacao || '—'}</span></div>
                                  <div><span className="text-slate-500 dark:text-slate-400">Forma Pgto:</span> <span className="font-medium">{vendaDetail.formaPagamento || '—'}</span></div>
                                  <div><span className="text-slate-500 dark:text-slate-400">Valor Final:</span> <span className="font-bold text-emerald-700 dark:text-emerald-400">{(vendaDetail.valorFinal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                                </div>
                                {/* Items table */}
                                {vendaDetail.itens?.length > 0 && (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b dark:border-slate-700">
                                          <th className="text-left py-1 px-2 text-slate-500">#</th>
                                          <th className="text-left py-1 px-2 text-slate-500">Código</th>
                                          <th className="text-left py-1 px-2 text-slate-500">Descrição</th>
                                          <th className="text-right py-1 px-2 text-slate-500">Qtd</th>
                                          <th className="text-right py-1 px-2 text-slate-500">Preço</th>
                                          <th className="text-right py-1 px-2 text-slate-500">Total</th>
                                          <th className="text-left py-1 px-2 text-slate-500">Vendedor</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {vendaDetail.itens.map((item: any) => (
                                          <tr key={item.id} className="border-b dark:border-slate-700/50">
                                            <td className="py-1 px-2 text-slate-500">{item.item}</td>
                                            <td className="py-1 px-2 font-mono">{item.codigoProduto}</td>
                                            <td className="py-1 px-2 max-w-[200px] truncate">{item.descricao}</td>
                                            <td className="py-1 px-2 text-right">{item.quantidade} {item.unidade}</td>
                                            <td className="py-1 px-2 text-right">{item.precoVenda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                            <td className="py-1 px-2 text-right font-medium">{item.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                            <td className="py-1 px-2 text-teal-600 dark:text-teal-400">{item.vendedor}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}
                            {loadingVendaDetail && (
                              <div className="flex items-center gap-2 py-2 text-slate-500 dark:text-slate-400"><Loader2 className="size-4 animate-spin" /><span className="text-sm">Carregando detalhe...</span></div>
                            )}
                          </>
                        )}
                      </fieldset>
                    )}

                    {/* ═══ HISTÓRICO TAB (existing only, read-only) ═══ */}
                    {activeTab === 'historico' && r && (
                      <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                        <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><Clock className="size-3.5" />Histórico de Alterações</legend>
                        {loadingAudit ? (
                          <div className="flex items-center gap-2 py-4 text-slate-500 dark:text-slate-400"><Loader2 className="size-4 animate-spin" /><span className="text-sm">Carregando histórico...</span></div>
                        ) : auditLogs.length > 0 ? (
                          <div className="space-y-3 max-h-96 overflow-y-auto">
                            {auditLogs.map((log) => (
                              <div key={log.id} className="flex flex-col gap-1 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border dark:border-slate-700">
                                <div className="flex items-center gap-2 text-xs">
                                  <Badge variant="outline" className="text-xs font-mono">{FIELD_LABELS[log.field] || log.field}</Badge>
                                  <span className="text-slate-400 dark:text-slate-500">{new Date(log.createdAt).toLocaleString('pt-BR')}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="line-through text-red-500 dark:text-red-400">{log.oldValue || '—'}</span>
                                  <span className="text-slate-400">→</span>
                                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{log.newValue || '—'}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-400 dark:text-slate-500 py-4">Nenhuma alteração registrada.</p>
                        )}
                      </fieldset>
                    )}
                  </div>
                </ScrollArea>

                {/* Footer */}
                <DialogFooter className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-800 dark:border-slate-700 gap-2">
                  <Button variant="outline" onClick={() => { setShowNewClient(false); setDetailClient(null) }}>{isNew ? 'Cancelar' : 'Fechar'}</Button>
                  {isNew && (
                    <Button onClick={handleSaveNewClient} disabled={savingNew || !form.cnpj.replace(/\D/g, '')} className="bg-teal-600 hover:bg-teal-700 text-white">
                      {savingNew ? <><Loader2 className="size-4 mr-1.5 animate-spin" />Salvando...</> : 'Salvar Cliente'}
                    </Button>
                  )}
                  {!isNew && detailTab === 'obs' && (
                    <Button onClick={handleSaveObs} disabled={savingObs} className="bg-teal-600 hover:bg-teal-700 text-white">
                      {savingObs ? <><Loader2 className="size-4 mr-1.5 animate-spin" />Salvando...</> : 'Salvar Observações'}
                    </Button>
                  )}
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Google Sheets Sync Modal */}
      <SheetsSyncModal
        open={showSheetsSync}
        onOpenChange={setShowSheetsSync}
        onSyncComplete={fetchData}
      />

      <UserManagementModal open={showUserManagement} onOpenChange={setShowUserManagement} />
      <PermissionManagementModal open={showPermissions} onOpenChange={setShowPermissions} />
      <TwoFactorSetupModal open={show2FASetup} onOpenChange={setShow2FASetup} />
    </div>
  )
}
