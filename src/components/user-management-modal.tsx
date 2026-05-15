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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  ShieldCheck,
  ShieldX,
} from 'lucide-react'

interface UserRecord {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  twoFactorEnabled: boolean
  createdAt: string
  updatedAt?: string
}

interface UserManagementModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const EMPTY_NEW_USER = {
  name: '',
  email: '',
  password: '',
  role: 'VENDEDOR' as Role,
}

export function UserManagementModal({ open, onOpenChange }: UserManagementModalProps) {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER)
  const [creating, setCreating] = useState(false)

  // Editing state: key = user id, value = field overrides
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<UserRecord & { password: string }>>({})
  const [saving, setSaving] = useState(false)

  // Password reset state
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Erro ao carregar usuários')
      }
      const data = await res.json()
      setUsers(data.users ?? [])
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
    }
  }, [open, fetchUsers])

  // ─── Create user ─────────────────────────────────
  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast({ title: 'Erro', description: 'Preencha todos os campos obrigatórios', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao criar usuário')

      toast({ title: 'Sucesso', description: 'Usuário criado com sucesso' })
      setNewUser(EMPTY_NEW_USER)
      setShowNewForm(false)
      fetchUsers()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  // ─── Update user ─────────────────────────────────
  const handleSaveEdit = async (userId: string) => {
    setSaving(true)
    try {
      const payload: any = { id: userId }
      if (editData.name !== undefined) payload.name = editData.name
      if (editData.email !== undefined) payload.email = editData.email
      if (editData.role !== undefined) payload.role = editData.role

      const res = await fetch('/api/users', {
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

  // ─── Toggle active ───────────────────────────────
  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, active: !currentActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao alterar status')

      toast({
        title: 'Sucesso',
        description: currentActive ? 'Usuário desativado' : 'Usuário ativado',
      })
      fetchUsers()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  // ─── Password reset ──────────────────────────────
  const handleResetPassword = async (userId: string) => {
    if (!resetPassword || resetPassword.length < 6) {
      toast({ title: 'Erro', description: 'Senha deve ter no mínimo 6 caracteres', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, password: resetPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao resetar senha')

      toast({ title: 'Sucesso', description: 'Senha atualizada' })
      setResettingId(null)
      setResetPassword('')
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (user: UserRecord) => {
    setEditingId(user.id)
    setEditData({ name: user.name, email: user.email, role: user.role })
    setResettingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col">
        <DialogHeader>
          <DialogTitle>Gerenciar Usuários</DialogTitle>
          <DialogDescription>
            Crie, edite e gerencie contas de usuários do sistema.
          </DialogDescription>
        </DialogHeader>

        {/* Actions bar */}
        <div className="flex items-center justify-between gap-2 pb-2">
          <span className="text-sm text-muted-foreground">
            {users.length} usuário{users.length !== 1 ? 's' : ''}
          </span>
          <Button
            size="sm"
            onClick={() => {
              setShowNewForm(!showNewForm)
              setEditingId(null)
              setResettingId(null)
            }}
          >
            <UserPlus className="size-4 mr-1" />
            Novo Usuário
          </Button>
        </div>

        {/* New user inline form */}
        {showNewForm && (
          <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
            <p className="text-sm font-medium">Novo Usuário</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                placeholder="Nome"
                value={newUser.name}
                onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))}
              />
              <Input
                placeholder="Email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
              />
              <Input
                placeholder="Senha (mín. 6 caracteres)"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
              />
              <Select
                value={newUser.role}
                onValueChange={(v) => setNewUser((p) => ({ ...p, role: v as Role }))}
              >
                <SelectTrigger className="w-full">
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
                Cancelar
              </Button>
              <Button size="sm" onClick={handleCreateUser} disabled={creating}>
                {creating && <Loader2 className="size-4 mr-1 animate-spin" />}
                Criar
              </Button>
            </div>
          </div>
        )}

        {/* Users table */}
        <div className="flex-1 overflow-y-auto max-h-96 rounded-md border">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nenhum usuário encontrado.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  <TableHead className="text-center">2FA</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const isEditing = editingId === user.id
                  const isResetting = resettingId === user.id

                  return (
                    <TableRow key={user.id} className={isEditing ? 'bg-accent/30' : ''}>
                      {/* Name */}
                      <TableCell>
                        {isEditing ? (
                          <Input
                            className="h-8 text-sm"
                            value={editData.name ?? ''}
                            onChange={(e) =>
                              setEditData((p) => ({ ...p, name: e.target.value }))
                            }
                          />
                        ) : (
                          <span className="font-medium text-sm">{user.name}</span>
                        )}
                      </TableCell>

                      {/* Email */}
                      <TableCell>
                        {isEditing ? (
                          <Input
                            className="h-8 text-sm"
                            type="email"
                            value={editData.email ?? ''}
                            onChange={(e) =>
                              setEditData((p) => ({ ...p, email: e.target.value }))
                            }
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">{user.email}</span>
                        )}
                      </TableCell>

                      {/* Role */}
                      <TableCell>
                        {isEditing ? (
                          <Select
                            value={editData.role ?? user.role}
                            onValueChange={(v) =>
                              setEditData((p) => ({ ...p, role: v as Role }))
                            }
                          >
                            <SelectTrigger className="h-8 text-sm w-full">
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
                            className={`text-[11px] ${ROLE_COLORS[user.role] ?? ''}`}
                          >
                            {ROLE_LABELS[user.role] ?? user.role}
                          </Badge>
                        )}
                      </TableCell>

                      {/* Active toggle */}
                      <TableCell className="text-center">
                        <Switch
                          checked={user.active}
                          onCheckedChange={() => handleToggleActive(user.id, user.active)}
                          disabled={isEditing}
                        />
                      </TableCell>

                      {/* 2FA */}
                      <TableCell className="text-center">
                        {user.twoFactorEnabled ? (
                          <ShieldCheck className="size-4 text-green-600 mx-auto" />
                        ) : (
                          <ShieldX className="size-4 text-muted-foreground mx-auto" />
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={() => handleSaveEdit(user.id)}
                              disabled={saving}
                            >
                              {saving ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Check className="size-3.5 text-green-600" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={cancelEdit}
                              disabled={saving}
                            >
                              <X className="size-3.5 text-red-500" />
                            </Button>
                          </div>
                        ) : isResetting ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              className="h-7 w-28 text-xs"
                              type="password"
                              placeholder="Nova senha"
                              value={resetPassword}
                              onChange={(e) => setResetPassword(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleResetPassword(user.id)
                              }}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={() => handleResetPassword(user.id)}
                              disabled={saving}
                            >
                              {saving ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Check className="size-3.5 text-green-600" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={() => {
                                setResettingId(null)
                                setResetPassword('')
                              }}
                              disabled={saving}
                            >
                              <X className="size-3.5 text-red-500" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={() => startEdit(user)}
                              title="Editar"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={() => {
                                setResettingId(user.id)
                                setResetPassword('')
                                setEditingId(null)
                              }}
                              title="Resetar senha"
                            >
                              <KeyRound className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
