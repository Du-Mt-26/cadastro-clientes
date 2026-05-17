import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── POST /api/clientes/auto-assign-vendedor ────────────
// One-time endpoint to auto-assign vendedores based on Linvix data
// Will be removed after use

export async function POST(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get('secret')
    if (secret !== 'mtech-assign-2026') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    // Get all system users
    const users = await db.user.findMany({
      select: { id: true, name: true, role: true },
    })

    // Build mapping
    const userMap = new Map<string, { id: string; role: string }>()
    for (const user of users) {
      const normalized = user.name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      userMap.set(normalized, { id: user.id, role: user.role })
    }

    console.log('[auto-assign] System users:', users.map(u => u.name))

    // Find all clients that need assignment
    const clientsNeedingAssignment = await db.cliente.findMany({
      where: {
        vendedor: { not: '' },
        carteira: 'SEM_VENDEDOR',
      },
      select: { id: true, codigo: true, vendedor: true },
    })

    let assigned = 0
    let fornecedor = 0
    let unchanged = 0
    const unmatchedNames = new Set<string>()

    for (const client of clientsNeedingAssignment) {
      const vendedorNorm = client.vendedor.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

      // M-TECH → FORNECEDOR
      if (vendedorNorm.includes('M-TECH') || vendedorNorm.includes('MTECH')) {
        await db.cliente.update({
          where: { id: client.id },
          data: { carteira: 'FORNECEDOR', vendedorId: null },
        })
        fornecedor++
        continue
      }

      // Try to find matching user
      let matchedUserId: string | null = null
      for (const [userName, userInfo] of userMap) {
        if (userName === vendedorNorm) {
          matchedUserId = userInfo.id
          break
        }
        if (userName.includes(vendedorNorm) || vendedorNorm.includes(userName)) {
          matchedUserId = userInfo.id
          break
        }
      }

      if (matchedUserId) {
        await db.cliente.update({
          where: { id: client.id },
          data: { carteira: 'COM_VENDEDOR', vendedorId: matchedUserId },
        })
        assigned++
      } else {
        unmatchedNames.add(client.vendedor)
        unchanged++
      }
    }

    return NextResponse.json({
      success: true,
      totalClientsProcessed: clientsNeedingAssignment.length,
      assigned,
      fornecedor,
      unchanged,
      unmatchedVendedorNames: [...unmatchedNames],
    })
  } catch (error) {
    console.error('Error auto-assigning vendedores:', error)
    return NextResponse.json({ error: 'Erro ao atribuir vendedores' }, { status: 500 })
  }
}
