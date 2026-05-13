import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSystemUserIds, canSeeAllClients, type Role, SYSTEM_USER_EMAILS } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidateCache } from '@/lib/clientes-cache'
import { calcDiasSemVenda } from '@/lib/clientes'

/**
 * POST /api/clientes/bolsao
 * Verificar Bolsão: moves clients with 151+ days without sale to BOLSÃO.
 *
 * Business rules:
 * - DSV >= 151 → move to Bolsão
 * - Grace period: if the vendor pulled this client FROM Bolsão within the last
 *   150 days (dataAtribuicaoVendedor is set and < 150 days ago), the client
 *   stays with the vendor.
 * - If dataAtribuicaoVendedor is null (initial import, not a Bolsão pull),
 *   there is NO grace period — DSV >= 151 means Bolsão.
 * - Also moves unassigned clients (vendedorId = null) to BOLSÃO.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const role = (session.user as any).role as Role
    if (!canSeeAllClients(role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const systemUserIds = await getSystemUserIds()
    const now = new Date()

    // Find all clients that are NOT assigned to system users (bolsão, lista fria, fornecedor)
    // and are not fornecedores
    const systemVendorNames = ['BOLSÃO', 'LISTA FRIA', 'FORNECEDOR']
    const clientes = await db.cliente.findMany({
      where: {
        fornecedor: false,
        vendedorId: { notIn: [systemUserIds.bolsao, systemUserIds.listaFria, systemUserIds.fornecedor].filter(Boolean) },
      },
      select: {
        id: true,
        codigo: true,
        ultimaVenda: true,
        vendedorId: true,
        vendedor: true,
        dataAtribuicaoVendedor: true,
      },
    })

    // Get all real (non-system) vendor user IDs for checking
    const realVendorUsers = await db.user.findMany({
      where: { isSystemUser: false, active: true },
      select: { id: true, name: true },
    })
    const realVendorIds = new Set(realVendorUsers.map(u => u.id))

    let movedToBolsao = 0
    let skippedGracePeriod = 0
    let skippedHasRecentSale = 0
    const THRESHOLD_DSV = 151
    const GRACE_PERIOD_DAYS = 150

    for (const c of clientes) {
      // Calculate DSV (days without sale)
      const dias = calcDiasSemVenda(c.ultimaVenda)
      const isDsv151Plus = dias === null || dias >= THRESHOLD_DSV

      // Client has recent sales (DSV < 151) → stays with vendor
      if (!isDsv151Plus) {
        skippedHasRecentSale++
        continue
      }

      // Client has DSV >= 151. Check if vendor has a grace period.
      // Grace period applies ONLY when dataAtribuicaoVendedor is set (meaning
      // the client was explicitly pulled from Bolsão or assigned with a date).
      // If dataAtribuicaoVendedor is null (initial import), no grace period.
      if (c.vendedorId && realVendorIds.has(c.vendedorId) && c.dataAtribuicaoVendedor) {
        const diasAtribuicao = Math.floor(
          (now.getTime() - new Date(c.dataAtribuicaoVendedor).getTime()) / 86400000
        )
        if (diasAtribuicao < GRACE_PERIOD_DAYS) {
          // Vendor pulled this client from Bolsão recently — still in grace period
          skippedGracePeriod++
          continue
        }
        // Grace period expired → move to Bolsão
      }

      // Also handle clients with vendor name string but no vendedorId (legacy data)
      if (!c.vendedorId) {
        const isSystemVendorName = systemVendorNames.some(n => c.vendedor.toUpperCase().includes(n))
        const hasRealVendorString = c.vendedor && !isSystemVendorName
        if (hasRealVendorString) {
          // Client has a vendor name but no vendedorId — link them first
          const matchingVendor = realVendorUsers.find(u =>
            u.name.toLowerCase().includes(c.vendedor.toLowerCase()) ||
            c.vendedor.toLowerCase().includes(u.name.toLowerCase())
          )
          if (matchingVendor) {
            await db.cliente.update({
              where: { id: c.id },
              data: {
                vendedorId: matchingVendor.id,
                dataAtribuicaoVendedor: null, // null = initial import, no grace period
              },
            })
            // Now this client has a real vendor but dataAtribuicaoVendedor is null,
            // so the grace period doesn't apply. Move to Bolsão since DSV >= 151.
          }
        }
      }

      // Move to Bolsão
      await db.cliente.update({
        where: { id: c.id },
        data: {
          vendedorId: systemUserIds.bolsao || null,
          dataEntradaBolsao: now,
          dataAtribuicaoVendedor: null,
        },
      })
      movedToBolsao++
    }

    // Also find clients where vendedorId = null (unassigned) and move to BOLSÃO
    const unassigned = await db.cliente.findMany({
      where: {
        vendedorId: null,
        fornecedor: false,
      },
      select: { id: true },
    })

    let movedUnassigned = 0
    for (const c of unassigned) {
      await db.cliente.update({
        where: { id: c.id },
        data: {
          vendedorId: systemUserIds.bolsao || null,
          dataEntradaBolsao: now,
        },
      })
      movedUnassigned++
    }

    invalidateCache()

    return NextResponse.json({
      success: true,
      movedToBolsao,
      movedUnassigned,
      skippedGracePeriod,
      skippedHasRecentSale,
      totalChecked: clientes.length,
    })
  } catch (error) {
    console.error('Error processing Bolsão:', error)
    return NextResponse.json({ error: 'Erro ao processar Bolsão' }, { status: 500 })
  }
}

/**
 * PATCH /api/clientes/bolsao
 * Actions:
 *  - 'puxar': vendedor picks up a client from BOLSÃO (starts 150-day grace period)
 *  - 'mover': move client to LISTA FRIA or FORNECEDOR (set vendedorId to system user ID)
 *  - 'abordar': mark client as approached by a vendor
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const role = (session.user as any).role as Role
    const userId = (session.user as any).id

    const body = await request.json()
    const { clienteCodigo, action, vendedorId, destino } = body

    if (!clienteCodigo) {
      return NextResponse.json({ error: 'Código do cliente é obrigatório' }, { status: 400 })
    }

    const cliente = await db.cliente.findUnique({ where: { codigo: clienteCodigo } })
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    const systemUserIds = await getSystemUserIds()

    if (action === 'puxar') {
      // Vendedor picks up client from BOLSÃO — starts 150-day grace period
      const puxarVendedorId = vendedorId || userId

      // Only the vendedor themselves or admin/diretor/gerente can pull
      if (!canSeeAllClients(role) && puxarVendedorId !== userId) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
      }

      // Verify the vendedor exists and is not a system user
      const vendedor = await db.user.findUnique({ where: { id: puxarVendedorId } })
      if (!vendedor || vendedor.isSystemUser) {
        return NextResponse.json({ error: 'Vendedor inválido' }, { status: 400 })
      }

      await db.cliente.update({
        where: { codigo: clienteCodigo },
        data: {
          vendedorId: puxarVendedorId,
          vendedor: vendedor.name,
          dataAtribuicaoVendedor: new Date(), // Start 150-day grace period
          dataEntradaBolsao: null,
        },
      })

      invalidateCache()
      return NextResponse.json({ success: true, vendedorId: puxarVendedorId, vendedorName: vendedor.name })
    }

    if (action === 'mover' && destino) {
      // Move client to LISTA_FRIA or FORNECEDOR — only admin/diretor/gerente
      if (!canSeeAllClients(role)) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
      }

      let targetUserId = ''
      let targetUserName = ''

      if (destino === 'LISTA_FRIA') {
        targetUserId = systemUserIds.listaFria
        targetUserName = 'LISTA FRIA'
      } else if (destino === 'FORNECEDOR') {
        targetUserId = systemUserIds.fornecedor
        targetUserName = 'FORNECEDOR'
        // Also set fornecedor flag
        await db.cliente.update({
          where: { codigo: clienteCodigo },
          data: {
            vendedorId: targetUserId || null,
            vendedor: targetUserName,
            fornecedor: true,
            dataAtribuicaoVendedor: null,
            dataEntradaBolsao: null,
          },
        })
        invalidateCache()
        return NextResponse.json({ success: true, destino })
      } else {
        return NextResponse.json({ error: 'Destino inválido. Use LISTA_FRIA ou FORNECEDOR' }, { status: 400 })
      }

      if (!targetUserId) {
        return NextResponse.json({ error: `Usuário do sistema para ${destino} não encontrado` }, { status: 500 })
      }

      await db.cliente.update({
        where: { codigo: clienteCodigo },
        data: {
          vendedorId: targetUserId,
          vendedor: targetUserName,
          dataAtribuicaoVendedor: null,
          dataEntradaBolsao: null,
        },
      })

      invalidateCache()
      return NextResponse.json({ success: true, destino })
    }

    if (action === 'abordar') {
      // Mark client as approached by a vendor
      const vid = vendedorId || userId
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

    return NextResponse.json({ error: 'Ação inválida. Use: puxar, mover, abordar' }, { status: 400 })
  } catch (error) {
    console.error('Error updating carteira:', error)
    return NextResponse.json({ error: 'Erro ao atualizar carteira' }, { status: 500 })
  }
}
