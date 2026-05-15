'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { ROLE_LABELS, type Role } from '@/lib/auth'
import { toast } from '@/hooks/use-toast'
import {
  Shield,
  Users,
  Briefcase,
  Sheet as SheetIcon,
  Settings2,
  Loader2,
  Save,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────

interface PermissionEntry {
  key: string
  label: string
  category: string
  allowed: boolean
}

interface PermissionManagementModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ─── Category config ──────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  clientes: {
    label: 'Clientes',
    icon: Users,
    color: 'text-teal-600 dark:text-teal-400',
  },
  bolsao: {
    label: 'Bolsão',
    icon: Briefcase,
    color: 'text-amber-600 dark:text-amber-400',
  },
  users: {
    label: 'Usuários',
    icon: Users,
    color: 'text-purple-600 dark:text-purple-400',
  },
  sheets: {
    label: 'Google Sheets',
    icon: SheetIcon,
    color: 'text-green-600 dark:text-green-400',
  },
  geral: {
    label: 'Geral',
    icon: Settings2,
    color: 'text-slate-600 dark:text-slate-400',
  },
}

const CATEGORY_ORDER = ['clientes', 'bolsao', 'users', 'sheets', 'geral']

const ROLE_OPTIONS: Role[] = ['ADMIN', 'DIRETOR_COMERCIAL', 'GERENTE_COMERCIAL', 'VENDEDOR']

// ─── Component ────────────────────────────────────────

export function PermissionManagementModal({ open, onOpenChange }: PermissionManagementModalProps) {
  const [permissions, setPermissions] = useState<PermissionEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<Role>('ADMIN')

  // ─── Fetch permissions ────────────────────────────
  const fetchPermissions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/permissions')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Erro ao carregar permissões')
      }
      const data = await res.json()
      // data.permissions is Record<role, Record<key, { label, category, allowed }>>
      setPermissions(
        Object.entries(data.permissions?.[selectedRole] ?? {}).map(([key, val]: [string, any]) => ({
          key,
          label: val.label ?? key,
          category: val.category ?? 'geral',
          allowed: val.allowed ?? false,
        }))
      )
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [selectedRole])

  useEffect(() => {
    if (open) {
      fetchPermissions()
    }
  }, [open, fetchPermissions])

  // ─── Toggle permission ────────────────────────────
  const handleToggle = async (permKey: string, currentAllowed: boolean) => {
    setSavingKey(permKey)
    try {
      const res = await fetch('/api/permissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole, permissionKey: permKey, allowed: !currentAllowed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao atualizar permissão')

      toast({ title: 'Sucesso', description: `Permissão ${permKey} ${!currentAllowed ? 'ativada' : 'desativada'}` })
      // Update local state
      setPermissions((prev) =>
        prev.map((p) => (p.key === permKey ? { ...p, allowed: !currentAllowed } : p))
      )
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setSavingKey(null)
    }
  }

  // ─── Group permissions by category ────────────────
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    config: CATEGORY_CONFIG[cat],
    permissions: permissions.filter((p) => p.category === cat),
  })).filter((g) => g.permissions.length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col p-4 sm:p-6 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Shield className="size-5 text-teal-600" />
            Gerenciar Permissões
          </DialogTitle>
          <DialogDescription>
            Configure as permissões de acesso para cada papel no sistema.
          </DialogDescription>
        </DialogHeader>

        {/* Role selector */}
        <div className="flex items-center gap-3 pb-2">
          <span className="text-sm font-medium text-muted-foreground">Papel:</span>
          <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as Role)}>
            <SelectTrigger className="w-auto min-w-[200px]">
              <SelectValue placeholder="Selecione o papel" />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  <Badge
                    variant="outline"
                    className={`text-[11px] mr-1 ${ROLE_LABELS[r] ? '' : ''}`}
                  >
                    {ROLE_LABELS[r] ?? r}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-xs bg-muted">
            {permissions.length} permissões
          </Badge>
        </div>

        {/* Permissions list grouped by category */}
        <div className="flex-1 overflow-y-auto max-h-[60vh] space-y-4 pr-1 custom-scrollbar">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <Shield className="size-10 mx-auto mb-2 opacity-30" />
              Nenhuma permissão encontrada.
            </div>
          ) : (
            grouped.map(({ category, config, permissions: catPerms }) => {
              const Icon = config.icon
              return (
                <div key={category} className="space-y-2">
                  {/* Category header */}
                  <div className="flex items-center gap-2 pt-2 first:pt-0">
                    <Icon className={`size-4 ${config.color}`} />
                    <span className={`text-sm font-semibold ${config.color}`}>
                      {config.label}
                    </span>
                    <div className="flex-1 border-b border-dashed border-slate-200 dark:border-slate-700" />
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted">
                      {catPerms.filter((p) => p.allowed).length}/{catPerms.length}
                    </Badge>
                  </div>

                  {/* Permission rows */}
                  <div className="space-y-1 pl-2">
                    {catPerms.map((perm) => (
                      <div
                        key={perm.key}
                        className="flex items-center justify-between gap-3 py-1.5 px-3 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-foreground">{perm.label}</span>
                          <p className="text-[11px] text-muted-foreground font-mono truncate">
                            {perm.key}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {savingKey === perm.key && (
                            <Loader2 className="size-3.5 animate-spin text-teal-600" />
                          )}
                          <Switch
                            checked={perm.allowed}
                            onCheckedChange={() => handleToggle(perm.key, perm.allowed)}
                            disabled={savingKey !== null}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
