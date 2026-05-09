import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, type Role } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidateCache } from '@/lib/clientes-cache'
import { calcDiasSemVenda } from '@/lib/clientes'

/**
 * POST /api/clientes/bolsao
 * Moves clients with 151+ days without purchase to Bolsão.
 * Can be called manually or by a scheduled job.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const role = (session.user as any).role as Role
    if (role !== 'ADMIN' && role !== 'DIRETOR_COMERCIAL' && role !== 'GERENTE_COMERCIAL') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    // Find all clients in CARTEIRA_REVENDAS or CARTEIRA_CORPORATIVO
    const clientes = await db.cliente.findMany({
      where: { carteira: { in: ['CARTEIRA_REVENDAS', 'CARTEIRA_CORPORATIVO'] } },
      select: { id: true, codigo: true, ultimaVenda: true, vendedorId: true },
    })

    let movedToBolsao = 0
    const now = new Date()

    for (const c of clientes) {
      const dias = calcDiasSemVenda(c.ultimaVenda)

      // 151+ days without purchase OR no purchase info
      if (dias === null || dias >= 151) {
        await db.cliente.update({
          where: { id: c.id },
          data: {
            carteira: 'BOLSAO',
            dataEntradaBolsao: now,
            vendedorId: null,  // Remove from vendedor's carteira — goes to shared pool
          },
        })
        movedToBolsao++
      }
    }

    // Also check for Carteira Fria: clients in BOLSAO that have been approached by all active vendors
    const activeVendors = await db.user.findMany({
      where: { role: { in: ['VENDEDOR', 'DIRETOR_COMERCIAL'] }, active: true },
      select: { id: true },
    })
    const activeVendorIds = activeVendors.map(v => v.id)
    const activeVendorCount = activeVendorIds.length

    let movedToFria = 0
    if (activeVendorCount > 0) {
      const bolsaoClientes = await db.cliente.findMany({
        where: { carteira: 'BOLSAO' },
        select: { id: true, codigo: true, vendedoresQueAbordaram: true },
      })

      for (const c of bolsaoClientes) {
        const abordados = c.vendedoresQueAbordaram
          ? c.vendedoresQueAbordaram.split(',').filter(Boolean)
          : []

        // Check if ALL active vendors have approached this client
        const allApproached = activeVendorIds.every(vid => abordados.includes(vid))

        if (allApproached && abordados.length >= activeVendorCount) {
          await db.cliente.update({
            where: { id: c.id },
            data: {
              carteira: 'CARTEIRA_FRIA',
              dataEntradaCarteiraFria: now,
            },
          })
          movedToFria++
        }
      }
    }

    invalidateCache()

    return NextResponse.json({
      success: true,
      movedToBolsao,
      movedToCarteiraFria: movedToFria,
      totalChecked: clientes.length,
    })
  } catch (error) {
    console.error('Error processing Bolsão:', error)
    return NextResponse.json({ error: 'Erro ao processar Bolsão' }, { status: 500 })
  }
}

/**
 * PATCH /api/clientes/bolsao
 * Mark a client as "approached" by a vendor (for Carteira Fria tracking)
 * Or manually move a client between carteiras
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { clienteCodigo, action, vendedorId, carteira } = body

    if (!clienteCodigo) {
      return NextResponse.json({ error: 'Código do cliente é obrigatório' }, { status: 400 })
    }

    const cliente = await db.cliente.findUnique({ where: { codigo: clienteCodigo } })
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    if (action === 'abordar') {
      // Mark client as approached by a vendor
      const vid = vendedorId || (session.user as any).id
      const abordados = cliente.vendedoresQueAbordaram
        ? cliente.vendedoresQueAbordaram.split(',').filter(Boolean)
        : []

      if (!abordados.includes(vid)) {
        abordados.push(vid)
      }

      await db.cliente.update({
        where: { codigo: clienteCodigo },
        data: { vendedoresQueAbordaram: abordados.join(',') },
      })

      invalidateCache()
      return NextResponse.json({ success: true, abordados })
    }

    if (action === 'mover' && carteira) {
      // Manually move client to a different carteira
      const validCarteiras = ['CARTEIRA_REVENDAS', 'CARTEIRA_CORPORATIVO', 'BOLSAO', 'CARTEIRA_FRIA']
      if (!validCarteiras.includes(carteira)) {
        return NextResponse.json({ error: 'Carteira inválida' }, { status: 400 })
      }

      const updateData: any = { carteira }
      if (carteira === 'BOLSAO') updateData.dataEntradaBolsao = new Date()
      if (carteira === 'CARTEIRA_FRIA') updateData.dataEntradaCarteiraFria = new Date()
      if (carteira === 'CARTEIRA_REVENDAS' || carteira === 'CARTEIRA_CORPORATIVO') {
        updateData.dataEntradaBolsao = null
        updateData.dataEntradaCarteiraFria = null
        updateData.vendedoresQueAbordaram = ''
      }

      await db.cliente.update({
        where: { codigo: clienteCodigo },
        data: updateData,
      })

      invalidateCache()
      return NextResponse.json({ success: true, carteira })
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (error) {
    console.error('Error updating carteira:', error)
    return NextResponse.json({ error: 'Erro ao atualizar carteira' }, { status: 500 })
  }
}
