import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, canSeeAllClients, type Role } from '@/lib/auth'
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
 * - Also moves unassigned clients (carteira = SEM_VENDEDOR) to BOLSÃO.
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

    const now = new Date()

    // Find all clients that are NOT in BOLSAO, LISTA_FRIA, or FORNECEDOR carteiras
    // and are not fornecedores
    const clientes = await db.cliente.findMany({
      where: {
        fornecedor: false,
        carteira: { notIn: ['BOLSAO', 'LISTA_FRIA', 'FORNECEDOR'] },
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

    // Get all active vendor user IDs for checking
    const realVendorUsers = await db.user.findMany({
      where: { active: true },
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
        const systemVendorNames = ['BOLSÃO', 'LISTA FRIA', 'FORNECEDOR']
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

      // Move to Bolsão — set carteira directly instead of assigning system user
      await db.cliente.update({
        where: { id: c.id },
        data: {
          carteira: 'BOLSAO',
          vendedorId: null,
          dataEntradaBolsao: now,
          dataAtribuicaoVendedor: null,
        },
      })
      movedToBolsao++
    }

    // Also find clients where carteira = SEM_VENDEDOR (unassigned) and move to BOLSÃO
    const unassigned = await db.cliente.findMany({
      where: {
        carteira: 'SEM_VENDEDOR',
        fornecedor: false,
      },
      select: { id: true },
    })

    let movedUnassigned = 0
    for (const c of unassigned) {
      await db.cliente.update({
        where: { id: c.id },
        data: {
          carteira: 'BOLSAO',
          vendedorId: null,
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
 *  - 'mover': move client to LISTA_FRIA or FORNECEDOR (set carteira field)
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

    if (action === 'puxar') {
      // Vendedor picks up client from BOLSÃO — starts 150-day grace period
      const puxarVendedorId = vendedorId || userId

      // Only the vendedor themselves or admin/diretor/gerente can pull
      if (!canSeeAllClients(role) && puxarVendedorId !== userId) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
      }

      // Verify the vendedor exists
      const vendedor = await db.user.findUnique({ where: { id: puxarVendedorId } })
      if (!vendedor) {
        return NextResponse.json({ error: 'Vendedor inválido' }, { status: 400 })
      }

      await db.cliente.update({
        where: { codigo: clienteCodigo },
        data: {
          carteira: 'COM_VENDEDOR',
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

      if (destino === 'LISTA_FRIA') {
        await db.cliente.update({
          where: { codigo: clienteCodigo },
          data: {
            carteira: 'LISTA_FRIA',
            vendedorId: null,
            vendedor: 'LISTA FRIA',
            dataAtribuicaoVendedor: null,
            dataEntradaBolsao: null,
          },
        })
        invalidateCache()
        return NextResponse.json({ success: true, destino })
      }

      if (destino === 'FORNECEDOR') {
        await db.cliente.update({
          where: { codigo: clienteCodigo },
          data: {
            carteira: 'FORNECEDOR',
            vendedorId: null,
            vendedor: 'FORNECEDOR',
            fornecedor: true,
            dataAtribuicaoVendedor: null,
            dataEntradaBolsao: null,
          },
        })
        invalidateCache()
        return NextResponse.json({ success: true, destino })
      }

      return NextResponse.json({ error: 'Destino inválido. Use LISTA_FRIA ou FORNECEDOR' }, { status: 400 })
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
