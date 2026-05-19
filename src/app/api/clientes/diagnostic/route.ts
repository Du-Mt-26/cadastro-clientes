import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── GET /api/clientes/diagnostic ────────────────────────
// Diagnostic: various database checks
// Uses simple hardcoded secret for one-time diagnostic use
//
// POST /api/clientes/diagnostic?secret=...&mode=backfill-ativo
// Backfill: set ativo=false for EXCLUÍDO/BAIXADA clients

export async function GET(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get('secret')
    if (secret !== 'mtech-diag-2026') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const mode = request.nextUrl.searchParams.get('mode') || 'full'

    // ─── situacaoCadastral values ─────────────────
    const situacaoGroup = await db.cliente.groupBy({
      by: ['situacaoCadastral'],
      _count: true,
      orderBy: { _count: { situacaoCadastral: 'desc' } },
    })

    // ─── Count by carteira ─────────────────
    const carteiraCounts = await db.cliente.groupBy({
      by: ['carteira'],
      _count: true,
    })

    // ─── LISTA_FRIA clients ─────────────────
    const listaFriaClients = await db.cliente.findMany({
      where: { carteira: 'LISTA_FRIA' },
      select: { codigo: true, razaoSocial: true, cidade: true, uf: true },
      take: 20,
    })

    // ─── BOLSAO clients (could be moved to LISTA_FRIA) ─────────────────
    const bolsaoCount = await db.cliente.count({ where: { carteira: 'BOLSAO' } })

    // ─── Observacoes with "Cadastrado via API" ─────────────────
    const obsComApi = await db.cliente.count({
      where: {
        observacoes: { contains: 'Cadastrado via API' }
      }
    })

    // ─── Total counts ─────────────────
    const totalClientes = await db.cliente.count()

    // ─── Users and roles ─────────────────
    const users = await db.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true },
      orderBy: { name: 'asc' },
    })

    // ─── ativo stats ─────────────────
    const ativoTrue = await db.cliente.count({ where: { ativo: true } })
    const ativoFalse = await db.cliente.count({ where: { ativo: false } })

    // ─── Clients by situacaoCadastral that are "irregular" ─────────────────
    const baixada = situacaoGroup.find(g => g.situacaoCadastral.toUpperCase() === 'BAIXADA')?._count ?? 0
    const inapta = situacaoGroup.find(g => g.situacaoCadastral.toUpperCase() === 'INAPTA')?._count ?? 0
    const suspensa = situacaoGroup.find(g => g.situacaoCadastral.toUpperCase() === 'SUSPENSA')?._count ?? 0
    const ativa = situacaoGroup.find(g => g.situacaoCadastral.toUpperCase() === 'ATIVA')?._count ?? 0
    const nula = situacaoGroup.find(g => g.situacaoCadastral === '')?._count ?? 0

    return NextResponse.json({
      totalClientes,
      ativoStats: { ativos: ativoTrue, inativos: ativoFalse },
      situacaoCadastral: situacaoGroup.map(g => ({ valor: g.situacaoCadastral || '(vazio)', count: g._count })),
      resumoSituacao: { ativa, baixada, inapta, suspensa, semInfo: nula },
      carteiraCounts: carteiraCounts.map(c => ({ carteira: c.carteira, count: c._count })),
      listaFriaClients,
      bolsaoCount,
      obsComApi,
      usuarios: users.map(u => ({ nome: u.name, email: u.email, role: u.role, ativo: u.active })),
    })
  } catch (error) {
    console.error('Error in diagnostic:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// ─── POST for backfill operations ─────────────────
export async function POST(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get('secret')
    if (secret !== 'mtech-diag-2026') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const mode = request.nextUrl.searchParams.get('mode') || ''
    const results: string[] = []

    if (mode === 'backfill-ativo') {
      // Set ativo=false for EXCLUÍDO and BAIXADA clients
      const updateResult = await db.cliente.updateMany({
        where: {
          situacaoCadastral: { in: ['EXCLUÍDO', 'BAIXADA'] }
        },
        data: { ativo: false }
      })
      results.push(`${updateResult.count} clientes marcados como inativos`)

      // Ensure all others are ativo=true
      const updateResult2 = await db.cliente.updateMany({
        where: {
          situacaoCadastral: { notIn: ['EXCLUÍDO', 'BAIXADA'] },
          ativo: false
        },
        data: { ativo: true }
      })
      results.push(`${updateResult2.count} clientes reativados`)

      // Verify
      const ativoTrue = await db.cliente.count({ where: { ativo: true } })
      const ativoFalse = await db.cliente.count({ where: { ativo: false } })
      results.push(`Verificação: ${ativoTrue} ativos, ${ativoFalse} inativos`)
    } else if (mode === 'fix-situacao') {
      // ─── Fix wrong EXCLUÍDO/BAIXADA values ─────────────────
      // These values came from the original XLSX seed and are INCORRECT.
      // The user verified on Receita Federal that these CNPJs are ATIVA.
      // The "EXCLUÍDO" status was from M-Tech's Linvix organization status,
      // not from the Receita Federal CNPJ status.

      // Step 1: List all clients with wrong situacaoCadastral
      const wrongClients = await db.cliente.findMany({
        where: {
          situacaoCadastral: { in: ['EXCLUÍDO', 'BAIXADA', 'excluído', 'baixada', 'Excluído', 'Baixada'] }
        },
        select: {
          id: true,
          codigo: true,
          razaoSocial: true,
          cnpj: true,
          situacaoCadastral: true,
          ativo: true,
        },
        orderBy: { razaoSocial: 'asc' },
      })

      results.push(`Encontrados ${wrongClients.length} clientes com situacaoCadastral incorreta:`)

      const excluidos = wrongClients.filter(c => c.situacaoCadastral.toUpperCase() === 'EXCLUÍDO')
      const baixadas = wrongClients.filter(c => c.situacaoCadastral.toUpperCase() === 'BAIXADA')
      results.push(`  - ${excluidos.length} com EXCLUÍDO`)
      results.push(`  - ${baixadas.length} com BAIXADA`)

      // Step 2: Update all to ATIVA and set ativo=true
      const updateResult = await db.cliente.updateMany({
        where: {
          situacaoCadastral: { in: ['EXCLUÍDO', 'BAIXADA', 'excluído', 'baixada', 'Excluído', 'Baixada'] }
        },
        data: {
          situacaoCadastral: 'ATIVA',
          ativo: true,
        }
      })
      results.push(`\nCorrigidos ${updateResult.count} clientes: situacaoCadastral → ATIVA, ativo → true`)

      // Step 3: Verify
      const remaining = await db.cliente.count({
        where: {
          situacaoCadastral: { in: ['EXCLUÍDO', 'BAIXADA', 'excluído', 'baixada', 'Excluído', 'Baixada'] }
        }
      })
      const ativaCount = await db.cliente.count({ where: { situacaoCadastral: 'ATIVA' } })
      const ativoTrue = await db.cliente.count({ where: { ativo: true } })
      const ativoFalse = await db.cliente.count({ where: { ativo: false } })
      results.push(`\nVerificação:`)
      results.push(`  - Restantes com EXCLUÍDO/BAIXADA: ${remaining}`)
      results.push(`  - Total com ATIVA: ${ativaCount}`)
      results.push(`  - Ativos: ${ativoTrue}, Inativos: ${ativoFalse}`)

      return NextResponse.json({
        success: true,
        results,
        correctedClients: wrongClients.map(c => ({
          codigo: c.codigo,
          razaoSocial: c.razaoSocial,
          cnpj: c.cnpj,
          situacaoAnterior: c.situacaoCadastral,
          ativoAnterior: c.ativo,
        })),
      })
    } else if (mode === 'list-situacao') {
      // ─── List all distinct situacaoCadastral values with sample clients ─────────────────
      const situacaoGroup = await db.cliente.groupBy({
        by: ['situacaoCadastral'],
        _count: true,
        orderBy: { _count: { situacaoCadastral: 'desc' } },
      })

      const details: Record<string, { count: number; samples: Array<{ codigo: string; razaoSocial: string; cnpj: string }> }> = {}

      for (const group of situacaoGroup) {
        const val = group.situacaoCadastral || '(vazio)'
        const samples = await db.cliente.findMany({
          where: { situacaoCadastral: group.situacaoCadastral },
          select: { codigo: true, razaoSocial: true, cnpj: true },
          take: 5,
          orderBy: { razaoSocial: 'asc' },
        })
        details[val] = { count: group._count, samples }
      }

      return NextResponse.json({
        success: true,
        situacaoCadastral: situacaoGroup.map(g => ({
          valor: g.situacaoCadastral || '(vazio)',
          count: g._count,
        })),
        details,
      })
    } else if (mode === 'fix-phones') {
      // ─── Fix duplicate phone numbers ─────────────────
      // 1. Remove telefone2 when it equals telefone1 (normalized digit comparison)
      // 2. Remove whatsapp when it equals telefone1 or telefone2
      const results_data: Record<string, unknown> = {}

      // Count duplicates before fix
      const dupTel1Tel2 = await db.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM "Cliente"
        WHERE "telefone1" != '' AND "telefone2" != ''
        AND REPLACE(REPLACE(REPLACE(REPLACE("telefone1", '(', ''), ')', ''), '-', ''), ' ', '')
         = REPLACE(REPLACE(REPLACE(REPLACE("telefone2", '(', ''), ')', ''), '-', ''), ' ', '')
      `) as Array<{ count: bigint }>
      results_data.dupTelefone1Telefone2 = Number(dupTel1Tel2[0]?.count ?? 0)

      const dupWhatsappTel = await db.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM "Cliente"
        WHERE "whatsapp" != '' AND ("telefone1" != '' OR "telefone2" != '')
        AND (
          REPLACE(REPLACE(REPLACE(REPLACE("whatsapp", '(', ''), ')', ''), '-', ''), ' ', '')
          = REPLACE(REPLACE(REPLACE(REPLACE("telefone1", '(', ''), ')', ''), '-', ''), ' ', '')
          OR
          REPLACE(REPLACE(REPLACE(REPLACE("whatsapp", '(', ''), ')', ''), '-', ''), ' ', '')
          = REPLACE(REPLACE(REPLACE(REPLACE("telefone2", '(', ''), ')', ''), '-', ''), ' ', '')
        )
      `) as Array<{ count: bigint }>
      results_data.dupWhatsappTelefone = Number(dupWhatsappTel[0]?.count ?? 0)

      // Count clients with whatsapp data
      const whatsappCount = await db.cliente.count({ where: { whatsapp: { not: '' } } })
      results_data.clientesComWhatsapp = whatsappCount

      // Count clients with empty whatsapp that have telefone3 data
      const migrateFromTel3 = await db.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM "Cliente"
        WHERE "whatsapp" = '' AND "telefone3" != '' AND "telefone3" IS NOT NULL
      `) as Array<{ count: bigint }>
      results_data.possivelMigracaoTelefone3 = Number(migrateFromTel3[0]?.count ?? 0)

      // Apply fixes
      // Step 1: Deduplicate telefone1 = telefone2
      const dedupTel = await db.$executeRawUnsafe(`
        UPDATE "Cliente"
        SET "telefone2" = ''
        WHERE "telefone1" != '' AND "telefone2" != ''
        AND REPLACE(REPLACE(REPLACE(REPLACE("telefone1", '(', ''), ')', ''), '-', ''), ' ', '')
         = REPLACE(REPLACE(REPLACE(REPLACE("telefone2", '(', ''), ')', ''), '-', ''), ' ', '')
      `)
      results_data.dedupTelefone1Telefone2Applied = dedupTel

      // Step 2: Deduplicate whatsapp = telefone1 or telefone2
      const dedupWa = await db.$executeRawUnsafe(`
        UPDATE "Cliente"
        SET "whatsapp" = ''
        WHERE "whatsapp" != '' AND ("telefone1" != '' OR "telefone2" != '')
        AND (
          REPLACE(REPLACE(REPLACE(REPLACE("whatsapp", '(', ''), ')', ''), '-', ''), ' ', '')
          = REPLACE(REPLACE(REPLACE(REPLACE("telefone1", '(', ''), ')', ''), '-', ''), ' ', '')
          OR
          REPLACE(REPLACE(REPLACE(REPLACE("whatsapp", '(', ''), ')', ''), '-', ''), ' ', '')
          = REPLACE(REPLACE(REPLACE(REPLACE("telefone2", '(', ''), ')', ''), '-', ''), ' ', '')
        )
      `)
      results_data.dedupWhatsappTelefoneApplied = dedupWa

      // Step 3: Migrate telefone3 → whatsapp where whatsapp is empty
      const migrate3 = await db.$executeRawUnsafe(`
        UPDATE "Cliente"
        SET "whatsapp" = "telefone3"
        WHERE "whatsapp" = '' AND "telefone3" != '' AND "telefone3" IS NOT NULL
      `)
      results_data.migratedTelefone3ToWhatsapp = migrate3

      // Verify
      const whatsappAfter = await db.cliente.count({ where: { whatsapp: { not: '' } } })
      results_data.clientesComWhatsappApos = whatsappAfter

      return NextResponse.json({
        success: true,
        results: results_data,
      })
    } else if (mode === 'fix-phone-order') {
      // ─── Fix phone order: ensure Tel.1 is filled before Tel.2 ─────────────────
      // If telefone1 is empty and telefone2 has data, move telefone2 → telefone1
      // Also cascade: if whatsapp is the only number, move it up
      const results_data: Record<string, unknown> = {}

      // Count clients with telefone1 empty and telefone2 filled
      const tel1EmptyTel2Filled = await db.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM "Cliente"
        WHERE ("telefone1" = '' OR "telefone1" IS NULL)
        AND "telefone2" != '' AND "telefone2" IS NOT NULL
      `) as Array<{ count: bigint }>
      results_data.tel1VazioTel2Preenchido = Number(tel1EmptyTel2Filled[0]?.count ?? 0)

      // Count clients with telefone1 and telefone2 empty but whatsapp filled
      const telEmptyWhatsappFilled = await db.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM "Cliente"
        WHERE ("telefone1" = '' OR "telefone1" IS NULL)
        AND ("telefone2" = '' OR "telefone2" IS NULL)
        AND "whatsapp" != '' AND "whatsapp" IS NOT NULL
      `) as Array<{ count: bigint }>
      results_data.telsVaziosWhatsappPreenchido = Number(telEmptyWhatsappFilled[0]?.count ?? 0)

      // Count clients with telefone1 empty, telefone2 empty, but telefone3 filled
      const tel1EmptyTel3Filled = await db.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM "Cliente"
        WHERE ("telefone1" = '' OR "telefone1" IS NULL)
        AND ("telefone2" = '' OR "telefone2" IS NULL)
        AND "telefone3" != '' AND "telefone3" IS NOT NULL
      `) as Array<{ count: bigint }>
      results_data.telsVaziosTel3Preenchido = Number(tel1EmptyTel3Filled[0]?.count ?? 0)

      // Step 1: Move telefone2 → telefone1 when telefone1 is empty
      const move1 = await db.$executeRawUnsafe(`
        UPDATE "Cliente"
        SET "telefone1" = "telefone2", "telefone2" = ''
        WHERE ("telefone1" = '' OR "telefone1" IS NULL)
        AND "telefone2" != '' AND "telefone2" IS NOT NULL
      `)
      results_data.movidosTel2ParaTel1 = move1

      // Step 2: After step 1, if telefone1 is still empty but whatsapp is filled, move whatsapp → telefone1
      const move2 = await db.$executeRawUnsafe(`
        UPDATE "Cliente"
        SET "telefone1" = "whatsapp", "whatsapp" = ''
        WHERE ("telefone1" = '' OR "telefone1" IS NULL)
        AND "whatsapp" != '' AND "whatsapp" IS NOT NULL
      `)
      results_data.movidosWhatsappParaTel1 = move2

      // Step 3: After steps 1&2, if telefone1 is still empty but telefone3 is filled, move telefone3 → telefone1
      const move3 = await db.$executeRawUnsafe(`
        UPDATE "Cliente"
        SET "telefone1" = "telefone3", "telefone3" = ''
        WHERE ("telefone1" = '' OR "telefone1" IS NULL)
        AND "telefone3" != '' AND "telefone3" IS NOT NULL
      `)
      results_data.movidosTel3ParaTel1 = move3

      // Step 4: Now cascade - if telefone2 is empty but whatsapp is filled, move whatsapp → telefone2
      const move4 = await db.$executeRawUnsafe(`
        UPDATE "Cliente"
        SET "telefone2" = "whatsapp", "whatsapp" = ''
        WHERE ("telefone2" = '' OR "telefone2" IS NULL)
        AND "whatsapp" != '' AND "whatsapp" IS NOT NULL
        AND "telefone1" != '' AND "telefone1" IS NOT NULL
      `)
      results_data.movidosWhatsappParaTel2 = move4

      // Step 5: If telefone2 is still empty but telefone3 is filled, move telefone3 → telefone2
      const move5 = await db.$executeRawUnsafe(`
        UPDATE "Cliente"
        SET "telefone2" = "telefone3", "telefone3" = ''
        WHERE ("telefone2" = '' OR "telefone2" IS NULL)
        AND "telefone3" != '' AND "telefone3" IS NOT NULL
        AND "telefone1" != '' AND "telefone1" IS NOT NULL
      `)
      results_data.movidosTel3ParaTel2 = move5

      // Verify: count remaining clients with telefone1 empty but telefone2 filled
      const remaining = await db.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM "Cliente"
        WHERE ("telefone1" = '' OR "telefone1" IS NULL)
        AND "telefone2" != '' AND "telefone2" IS NOT NULL
      `) as Array<{ count: bigint }>
      results_data.restantesTel1VazioTel2Preenchido = Number(remaining[0]?.count ?? 0)

      return NextResponse.json({
        success: true,
        results: results_data,
      })
    } else {
      return NextResponse.json({ error: 'Modo inválido. Use: backfill-ativo, fix-situacao, list-situacao, fix-phones, fix-phone-order' }, { status: 400 })
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Error in diagnostic POST:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
