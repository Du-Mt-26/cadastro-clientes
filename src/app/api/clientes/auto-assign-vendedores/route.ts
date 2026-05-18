import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { mapVendedorToUser, getDeboraVendedorNames, getDeboraId } from '@/lib/vendedor-mapping'

export const dynamic = 'force-dynamic'

/**
 * Auto-assign vendedores to clients that don't have one.
 * Protected by a secret query parameter.
 *
 * Regras (centralizadas em vendedor-mapping.ts):
 * - Clientes com vendedor RAFAEL DE SOUZA, WILLIAN LUIZ PEREIRA → DEBORA
 * - Clientes com vendedor M-TECH DISTRIBUIDORA → FORNECEDOR (Débora)
 * - Clientes com vendedor vazio → ficam SEM_VENDEDOR (não são atribuídos)
 * - Clientes com vendedor não mapeado → ficam SEM_VENDEDOR
 * - Clientes com vendedor que existe no sistema → atribuir ao vendedor correspondente
 *
 * GET /api/clientes/auto-assign-vendedores?secret=mtech-assign-2026
 * GET /api/clientes/auto-assign-vendedores?secret=mtech-assign-2026&mode=sync-sem-vendedor
 * GET /api/clientes/auto-assign-vendedores?secret=mtech-assign-2026&mode=clean-obs
 * GET /api/clientes/auto-assign-vendedores?secret=mtech-assign-2026&mode=migrate-whatsapp
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    if (secret !== 'mtech-assign-2026') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const mode = searchParams.get('mode')
    const dryRun = searchParams.get('dryRun') === 'true'

    // Mode: sync-sem-vendedor — Remove vendedor de clientes que estão sem vendedor no Linvix
    if (mode === 'sync-sem-vendedor') {
      return await syncSemVendedor(dryRun)
    }

    // Mode: clean-obs — Remove observações "Cadastrado via API"
    if (mode === 'clean-obs') {
      return await cleanObservacoes(dryRun)
    }

    // Mode: migrate-whatsapp — Add whatsapp column and migrate data from telefone3
    if (mode === 'migrate-whatsapp') {
      return await migrateWhatsapp(dryRun)
    }

    console.log(`[AutoAssign] Iniciando atribuição automática de vendedores...${dryRun ? ' (DRY RUN)' : ''}`)

    // Get all system users for dynamic matching
    const systemUsers = await db.user.findMany({
      select: { id: true, name: true, role: true }
    })

    // Get all clients with SEM_VENDEDOR
    const clientesSemVendedor = await db.cliente.findMany({
      where: {
        carteira: 'SEM_VENDEDOR',
        vendedor: { not: '' },  // Only clients with a non-empty vendedor name
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

    // Revert: clients with empty vendedor that were assigned to Débora should be SEM_VENDEDOR
    let revertedCount = 0
    if (!dryRun) {
      const revertResult = await db.cliente.updateMany({
        where: {
          vendedor: '',
          vendedorId: getDeboraId(),
          carteira: 'COM_VENDEDOR',
        },
        data: {
          vendedorId: null,
          carteira: 'SEM_VENDEDOR',
          dataAtribuicaoVendedor: null,
        },
      })
      revertedCount = revertResult.count
      if (revertedCount > 0) {
        console.log(`[AutoAssign] Revertidos ${revertedCount} clientes com vendedor vazio de volta para SEM_VENDEDOR`)
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      totalClientes: clientesSemVendedor.length,
      updated,
      skipped: toSkip.length,
      revertedToSemVendedor: revertedCount,
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

// Códigos dos clientes que estão SEM vendedor no Linvix (buscados em 19/05/2026)
const LINVIX_SEM_VENDEDOR_CODIGOS = [
  "001777", "001896", "001806", "002105", "001778", "001713", "001735", "001862",
  "001877", "001731", "001788", "001904", "001724", "001749", "001824", "001819",
  "001836", "002335", "001730", "001820", "001797", "001848", "001885", "000043",
  "000246", "000028", "002152", "001796", "001799", "002162", "001787", "001825",
  "001766", "000006", "001821", "000253", "000013", "001582", "001906", "002177",
  "001859", "001854", "001888", "001784", "001838", "001852", "001705", "000007",
  "000000", "001785", "001800", "000120", "001845", "001776", "002168", "001843",
  "001780", "001717", "001716", "001770", "002365", "001823", "001740", "001883",
  "000073", "001753", "001736", "002295", "000192", "001661", "002317", "000150",
  "001729", "000182", "001930", "002151", "001767", "001830", "001947", "001638",
  "001704", "002292", "001827", "002161", "001858", "001916", "001865", "001855",
  "001790", "001734", "002191", "001726", "001774", "001712", "001867", "000147",
  "001828", "001816", "002182", "000189", "000113", "002150", "000156", "001804",
  "002269", "001897", "002362", "001732", "002363", "001891", "001841", "001752",
  "001739", "001881", "001670", "001760", "001761", "000048", "000234", "001742",
  "002301", "001803", "001839", "001818", "002067", "001763", "000010", "001720",
  "001946", "002188", "002149", "001511", "000126", "001876", "002293", "002285",
  "001801", "001741", "001958", "001829", "001860", "001880", "000277", "001727",
  "001751", "001861", "001844", "002189", "000320", "000001", "001786", "000140",
  "002144", "001833", "001771", "000179", "001781", "001878", "001557", "001990",
  "002025", "001481", "001549", "001745", "001899", "001419", "002258", "001849",
  "001908", "001711", "001747", "001772", "002165", "001826", "001602", "001939",
  "001748",
]

/**
 * Sincroniza clientes sem vendedor: remove qualquer vendedor atribuído no Mtech
 * para clientes que estão SEM vendedor no Linvix.
 *
 * Regra: O Mtech deve espelhar o Linvix. Se no Linvix o cliente está sem vendedor,
 * no Mtech também deve estar SEM_VENDEDOR, independente de quem está atribuído.
 */
