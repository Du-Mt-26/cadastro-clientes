/**
 * NextAuth.js configuration — Credentials provider + JWT + 2FA.
 *
 * Roles:
 *  - ADMIN             → total access
 *  - DIRETOR_COMERCIAL → full read/write on data
 *  - GERENTE_COMERCIAL → read/write on commercial data
 *  - VENDEDOR          → own clients + Bolsão + unassigned Revendas
 */

import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { authenticator } from 'otplib'
import { db } from '@/lib/db'

// Configure TOTP to be compatible with Google Authenticator
authenticator.options = {
  step: 30,
  window: 1,
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
        twoFactorCode: { label: '2FA Code', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email e senha são obrigatórios')
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        })

        if (!user) {
          throw new Error('Email ou senha incorretos')
        }

        if (!user.active) {
          throw new Error('Conta desativada. Contate o administrador.')
        }

        const isValidPassword = await bcrypt.compare(credentials.password, user.password)
        if (!isValidPassword) {
          throw new Error('Email ou senha incorretos')
        }

        // Check 2FA
        if (user.twoFactorEnabled && user.twoFactorSecret) {
          if (!credentials.twoFactorCode) {
            throw new Error('2FA_REQUIRED')
          }

          const isValidToken = authenticator.verify({
            token: credentials.twoFactorCode,
            secret: user.twoFactorSecret,
          })

          if (!isValidToken) {
            throw new Error('Código 2FA inválido')
          }
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          twoFactorEnabled: user.twoFactorEnabled,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
  jwt: {
    maxAge: 8 * 60 * 60, // 8 hours
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.twoFactorEnabled = (user as any).twoFactorEnabled
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id
        ;(session.user as any).role = token.role
        ;(session.user as any).twoFactorEnabled = token.twoFactorEnabled
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: false,
}

// ─── Role Hierarchy & Permissions ──────────────────

export type Role = 'ADMIN' | 'DIRETOR_COMERCIAL' | 'GERENTE_COMERCIAL' | 'VENDEDOR'

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  DIRETOR_COMERCIAL: 'Diretor(a) Comercial',
  GERENTE_COMERCIAL: 'Gerente Comercial',
  VENDEDOR: 'Vendedor(a)',
}

export const ROLE_COLORS: Record<Role, string> = {
  ADMIN: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  DIRETOR_COMERCIAL: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  GERENTE_COMERCIAL: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  VENDEDOR: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
}

export const ROLE_PRIORITY: Record<Role, number> = {
  ADMIN: 100,
  DIRETOR_COMERCIAL: 75,
  GERENTE_COMERCIAL: 50,
  VENDEDOR: 25,
}

export function canManageUsers(role: Role): boolean {
  return role === 'ADMIN'
}

export function canSeeAllClients(role: Role): boolean {
  return role === 'ADMIN' || role === 'DIRETOR_COMERCIAL' || role === 'GERENTE_COMERCIAL'
}

export function canEditAllFields(role: Role): boolean {
  return role === 'ADMIN' || role === 'DIRETOR_COMERCIAL'
}

export function canEditCommercialData(role: Role): boolean {
  return role === 'ADMIN' || role === 'DIRETOR_COMERCIAL' || role === 'GERENTE_COMERCIAL'
}

export function canViewReports(role: Role): boolean {
  return role === 'ADMIN' || role === 'DIRETOR_COMERCIAL' || role === 'GERENTE_COMERCIAL'
}

export function canAssignVendedor(role: Role): boolean {
  return role === 'ADMIN' || role === 'DIRETOR_COMERCIAL' || role === 'GERENTE_COMERCIAL'
}

/**
 * Returns the filter that should be applied to client queries based on user role.
 * Vendors can see their own clients + Bolsão + unassigned Revendas.
 */
export function getClientFilterForRole(role: Role, userId: string): {
  vendedorId?: string
  carteira?: string
  orConditions?: Array<{ vendedorId: string } | { carteira: string } | { carteira: string; vendedorId: null }>
} {
  if (canSeeAllClients(role)) {
    return {} // No filter — sees everything
  }

  // VENDEDOR: own clients + Bolsão + unassigned Revendas
  return {
    orConditions: [
      { vendedorId: userId },
      { carteira: 'BOLSAO' },
      { carteira: 'CARTEIRA_REVENDAS', vendedorId: null },
    ],
  }
}

// ─── Carteira Labels ───────────────────────────────

export const CARTEIRA_LABELS: Record<string, string> = {
  CARTEIRA_REVENDAS: 'Carteira Revendas',
  CARTEIRA_CORPORATIVO: 'Carteira Corporativo',
  BOLSAO: 'Bolsão (151+ dias)',
  CARTEIRA_FRIA: 'Carteira Fria',
}

export const CARTEIRA_COLORS: Record<string, string> = {
  CARTEIRA_REVENDAS: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  CARTEIRA_CORPORATIVO: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  BOLSAO: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  CARTEIRA_FRIA: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}
