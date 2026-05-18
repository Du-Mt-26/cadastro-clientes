/**
 * NextAuth.js configuration — Credentials provider + JWT + 2FA.
 *
 * Roles:
 *  - ADMIN             → total access
 *  - DIRETOR_COMERCIAL → full read/write on data
 *  - GERENTE_COMERCIAL → read/write on commercial data
 *  - VENDEDOR          → own clients + Bolsão
 *
 * Permissions are now dynamic (DB-backed) with in-memory cache.
 * Use canDo(role, permissionKey) instead of hardcoded functions.
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

// ─── Role Hierarchy & Labels ──────────────────────

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

// ─── Carteira Labels ───────────────────────────────

export const CARTEIRA_LABELS: Record<string, string> = {
  COM_VENDEDOR: 'COM VENDEDOR',
  BOLSAO: 'BOLSÃO',
  LISTA_FRIA: 'LISTA FRIA',
  FORNECEDOR: 'FORNECEDOR',
  SEM_VENDEDOR: 'SEM VENDEDOR',
}

export const CARTEIRA_COLORS: Record<string, string> = {
  COM_VENDEDOR: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  BOLSAO: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  LISTA_FRIA: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  FORNECEDOR: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  SEM_VENDEDOR: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

// ─── Dynamic Permission System ─────────────────────
// Permissions are stored in DB (Permission + RolePermission tables).
// They are cached in memory with a TTL for performance.

type PermissionMap = Map<string, boolean> // permissionKey → allowed
type RolePermissionCache = Map<string, PermissionMap> // role → permissions

let _permissionCache: RolePermissionCache | null = null
let _permissionCacheExpiry = 0
const PERMISSION_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Hardcoded fallback (used when DB permissions are not available)
export const FALLBACK_PERMISSIONS: Record<string, Record<string, boolean>> = {
  ADMIN: {
    'clients.view_all': true, 'clients.edit_all_fields': true, 'clients.edit_contact': true,
    'clients.export': true, 'clients.receita': true, 'clients.audit': true,
    'clients.bulk_import': true, 'clients.create': true, 'clients.edit_commercial': true,
    'clients.view_reports': true, 'bolsao.check': true, 'bolsao.pull': true,
    'bolsao.move': true, 'bolsao.abordar': true, 'users.manage': true,
    'users.assign_clients': true, 'sheets.manage': true, 'favorites.use': true,
    'permissions.manage': true,
  },
  DIRETOR_COMERCIAL: {
    'clients.view_all': true, 'clients.edit_all_fields': true, 'clients.edit_contact': true,
    'clients.export': true, 'clients.receita': true, 'clients.audit': true,
    'clients.bulk_import': true, 'clients.create': true, 'clients.edit_commercial': true,
    'clients.view_reports': true, 'bolsao.check': true, 'bolsao.pull': true,
    'bolsao.move': true, 'bolsao.abordar': true, 'users.manage': false,
    'users.assign_clients': true, 'sheets.manage': true, 'favorites.use': true,
    'permissions.manage': false,
  },
  GERENTE_COMERCIAL: {
    'clients.view_all': true, 'clients.edit_all_fields': false, 'clients.edit_contact': true,
    'clients.export': false, 'clients.receita': true, 'clients.audit': true,
    'clients.bulk_import': false, 'clients.create': true, 'clients.edit_commercial': true,
    'clients.view_reports': true, 'bolsao.check': true, 'bolsao.pull': true,
    'bolsao.move': true, 'bolsao.abordar': true, 'users.manage': false,
    'users.assign_clients': true, 'sheets.manage': false, 'favorites.use': true,
    'permissions.manage': false,
  },
  VENDEDOR: {
    'clients.view_all': false, 'clients.edit_all_fields': false, 'clients.edit_contact': true,
    'clients.export': false, 'clients.receita': true, 'clients.audit': false,
    'clients.bulk_import': false, 'clients.create': true, 'clients.edit_commercial': false,
    'clients.view_reports': false, 'bolsao.check': false, 'bolsao.pull': true,
    'bolsao.move': false, 'bolsao.abordar': true, 'users.manage': false,
    'users.assign_clients': false, 'sheets.manage': false, 'favorites.use': true,
    'permissions.manage': false,
  },
}

/**
 * Load permissions from DB into cache.
 */
