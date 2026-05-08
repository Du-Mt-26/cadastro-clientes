/**
 * Seed script: Import XLSX data into the Cliente table.
 *
 * Usage:
 *   bun run prisma/seed.ts
 *
 * Set DATABASE_URL in .env — can be local PostgreSQL or Neon.
 *
 * This script reads the XLSX file (or JSON cache), parses all records,
 * and upserts them into the Cliente table with source='xlsx'.
 */

import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import { parseObservacoes, formatDate } from '../src/lib/clientes'

const db = new PrismaClient({ log: [] })

// ─── Paths ──────────────────────────────────────────

const JSON_CACHE_PATH = path.join(process.cwd(), 'upload', 'clientes_cache.json')
const XLSX_FILE_PATH = path.join(
  process.cwd(),
  'upload',
  'Cadastro de Clientes -Mtech Geral _ Ativos e Inativos_corrigido_2026_04_23_parte_0_de_3.xlsx'
)

// ─── Main ────────────────────────────────────────────

async function main() {
  console.log('📦 Seed: Importando dados XLSX para o banco...\n')

  // Load raw data
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

  // Import in batches
  const BATCH_SIZE = 50
  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < rawData.length; i += BATCH_SIZE) {
    const batch = rawData.slice(i, i + BATCH_SIZE)

    for (const row of batch) {
      try {
        const parsed = parseObservacoes(row['Observações'] || '')

        // Skip rows with codigo 000000
        if (parsed.codigo === '000000' || !parsed.codigo) {
          skipped++
          continue
        }

        const data = {
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
        }

        await db.cliente.upsert({
          where: { codigo: data.codigo },
          update: data,
          create: data,
        })

        // Count as created or updated
        const existing = await db.cliente.findUnique({ where: { codigo: data.codigo } })
        if (existing) updated++
        else created++
      } catch (err) {
        errors++
        if (errors <= 5) {
          console.error(`  ❌ Erro no registro ${i}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    // Progress
    const progress = Math.min(i + BATCH_SIZE, rawData.length)
    process.stdout.write(`\r  📊 ${progress}/${rawData.length} processados...`)
  }

  console.log('\n')
  console.log('✅ Importação concluída!')
  console.log(`   Criados: ${created}`)
  console.log(`   Atualizados: ${updated}`)
  console.log(`   Pulados: ${skipped}`)
  console.log(`   Erros: ${errors}`)

  // Verify total
  const total = await db.cliente.count()
  console.log(`   Total no banco: ${total}`)

  await db.$disconnect()
}

main().catch((err) => {
  console.error('❌ Erro fatal:', err)
  process.exit(1)
})
