'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useState } from 'react'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Clientes', href: '/clientes', icon: Users },
]

function UserNav() {
  const { data: session } = useSession()
  const router = useRouter()

  if (!session) return null

  const initials = session.user.name
    ? session.user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : session.user.email.substring(0, 2).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 px-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:inline text-sm font-medium max-w-[120px] truncate">
            {session.user.name || session.user.email}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{session.user.name || 'Usuário'}</p>
          <p className="text-xs text-muted-foreground">{session.user.email}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {session.user.role === 'ADMIN' ? 'Administrador' :
             session.user.role === 'SUPERVISORA' ? 'Supervisora' :
             session.user.role === 'GERENTE_COMERCIAL' ? 'Gerente Comercial' :
             session.user.role === 'DIRETOR_COMERCIAL' ? 'Diretor Comercial' :
             'Vendedor'}
          </p>
        </div>
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { status } = useSession()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    router.push('/login')
    return null
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4 gap-4">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="flex items-center justify-between p-4 border-b">
                <span className="font-bold text-lg">M-Tech</span>
                <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <nav className="p-2">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      pathname === item.href
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <span className="text-primary">M-Tech</span>
            <span className="text-muted-foreground font-normal text-sm hidden sm:inline">Clientes</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 ml-6">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* User nav */}
          <UserNav />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t py-4 px-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} M-Tech Distribuidora</span>
          <span>Sistema de Gestão de Clientes</span>
        </div>
      </footer>
    </div>
  )
}
