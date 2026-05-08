/**
 * Resume seed — only inserts records that don't exist yet in Neon.
 * Uses createMany for speed.
 */
import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import { parseObservacoes, formatDate } from '../src/lib/clientes'

const db = new PrismaClient({ log: [] })

const JSON_CACHE_PATH = path.join(process.cwd(), 'upload', 'clientes_cache.json')

async function main() {
  const rawData: Record<string, string>[] = JSON.parse(fs.readFileSync(JSON_CACHE_PATH, 'utf-8'))
  console.log(`📄 ${rawData.length} registros no cache`)

  // Parse all valid records
  const allRecords: any[] = []
  for (const row of rawData) {
    const parsed = parseObservacoes(row['Observações'] || '')
    if (parsed.codigo === '000000' || !parsed.codigo) continue
    allRecords.push({
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
  console.log(`✅ ${allRecords.length} registros válidos`)

  // Get existing codigos
  const existing = await db.cliente.findMany({ select: { codigo: true } })
  const existingCodigos = new Set(existing.map(e => e.codigo))
  console.log(`📊 Já existem no Neon: ${existingCodigos.size}`)

  const newRecords = allRecords.filter(r => !existingCodigos.has(r.codigo))
  console.log(`🆕 Novos a inserir: ${newRecords.length}`)

  if (newRecords.length === 0) {
    console.log('✅ Banco já está completo!')
    const total = await db.cliente.count()
    console.log(`   Total: ${total}`)
    await db.$disconnect()
    return
  }

  // Insert in batches of 50
  const BATCH = 50
  let created = 0
  let errors = 0

  for (let i = 0; i < newRecords.length; i += BATCH) {
    const batch = newRecords.slice(i, i + BATCH)
    try {
      const result = await db.cliente.createMany({ data: batch, skipDuplicates: true })
      created += result.count
    } catch {
      for (const rec of batch) {
        try { await db.cliente.create({ data: rec }); created++ } catch { errors++ }
      }
    }
    const progress = Math.min(i + BATCH, newRecords.length)
    process.stdout.write(`\r  📊 ${progress}/${newRecords.length} (${created} ok, ${errors} err)`)
  }

  console.log(`\n\n✅ Importação concluída!`)
  console.log(`   Criados: ${created}`)
  console.log(`   Erros: ${errors}`)
  const total = await db.cliente.count()
  console.log(`   Total no banco: ${total}`)
  await db.$disconnect()
}

main().catch((err) => { console.error('❌ Erro:', err.message); process.exit(1) })
