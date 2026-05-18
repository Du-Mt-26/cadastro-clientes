'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Card,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { ROLE_LABELS, ROLE_COLORS, type Role } from '@/lib/auth'
import { toast } from '@/hooks/use-toast'
import {
  UserPlus,
  Pencil,
  KeyRound,
  Check,
  X,
  Loader2,
  Users,
  Briefcase,
  Building2,
  ShieldCheck,
  ShieldX,
  Filter,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────

interface UserInfo {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  twoFactorEnabled: boolean
  clientCount: number
  carteiraRevendas: number
  carteiraCorporativo: number
  listaFria: number
  fornecedores: number
  bolsao: number
}

interface UserManagementModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const EMPTY_NEW_USER = {
  name: '',
  email: '',
  password: 'Mtech@2026',
  role: 'VENDEDOR' as Role,
}

const ROLE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'ADMIN', label: ROLE_LABELS.ADMIN },
  { value: 'DIRETOR_COMERCIAL', label: ROLE_LABELS.DIRETOR_COMERCIAL },
  { value: 'GERENTE_COMERCIAL', label: ROLE_LABELS.GERENTE_COMERCIAL },
  { value: 'SUPERVISORA', label: ROLE_LABELS.SUPERVISORA },
  { value: 'VENDEDOR', label: ROLE_LABELS.VENDEDOR },
]

// ─── Component ────────────────────────────────────────