async function cleanObservacoes(dryRun: boolean): Promise<Response> {
  console.log(`[CleanObs] Limpando observações "Cadastrado via API"...${dryRun ? ' (DRY RUN)' : ''}`)

  // Buscar clientes com observação "Cadastrado via API"
  const clientesComObs = await db.cliente.findMany({
    where: {
      observacoes: { contains: 'Cadastrado via API' },
    },
    select: {
      id: true,
      codigo: true,
      razaoSocial: true,
      observacoes: true,
    },
  })

  console.log(`[CleanObs] ${clientesComObs.length} clientes com "Cadastrado via API"`)

  if (clientesComObs.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'Nenhum cliente com observação "Cadastrado via API"',
      cleaned: 0,
    })
  }

  if (dryRun) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      message: 'DRY RUN — nenhuma alteração foi feita',
      toClean: clientesComObs.length,
      clientes: clientesComObs.slice(0, 20).map(c => ({
        codigo: c.codigo,
        razaoSocial: c.razaoSocial,
        observacoes: c.observacoes,
      })),
    })
  }

  // Limpar: remover "Cadastrado via API" das observações
  // Se a observação é APENAS "Cadastrado via API", deixar vazio
  // Se tem mais texto, remover apenas a parte do "Cadastrado via API"
  let cleaned = 0
  for (const cliente of clientesComObs) {
    const obs = cliente.observacoes || ''
    let newObs = obs.replace(/Cadastrado via API/gi, '').trim()
    // Remover vírgulas/pontos soltos no início/fim
    newObs = newObs.replace(/^[,\s.]+|[,\s.]+$/g, '').trim()

    try {
      await db.cliente.update({
        where: { id: cliente.id },
        data: { observacoes: newObs },
      })
      cleaned++
    } catch (err) {
      console.error(`[CleanObs] Erro ao atualizar cliente ${cliente.codigo}:`, err)
    }
  }

  console.log(`[CleanObs] ${cleaned} clientes atualizados`)

  return NextResponse.json({
    success: true,
    message: `${cleaned} clientes tiveram "Cadastrado via API" removido das observações`,
    cleaned,
  })
}

