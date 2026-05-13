import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// Bulk import clients — ADMIN only
// Accepts an array of client objects and upserts them into the database
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const userRole = (session.user as any)?.role
  if (userRole !== 'ADMIN' && userRole !== 'DIRETOR_COMERCIAL') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { clients, clearFirst } = body as {
      clients: Array<Record<string, any>>
      clearFirst?: boolean
    }

    if (!Array.isArray(clients) || clients.length === 0) {
      return NextResponse.json({ error: 'Array de clientes vazio ou inválido' }, { status: 400 })
    }

    console.log(`[bulk-import] Recebidos ${clients.length} clientes para importação`)

    // Optionally clear existing clients (dangerous — use with care)
    if (clearFirst) {
      const deleteResult = await db.cliente.deleteMany({})
      console.log(`[bulk-import] Removidos ${deleteResult.count} clientes existentes`)
    }

    let created = 0
    let updated = 0
    let skipped = 0
    let errors = 0
    const errorDetails: string[] = []

    // Process in batches of 50 to avoid timeout
    const BATCH_SIZE = 50
    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE)

      for (const clientData of batch) {
        try {
          // Validate required fields
          if (!clientData.codigo) {
            skipped++
            continue
          }

          // Build the data object, mapping fields carefully
          const data = {
            ieRg: String(clientData.ieRg || ''),
            razaoSocial: String(clientData.razaoSocial || ''),
            nomeFantasia: String(clientData.nomeFantasia || ''),
            situacaoCadastral: String(clientData.situacaoCadastral || ''),
            cnpj: String(clientData.cnpj || ''),
            endereco: String(clientData.endereco || ''),
            numero: String(clientData.numero || ''),
            complemento: String(clientData.complemento || ''),
            bairro: String(clientData.bairro || ''),
            cidade: String(clientData.cidade || ''),
            cep: String(clientData.cep || ''),
            uf: String(clientData.uf || ''),
            telefone1: String(clientData.telefone1 || ''),
            telefone2: String(clientData.telefone2 || ''),
            telefone3: String(clientData.telefone3 || ''),
            telefone4: String(clientData.telefone4 || ''),
            email1: String(clientData.email1 || '').toLowerCase().trim(),
            email2: String(clientData.email2 || '').toLowerCase().trim(),
            email3: String(clientData.email3 || '').toLowerCase().trim(),
            pessoaContato: String(clientData.pessoaContato || ''),
            dataSituacao: String(clientData.dataSituacao || ''),
            dataAbertura: String(clientData.dataAbertura || ''),
            cnaePrincipal: String(clientData.cnaePrincipal || ''),
            naturezaJuridica: String(clientData.naturezaJuridica || ''),
            porte: String(clientData.porte || ''),
            cadastro: String(clientData.cadastro || ''),
            ultimaVenda: String(clientData.ultimaVenda || ''),
            regSimples: String(clientData.regSimples || ''),
            vendedor: String(clientData.vendedor || ''),
            observacoes: String(clientData.observacoes || ''),
            source: String(clientData.source || 'xlsx'),
            sheetsRow: Number(clientData.sheetsRow || 0),
            tipo: String(clientData.tipo || 'REVENDA'),
            fornecedor: Boolean(clientData.fornecedor || false),
            vendedorId: clientData.vendedorId || null,
            dataAtribuicaoVendedor: clientData.dataAtribuicaoVendedor
              ? new Date(clientData.dataAtribuicaoVendedor)
              : null,
            dataEntradaBolsao: clientData.dataEntradaBolsao
              ? new Date(clientData.dataEntradaBolsao)
              : null,
            vendedoresQueAbordaram: String(clientData.vendedoresQueAbordaram || ''),
          }

          // Upsert by codigo (unique field)
          const result = await db.cliente.upsert({
            where: { codigo: String(clientData.codigo) },
            update: data,
            create: {
              codigo: String(clientData.codigo),
              ...data,
            },
          })

          // Check if it was created or updated
          const existing = await db.cliente.findUnique({
            where: { codigo: String(clientData.codigo) },
          })
          if (existing) {
            updated++
          } else {
            created++
          }
        } catch (err: any) {
          errors++
          const msg = `Cliente ${clientData.codigo}: ${err.message?.substring(0, 100)}`
          errorDetails.push(msg)
          if (errors <= 5) console.error(`[bulk-import] ${msg}`)
        }
      }

      // Log progress
      if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= clients.length) {
        console.log(`[bulk-import] Progresso: ${Math.min(i + BATCH_SIZE, clients.length)}/${clients.length} processados`)
      }
    }

    const result = {
      total: clients.length,
      created,
      updated,
      skipped,
      errors,
      errorDetails: errorDetails.slice(0, 20), // Limit error details
    }

    console.log(`[bulk-import] Resultado:`, result)

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[bulk-import] Erro geral:', err)
    return NextResponse.json(
      { error: 'Erro na importação', details: err.message?.substring(0, 200) },
      { status: 500 }
    )
  }
}
