/**
 * Database client — PostgreSQL via Neon.
 *
 * Development: uses DATABASE_URL (local PostgreSQL or Neon dev branch)
 * Production (Vercel): uses DATABASE_URL from Neon (set in Vercel env vars)
 *
 * No adapter needed — Prisma natively supports PostgreSQL.
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: [],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
