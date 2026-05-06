'use client'

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react'
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
} from 'lucide-react'
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
  FIELD_LABELS,
} from '@/lib/types'
import {
  calcDiasSemVenda,
  formatPhone,
  getNowBrasilia,
  getRecordValue,
  toEditableKey,
} from '@/lib/clientes'

// ─── Client-only helpers ──────────────────────────

function getDiasSemVendaBg(dias: number | null): string {
  if (dias === null) return 'bg-red-600 text-white border-red-700 dark:bg-red-700 dark:text-white dark:border-red-800'
  if (dias <= 30) return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700'
  if (dias <= 60) return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700'
  if (dias <= 90) return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-700'
  if (dias <= 120) return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700'
  return 'bg-red-600 text-white border-red-700 dark:bg-red-700 dark:text-white dark:border-red-800'
}

function formatCnpj(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length !== 14) return raw
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
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
    <Badge className="bg-red-600 text-white border-red-700 dark:bg-red-700 dark:text-white dark:border-red-800 text-xs font-bold border tabular-nums" title="Sem informação de última venda">121+</Badge>
  )
  return (
    <Badge className={`${getDiasSemVendaBg(dias)} text-xs font-bold border tabular-nums`} title={ultimaVenda ? `Última venda: ${ultimaVenda}` : undefined}>{dias}</Badge>
  )
}

