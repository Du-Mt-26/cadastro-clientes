/**
 * Fast seed script for Neon — uses createMany in batches instead of upsert one-by-one.
 * Run: DATABASE_URL="..." bun run prisma/seed-fast.ts
 */

import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import { parseObservacoes, formatDate } from '../src/lib/clientes'

const db = new PrismaClient({ log: [] })

const JSON_CACHE_PATH = path.join(process.cwd(), 'upload', 'clientes_cache.json')
const XLSX_FILE_PATH = path.join(
  process.cwd(),
  'upload',
  'Cadastro de Clientes -Mtech Geral _ Ativos e Inativos_corrigido_2026_04_23_parte_0_de_3.xlsx'
)

async function main() {
  console.log('📦 Fast Seed: Importando dados para o Neon...\n')

  let rawData: Record<string, string>[]

  if (fs.existsSync(JSON_CACHE_PATH)) {
    console.log('  Lendo JSON cache...')
    rawData = JSON.parse(fs.readFileSync(JSON_CACHE_PATH, 'utf-8'))
  } else if (fs.existsSync(XLSX_FILE_PATH)) {
    console.log('  Lendo XLSX...')
    const fileBuffer = fs.readFileSync(XLSX_FILE_PATH)
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    rawData = XLSX.utils.sheet_to_json(worksheet)
  } else {
    console.error('❌ Nenhum arquivo de dados encontrado!')
    process.exit(1)
  }

  console.log(`  ${rawData.length} registros encontrados\n`)

  // Parse all records first
  const records: any[] = []
  let skipped = 0

  for (const row of rawData) {
    const parsed = parseObservacoes(row['Observações'] || '')
    if (parsed.codigo === '000000' || !parsed.codigo) {
      skipped++
      continue
    }

    records.push({
      codigo: parsed.codigo,
      ieRg: parsed.ie_rg || '',
      razaoSocial: row['Razão Social'] || '',
      nomeFantasia: row['Nome Fantasia'] || '',
      situacaoCadastral: row['Situação Cadastral'] || '',
      cnpj: (row['CNPJ'] || '').replace(/\D/g, ''),
      endereco: row['Endereço Rua/Avenida'] || '',
      numero: row['Numero'] || '',
      complemento: row['Complemento'] || '',
      bairro: row['Bairro'] || '',
      cidade: row['Cidade'] || '',
      cep: row['CEP'] || '',
      uf: row['UF'] || '',
      telefone1: row['Telefone 1'] || '',
      telefone2: row['Telefone 2'] || '',
      telefone3: parsed.celular || '',
      telefone4: parsed.fax || '',
      email1: row['Email 1'] || '',
      email2: '',
      email3: '',
      pessoaContato: row['Pessoa de contato'] || '',
      dataSituacao: formatDate(row['Data Situação'] || ''),
      dataAbertura: formatDate(row['Data Abertura'] || ''),
      cnaePrincipal: row['CNAE Principal'] || '',
      naturezaJuridica: row['Natureza Jurídica'] || '',
      porte: row['Porte'] || '',
      cadastro: parsed.cadastro || '',
      ultimaVenda: parsed.ultima_venda || '',
      regSimples: parsed.reg_simples || '',
      vendedor: parsed.vendedor || '',
      observacoes: row['Observações'] || '',
      source: 'xlsx',
      sheetsRow: 0,
    })
  }

  console.log(`  ${records.length} registros válidos, ${skipped} pulados\n`)

  // Check if data already exists
  const existingCount = await db.cliente.count()
  if (existingCount > 0) {
    console.log(`  ⚠️  Banco já tem ${existingCount} registros. Usando upsert...\n`)

    // Upsert mode (slower but safe)
    const BATCH_SIZE = 25
    let processed = 0
    let errors = 0

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE)
      for (const rec of batch) {
        try {
          await db.cliente.upsert({
            where: { codigo: rec.codigo },
            update: rec,
            create: rec,
          })
        } catch (err) {
          errors++
          if (errors <= 3) console.error(`  ❌ Erro: ${rec.codigo}`, err instanceof Error ? err.message : String(err))
        }
      }
      processed += batch.length
      process.stdout.write(`\r  📊 ${processed}/${records.length} upserted...`)
    }

    console.log(`\n\n✅ Importação concluída! Erros: ${errors}`)
  } else {
    console.log('  Banco vazio. Usando createMany (rápido)...\n')

    // Fast mode — createMany in batches
    const BATCH_SIZE = 100
    let created = 0
    let errors = 0

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE)
      try {
        const result = await db.cliente.createMany({ data: batch, skipDuplicates: true })
        created += result.count
      } catch (err) {
        errors++
        // Try one by one if batch fails
        for (const rec of batch) {
          try {
            await db.cliente.create({ data: rec })
            created++
          } catch { errors++ }
        }
      }
      process.stdout.write(`\r  📊 ${Math.min(i + BATCH_SIZE, records.length)}/${records.length} created... (${created} ok, ${errors} erros)`)
    }

    console.log(`\n\n✅ Importação concluída!`)
    console.log(`   Criados: ${created}`)
    console.log(`   Erros: ${errors}`)
  }

  const total = await db.cliente.count()
  console.log(`   Total no banco: ${total}`)

  await db.$disconnect()
}

main().catch((err) => {
  console.error('❌ Erro fatal:', err)
  process.exit(1)
})