async function syncSemVendedor(dryRun: boolean): Promise<Response> {
  console.log(`[SyncSemVendedor] Iniciando sync...${dryRun ? ' (DRY RUN)' : ''}`)
  console.log(`[SyncSemVendedor] ${LINVIX_SEM_VENDEDOR_CODIGOS.length} códigos sem vendedor no Linvix`)

  // Buscar clientes no Mtech que estão SEM vendedor no Linvix mas têm vendedor no Mtech
  const clientesComVendedorNoMtech = await db.cliente.findMany({
    where: {
      codigo: { in: LINVIX_SEM_VENDEDOR_CODIGOS },
      vendedorId: { not: null },
    },
    select: {
      id: true,
      codigo: true,
      razaoSocial: true,
      vendedor: true,
      vendedorId: true,
      carteira: true,
    },
  })

  console.log(`[SyncSemVendedor] ${clientesComVendedorNoMtech.length} clientes com vendedor no Mtech que deveriam estar SEM_VENDEDOR`)

  if (clientesComVendedorNoMtech.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'Todos os clientes já estão sincronizados — nenhum precisa ser atualizado',
      totalNoLinvix: LINVIX_SEM_VENDEDOR_CODIGOS.length,
      toRemove: 0,
    })
  }

  // Agrupar por vendedor atual para relatório
  const byVendedor = new Map<string, { nome: string; count: number }>()
  for (const c of clientesComVendedorNoMtech) {
    const key = c.vendedorId || 'null'
    if (!byVendedor.has(key)) {
      byVendedor.set(key, { nome: c.vendedor || '(desconhecido)', count: 0 })
    }
    byVendedor.get(key)!.count++
  }

  const porVendedor = Array.from(byVendedor.entries()).map(([id, g]) => ({
    vendedorId: id,
    vendedorNome: g.nome,
    quantidade: g.count,
  }))

  if (dryRun) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      message: 'DRY RUN — nenhuma alteração foi feita',
      totalNoLinvix: LINVIX_SEM_VENDEDOR_CODIGOS.length,
      toRemove: clientesComVendedorNoMtech.length,
      porVendedor,
      clientes: clientesComVendedorNoMtech.map(c => ({
        codigo: c.codigo,
        razaoSocial: c.razaoSocial,
        vendedorAtual: c.vendedor,
        carteiraAtual: c.carteira,
      })),
    })
  }

  // Executar update em massa
  const result = await db.cliente.updateMany({
    where: {
      codigo: { in: LINVIX_SEM_VENDEDOR_CODIGOS },
      vendedorId: { not: null },
    },
    data: {
      vendedorId: null,
      carteira: 'SEM_VENDEDOR',
      dataAtribuicaoVendedor: null,
    },
  })

  console.log(`[SyncSemVendedor] ${result.count} clientes atualizados para SEM_VENDEDOR`)

  return NextResponse.json({
    success: true,
    message: `${result.count} clientes atualizados para SEM_VENDEDOR`,
    totalNoLinvix: LINVIX_SEM_VENDEDOR_CODIGOS.length,
    toRemove: clientesComVendedorNoMtech.length,
    updated: result.count,
    porVendedor,
  })
}

/**
 * Migração: Adiciona coluna whatsapp ao banco, migra dados de telefone3 → whatsapp,
 * e remove números duplicados de telefone1/telefone2.
 */
