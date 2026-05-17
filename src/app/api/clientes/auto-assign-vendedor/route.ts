import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── POST /api/clientes/auto-assign-vendedor ────────────
// Auto-assign vendedores using efficient batch SQL
// One-time endpoint, will be removed after use

export async function POST(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get('secret')
    if (secret !== 'mtech-assign-2026') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    // Get all system users
    const users = await db.user.findMany({
      select: { id: true, name: true },
    })

    // Build mapping: normalized name → user ID
    const userMap: { normalized: string; id: string; original: string }[] = []
    for (const user of users) {
      const normalized = user.name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      userMap.push({ normalized, id: user.id, original: user.name })
    }

    // 1. Set M-TECH DISTRIBUIDORA clients as FORNECEDOR
    const mtechResult = await db.$executeRaw`
      UPDATE "Cliente"
      SET "carteira" = 'FORNECEDOR'::"Carteira", "vendedorId" = NULL, "updatedAt" = NOW()
      WHERE "carteira" = 'SEM_VENDEDOR'::"Carteira"
        AND ("vendedor" ILIKE '%M-TECH%' OR "vendedor" ILIKE '%MTECH%')
    `

    // 2. For each user, assign matching clients using SQL ILIKE
    const assignResults: { name: string; count: number }[] = []

    for (const entry of userMap) {
      // Skip admin/diretor/gerente users that shouldn't have clients assigned
      // We'll assign to all VENDEDOR/SUPERVISORA users

      // Try exact match first, then partial
      // Use the original name parts (before hyphen) for matching
      const nameParts = entry.original.split(' - ')[0].split(' ')
      const firstName = nameParts[0]

      // Match: vendedor field contains the first name AND carteira is still SEM_VENDEDOR
      const result = await db.$executeRaw`
        UPDATE "Cliente"
        SET "carteira" = 'COM_VENDEDOR'::"Carteira", "vendedorId" = ${entry.id}, "updatedAt" = NOW()
        WHERE "carteira" = 'SEM_VENDEDOR'::"Carteira"
          AND "vendedor" ILIKE ${'%' + firstName + '%'}
      `

      if (result > 0) {
        assignResults.push({ name: entry.original, count: result })
      }
    }

    // 3. Count remaining SEM_VENDEDOR with vendedor name
    const remaining = await db.cliente.count({
      where: {
        carteira: 'SEM_VENDEDOR',
        vendedor: { not: '' },
      },
    })

    // 4. Get unmatched vendedor names
    const unmatched = await db.cliente.groupBy({
      by: ['vendedor'],
      where: { carteira: 'SEM_VENDEDOR', vendedor: { not: '' } },
      _count: true,
    })

    return NextResponse.json({
      success: true,
      mtechToFornecedor: mtechResult,
      assignedByUser: assignResults,
      totalAssigned: assignResults.reduce((sum, r) => sum + r.count, 0),
      remainingSemVendedor: remaining,
      unmatchedVendedores: unmatched.map(u => ({ nome: u.vendedor, clientes: u._count })),
    })
  } catch (error) {
    console.error('Error auto-assigning vendedores:', error)
    return NextResponse.json({ error: 'Erro ao atribuir vendedores' }, { status: 500 })
  }
}
