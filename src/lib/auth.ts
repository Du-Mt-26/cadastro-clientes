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

// ─── System User Emails ────────────────────────────

export const SYSTEM_USER_EMAILS = {
  BOLSAO: 'bolsao@sistema.mtech',
  LISTA_FRIA: 'lista-fria@sistema.mtech',
  FORNECEDOR: 'fornecedor@sistema.mtech',
} as const

export const SYSTEM_USER_NAMES = {
  BOLSAO: 'BOLSÃO',
  LISTA_FRIA: 'LISTA FRIA',
  FORNECEDOR: 'FORNECEDOR',
} as const

// Cached system user IDs (populated after first DB call)
let _systemUserIds: { bolsao: string; listaFria: string; fornecedor: string } | null = null

/**
 * Get system user IDs from the database.
 * Results are cached after the first call.
 *
 * Optimized: first tries a fast findMany (no hashing, no writes).
 * Only falls back to upsert if any system user is missing.
 */
export async function getSystemUserIds() {
  if (_systemUserIds) return _systemUserIds

  // Fast path: check if all system users already exist (no hashing, no writes)
  const existing = await db.user.findMany({
    where: { isSystemUser: true },
    select: { id: true, email: true },
  })

  const bolsao = existing.find((u) => u.email === SYSTEM_USER_EMAILS.BOLSAO)
  const listaFria = existing.find((u) => u.email === SYSTEM_USER_EMAILS.LISTA_FRIA)
  const fornecedor = existing.find((u) => u.email === SYSTEM_USER_EMAILS.FORNECEDOR)

  if (bolsao && listaFria && fornecedor) {
    _systemUserIds = { bolsao: bolsao.id, listaFria: listaFria.id, fornecedor: fornecedor.id }
    return _systemUserIds
  }

  // Slow path: some system users are missing — need to upsert (requires hashing)
  const bcrypt = await import('bcryptjs')
  const hashedPassword = await bcrypt.hash('sistema@mtech2024', 12)

  const [bolsaoUser, listaFriaUser, fornecedorUser] = await Promise.all([
    db.user.upsert({
      where: { email: SYSTEM_USER_EMAILS.BOLSAO },
      update: {},
      create: { email: SYSTEM_USER_EMAILS.BOLSAO, name: SYSTEM_USER_NAMES.BOLSAO, password: hashedPassword, role: 'VENDEDOR', isSystemUser: true, active: true },
    }),
    db.user.upsert({
      where: { email: SYSTEM_USER_EMAILS.LISTA_FRIA },
      update: {},
      create: { email: SYSTEM_USER_EMAILS.LISTA_FRIA, name: SYSTEM_USER_NAMES.LISTA_FRIA, password: hashedPassword, role: 'VENDEDOR', isSystemUser: true, active: true },
    }),
    db.user.upsert({
      where: { email: SYSTEM_USER_EMAILS.FORNECEDOR },
      update: {},
      create: { email: SYSTEM_USER_EMAILS.FORNECEDOR, name: SYSTEM_USER_NAMES.FORNECEDOR, password: hashedPassword, role: 'VENDEDOR', isSystemUser: true, active: true },
    }),
  ])

  _systemUserIds = { bolsao: bolsaoUser.id, listaFria: listaFriaUser.id, fornecedor: fornecedorUser.id }
  return _systemUserIds
}

/**
 * Invalidate the cached system user IDs.
 * Call this after creating/migrating system users.
 */
export function invalidateSystemUserIds() {
  _systemUserIds = null
}

/**
 * Compute the carteira label from vendedorId + tipo.
 * Carteira is no longer stored — it is derived from the relationship.
 */
export function computeCarteira(
  vendedorId: string | null,
  tipo: string,
  systemUserIds: { bolsao: string; listaFria: string; fornecedor: string }
): string {
  if (!vendedorId) return 'SEM_VENDEDOR'
  if (vendedorId === systemUserIds.bolsao) return 'BOLSAO'
  if (vendedorId === systemUserIds.listaFria) return 'LISTA_FRIA'
  if (vendedorId === systemUserIds.fornecedor) return 'FORNECEDOR'
  // Regular vendedor assigned
  return 'COM_VENDEDOR'
}

/**
 * Check if user can see LISTA FRIA clients.
 */
export function canSeeListaFria(role: Role): boolean {
  if (role === 'ADMIN' || role === 'DIRETOR_COMERCIAL' || role === 'GERENTE_COMERCIAL') return true
  return false
}

/**
 * Check if user can see FORNECEDOR clients.
 */
export function canSeeFornecedor(role: Role, userEmail: string): boolean {
  if (role === 'ADMIN' || role === 'DIRETOR_COMERCIAL') return true
  if (userEmail === SYSTEM_USER_EMAILS.FORNECEDOR) return true
  return false
}

// ─── Carteira Labels ───────────────────────────────

export const CARTEIRA_LABELS: Record<string, string> = {
  COM_VENDEDOR: 'COM VENDEDOR',
  BOLSAO: 'BOLSÃO',
  LISTA_FRIA: 'LISTA FRIA',
  FORNECEDOR: 'FORNECEDOR',
  SEM_VENDEDOR: 'SEM USUÁRIO',
}

export const CARTEIRA_COLORS: Record<string, string> = {
  COM_VENDEDOR: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  BOLSAO: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  LISTA_FRIA: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  FORNECEDOR: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  SEM_VENDEDOR: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}