async function migrateWhatsapp(dryRun: boolean): Promise<Response> {
  console.log(`[MigrateWhatsapp] Iniciando migração...${dryRun ? ' (DRY RUN)' : ''}`)

  const results: Record<string, unknown> = {}

  // Step 1: Add whatsapp column if it doesn't exist
  try {
    console.log('[MigrateWhatsapp] Verificando se coluna whatsapp existe...')
    await db.$executeRawUnsafe(`
      ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT NOT NULL DEFAULT ''
    `)
    results.columnAdded = true
    console.log('[MigrateWhatsapp] Coluna whatsapp adicionada/verificada')
  } catch (err) {
    console.error('[MigrateWhatsapp] Erro ao adicionar coluna whatsapp:', err)
    results.columnAdded = false
    results.columnError = err instanceof Error ? err.message : 'Erro desconhecido'
  }

  if (dryRun) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      message: 'DRY RUN — nenhuma alteração foi feita',
      results,
    })
  }

  // Step 2: Migrate telefone3 data → whatsapp (only where whatsapp is empty and telefone3 has data)
  try {
    const migrateResult = await db.$executeRawUnsafe(`
      UPDATE "Cliente"
      SET "whatsapp" = "telefone3"
      WHERE "whatsapp" = ''
        AND "telefone3" != ''
        AND "telefone3" IS NOT NULL
    `)
    results.migratedFromTelefone3 = migrateResult
    console.log(`[MigrateWhatsapp] ${migrateResult} clientes migrados de telefone3 → whatsapp`)
  } catch (err) {
    console.error('[MigrateWhatsapp] Erro ao migrar telefone3 → whatsapp:', err)
    results.migrateError = err instanceof Error ? err.message : 'Erro desconhecido'
  }

  // Step 3: Remove duplicate phone numbers where telefone1 == telefone2
  try {
    const dedupResult = await db.$executeRawUnsafe(`
      UPDATE "Cliente"
      SET "telefone2" = ''
      WHERE "telefone1" != ''
        AND "telefone2" != ''
        AND REPLACE(REPLACE(REPLACE(REPLACE("telefone1", '(', ''), ')', ''), '-', ''), ' ', '')
         = REPLACE(REPLACE(REPLACE(REPLACE("telefone2", '(', ''), ')', ''), '-', ''), ' ', '')
    `)
    results.dedupTelefone1Telefone2 = dedupResult
    console.log(`[MigrateWhatsapp] ${dedupResult} clientes com telefone1=telefone2 deduplicados`)
  } catch (err) {
    console.error('[MigrateWhatsapp] Erro ao deduplicar telefones:', err)
    results.dedupError = err instanceof Error ? err.message : 'Erro desconhecido'
  }

  // Step 4: Also deduplicate telefone1=whatsapp and telefone2=whatsapp
  try {
    const dedupWhatsapp1 = await db.$executeRawUnsafe(`
      UPDATE "Cliente"
      SET "whatsapp" = ''
      WHERE "whatsapp" != ''
        AND ("telefone1" != '' OR "telefone2" != '')
        AND (
          REPLACE(REPLACE(REPLACE(REPLACE("whatsapp", '(', ''), ')', ''), '-', ''), ' ', '')
          = REPLACE(REPLACE(REPLACE(REPLACE("telefone1", '(', ''), ')', ''), '-', ''), ' ', '')
          OR
          REPLACE(REPLACE(REPLACE(REPLACE("whatsapp", '(', ''), ')', ''), '-', ''), ' ', '')
          = REPLACE(REPLACE(REPLACE(REPLACE("telefone2", '(', ''), ')', ''), '-', ''), ' ', '')
        )
    `)
    results.dedupWhatsappTelefone = dedupWhatsapp1
    console.log(`[MigrateWhatsapp] ${dedupWhatsapp1} clientes com whatsapp=telefone deduplicados`)
  } catch (err) {
    console.error('[MigrateWhatsapp] Erro ao deduplicar whatsapp/telefone:', err)
    results.dedupWhatsappError = err instanceof Error ? err.message : 'Erro desconhecido'
  }

  return NextResponse.json({
    success: true,
    message: 'Migração concluída com sucesso',
    results,
  })
}
