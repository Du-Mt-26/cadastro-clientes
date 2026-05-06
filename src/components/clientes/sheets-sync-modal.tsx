'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Link2,
  Unlink,
  Upload,
  Download,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sheet,
  Loader2,
  ArrowRightLeft,
  Copy,
  ExternalLink,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface SyncConfig {
  id?: string
  sheetsUrl: string
  spreadsheetId: string
  sheetName: string
  connected: boolean
  headerRow: number
  syncMode: string
  autoSync: boolean
  autoSyncMinutes: number
  lastSyncAt: string | null
  lastSyncStatus: string
  lastSyncCount: number
  lastSyncError: string
}

interface SyncStatus {
  configured: boolean
  connected: boolean
  credentialsConfigured: boolean
  serviceEmail: string | null
  config: SyncConfig | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSyncComplete?: () => void
}

export function SheetsSyncModal({ open, onOpenChange, onSyncComplete }: Props) {
  const [url, setUrl] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [connectResult, setConnectResult] = useState<{
    success: boolean
    title?: string
    sheetName?: string
    rowCount?: number
    headers?: string[]
    error?: string
  } | null>(null)
  const [syncMode, setSyncMode] = useState('pull')

  // Load sync status on open
  useEffect(() => {
    if (open) {
      loadStatus()
      setConnectResult(null)
    }
  }, [open])

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/sync')
      const data = await res.json()
      setSyncStatus(data)
      if (data.config?.sheetsUrl) {
        setUrl(data.config.sheetsUrl)
      }
      if (data.config?.syncMode) {
        setSyncMode(data.config.syncMode)
      }
    } catch {
      // ignore
    }
  }

  const handleConnect = async () => {
    if (!url.trim()) {
      toast({ title: '✗ URL obrigatória', description: 'Cole a URL da planilha do Google Sheets', variant: 'destructive' })
      return
    }

    setConnecting(true)
    setConnectResult(null)

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()

      setConnectResult(data)

      if (data.success) {
        toast({
          title: '✓ Conectado!',
          description: `"${data.title}" — ${data.rowCount} linhas, ${data.headers?.length || 0} colunas detectadas`,
        })
      } else {
        toast({
          title: '✗ Erro ao conectar',
          description: data.error || 'Verifique a URL e as permissões de compartilhamento',
          variant: 'destructive',
        })
      }

      await loadStatus()
    } catch {
      toast({ title: '✗ Erro de conexão', description: 'Não foi possível conectar ao servidor', variant: 'destructive' })
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await fetch('/api/sync', { method: 'DELETE' })
      setConnectResult(null)
      await loadStatus()
      toast({ title: 'Desconectado', description: 'Planilha desconectada' })
    } catch {
      toast({ title: '✗ Erro', description: 'Não foi possível desconectar', variant: 'destructive' })
    }
  }

  const handlePull = async () => {
    setPulling(true)
    try {
      const res = await fetch('/api/sync/pull', { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        toast({
          title: `✓ Importação concluída`,
          description: `${data.pulled} registros importados (${data.created} novos, ${data.updated} atualizados)`,
        })
        onSyncComplete?.()
      } else {
        toast({
          title: '✗ Erro na importação',
          description: data.error || data.errors?.join('; ') || 'Erro desconhecido',
          variant: 'destructive',
        })
      }
      await loadStatus()
    } catch {
      toast({ title: '✗ Erro', description: 'Falha na importação', variant: 'destructive' })
    } finally {
      setPulling(false)
    }
  }

  const handlePush = async () => {
    setPushing(true)
    try {
      const res = await fetch('/api/sync/push', { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        toast({
          title: `✓ Envio concluído`,
          description: `${data.pushed} registros enviados para a planilha`,
        })
      } else {
        toast({
          title: '✗ Erro no envio',
          description: data.error || data.errors?.join('; ') || 'Erro desconhecido',
          variant: 'destructive',
        })
      }
      await loadStatus()
    } catch {
      toast({ title: '✗ Erro', description: 'Falha no envio', variant: 'destructive' })
    } finally {
      setPushing(false)
    }
  }

  const copyServiceEmail = () => {
    if (syncStatus?.serviceEmail) {
      navigator.clipboard.writeText(syncStatus.serviceEmail)
      toast({ title: '✓ Copiado!', description: 'Email copiado para a área de transferência' })
    }
  }

  const isConnected = syncStatus?.connected && syncStatus?.config?.connected
  const lastSync = syncStatus?.config?.lastSyncAt
    ? new Date(syncStatus.config.lastSyncAt).toLocaleString('pt-BR')
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sheet className="size-5 text-teal-600" />
            Google Sheets — Sincronização
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Credentials Status */}
          <div className={`rounded-lg border p-4 ${syncStatus?.credentialsConfigured ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'}`}>
            <div className="flex items-start gap-3">
              {syncStatus?.credentialsConfigured ? (
                <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {syncStatus?.credentialsConfigured ? 'Credenciais configuradas' : 'Credenciais não configuradas'}
                </p>
                {syncStatus?.credentialsConfigured && syncStatus?.serviceEmail && (
                  <div className="mt-2 flex items-center gap-2">
                    <code className="text-xs bg-white dark:bg-slate-800 px-2 py-1 rounded border break-all">
                      {syncStatus.serviceEmail}
                    </code>
                    <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={copyServiceEmail} title="Copiar email">
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                )}
                {!syncStatus?.credentialsConfigured && (
                  <div className="mt-2 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                    <p>Para conectar ao Google Sheets, configure as variáveis no arquivo <code className="bg-white dark:bg-slate-800 px-1 rounded">.env</code>:</p>
                    <pre className="bg-white dark:bg-slate-800 p-2 rounded text-[11px] overflow-x-auto">
{`GOOGLE_SERVICE_ACCOUNT_EMAIL=seu-email@projeto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"`}
                    </pre>
                    <p className="mt-1">1. Crie um projeto no <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-teal-600 underline inline-flex items-center gap-0.5">Google Cloud Console <ExternalLink className="size-3" /></a></p>
                    <p>2. Ative a Google Sheets API</p>
                    <p>3. Crie uma Service Account e baixe a chave JSON</p>
                    <p>4. Compartilhe a planilha com o email da Service Account</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* URL Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              URL da Planilha
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  placeholder="Cole a URL do Google Sheets aqui..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="pl-9"
                  disabled={connecting}
                />
              </div>
              {isConnected ? (
                <Button variant="outline" size="sm" onClick={handleDisconnect} className="shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30">
                  <Unlink className="size-4 mr-1.5" />
                  Desconectar
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleConnect}
                  disabled={connecting || !url.trim()}
                  className="shrink-0 bg-teal-600 hover:bg-teal-700 text-white"
                >
                  {connecting ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Link2 className="size-4 mr-1.5" />}
                  Conectar
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Formatos aceitos: URL completa, encurtada (bit.ly), ou ID da planilha
            </p>
          </div>

          {/* Connection Result */}
          {connectResult && (
            <div className={`rounded-lg border p-3 ${connectResult.success ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'}`}>
              {connectResult.success ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Conectado!</span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    <strong>{connectResult.title}</strong> — Aba: {connectResult.sheetName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {connectResult.rowCount} linhas · {connectResult.headers?.length || 0} colunas
                  </p>
                  {connectResult.headers && connectResult.headers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {connectResult.headers.slice(0, 12).map((h, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">{h || `Col ${i + 1}`}</Badge>
                      ))}
                      {connectResult.headers.length > 12 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{connectResult.headers.length - 12} mais</Badge>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <XCircle className="size-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">Falha na conexão</p>
                    <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">{connectResult.error}</p>
                    {connectResult.error?.includes('compartilhe') && (
                      <p className="text-xs text-slate-500 mt-1">
                        Compartilhe a planilha com: <code className="bg-white dark:bg-slate-800 px-1 rounded">{syncStatus?.serviceEmail}</code>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Connected Status */}
          {isConnected && !connectResult && (
            <div className="rounded-lg border p-3 bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="size-4 text-teal-600" />
                <span className="text-sm font-medium text-teal-700 dark:text-teal-400">
                  Planilha conectada
                </span>
              </div>
              {syncStatus?.config?.sheetsUrl && (
                <p className="text-xs text-slate-600 dark:text-slate-400 truncate" title={syncStatus.config.sheetsUrl}>
                  {syncStatus.config.sheetsUrl}
                </p>
              )}
              {lastSync && (
                <p className="text-xs text-slate-500 mt-1">
                  Última sync: {lastSync}
                  {syncStatus.config?.lastSyncCount ? ` — ${syncStatus.config.lastSyncCount} registros` : ''}
                  {syncStatus.config?.lastSyncStatus === 'error' && (
                    <Badge variant="destructive" className="ml-2 text-[10px] px-1 py-0">Erro</Badge>
                  )}
                </p>
              )}
              {syncStatus?.config?.lastSyncError && (
                <p className="text-xs text-red-500 mt-1">{syncStatus.config.lastSyncError}</p>
              )}
            </div>
          )}

          {/* Sync Mode */}
          {isConnected && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Modo de sincronização
                </label>
                <Select value={syncMode} onValueChange={setSyncMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pull">
                      <span className="flex items-center gap-2">
                        <Download className="size-3.5" />
                        Importar (Sheets → Sistema)
                      </span>
                    </SelectItem>
                    <SelectItem value="push">
                      <span className="flex items-center gap-2">
                        <Upload className="size-3.5" />
                        Exportar (Sistema → Sheets)
                      </span>
                    </SelectItem>
                    <SelectItem value="bidirectional">
                      <span className="flex items-center gap-2">
                        <ArrowRightLeft className="size-3.5" />
                        Bidirecional (ambos)
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sync Actions */}
              <div className="flex gap-2">
                {(syncMode === 'pull' || syncMode === 'bidirectional') && (
                  <Button
                    onClick={handlePull}
                    disabled={pulling}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    {pulling ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Download className="size-4 mr-1.5" />}
                    Importar do Sheets
                  </Button>
                )}
                {(syncMode === 'push' || syncMode === 'bidirectional') && (
                  <Button
                    onClick={handlePush}
                    disabled={pushing}
                    variant="outline"
                    className="flex-1 border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-400 dark:hover:bg-teal-950/30"
                  >
                    {pushing ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Upload className="size-4 mr-1.5" />}
                    Enviar para Sheets
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
            <p className="font-medium text-slate-700 dark:text-slate-300">Como funciona:</p>
            <div className="flex items-center gap-2">
              <span className="bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 rounded-full size-5 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
              <span>Cole a URL da planilha e clique <strong>Conectar</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 rounded-full size-5 flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
              <span>Compartilhe a planilha com o email da Service Account (permissão de <strong>Editor</strong>)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 rounded-full size-5 flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
              <span>Clique <strong>Importar</strong> para trazer os dados ou <strong>Enviar</strong> para atualizar a planilha</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 rounded-full size-5 flex items-center justify-center text-[10px] font-bold shrink-0">4</span>
              <span>No modo <strong>Bidirecional</strong>, alterações em ambos os lados são sincronizadas</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
