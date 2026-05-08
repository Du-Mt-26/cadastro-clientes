/**
 * Database client — supports both local SQLite and Turso (libSQL).
 *
 * Development: uses local SQLite file via DATABASE_URL (file:./db/custom.db)
 * Production (Vercel): uses Turso via TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
 *
 * The driverAdapters preview feature allows Prisma to use the libSQL adapter
 * for Turso connections in serverless environments.
 *
 * Turso imports are lazy to avoid Turbopack ESM issues in development.
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // Check if we're using Turso (production/Vercel)
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  if (tursoUrl && tursoToken) {
    // Turso / libSQL connection — lazy import to avoid Turbopack issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require('@libsql/client')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaLibSql } = require('@prisma/adapter-libsql')

    const libsql = createClient({
      url: tursoUrl,
      authToken: tursoToken,
    })

    const adapter = new PrismaLibSql(libsql)

    return new PrismaClient({
      adapter,
      log: [],
    })
  }

  // Local SQLite connection (development)
  return new PrismaClient({
    log: [],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