async function loadPermissionsFromDB(): Promise<RolePermissionCache> {
  const cache: RolePermissionCache = new Map()

  try {
    const rolePerms = await db.rolePermission.findMany({
      select: { role: true, permissionKey: true, allowed: true },
    })

    for (const rp of rolePerms) {
      if (!cache.has(rp.role)) cache.set(rp.role, new Map())
      cache.get(rp.role)!.set(rp.permissionKey, rp.allowed)
    }
  } catch {
    // DB not available yet (migration not run) — use fallback
  }

  return cache
}

/**
 * Get the permission cache, loading from DB if expired.
 */
async function getPermissionCache(): Promise<RolePermissionCache> {
  if (_permissionCache && Date.now() < _permissionCacheExpiry) {
    return _permissionCache
  }

  _permissionCache = await loadPermissionsFromDB()
  _permissionCacheExpiry = Date.now() + PERMISSION_CACHE_TTL
  return _permissionCache
}

/**
 * Invalidate the permission cache.
 * Call after changing permissions.
 */
export function invalidatePermissionCache() {
  _permissionCache = null
  _permissionCacheExpiry = 0
}

/**
 * Check if a role has a specific permission.
 * Falls back to hardcoded defaults if DB permissions are not available.
 */
export async function canDo(role: Role | string, permissionKey: string): Promise<boolean> {
  const cache = await getPermissionCache()
  const rolePerms = cache.get(role)

  if (rolePerms && rolePerms.has(permissionKey)) {
    return rolePerms.get(permissionKey)!
  }

  // Fallback to hardcoded
  const fallback = FALLBACK_PERMISSIONS[role]
  if (fallback && permissionKey in fallback) {
    return fallback[permissionKey]
  }

  // Default deny
  return false
}

/**
 * Synchronous version using fallback only (no DB call).
 * Use in middleware or non-async contexts where DB access is not possible.
 */
export function canDoSync(role: Role | string, permissionKey: string): boolean {
  // Try cache first
  if (_permissionCache) {
    const rolePerms = _permissionCache.get(role)
    if (rolePerms && rolePerms.has(permissionKey)) {
      return rolePerms.get(permissionKey)!
    }
  }

  // Fallback to hardcoded
  const fallback = FALLBACK_PERMISSIONS[role]
  if (fallback && permissionKey in fallback) {
    return fallback[permissionKey]
  }

  return false
}

// ─── Legacy helper functions (now backed by canDo) ──
// These are kept for backward compatibility and convenience.

export function canManageUsers(role: Role): boolean {
  return canDoSync(role, 'users.manage')
}

export function canSeeAllClients(role: Role): boolean {
  return canDoSync(role, 'clients.view_all')
}

export function canEditAllFields(role: Role): boolean {
  return canDoSync(role, 'clients.edit_all_fields')
}

export function canEditCommercialData(role: Role): boolean {
  return canDoSync(role, 'clients.edit_commercial')
}

export function canViewReports(role: Role): boolean {
  return canDoSync(role, 'clients.view_reports')
}

export function canAssignVendedor(role: Role): boolean {
  return canDoSync(role, 'users.assign_clients')
}

export function canSeeListaFria(role: Role): boolean {
  return canDoSync(role, 'bolsao.move')
}

export function canSeeFornecedor(role: Role): boolean {
  return canDoSync(role, 'bolsao.move')
}

/**
 * Get carteira label from the Carteira enum value.
 * Now carteira is stored directly on the Cliente record.
 */
export function getCarteiraLabel(carteira: string): string {
  return CARTEIRA_LABELS[carteira] || carteira
}

/**
 * Compute carteira is no longer needed — carteira is stored on the model.
 * Kept for migration compatibility only.
 * @deprecated Use the carteira field directly from the Cliente model.
 */
export function computeCarteira(
  vendedorId: string | null,
  tipo: string,
  _systemUserIds?: { bolsao: string; listaFria: string; fornecedor: string }
): string {
  // Backward compatibility: if carteira field is not set, compute from vendedorId
  // This should not happen after migration
  if (!vendedorId) return 'SEM_VENDEDOR'
  return 'COM_VENDEDOR'
}

// ─── Removed: System User system ────────────────────
// The following have been removed:
// - SYSTEM_USER_EMAILS
// - SYSTEM_USER_NAMES
// - getSystemUserIds()
// - invalidateSystemUserIds()
// - canSeeFornecedor(role, userEmail) — now just checks canDo(role, 'bolsao.move')
// Carteira is now an explicit enum field on the Cliente model.
