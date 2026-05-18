import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Migration: Add `ativo` column to Cliente table
 * 
 * POST /api/clientes/migrate-ativo?secret=...
 * 
 * Steps:
 * 1. Add `ativo` boolean column (default true)
 * 2. Backfill: set ativo=false for EXCLUÍDO/BAIXADA situacaoCadastral
 */
export async function POST(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get('secret')
    if (secret !== 'mtech-migrate-2026') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const results: string[] = []

    // Step 1: Add column if not exists
    try {
      await db.$executeRawUnsafe(`
        ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "ativo" BOOLEAN NOT NULL DEFAULT true
      `)
      results.push('Coluna "ativo" adicionada (ou já existia)')
    } catch (e) {
      results.push(`Erro ao adicionar coluna: ${String(e)}`)
    }

    // Step 2: Backfill - set ativo=false for EXCLUÍDO and BAIXADA
    try {
      const updateResult = await db.$executeRawUnsafe(`
        UPDATE "Cliente" SET "ativo" = false 
        WHERE "situacaoCadastral" IN ('EXCLUÍDO', 'BAIXADA', 'excluído', 'baixada', 'Excluído', 'Baixada')
      `)
      results.push(`${updateResult} clientes marcados como inativos (EXCLUÍDO/BAIXADA)`)
    } catch (e) {
      results.push(`Erro no backfill: ${String(e)}`)
    }

    // Step 3: Verify
    try {
      const ativoCount = await db.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "Cliente" WHERE "ativo" = true`) as Array<{count: bigint}>
      const inativoCount = await db.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "Cliente" WHERE "ativo" = false`) as Array<{count: bigint}>
      results.push(`Verificação: ${Number(ativoCount[0].count)} ativos, ${Number(inativoCount[0].count)} inativos`)
    } catch (e) {
      results.push(`Erro na verificação: ${String(e)}`)
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
