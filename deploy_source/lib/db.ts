/**
 * Database client — PostgreSQL via Neon.
 *
 * Both local dev and production use the same Neon PostgreSQL database
 * via the DATABASE_URL environment variable.
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: [],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