export function UserManagementModal({ open, onOpenChange }: UserManagementModalProps) {
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER)
  const [creating, setCreating] = useState(false)
  const [roleFilter, setRoleFilter] = useState('all')

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<{ name: string; email: string; role: Role }>>({})
  const [saving, setSaving] = useState(false)

  // Password reset state
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')

  // ─── Fetch users ──────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vendedores')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Erro ao carregar usuários')
      }
      const data = await res.json()
      setUsers(data.vendedores ?? [])
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchUsers()
      setShowNewForm(false)
      setEditingId(null)
      setResettingId(null)
      setNewUser(EMPTY_NEW_USER)
    }
  }, [open, fetchUsers])

  // ─── Create user ──────────────────────────────────
  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast({ title: 'Erro', description: 'Preencha todos os campos obrigatórios', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/vendedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao criar usuário')

      toast({ title: 'Sucesso', description: `${newUser.name} criado com sucesso` })
      setNewUser(EMPTY_NEW_USER)
      setShowNewForm(false)
      fetchUsers()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  // ─── Update user ──────────────────────────────────
  const handleSaveEdit = async (userId: string) => {
    setSaving(true)
    try {
      const payload: any = { id: userId }
      if (editData.name !== undefined) payload.name = editData.name
      if (editData.email !== undefined) payload.email = editData.email
      if (editData.role !== undefined) payload.role = editData.role

      const res = await fetch('/api/vendedores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao atualizar usuário')

      toast({ title: 'Sucesso', description: 'Usuário atualizado' })
      setEditingId(null)
      setEditData({})
      fetchUsers()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ─── Toggle active ────────────────────────────────
  const handleToggleActive = async (userId: string, currentActive: boolean, userName: string) => {
    try {
      const res = await fetch('/api/vendedores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, active: !currentActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao alterar status')

      toast({
        title: 'Sucesso',
        description: currentActive ? `${userName} desativado` : `${userName} ativado`,
      })
      fetchUsers()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  // ─── Password reset ───────────────────────────────
  const handleResetPassword = async (userId: string) => {
    if (!resetPassword || resetPassword.length < 6) {
      toast({ title: 'Erro', description: 'Senha deve ter no mínimo 6 caracteres', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/vendedores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, password: resetPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao resetar senha')

      toast({ title: 'Sucesso', description: 'Senha atualizada com sucesso' })
      setResettingId(null)
      setResetPassword('')
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (u: UserInfo) => {
    setEditingId(u.id)
    setEditData({ name: u.name, email: u.email, role: u.role })
    setResettingId(null)
    setShowNewForm(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
  }

  const startResetPassword = (userId: string) => {
    setResettingId(userId)
    setResetPassword('')
    setEditingId(null)
  }

  // ─── Stats & filtering ────────────────────────────
  const filteredUsers = roleFilter === 'all'
    ? users
    : users.filter((u) => u.role === roleFilter)

  const activeCount = users.filter((u) => u.active).length
  const totalClients = users.reduce((sum, u) => sum + u.clientCount, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Users className="size-5 text-teal-600" />
            Cadastro de Usuários
          </DialogTitle>
          <DialogDescription>
            Gerencie usuários, carteiras e acessos.{' '}
            <span className="font-medium text-foreground">
              {users.length} usuário{users.length !== 1 ? 's' : ''} • {activeCount} ativo{activeCount !== 1 ? 's' : ''} • {totalClients} clientes
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Actions bar */}
        <div className="flex items-center justify-between gap-2 pb-1">
          <div className="flex items-center gap-3">
            {/* Role filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="size-3.5 text-muted-foreground" />
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-7 text-xs w-auto min-w-[130px]">
                  <SelectValue placeholder="Filtrar papel" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Badge variant="outline" className="text-xs bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border-teal-200 dark:border-teal-800">
              <Users className="size-3 mr-1" />
              {activeCount} ativos
            </Badge>
            <Badge variant="outline" className="text-xs bg-muted">
              {totalClients} clientes
            </Badge>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setShowNewForm(!showNewForm)
              setEditingId(null)
              setResettingId(null)
            }}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            <UserPlus className="size-4 mr-1" />
            Novo Usuário
          </Button>
        </div>

        {/* New user inline form */}
        {showNewForm && (
          <div className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20 p-4 space-y-3 transition-all">
            <p className="text-sm font-semibold text-teal-700 dark:text-teal-300 flex items-center gap-2">
              <UserPlus className="size-4" />
              Novo Usuário
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                placeholder="Nome completo"
                value={newUser.name}
                onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))}
                className="bg-white dark:bg-background"
              />
              <Input
                placeholder="Email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                className="bg-white dark:bg-background"
              />
              <Input
                placeholder="Senha padrão"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                className="bg-white dark:bg-background"
              />
              <Select
                value={newUser.role}
                onValueChange={(v) => setNewUser((p) => ({ ...p, role: v as Role }))}
              >
                <SelectTrigger className="w-full bg-white dark:bg-background">
                  <SelectValue placeholder="Papel" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowNewForm(false)
                  setNewUser(EMPTY_NEW_USER)
                }}
              >
                <X className="size-4 mr-1" />
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleCreateUser}
                disabled={creating}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                {creating && <Loader2 className="size-4 mr-1 animate-spin" />}
                Criar Usuário
              </Button>
            </div>
          </div>
        )}

        {/* Users list */}
        <div className="flex-1 overflow-y-auto max-h-[60vh] space-y-3 pr-1 custom-scrollbar">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <Users className="size-10 mx-auto mb-2 opacity-30" />
              Nenhum usuário encontrado.
            </div>
          ) : (
            filteredUsers.map((user) => {
              const isEditing = editingId === user.id
              const isResetting = resettingId === user.id
              const isInactive = !user.active

              return (
                <Card
                  key={user.id}
                  className={`p-4 transition-all duration-200 ${
                    isInactive
                      ? 'bg-muted/60 dark:bg-muted/30 border-dashed opacity-75'
                      : 'bg-white dark:bg-card'
                  } ${isEditing ? 'ring-2 ring-teal-500/50 border-teal-300 dark:border-teal-700' : ''}`}
                >
                  <div className="flex flex-col gap-3">
                    {/* Row 1: Name, Email, Role Badge, Actions */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Name */}
                          {isEditing ? (
                            <Input
                              className="h-8 text-sm max-w-[200px]"
                              value={editData.name ?? ''}
                              onChange={(e) =>
                                setEditData((p) => ({ ...p, name: e.target.value }))
                              }
                              autoFocus
                            />
                          ) : (
                            <span className="font-semibold text-sm truncate">
                              {user.name}
                            </span>
                          )}

                          {/* Role Badge */}
                          {isEditing ? (
                            <Select
                              value={editData.role ?? user.role}
                              onValueChange={(v) =>
                                setEditData((p) => ({ ...p, role: v as Role }))
                              }
                            >
                              <SelectTrigger className="h-7 text-xs w-auto min-w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {ROLE_LABELS[r]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${ROLE_COLORS[user.role] ?? ''}`}
                            >
                              {ROLE_LABELS[user.role] ?? user.role}
                            </Badge>
                          )}

                          {/* Inactive badge */}
                          {isInactive && !isEditing && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-300 dark:border-gray-600">
                              Inativo
                            </Badge>
                          )}

                          {/* 2FA indicator */}
                          {!isEditing && (
                            user.twoFactorEnabled ? (
                              <ShieldCheck className="size-3.5 text-green-600 dark:text-green-400" />
                            ) : (
                              <ShieldX className="size-3.5 text-muted-foreground/50" />
                            )
                          )}
                        </div>

                        {/* Email */}
                        {isEditing ? (
                          <Input
                            className="h-8 text-sm mt-1.5 max-w-[280px]"
                            type="email"
                            value={editData.email ?? ''}
                            onChange={(e) =>
                              setEditData((p) => ({ ...p, email: e.target.value }))
                            }
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {user.email}
                          </p>
                        )}
                      </div>

                      {/* Right side: Active toggle + Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Active toggle */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground hidden sm:inline">
                            {user.active ? 'Ativo' : 'Inativo'}
                          </span>
                          <Switch
                            checked={user.active}
                            onCheckedChange={() =>
                              handleToggleActive(user.id, user.active, user.name)
                            }
                            disabled={isEditing}
                          />
                        </div>

                        {/* Action buttons */}
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              onClick={() => handleSaveEdit(user.id)}
                              disabled={saving}
                              title="Salvar"
                            >
                              {saving ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Check className="size-4 text-teal-600" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              onClick={cancelEdit}
                              disabled={saving}
                              title="Cancelar"
                            >
                              <X className="size-4 text-red-500" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              onClick={() => startEdit(user)}
                              title="Editar"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              onClick={() => startResetPassword(user.id)}
                              title="Resetar senha"
                            >
                              <KeyRound className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Client count breakdown */}
                    {!isEditing && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-muted-foreground mr-1 flex items-center gap-1">
                          <Briefcase className="size-3" />
                          Carteira:
                        </span>
                        {user.carteiraRevendas > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800">
                            Revendas {user.carteiraRevendas}
                          </Badge>
                        )}
                        {user.carteiraCorporativo > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800">
                            <Building2 className="size-2.5 mr-0.5" />
                            Corporativo {user.carteiraCorporativo}
                          </Badge>
                        )}
                        {user.listaFria > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700">
                            Lista Fria {user.listaFria}
                          </Badge>
                        )}
                        {user.fornecedores > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800">
                            Fornecedores {user.fornecedores}
                          </Badge>
                        )}
                        {user.bolsao > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800">
                            Bolsão {user.bolsao}
                          </Badge>
                        )}
                        {user.clientCount === 0 && (
                          <span className="text-[10px] text-muted-foreground italic">
                            Sem clientes
                          </span>
                        )}
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted">
                          Total {user.clientCount}
                        </Badge>
                      </div>
                    )}

                    {/* Row 3: Password reset inline */}
                    {isResetting && (
                      <div className="flex items-center gap-2 pt-1 border-t border-dashed mt-1">
                        <KeyRound className="size-3.5 text-amber-500 shrink-0" />
                        <Input
                          className="h-8 text-sm flex-1 max-w-[220px]"
                          type="password"
                          placeholder="Nova senha (mín. 6 caracteres)"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleResetPassword(user.id)
                          }}
                          autoFocus
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0"
                          onClick={() => handleResetPassword(user.id)}
                          disabled={saving}
                          title="Salvar senha"
                        >
                          {saving ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Check className="size-4 text-teal-600" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0"
                          onClick={() => {
                            setResettingId(null)
                            setResetPassword('')
                          }}
                          disabled={saving}
                          title="Cancelar"
                        >
                          <X className="size-4 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
