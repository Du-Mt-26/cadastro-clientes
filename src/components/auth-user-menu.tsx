'use client'

import { useSession, signOut } from 'next-auth/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ROLE_LABELS, ROLE_COLORS, type Role } from '@/lib/auth'
import {
  ShieldCheck,
  Users,
  LogOut,
  ChevronDown,
  Briefcase,
} from 'lucide-react'

interface AuthUserMenuProps {
  onOpen2FA: () => void
  onOpenUserManagement: () => void
  onOpenVendedorManagement: () => void
}

export function AuthUserMenu({ onOpen2FA, onOpenUserManagement, onOpenVendedorManagement }: AuthUserMenuProps) {
  const { data: session } = useSession()

  if (!session?.user) return null

  const user = session.user as typeof session.user & {
    id: string
    role: Role
    twoFactorEnabled: boolean
  }

  const role = user.role as Role
  const isAdmin = role === 'ADMIN'
  const canManageVendedores = role === 'ADMIN' || role === 'DIRETOR_COMERCIAL' || role === 'GERENTE_COMERCIAL'
  const initials = user.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? 'U'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline text-sm font-medium max-w-[120px] truncate">
            {user.name}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        {/* User info */}
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate">{user.name}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            <Badge
              variant="outline"
              className={`w-fit text-[11px] ${ROLE_COLORS[role] ?? ''}`}
            >
              {ROLE_LABELS[role] ?? role}
            </Badge>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Actions */}
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onOpen2FA} className="cursor-pointer">
            <ShieldCheck className="size-4" />
            <span>Configurar 2FA</span>
          </DropdownMenuItem>

          {isAdmin && (
            <DropdownMenuItem onClick={onOpenUserManagement} className="cursor-pointer">
              <Users className="size-4" />
              <span>Gerenciar Usuários</span>
            </DropdownMenuItem>
          )}

          {canManageVendedores && (
            <DropdownMenuItem onClick={onOpenVendedorManagement} className="cursor-pointer">
              <Briefcase className="size-4" />
              <span>Cadastro de Vendedores</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="cursor-pointer"
        >
          <LogOut className="size-4" />
          <span>Sair</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
