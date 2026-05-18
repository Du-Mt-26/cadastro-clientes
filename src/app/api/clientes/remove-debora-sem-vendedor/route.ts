import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Sincroniza clientes sem vendedor: remove qualquer vendedor atribuído no Mtech
 * para clientes que estão SEM vendedor no Linvix.
 *
 * Regra: O Mtech deve espelhar o Linvix. Se no Linvix o cliente está sem vendedor,
 * no Mtech também deve estar SEM_VENDEDOR, independente de quem está atribuído.
 *
 * GET /api/clientes/remove-debora-sem-vendedor?secret=mtech-sync-2026
 * GET /api/clientes/remove-debora-sem-vendedor?secret=mtech-sync-2026&dryRun=true
 */

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    if (secret !== 'mtech-sync-2026') {
      return NextResponse.json({ error: 'Rota sync-sem-vendedor: secret inválido' }, { status: 401 })
    }

    const dryRun = searchParams.get('dryRun') === 'true'

    console.log(`[SyncSemVendedor] Iniciando sync de clientes sem vendedor...${dryRun ? ' (DRY RUN)' : ''}`)
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
    const byVendedor = new Map<string, { nome: string; clientes: typeof clientesComVendedorNoMtech }>()
    for (const c of clientesComVendedorNoMtech) {
      const key = c.vendedorId || 'null'
      if (!byVendedor.has(key)) {
        byVendedor.set(key, { nome: c.vendedor || '(desconhecido)', clientes: [] })
      }
      byVendedor.get(key)!.clientes.push(c)
    }

    const summary = Array.from(byVendedor.entries()).map(([id, group]) => ({
      vendedorId: id,
      vendedorNome: group.nome,
      quantidade: group.clientes.length,
    }))

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        message: 'DRY RUN — nenhuma alteração foi feita',
        totalNoLinvix: LINVIX_SEM_VENDEDOR_CODIGOS.length,
        toRemove: clientesComVendedorNoMtech.length,
        porVendedor: summary,
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
      message: `${result.count} clientes atualizados de COM_VENDEDOR para SEM_VENDEDOR`,
      totalNoLinvix: LINVIX_SEM_VENDEDOR_CODIGOS.length,
      toRemove: clientesComVendedorNoMtech.length,
      updated: result.count,
      porVendedor: summary,
    })

  } catch (error) {
    console.error('[SyncSemVendedor] Erro:', error)
    return NextResponse.json({
      success: false,
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 })
  }
}
