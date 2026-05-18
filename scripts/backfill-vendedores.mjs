import { PrismaClient } from '@prisma/client'

const DATABASE_URL = 'postgresql://neondb_owner:npg_MCW4YHh1UZIz@ep-winter-river-ac6s8rcm-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

const prisma = new PrismaClient({
  datasources: {
    db: { url: DATABASE_URL }
  }
})

const DEBORA_ID = 'cmoxe1srn0004wxwfyzyde247'

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  console.log(`\n=== BACKFILL VENDEDORES (SQL Raw) ===`)
  console.log(`Modo: ${dryRun ? 'DRY RUN' : 'EXECUÇÃO REAL'}\n`)

  // 1. Ver distribuição atual de SEM_VENDEDOR
  const distribuicao = await prisma.$queryRawUnsafe(`
    SELECT
      COALESCE(TRIM(UPPER("vendedor")), '(vazio)') as vendedor_nome,
      COUNT(*)::int as total
    FROM "Cliente"
    WHERE carteira = 'SEM_VENDEDOR'
    GROUP BY TRIM(UPPER("vendedor"))
    ORDER BY total DESC
  `)

  console.log('Distribuição por vendedor (SEM_VENDEDOR):')
  const vendedoresParaDebora = ['M-TECH DISTRIBUIDORA', 'RAFAEL DE SOUZA', 'WILLIAN LUIZ PEREIRA']
  for (const row of distribuicao) {
    const vaiParaDebora = vendedoresParaDebora.includes(row.vendedor_nome)
    console.log(`  ${row.vendedor_nome}: ${row.total} clientes${vaiParaDebora ? ' → DEBORA' : ' → fica como está'}`)
  }

  // 2. Contar quantos serão atualizados
  const countResult = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as total
    FROM "Cliente"
    WHERE carteira = 'SEM_VENDEDOR'
    AND TRIM(UPPER("vendedor")) IN ('M-TECH DISTRIBUIDORA', 'RAFAEL DE SOUZA', 'WILLIAN LUIZ PEREIRA')
  `)
  const totalParaAtualizar = countResult[0].total

  console.log(`\nClientes que serão atribuídos à Débora: ${totalParaAtualizar}`)

  if (totalParaAtualizar === 0) {
    console.log('\nNenhum cliente para atualizar. Encerrando.')
    return
  }

  // 3. Mostrar amostra
  const amostra = await prisma.$queryRawUnsafe(`
    SELECT codigo, "razaoSocial", "vendedor"
    FROM "Cliente"
    WHERE carteira = 'SEM_VENDEDOR'
    AND TRIM(UPPER("vendedor")) IN ('M-TECH DISTRIBUIDORA', 'RAFAEL DE SOUZA', 'WILLIAN LUIZ PEREIRA')
    LIMIT 10
  `)

  console.log('\nAmostra dos clientes:')
  for (const c of amostra) {
    console.log(`  [${c.codigo}] ${c.razaoSocial?.substring(0, 45)} — vendedor: "${c.vendedor}"`)
  }

  if (dryRun) {
    console.log('\n*** DRY RUN — Nenhuma alteração foi feita ***')
    return
  }

  // 4. Executar UPDATE
  console.log('\nExecutando atualizações...')

  const result = await prisma.$executeRawUnsafe(`
    UPDATE "Cliente"
    SET
      "vendedorId" = '${DEBORA_ID}',
      carteira = 'COM_VENDEDOR',
      "updatedAt" = NOW()
    WHERE carteira = 'SEM_VENDEDOR'
    AND TRIM(UPPER("vendedor")) IN ('M-TECH DISTRIBUIDORA', 'RAFAEL DE SOUZA', 'WILLIAN LUIZ PEREIRA')
  `)

  console.log(`\n=== RESULTADO FINAL ===`)
  console.log(`Linhas atualizadas: ${result}`)

  // 5. Verificar resultado
  const novaDistribuicao = await prisma.$queryRawUnsafe(`
    SELECT
      COALESCE(TRIM(UPPER("vendedor")), '(vazio)') as vendedor_nome,
      carteira,
      COUNT(*)::int as total
    FROM "Cliente"
    WHERE TRIM(UPPER("vendedor")) IN ('M-TECH DISTRIBUIDORA', 'RAFAEL DE SOUZA', 'WILLIAN LUIZ PEREIRA')
    GROUP BY TRIM(UPPER("vendedor")), carteira
    ORDER BY vendedor_nome
  `)

  console.log('\nSituação após atualização:')
  for (const row of novaDistribuicao) {
    console.log(`  ${row.vendedor_nome}: carteira=${row.carteira}, total=${row.total}`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
