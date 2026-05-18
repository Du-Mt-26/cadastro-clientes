import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { mapVendedorToUser, getDeboraVendedorNames, getDeboraId } from '@/lib/vendedor-mapping'

export const dynamic = 'force-dynamic'

/**
 * Auto-assign vendedores to clients that don't have one.
 * Protected by a secret query parameter.
 *
 * Regras (centralizadas em vendedor-mapping.ts):
 * - Clientes com vendedor M-TECH DISTRIBUIDORA, RAFAEL DE SOUZA, WILLIAN LUIZ PEREIRA → DEBORA
 * - Clientes com vendedor vazio → DEBORA
 * - Clientes com vendedor não mapeado → DEBORA (fallback)
 * - Clientes com vendedor que existe no sistema → atribuir ao vendedor correspondente
 *
 * GET /api/clientes/auto-assign-vendedores?secret=mtech-assign-2026
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    if (secret !== 'mtech-assign-2026') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const dryRun = searchParams.get('dryRun') === 'true'

    console.log(`[AutoAssign] Iniciando atribuição automática de vendedores...${dryRun ? ' (DRY RUN)' : ''}`)

    // Get all system users for dynamic matching
    const systemUsers = await db.user.findMany({
      select: { id: true, name: true, role: true }
    })

    // Get all clients with SEM_VENDEDOR
    const clientesSemVendedor = await db.cliente.findMany({
      where: {
        carteira: 'SEM_VENDEDOR'
      },
      select: {
        id: true,
        codigo: true,
        razaoSocial: true,
        vendedor: true,
        cidade: true,
        uf: true,
      }
    })

    console.log(`[AutoAssign] Encontrados ${clientesSemVendedor.length} clientes com SEM_VENDEDOR`)

    if (clientesSemVendedor.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nenhum cliente sem vendedor encontrado',
        updated: 0,
        skipped: 0,
        errors: 0,
        details: []
      })
    }

    // Determine assignment for each client
    const toUpdate: Array<{
      id: string
      codigo: string
      razaoSocial: string
      vendedorOriginal: string | null
      vendedorIdDestino: string
      vendedorNomeDestino: string
    }> = []
    const toSkip: Array<{
      codigo: string
      razaoSocial: string
      vendedorOriginal: string | null
      motivo: string
    }> = []

    for (const cliente of clientesSemVendedor) {
      const { userId, carteira } = mapVendedorToUser(cliente.vendedor, systemUsers)

      if (!userId) {
        // No mapping found — stays SEM_VENDEDOR
        toSkip.push({
          codigo: cliente.codigo,
          razaoSocial: cliente.razaoSocial,
          vendedorOriginal: cliente.vendedor || '(vazio)',
          motivo: cliente.vendedor ? `Vendedor "${cliente.vendedor}" não mapeado` : 'Sem vendedor no Linvix'
        })
      } else {
        const user = systemUsers.find(u => u.id === userId)
        toUpdate.push({
          id: cliente.id,
          codigo: cliente.codigo,
          razaoSocial: cliente.razaoSocial,
          vendedorOriginal: cliente.vendedor || '(vazio)',
          vendedorIdDestino: userId,
          vendedorNomeDestino: user?.name || 'Desconhecido'
        })
      }
    }

    console.log(`[AutoAssign] ${toUpdate.length} clientes para atualizar, ${toSkip.length} para pular`)

    // Perform updates (unless dry run)
    let updated = 0
    let errors = 0
    const details: Array<{
      vendedorLinvix: string
      vendedorSistema: string
      clientesAtualizados: number
      erros: number
    }> = []

    if (!dryRun) {
      // Group by destination vendedor for batch reporting
      const updateByVendedor = new Map<string, { vendedorNome: string; clientes: typeof toUpdate }>()
      for (const item of toUpdate) {
        if (!updateByVendedor.has(item.vendedorIdDestino)) {
          updateByVendedor.set(item.vendedorIdDestino, {
            vendedorNome: item.vendedorNomeDestino,
            clientes: []
          })
        }
        updateByVendedor.get(item.vendedorIdDestino)!.clientes.push(item)
      }

      for (const [vendedorId, group] of updateByVendedor) {
        let groupUpdated = 0
        let groupErrors = 0

        for (const cliente of group.clientes) {
          try {
            await db.cliente.update({
              where: { id: cliente.id },
              data: {
                vendedorId: vendedorId,
                carteira: 'COM_VENDEDOR',
                updatedAt: new Date()
              }
            })
            groupUpdated++
          } catch (err) {
            console.error(`[AutoAssign] Erro ao atualizar cliente ${cliente.codigo}:`, err)
            groupErrors++
          }
        }

        updated += groupUpdated
        errors += groupErrors

        // Get representative Linvix vendedor names from the group
        const vendedorLinvixNames = [...new Set(group.clientes.map(c => c.vendedorOriginal))]

        details.push({
          vendedorLinvix: vendedorLinvixNames.join(', '),
          vendedorSistema: group.vendedorNome,
          clientesAtualizados: groupUpdated,
          erros: groupErrors
        })
      }
    } else {
      // Dry run — just report what would happen
      const updateByVendedor = new Map<string, { vendedorNome: string; clientes: typeof toUpdate }>()
      for (const item of toUpdate) {
        if (!updateByVendedor.has(item.vendedorIdDestino)) {
          updateByVendedor.set(item.vendedorIdDestino, {
            vendedorNome: item.vendedorNomeDestino,
            clientes: []
          })
        }
        updateByVendedor.get(item.vendedorIdDestino)!.clientes.push(item)
      }

      for (const [, group] of updateByVendedor) {
        const vendedorLinvixNames = [...new Set(group.clientes.map(c => c.vendedorOriginal))]
        details.push({
          vendedorLinvix: vendedorLinvixNames.join(', '),
          vendedorSistema: group.vendedorNome,
          clientesAtualizados: group.clientes.length,
          erros: 0
        })
      }
    }

    console.log(`[AutoAssign] Concluído: ${updated} atualizados, ${toSkip.length} pulados, ${errors} erros`)

    return NextResponse.json({
      success: true,
      dryRun,
      totalClientes: clientesSemVendedor.length,
      updated,
      skipped: toSkip.length,
      errors,
      assignmentGroups: details,
      skippedClients: toSkip.slice(0, 50), // Show up to 50 skipped for brevity
      skippedCount: toSkip.length
    })

  } catch (error) {
    console.error('[AutoAssign] Erro:', error)
    return NextResponse.json({
      success: false,
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 })
  }
}
