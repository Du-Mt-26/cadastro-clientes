import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions, type Role } from '@/lib/auth'

// ─── POST /api/clientes/backfill-cnpj-base ────────────────
// Backfill cnpjBase for all clients that have a CNPJ but empty cnpjBase
// Also updates cnpjBase when the value is inconsistent with the current CNPJ
// Supports secret-based auth for automated runs via ?secret=CRON_SECRET

export async function POST(request: NextRequest) {
  try {
    // Allow secret-based auth (for automated/curl runs)
    const secret = request.nextUrl.searchParams.get('secret')
    const isSecretAuth = secret && secret === process.env.CRON_SECRET

    if (!isSecretAuth) {
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
      }
      const role = (session.user as any).role as Role
      if (role !== 'ADMIN' && role !== 'DIRETOR_COMERCIAL' && role !== 'GERENTE_COMERCIAL') {
        return NextResponse.json({ error: 'Permissão negada' }, { status: 403 })
      }
    }

    // Find all clients with a CNPJ but empty or inconsistent cnpjBase
    const clientes = await db.cliente.findMany({
      where: {
        cnpj: { not: '' },
      },
      select: { id: true, codigo: true, cnpj: true, cnpjBase: true },
    })

    let updatedCount = 0
    let skippedCount = 0
    const updates: { codigo: string; oldBase: string; newBase: string }[] = []

    for (const c of clientes) {
      const digits = c.cnpj.replace(/\D/g, '')
      if (digits.length !== 14) {
        skippedCount++
        continue
      }
      const expectedBase = digits.slice(0, 8)
      if (c.cnpjBase !== expectedBase) {
        await db.cliente.update({
          where: { id: c.id },
          data: { cnpjBase: expectedBase },
        })
        updates.push({ codigo: c.codigo, oldBase: c.cnpjBase, newBase: expectedBase })
        updatedCount++
      } else {
        skippedCount++
      }
    }

    return NextResponse.json({
      success: true,
      totalClients: clientes.length,
      updatedCount,
      skippedCount,
      updates: updates.slice(0, 50),
    })
  } catch (error) {
    console.error('Error backfilling cnpjBase:', error)
    return NextResponse.json({ error: 'Erro ao atualizar cnpjBase' }, { status: 500 })
  }
}