function EditableCell({ value, codigo, field, onSave, isPhone, isObservacoes }: {
  value: string; codigo: string; field: keyof EditableFields;
  onSave: (codigo: string, field: keyof EditableFields, value: string) => void; isPhone: boolean;
  isObservacoes?: boolean
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

  const handleSave = () => { if (editValue !== value) onSave(codigo, field, editValue); setEditing(false) }
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
  return (
    <span className="cursor-pointer group flex items-center gap-1" onClick={(e) => { e.stopPropagation(); setEditing(true) }} title={isObservacoes && value ? value : "Clique para editar"}>
      <span className="text-xs">{displayValue}</span>
      <Pencil className="size-2.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </span>
  )
}

// ─── Draggable Column Header ───────────────────────

function DraggableColumnHeader({ col, isActive, sortOrder, onSort, onDragStart, onDragOver, onDrop, isDragging, isDragOver }: {
  col: ColumnDef; isActive: boolean; sortOrder: 'asc' | 'desc';
  onSort: (key: string) => void;
  onDragStart: (e: React.DragEvent, key: string) => void;
  onDragOver: (e: React.DragEvent, key: string) => void;
  onDrop: (e: React.DragEvent, key: string) => void;
  isDragging: boolean; isDragOver: boolean
}) {
  const isSticky = col.sticky === 'left'
  const isEditable = col.editable
  let headerBg = 'bg-slate-50 dark:bg-slate-800'
  let headerText = 'text-slate-700 dark:text-slate-300'
  if (isEditable) { headerBg = 'bg-teal-50 dark:bg-teal-950/40'; headerText = 'text-teal-700 dark:text-teal-400' }
  if (isSticky) headerBg = 'bg-slate-100 dark:bg-slate-800'
  if (isDragging) { headerBg = 'bg-teal-100 dark:bg-teal-900/50'; headerText = 'text-teal-800 dark:text-teal-300' }
  if (isDragOver) headerBg = 'bg-amber-100 dark:bg-amber-900/50'

  return (
    <th
      key={col.key}
      className={`font-semibold ${headerText} text-xs ${headerBg} cursor-pointer select-none transition-colors whitespace-nowrap sticky top-0 ${isSticky ? 'z-[7]' : 'z-[5]'} ${isDragging ? 'opacity-60' : ''} ${col.centered ? 'text-center' : ''} px-3 py-2.5 border-b border-slate-200 dark:border-slate-700`}
      style={isSticky ? { left: col.stickyOffset, minWidth: col.minWidth } : { minWidth: col.minWidth }}
      onClick={() => onSort(col.key)}
      draggable={!isSticky}
      onDragStart={(e) => !isSticky && onDragStart(e, col.key)}
      onDragOver={(e) => { e.preventDefault(); if (!isSticky) onDragOver(e, col.key) }}
      onDrop={(e) => !isSticky && onDrop(e, col.key)}
    >
      <span className="flex items-center gap-1">
        {!isSticky && <GripVertical className="size-3 text-slate-300 dark:text-slate-600 shrink-0 cursor-grab active:cursor-grabbing" />}
        {col.label}
        {isEditable && <Pencil className="size-2.5 text-teal-500 dark:text-teal-400 shrink-0" />}
        {isActive ? (
          col.numericSort ? (
            sortOrder === 'asc' ? <ArrowUpNarrowWide className="size-3.5 text-teal-600 dark:text-teal-400 shrink-0" /> : <ArrowDownWideNarrow className="size-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
          ) : (
            sortOrder === 'asc' ? <ArrowUpAZ className="size-3.5 text-teal-600 dark:text-teal-400 shrink-0" /> : <ArrowDownZA className="size-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
          )
        ) : <ArrowUpDown className="size-3 text-slate-300 dark:text-slate-600 shrink-0" />}
      </span>
    </th>
  )
}

// ─── Main Component ────────────────────────────────

function Home() {
  const { theme, setTheme } = useTheme()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [situacaoCadastral, setSituacaoCadastral] = useState(searchParams.get('situacao') || 'all')
  const [vendedor, setVendedor] = useState(searchParams.get('vendedor') || 'all')
  const [cidade, setCidade] = useState(searchParams.get('cidade') || 'all')
  const [uf, setUf] = useState(searchParams.get('uf') || 'all')
  const [diasSemVendaFilter, setDiasSemVendaFilter] = useState(searchParams.get('dias') || 'all')
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'))
  const [limit, setLimit] = useState<string>(searchParams.get('limit') || '10')
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const [saving, setSaving] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState(searchParams.get('sort_by') || '')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>((searchParams.get('sort_order') as 'asc' | 'desc') || 'asc')
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [focusedRow, setFocusedRow] = useState(-1)
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
  const [form, setForm] = useState<NewClientForm>(EMPTY_FORM)
  const [consulting, setConsulting] = useState(false)
  const [consultError, setConsultError] = useState('')
  const [consultWarning, setConsultWarning] = useState('')
  const [savingNew, setSavingNew] = useState(false)

  // Client detail modal
  const [detailClient, setDetailClient] = useState<ClienteRecord | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('contato')
  const [detailObs, setDetailObs] = useState('')
  const [savingObs, setSavingObs] = useState(false)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  // Dark mode mounted
  useEffect(() => { setMounted(true) }, [])

  // URL sync
  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (situacaoCadastral !== 'all') params.set('situacao', situacaoCadastral)
    if (vendedor !== 'all') params.set('vendedor', vendedor)
    if (cidade !== 'all') params.set('cidade', cidade)
    if (uf !== 'all') params.set('uf', uf)
    if (diasSemVendaFilter !== 'all') params.set('dias', diasSemVendaFilter)
    if (page > 1) params.set('page', page.toString())
    if (limit !== '10') params.set('limit', limit)
    if (sortBy) { params.set('sort_by', sortBy); params.set('sort_order', sortOrder) }
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [search, situacaoCadastral, vendedor, cidade, uf, diasSemVendaFilter, page, limit, sortBy, sortOrder, router])

  // Reorder columns
  const columns = useMemo(() => {
    const colMap = new Map(DEFAULT_COLUMNS.map(c => [c.key, c]))
    const stickyKeys = columnOrder.filter(k => { const c = colMap.get(k); return c?.sticky === 'left' })
    const normalKeys = columnOrder.filter(k => { const c = colMap.get(k); return !c?.sticky })
    const allKeys = [...stickyKeys, ...normalKeys]
    const missing = DEFAULT_COLUMNS.filter(c => !allKeys.includes(c.key)).map(c => c.key)
    return [...allKeys, ...missing].map(k => colMap.get(k)!).filter(Boolean)
  }, [columnOrder])

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
    if (vendedor && vendedor !== 'all') params.set('vendedor', vendedor)
    if (cidade !== 'all') params.set('cidade', cidade)
    if (uf !== 'all') params.set('uf', uf)
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (sortBy && !CLIENT_SORT_KEYS.has(sortBy)) { params.set('sort_by', sortBy); params.set('sort_order', sortOrder) }
    return params
  }, [situacaoCadastral, vendedor, cidade, uf, debouncedSearch, sortBy, sortOrder])

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

  // Client-side filter for dias sem venda
  const filteredData = useMemo(() => {
    if (!data?.data) return []
    if (diasSemVendaFilter === 'all') return data.data
    return data.data.filter((r) => {
      const dias = calcDiasSemVenda(r.parsed.ultima_venda)
      switch (diasSemVendaFilter) {
        case '0-30': return dias !== null && dias <= 30
        case '31-60': return dias !== null && dias > 30 && dias <= 60
        case '61-90': return dias !== null && dias > 60 && dias <= 90
        case '91-120': return dias !== null && dias > 90 && dias <= 120
        case '121+': return dias === null || dias > 120
        default: return true
      }
    })
  }, [data?.data, diasSemVendaFilter])

  // Client-side sort for computed fields
  const sortedData = useMemo(() => {
    if (!sortBy || !CLIENT_SORT_KEYS.has(sortBy)) return filteredData
    return [...filteredData].sort((a, b) => {
      if (sortBy === 'dias_sem_venda') {
        const aVal = calcDiasSemVenda(a.parsed.ultima_venda)
        const bVal = calcDiasSemVenda(b.parsed.ultima_venda)
        if (aVal === null && bVal === null) return 0
        if (aVal === null) return 1
        if (bVal === null) return -1
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })
  }, [filteredData, sortBy, sortOrder])

  // Use server-side dsvStats
  const dsvStats = data?.stats.dias_sem_venda ?? { verde: 0, amarelo: 0, laranja: 0, vermelho: 0, preto: 0 }

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
  const hasActiveFilters = search !== '' || situacaoCadastral !== 'all' || vendedor !== 'all' || cidade !== 'all' || uf !== 'all' || diasSemVendaFilter !== 'all'

  const clearFilters = () => {
    setSearch('')
    setSituacaoCadastral('all')
    setVendedor('all')
    setCidade('all')
    setUf('all')
    setDiasSemVendaFilter('all')
    setSortBy('')
    setSortOrder('asc')
    setPage(1)
  }

  const handleExport = async () => {
    setExporting(true)
    toast({ title: '⏳ Preparando exportação...', description: 'Aguarde enquanto o arquivo é gerado' })
    try {
      const params = buildFilterParams()
      const res = await fetch(`/api/clientes/export?${params.toString()}`)
      if (!res.ok) throw new Error('Erro na exportação')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `Cadastro_Clientes_Mtech_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url)
      const count = data?.pagination.total ?? 0
      toast({ title: `✓ ${count.toLocaleString('pt-BR')} clientes exportados`, description: 'Arquivo XLSX baixado com sucesso' })
    } catch (error) {
      console.error('Error exporting:', error)
      toast({ title: '✗ Erro na exportação', description: 'Não foi possível gerar o arquivo', variant: 'destructive' })
    }
    finally { setExporting(false) }
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

  const openNewClient = () => { setForm(EMPTY_FORM); setConsultError(''); setConsultWarning(''); setShowNewClient(true) }
  const updateForm = (field: keyof NewClientForm, value: string) => setForm((f) => ({ ...f, [field]: value }))

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!sortedData.length) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedRow(prev => Math.min(prev + 1, sortedData.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedRow(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && focusedRow >= 0 && focusedRow < sortedData.length) {
        e.preventDefault()
        openDetail(sortedData[focusedRow])
      } else if (e.key === 'Escape') {
        setFocusedRow(-1)
        clearFilters()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sortedData, focusedRow])

  const totalPages = data?.pagination.totalPages ?? 0
  const scStats = data?.stats.situacao_cadastral ?? {}
  const showingAll = limit === 'all'
  const nowBrasilia = getNowBrasilia()
  const todayStr = nowBrasilia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const handlePageJump = () => {
    const num = parseInt(pageJump)
    if (num >= 1 && num <= totalPages) {
      setPage(num)
      setPageJump('')
    }
  }

  // Reset focusedRow when data changes
  useEffect(() => { setFocusedRow(-1) }, [data?.data])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <header className="bg-white dark:bg-slate-900 border-b dark:border-slate-700 shadow-sm sticky top-0 z-10">
        <div className="max-w-[1900px] mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-md"><Building2 className="size-5" /></div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Cadastro de Clientes</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Mtech Geral — {todayStr} (UTC-3)</p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              <Button variant="outline" size="sm" onClick={openNewClient} className="bg-teal-600 text-white hover:bg-teal-700 border-teal-600"><UserPlus className="size-4 mr-1.5" />Novo Cliente</Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting} className="bg-slate-700 text-white hover:bg-slate-800 border-slate-700 dark:bg-slate-600 dark:hover:bg-slate-500 dark:border-slate-600"><Download className={`size-4 mr-1.5 ${exporting ? 'animate-bounce' : ''}`} />{exporting ? 'Exportando...' : 'Exportar XLSX'}</Button>
              <Button variant="outline" size="sm" onClick={() => { setColumnOrder(DEFAULT_COLUMNS.map(c => c.key)); localStorage.removeItem('columnOrder') }} className="text-slate-600 dark:text-slate-400"><RotateCcw className="size-4 mr-1.5" />Restaurar Colunas</Button>
              <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}><RefreshCw className={`size-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />Atualizar</Button>
              <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}>
                {mounted && (theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />)}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1900px] mx-auto w-full px-4 sm:px-6 py-4">
        {/* Stats Row 1 */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Card className="border-0 shadow-sm dark:bg-slate-800"><CardContent className="p-3 flex items-center gap-2"><div className="flex items-center justify-center size-9 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0"><Users className="size-4" /></div><div><p className="text-xs text-slate-500 dark:text-slate-400">Total</p><p className="text-lg font-bold text-slate-900 dark:text-slate-100">{data?.stats.total.toLocaleString('pt-BR') ?? '—'}</p></div></CardContent></Card>
          <Card className="border-0 shadow-sm dark:bg-slate-800"><CardContent className="p-3 flex items-center gap-2"><div className="flex items-center justify-center size-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 shrink-0"><CheckCircle2 className="size-4" /></div><div><p className="text-xs text-slate-500 dark:text-slate-400">Ativa</p><p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{(scStats['ATIVA'] ?? 0).toLocaleString('pt-BR')}</p></div></CardContent></Card>
          <Card className="border-0 shadow-sm dark:bg-slate-800"><CardContent className="p-3 flex items-center gap-3"><div className="flex items-center justify-center size-9 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 shrink-0"><AlertTriangle className="size-4" /></div><div className="min-w-0"><p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Irregular</p><div className="flex flex-col gap-0.5 text-xs"><span className="text-red-600 dark:text-red-400 font-semibold">{(scStats['BAIXADA'] ?? 0).toLocaleString('pt-BR')} <span className="font-normal text-red-400 dark:text-red-500">baixadas</span></span><span className="text-amber-600 dark:text-amber-400 font-semibold">{(scStats['INAPTA'] ?? 0).toLocaleString('pt-BR')} <span className="font-normal text-amber-400 dark:text-amber-500">inaptas</span></span><span className="text-orange-600 dark:text-orange-400 font-semibold">{(scStats['SUSPENSA'] ?? 0).toLocaleString('pt-BR')} <span className="font-normal text-orange-400 dark:text-orange-500">suspensas</span></span></div></div></CardContent></Card>
        </div>

        {/* Stats Row 2: 5 Dias Sem Venda */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
          <Card className={`border-0 shadow-sm cursor-pointer transition-all ${diasSemVendaFilter === '0-30' ? 'ring-2 ring-emerald-400 bg-emerald-50 dark:bg-emerald-950/40' : 'bg-white dark:bg-slate-800 hover:ring-2 hover:ring-emerald-300'}`} onClick={() => { setDiasSemVendaFilter(diasSemVendaFilter === '0-30' ? 'all' : '0-30'); setPage(1) }}><CardContent className="p-3 flex items-center gap-2"><div className="flex items-center justify-center size-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 shrink-0"><Clock className="size-4" /></div><div><p className="text-xs text-slate-500 dark:text-slate-400">0–30 dias</p><p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{dsvStats.verde.toLocaleString('pt-BR')}</p></div></CardContent></Card>
          <Card className={`border-0 shadow-sm cursor-pointer transition-all ${diasSemVendaFilter === '31-60' ? 'ring-2 ring-amber-400 bg-amber-50 dark:bg-amber-950/40' : 'bg-amber-50/40 dark:bg-slate-800 hover:ring-2 hover:ring-amber-300'}`} onClick={() => { setDiasSemVendaFilter(diasSemVendaFilter === '31-60' ? 'all' : '31-60'); setPage(1) }}><CardContent className="p-3 flex items-center gap-2"><div className="flex items-center justify-center size-9 rounded-lg bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400 shrink-0"><Clock className="size-4" /></div><div><p className="text-xs text-slate-500 dark:text-slate-400">31–60 dias</p><p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{dsvStats.amarelo.toLocaleString('pt-BR')}</p></div></CardContent></Card>
          <Card className={`border-0 shadow-sm cursor-pointer transition-all ${diasSemVendaFilter === '61-90' ? 'ring-2 ring-orange-400 bg-orange-50 dark:bg-orange-950/40' : 'bg-orange-50/40 dark:bg-slate-800 hover:ring-2 hover:ring-orange-300'}`} onClick={() => { setDiasSemVendaFilter(diasSemVendaFilter === '61-90' ? 'all' : '61-90'); setPage(1) }}><CardContent className="p-3 flex items-center gap-2"><div className="flex items-center justify-center size-9 rounded-lg bg-orange-200 dark:bg-orange-900/60 text-orange-700 dark:text-orange-300 shrink-0"><Clock className="size-4" /></div><div><p className="text-xs text-slate-500 dark:text-slate-400">61–90 dias</p><p className="text-lg font-bold text-orange-700 dark:text-orange-300">{dsvStats.laranja.toLocaleString('pt-BR')}</p></div></CardContent></Card>
          <Card className={`border-0 shadow-sm cursor-pointer transition-all ${diasSemVendaFilter === '91-120' ? 'ring-2 ring-red-400 bg-red-50 dark:bg-red-950/40' : 'bg-white dark:bg-slate-800 hover:ring-2 hover:ring-red-300'}`} onClick={() => { setDiasSemVendaFilter(diasSemVendaFilter === '91-120' ? 'all' : '91-120'); setPage(1) }}><CardContent className="p-3 flex items-center gap-2"><div className="flex items-center justify-center size-9 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 shrink-0"><TrendingDown className="size-4" /></div><div><p className="text-xs text-slate-500 dark:text-slate-400">91–120 dias</p><p className="text-lg font-bold text-red-700 dark:text-red-400">{dsvStats.vermelho.toLocaleString('pt-BR')}</p></div></CardContent></Card>
          <Card className={`border-0 shadow-sm cursor-pointer transition-all ${diasSemVendaFilter === '121+' ? 'ring-2 ring-red-600 bg-red-50 dark:bg-red-950/40' : 'bg-white dark:bg-slate-800 hover:ring-2 hover:ring-red-400'}`} onClick={() => { setDiasSemVendaFilter(diasSemVendaFilter === '121+' ? 'all' : '121+'); setPage(1) }}><CardContent className="p-3 flex items-center gap-2"><div className="flex items-center justify-center size-9 rounded-lg bg-red-600 text-white dark:bg-red-700 shrink-0"><AlertCircle className="size-4" /></div><div><p className="text-xs text-slate-500 dark:text-slate-400">121+ dias</p><p className="text-lg font-bold text-red-700 dark:text-red-400">{dsvStats.preto.toLocaleString('pt-BR')}</p></div></CardContent></Card>
        </div>

        {/* Hint */}
        <div className="flex items-center gap-2 mb-3 text-xs text-slate-500 dark:text-slate-400">
          <Pencil className="size-3" />
          <span>Clique nos campos com <Pencil className="size-2.5 inline text-teal-500 dark:text-teal-400" /> para editar · Arraste <GripVertical className="size-3 inline" /> para reordenar colunas · Clique na linha para ver ficha · <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px]">↑↓</kbd> navegar · <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px]">Enter</kbd> abrir · <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px]">Esc</kbd> limpar</span>
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-sm mb-4 dark:bg-slate-800">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 dark:text-slate-500" />
                <Input placeholder="Buscar por razão social, CNPJ, código, cidade, vendedor..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={situacaoCadastral} onValueChange={(val) => { setSituacaoCadastral(val); setPage(1) }}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Situação Cadastral" /></SelectTrigger><SelectContent><SelectItem value="all">Situação Cadastral</SelectItem>{data?.filters.situacao_cadastral.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent></Select>
              <Select value={vendedor} onValueChange={(val) => { setVendedor(val); setPage(1) }}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Vendedor" /></SelectTrigger><SelectContent><SelectItem value="all">Todos Vendedores</SelectItem>{data?.filters.vendedores.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}</SelectContent></Select>
              <Select value={cidade} onValueChange={(val) => { setCidade(val); setPage(1) }}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Cidade" /></SelectTrigger><SelectContent><SelectItem value="all">Todas Cidades</SelectItem>{data?.filters.cidades.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent></Select>
              <Select value={uf} onValueChange={(val) => { setUf(val); setPage(1) }}><SelectTrigger className="w-full sm:w-[100px]"><SelectValue placeholder="UF" /></SelectTrigger><SelectContent><SelectItem value="all">Todos UF</SelectItem>{data?.filters.ufs.map((u) => (<SelectItem key={u} value={u}>{u}</SelectItem>))}</SelectContent></Select>
              <Select value={diasSemVendaFilter} onValueChange={(val) => { setDiasSemVendaFilter(val); setPage(1) }}><SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Dias S/ Venda" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="0-30">0–30 dias 🟢</SelectItem><SelectItem value="31-60">31–60 dias 🟡</SelectItem><SelectItem value="61-90">61–90 dias 🟠</SelectItem><SelectItem value="91-120">91–120 dias 🔴</SelectItem><SelectItem value="121+">121+ dias 🔴</SelectItem></SelectContent></Select>
              <Select value={limit} onValueChange={handleLimitChange}><SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Por página" /></SelectTrigger><SelectContent>{PAGE_SIZE_OPTIONS.map((n) => (<SelectItem key={String(n)} value={String(n)}>{n}/pág</SelectItem>))}<SelectItem value="all">Todos</SelectItem></SelectContent></Select>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="shrink-0 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400">
                  <XCircle className="size-4 mr-1.5" />Limpar Filtros
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Data Table */}
        <Card className="border-0 shadow-sm dark:bg-slate-800">
          <CardContent className="p-0">
            <div ref={tableContainerRef} className="overflow-auto custom-scrollbar" style={{ maxHeight: showingAll ? '80vh' : '60vh', minHeight: '200px' }}>
              <table className="border-separate border-spacing-0 w-full">
                <thead>
                  <tr className="hover:bg-transparent">
                    {columns.map((col) => (
                      <DraggableColumnHeader
                        key={col.key}
                        col={col}
                        isActive={sortBy === col.key}
                        sortOrder={sortOrder}
                        onSort={handleSort}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        isDragging={dragKey === col.key}
                        isDragOver={dragOverKey === col.key}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => (<tr key={i}>{columns.map((col) => (<td key={col.key} className="px-3 py-2"><div className="h-3 bg-slate-100 dark:bg-slate-700 rounded animate-pulse w-16" /></td>))}</tr>))
                  ) : sortedData.length > 0 ? (
                    sortedData.map((r, idx) => {
                      const isEven = idx % 2 === 0
                      const rowBg = isEven ? 'bg-white dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-800'
                      const isFocused = focusedRow === idx
                      const diasSemVenda = calcDiasSemVenda(r.parsed.ultima_venda)

                      return (
                        <tr key={idx} className={`${rowBg} hover:bg-teal-50/40 dark:hover:bg-teal-900/30 transition-colors cursor-pointer ${isFocused ? 'ring-2 ring-inset ring-teal-400 bg-teal-50/60 dark:bg-teal-900/40' : ''}`} onClick={() => openDetail(r)}>
                          {columns.map((col) => {
                            const isSticky = col.sticky === 'left'
                            const editableKey = toEditableKey(col.key)

                            if (col.key === 'dias_sem_venda') {
                              return <td key={col.key} className={`whitespace-nowrap px-3 py-2 ${col.centered ? 'text-center' : ''}`} onClick={(e) => e.stopPropagation()}><DiasSemVendaBadge dias={diasSemVenda} ultimaVenda={r.parsed.ultima_venda} /></td>
                            }

                            const val = getRecordValue(r, col.key)

                            if (col.key === 'situacao_cadastral') return <td key={col.key} className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}><SituacaoCadastralBadge value={val} /></td>
                            if (col.key === 'reg_simples') return <td key={col.key} className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>{val ? <Badge variant="secondary" className="text-xs">{val}</Badge> : '—'}</td>

                            if (col.editable && editableKey) {
                              const isPhone = PHONE_FIELDS.has(col.key)
                              const isObs = col.key === 'observacoes'
                              return <td key={col.key} className="bg-teal-50/30 dark:bg-teal-900/20 whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}><EditableCell value={val} codigo={r.parsed.codigo} field={editableKey} onSave={handleSave} isPhone={isPhone} isObservacoes={isObs} /></td>
                            }

                            if (isSticky) {
                              return (
                                <td key={col.key} className={`whitespace-nowrap sticky z-[4] ${rowBg} ${col.key === 'codigo' ? 'font-mono font-medium text-teal-700 dark:text-teal-400 text-xs' : 'text-xs max-w-[220px] truncate dark:text-slate-200'} after:absolute after:top-0 after:right-0 after:bottom-0 after:w-3 after:bg-gradient-to-r after:from-transparent ${isEven ? 'after:to-white dark:after:to-slate-900' : 'after:to-slate-100 dark:after:to-slate-800'} px-3 py-2 relative`} style={{ left: col.stickyOffset, minWidth: col.minWidth }} title={col.key === 'razao_social' ? val : undefined}>
                                  {val || '—'}
                                </td>
                              )
                            }

                            const isMono = ['ie_rg', 'cep'].includes(col.key)
                            const isTruncate = ['nome_fantasia', 'endereco', 'complemento', 'bairro', 'cnae_principal', 'natureza_juridica'].includes(col.key)
                            const truncateMax: Record<string, string> = { nome_fantasia: 'max-w-[160px]', endereco: 'max-w-[180px]', complemento: 'max-w-[110px]', bairro: 'max-w-[130px]', cnae_principal: 'max-w-[200px]', natureza_juridica: 'max-w-[160px]' }

                            let displayVal = val || '—'
                            if (col.key === 'cnpj' && val) displayVal = formatCnpj(val)
                            else if (col.key === 'cep' && val) displayVal = formatCep(val)

                            return (
                              <td key={col.key} className={`text-xs whitespace-nowrap px-3 py-2 ${isMono ? 'font-mono' : ''} ${col.key === 'cnpj' ? 'font-mono' : ''} ${isTruncate ? truncateMax[col.key] + ' truncate' : ''} ${col.centered ? 'text-center' : ''} dark:text-slate-300`} title={isTruncate ? val : undefined}>
                                {col.key === 'vendedor' ? <span className="font-medium">{displayVal}</span> : displayVal}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })
                  ) : (
                    <tr><td colSpan={columns.length} className="h-24 text-center text-slate-500 dark:text-slate-400 px-3 py-2">Nenhum registro encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-t dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Exibindo {((page - 1) * parseInt(limit) + 1)}–{Math.min(page * parseInt(limit), data?.pagination.total ?? 0)} de {(data?.pagination.total ?? 0).toLocaleString('pt-BR')} clientes
                {sortBy && <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">Ordenado por {columns.find(c => c.key === sortBy)?.label} {sortBy === 'dias_sem_venda' ? (sortOrder === 'asc' ? '↑ Menor→Maior' : '↓ Maior→Menor') : (sortOrder === 'asc' ? '↑ A-Z' : '↓ Z-A')}</span>}
                {diasSemVendaFilter !== 'all' && <span className="ml-2 text-xs text-teal-600 dark:text-teal-400 font-medium">Filtro: Dias S/ Venda ({diasSemVendaFilter})</span>}
              </p>
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="mt-auto bg-white dark:bg-slate-900 border-t dark:border-slate-700 sticky bottom-0 z-10">
        <div className="max-w-[1900px] mx-auto px-4 sm:px-6 py-2.5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-xs text-slate-400 dark:text-slate-500">Cadastro de Clientes — Mtech Geral © {new Date().getFullYear()}</p>
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

      {/* New Client Modal */}
      <Dialog open={showNewClient} onOpenChange={setShowNewClient}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-lg"><UserPlus className="size-5 text-teal-600 dark:text-teal-400" />Novo Cliente</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] px-6">
            <div className="space-y-5 pb-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">CNPJ <span className="text-red-500">*</span></label>
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
              <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2">Dados da Empresa</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2"><label className="text-xs text-slate-500 dark:text-slate-400">Razão Social</label><Input value={form.razaoSocial} onChange={(e) => updateForm('razaoSocial', e.target.value)} /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Nome Fantasia</label><Input value={form.nomeFantasia} onChange={(e) => updateForm('nomeFantasia', e.target.value)} /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">IE/RG</label><Input value={form.ieRg} onChange={(e) => updateForm('ieRg', e.target.value)} /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Situação Cadastral</label><Input value={form.situacaoCadastral} onChange={(e) => updateForm('situacaoCadastral', e.target.value)} /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Data Abertura</label><Input value={form.dataAbertura} onChange={(e) => updateForm('dataAbertura', e.target.value)} placeholder="dd/mm/aaaa" /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">CNAE Principal</label><Input value={form.cnaePrincipal} onChange={(e) => updateForm('cnaePrincipal', e.target.value)} /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Natureza Jurídica</label><Input value={form.naturezaJuridica} onChange={(e) => updateForm('naturezaJuridica', e.target.value)} /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Porte</label><Input value={form.porte} onChange={(e) => updateForm('porte', e.target.value)} /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Reg. Simples</label><Select value={form.regSimples || '_empty'} onValueChange={(v) => updateForm('regSimples', v === '_empty' ? '' : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="_empty">—</SelectItem><SelectItem value="SIMPLES">SIMPLES</SelectItem><SelectItem value="NÃO">NÃO</SelectItem></SelectContent></Select></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Vendedor</label><Select value={form.vendedor || '_empty'} onValueChange={(v) => updateForm('vendedor', v === '_empty' ? '' : v)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="_empty">—</SelectItem>{data?.filters.vendedores.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}</SelectContent></Select></div>
                </div>
              </fieldset>
              <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2">Endereço</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2"><label className="text-xs text-slate-500 dark:text-slate-400">Endereço</label><Input value={form.endereco} onChange={(e) => updateForm('endereco', e.target.value)} /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Número</label><Input value={form.numero} onChange={(e) => updateForm('numero', e.target.value)} /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Complemento</label><Input value={form.complemento} onChange={(e) => updateForm('complemento', e.target.value)} /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Bairro</label><Input value={form.bairro} onChange={(e) => updateForm('bairro', e.target.value)} /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Cidade</label><Input value={form.cidade} onChange={(e) => updateForm('cidade', e.target.value)} /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">CEP</label><Input value={form.cep} onChange={(e) => updateForm('cep', e.target.value)} placeholder="00000-000" /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">UF</label><Input value={form.uf} onChange={(e) => updateForm('uf', e.target.value)} maxLength={2} className="uppercase" /></div>
                </div>
              </fieldset>
              <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2">Contato</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Telefone 1</label><Input value={form.telefone1} onChange={(e) => updateForm('telefone1', e.target.value)} placeholder="(XX) XXXXX-XXXX" /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Telefone 2</label><Input value={form.telefone2} onChange={(e) => updateForm('telefone2', e.target.value)} placeholder="(XX) XXXXX-XXXX" /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Telefone 3</label><Input value={form.telefone3} onChange={(e) => updateForm('telefone3', e.target.value)} placeholder="(XX) XXXXX-XXXX" /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Telefone 4</label><Input value={form.telefone4} onChange={(e) => updateForm('telefone4', e.target.value)} placeholder="(XX) XXXXX-XXXX" /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Email 1</label><Input value={form.email1} onChange={(e) => updateForm('email1', e.target.value)} type="email" /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Email 2</label><Input value={form.email2} onChange={(e) => updateForm('email2', e.target.value)} type="email" /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Email 3</label><Input value={form.email3} onChange={(e) => updateForm('email3', e.target.value)} type="email" /></div>
                  <div><label className="text-xs text-slate-500 dark:text-slate-400">Pessoa de Contato</label><Input value={form.pessoaContato} onChange={(e) => updateForm('pessoaContato', e.target.value)} /></div>
                </div>
              </fieldset>
            </div>
          </ScrollArea>
          <DialogFooter className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-800 dark:border-slate-700 gap-2">
            <Button variant="outline" onClick={() => setShowNewClient(false)} disabled={savingNew}>Cancelar</Button>
            <Button onClick={handleSaveNewClient} disabled={savingNew || !form.cnpj.replace(/\D/g, '')} className="bg-teal-600 hover:bg-teal-700 text-white">
              {savingNew ? <><Loader2 className="size-4 mr-1.5 animate-spin" />Salvando...</> : 'Salvar Cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Detail Modal (Ficha do Cliente) — 6 Tabs */}
      <Dialog open={!!detailClient} onOpenChange={(open) => { if (!open) setDetailClient(null) }}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          {detailClient && (() => {
            const r = detailClient
            const diasSemVenda = calcDiasSemVenda(r.parsed.ultima_venda)
            return (
              <>
                <DialogHeader className="px-6 pt-6 pb-2">
                  <DialogTitle className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-5 text-teal-600 dark:text-teal-400 shrink-0" />
                      <span className="text-base sm:text-lg truncate max-w-[400px]">{r.razao_social || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DiasSemVendaBadge dias={diasSemVenda} ultimaVenda={r.parsed.ultima_venda} />
                      <SituacaoCadastralBadge value={r.situacao_cadastral} />
                    </div>
                  </DialogTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {r.nome_fantasia && <span className="font-medium">{r.nome_fantasia}</span>}
                    {r.nome_fantasia && ' · '}
                    Código: <span className="font-mono font-medium text-teal-700 dark:text-teal-400">{r.parsed.codigo}</span>
                    {r.cnpj && <> · CNPJ: <span className="font-mono">{formatCnpj(r.cnpj)}</span></>}
                  </p>
                </DialogHeader>

                {/* Tabs */}
                <div className="px-6 border-b dark:border-slate-700">
                  <div className="flex gap-1 overflow-x-auto">
                    {DETAIL_TABS.map(tab => {
                      const Icon = tab.icon
                      const isActive = detailTab === tab.key
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setDetailTab(tab.key)}
                          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${isActive ? 'border-teal-500 text-teal-700 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'}`}
                        >
                          <Icon className="size-3.5" />
                          {tab.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <ScrollArea className="max-h-[55vh] px-6">
                  <div className="py-4 pb-4">
                    {/* Contato Tab */}
                    {detailTab === 'contato' && (
                      <div className="space-y-4">
                        <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                          <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><Phone className="size-3.5" />Telefones</legend>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            {r.telefone1 && <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Tel. 1</span><span className="font-mono text-slate-800 dark:text-slate-200">{formatPhone(r.telefone1)}</span></div>}
                            {r.telefone2 && <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Tel. 2</span><span className="font-mono text-slate-800 dark:text-slate-200">{formatPhone(r.telefone2)}</span></div>}
                            {r.telefone3 && <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Tel. 3</span><span className="font-mono text-slate-800 dark:text-slate-200">{formatPhone(r.telefone3)}</span></div>}
                            {r.telefone4 && <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Tel. 4</span><span className="font-mono text-slate-800 dark:text-slate-200">{formatPhone(r.telefone4)}</span></div>}
                            {!r.telefone1 && !r.telefone2 && !r.telefone3 && !r.telefone4 && <span className="text-slate-400 dark:text-slate-500">Nenhum telefone cadastrado</span>}
                          </div>
                        </fieldset>
                        <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                          <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><Mail className="size-3.5" />Emails</legend>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            {r.email1 && <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Email 1</span><span className="text-slate-800 dark:text-slate-200">{r.email1}</span></div>}
                            {r.email2 && <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Email 2</span><span className="text-slate-800 dark:text-slate-200">{r.email2}</span></div>}
                            {r.email3 && <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Email 3</span><span className="text-slate-800 dark:text-slate-200">{r.email3}</span></div>}
                            {!r.email1 && !r.email2 && !r.email3 && <span className="text-slate-400 dark:text-slate-500">Nenhum email cadastrado</span>}
                          </div>
                        </fieldset>
                        <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                          <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><User className="size-3.5" />Pessoa de Contato</legend>
                          <div className="text-sm">
                            {r.pessoa_contato ? <span className="text-slate-800 dark:text-slate-200 font-medium">{r.pessoa_contato}</span> : <span className="text-slate-400 dark:text-slate-500">Não informado</span>}
                          </div>
                        </fieldset>
                      </div>
                    )}

                    {/* Comercial Tab */}
                    {detailTab === 'comercial' && (
                      <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                        <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><Briefcase className="size-3.5" />Comercial</legend>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Vendedor</span><span className="font-medium text-slate-800 dark:text-slate-200">{r.parsed.vendedor || '—'}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Reg. Simples</span><span className="text-slate-800 dark:text-slate-200">{r.parsed.reg_simples ? <Badge variant="secondary" className="text-xs">{r.parsed.reg_simples}</Badge> : '—'}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Dias Sem Venda</span><DiasSemVendaBadge dias={diasSemVenda} ultimaVenda={r.parsed.ultima_venda} /></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Última Venda</span><span className="text-slate-800 dark:text-slate-200">{r.parsed.ultima_venda || '—'}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Cadastro</span><span className="text-slate-800 dark:text-slate-200">{r.parsed.cadastro || '—'}</span></div>
                        </div>
                      </fieldset>
                    )}

                    {/* Endereço Tab */}
                    {detailTab === 'endereco' && (
                      <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                        <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><MapPin className="size-3.5" />Endereço</legend>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                          <div className="sm:col-span-2"><span className="text-xs text-slate-500 dark:text-slate-400 block">Endereço</span><span className="text-slate-800 dark:text-slate-200">{r.endereco || '—'}{r.numero ? `, ${r.numero}` : ''}{r.complemento ? ` - ${r.complemento}` : ''}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Bairro</span><span className="text-slate-800 dark:text-slate-200">{r.bairro || '—'}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Cidade</span><span className="text-slate-800 dark:text-slate-200">{r.cidade || '—'}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">CEP</span><span className="font-mono text-slate-800 dark:text-slate-200">{r.cep ? formatCep(r.cep) : '—'}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">UF</span><span className="text-slate-800 dark:text-slate-200">{r.uf || '—'}</span></div>
                        </div>
                      </fieldset>
                    )}

                    {/* Fiscal Tab */}
                    {detailTab === 'fiscal' && (
                      <fieldset className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                        <legend className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-2 flex items-center gap-1.5"><Building2 className="size-3.5" />Dados Fiscais</legend>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">CNPJ</span><span className="font-mono text-slate-800 dark:text-slate-200">{r.cnpj ? formatCnpj(r.cnpj) : '—'}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">IE/RG</span><span className="font-mono text-slate-800 dark:text-slate-200">{r.parsed.ie_rg || '—'}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Situação Cadastral</span><span><SituacaoCadastralBadge value={r.situacao_cadastral} /></span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Data Situação</span><span className="text-slate-800 dark:text-slate-200">{r.data_situacao || '—'}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Data Abertura</span><span className="text-slate-800 dark:text-slate-200">{r.data_abertura || '—'}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">CNAE Principal</span><span className="text-slate-800 dark:text-slate-200">{r.cnae_principal || '—'}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Natureza Jurídica</span><span className="text-slate-800 dark:text-slate-200">{r.natureza_juridica || '—'}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Porte</span><span className="text-slate-800 dark:text-slate-200">{r.porte || '—'}</span></div>
                          <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Reg. Simples</span><span className="text-slate-800 dark:text-slate-200">{r.parsed.reg_simples ? <Badge variant="secondary" className="text-xs">{r.parsed.reg_simples}</Badge> : '—'}</span></div>
                        </div>
                      </fieldset>
                    )}

                    {/* Observações Tab */}
                    {detailTab === 'obs' && (
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

                    {/* Histórico Tab */}
                    {detailTab === 'historico' && (
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
                <DialogFooter className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-800 dark:border-slate-700 gap-2">
                  <Button variant="outline" onClick={() => setDetailClient(null)}>Fechar</Button>
                  {detailTab === 'obs' && (
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
    </div>
  )
}

// ─── Export with Suspense ──────────────────────────

export default function HomeWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <Loader2 className="size-6 animate-spin" />
          <span className="text-lg">Carregando...</span>
        </div>
      </div>
    }>
      <Home />
    </Suspense>
  )
}
