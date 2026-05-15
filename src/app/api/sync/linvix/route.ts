import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Carteira } from '@prisma/client'

// ─── Linvix Sync API Endpoint ───────────────────────
// Receives client data from the Linvix Playwright sync service
// and upserts into the M-Tech database.
//
// Authentication: API key via X-Sync-API-Key header
// (SYNC_API_KEY environment variable must be set)

const SYNC_API_KEY = process.env.SYNC_API_KEY || ''

function validateApiKey(request: NextRequest): boolean {
  if (!SYNC_API_KEY) {
    console.warn('[sync/linvix] SYNC_API_KEY not configured — rejecting all requests')
    return false
  }
  const key = request.headers.get('x-sync-api-key') || ''
  return key === SYNC_API_KEY
}

// ─── Field mapping: Linvix → M-Tech ─────────────────
// The sync service sends client data with these field names
// (Portuguese from Linvix mapped to our DB field names)

interface LinvixClientData {
  codigo: string           // Código do cliente no Linvix
  razaoSocial: string      // Nome / Razão Social
  nomeFantasia: string     // Nome Fantasia
  cnpj: string             // CNPJ/CPF (digits only)
  ieRg: string             // Inscrição Estadual / RG
  telefone1: string        // Telefone
  telefone2: string        // Celular
  telefone3: string        // WhatsApp
  telefone4: string        // Fax / Outro
  email1: string           // E-mail principal
  email2: string           // E-mail secundário
  email3: string           // E-mail terciário
  pessoaContato: string    // Pessoa de contato
  endereco: string         // Logradouro
  numero: string           // Número
  complemento: string      // Complemento
  bairro: string           // Bairro
  cidade: string           // Cidade
  cep: string              // CEP
  uf: string               // UF / Estado
  situacaoCadastral: string // Situação cadastral (Receita)
  dataSituacao: string     // Data da situação
  dataAbertura: string     // Data de abertura
  cnaePrincipal: string    // CNAE principal
  naturezaJuridica: string // Natureza jurídica
  porte: string            // Porte da empresa
  regSimples: string       // Regime Simples
  vendedor: string         // Vendedor(a) no Linvix
  observacoes: string      // Observações
}

/**
 * GET /api/sync/linvix — Get last sync status
 */
export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: 'API key inválida' }, { status: 401 })
  }

  try {
    const lastSync = await db.linvixSyncLog.findFirst({
      orderBy: { startedAt: 'desc' },
    })

    const recentSyncs = await db.linvixSyncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
    })

    return NextResponse.json({
      lastSync: lastSync ? {
        id: lastSync.id,
        status: lastSync.status,
        startedAt: lastSync.startedAt,
        finishedAt: lastSync.finishedAt,
        totalClients: lastSync.totalClients,
        createdCount: lastSync.createdCount,
        updatedCount: lastSync.updatedCount,
        skippedCount: lastSync.skippedCount,
        errorCount: lastSync.errorCount,
        errorMessage: lastSync.errorMessage,
        pagesScraped: lastSync.pagesScraped,
        detailsScraped: lastSync.detailsScraped,
        durationMs: lastSync.durationMs,
      } : null,
      recentSyncs: recentSyncs.map(s => ({
        id: s.id,
        status: s.status,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        totalClients: s.totalClients,
        createdCount: s.createdCount,
        updatedCount: s.updatedCount,
        durationMs: s.durationMs,
      })),
    })
  } catch (error) {
    console.error('[sync/linvix] Error getting sync status:', error)
    return NextResponse.json({ error: 'Erro ao buscar status de sync' }, { status: 500 })
  }
}

/**
 * POST /api/sync/linvix — Upsert clients from Linvix
 *
 * Body: {
 *   syncLogId: string       // ID of the LinvixSyncLog record (created by sync service)
 *   clients: LinvixClientData[]
 *   totalPages?: number     // Total pages in Linvix (for progress tracking)
 *   currentPage?: number    // Current page being synced
 *   isFullSync?: boolean    // If true, this is a complete sync run
 * }
 */
export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: 'API key inválida' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { clients, isFullSync = false } = body as {
      clients: LinvixClientData[]
      isFullSync?: boolean
    }

    if (!Array.isArray(clients) || clients.length === 0) {
      return NextResponse.json({ error: 'Array de clientes vazio ou inválido' }, { status: 400 })
    }

    console.log(`[sync/linvix] Recebidos ${clients.length} clientes do Linvix (fullSync=${isFullSync})`)

    // Create sync log entry
    const syncLog = await db.linvixSyncLog.create({
      data: {
        status: 'running',
        totalClients: clients.length,
      },
    })

    let created = 0
    let updated = 0
    let skipped = 0
    let errors = 0
    const errorDetails: string[] = []

    // Process in batches of 50
    const BATCH_SIZE = 50
    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE)

      for (const clientData of batch) {
        try {
          // Validate required field
          if (!clientData.codigo) {
            skipped++
            continue
          }

          // Normalize CNPJ (digits only)
          const cnpjNormalized = (clientData.cnpj || '').replace(/\D/g, '')

          // Build the data object for upsert
          // Only include fields that have values from Linvix
          // Empty strings from Linvix will NOT overwrite existing M-Tech data
          const data: Record<string, unknown> = {}

          const fieldsToMap: Array<{ linvix: keyof LinvixClientData; mtech: string }> = [
            { linvix: 'razaoSocial', mtech: 'razaoSocial' },
            { linvix: 'nomeFantasia', mtech: 'nomeFantasia' },
            { linvix: 'cnpj', mtech: 'cnpj' },
            { linvix: 'ieRg', mtech: 'ieRg' },
            { linvix: 'telefone1', mtech: 'telefone1' },
            { linvix: 'telefone2', mtech: 'telefone2' },
            { linvix: 'telefone3', mtech: 'telefone3' },
            { linvix: 'telefone4', mtech: 'telefone4' },
            { linvix: 'email1', mtech: 'email1' },
            { linvix: 'email2', mtech: 'email2' },
            { linvix: 'email3', mtech: 'email3' },
            { linvix: 'pessoaContato', mtech: 'pessoaContato' },
            { linvix: 'endereco', mtech: 'endereco' },
            { linvix: 'numero', mtech: 'numero' },
            { linvix: 'complemento', mtech: 'complemento' },
            { linvix: 'bairro', mtech: 'bairro' },
            { linvix: 'cidade', mtech: 'cidade' },
            { linvix: 'cep', mtech: 'cep' },
            { linvix: 'uf', mtech: 'uf' },
            { linvix: 'situacaoCadastral', mtech: 'situacaoCadastral' },
            { linvix: 'dataSituacao', mtech: 'dataSituacao' },
            { linvix: 'dataAbertura', mtech: 'dataAbertura' },
            { linvix: 'cnaePrincipal', mtech: 'cnaePrincipal' },
            { linvix: 'naturezaJuridica', mtech: 'naturezaJuridica' },
            { linvix: 'porte', mtech: 'porte' },
            { linvix: 'regSimples', mtech: 'regSimples' },
            { linvix: 'vendedor', mtech: 'vendedor' },
            { linvix: 'observacoes', mtech: 'observacoes' },
          ]

          for (const { linvix, mtech } of fieldsToMap) {
            const value = clientData[linvix]
            if (value !== undefined && value !== null && value !== '') {
              // Lowercase emails
              if (mtech.startsWith('email')) {
                data[mtech] = String(value).toLowerCase().trim()
              } else if (mtech === 'cnpj') {
                data[mtech] = cnpjNormalized
              } else {
                data[mtech] = String(value)
              }
            }
          }

          // Always set source to 'linvix' for synced clients
          data.source = 'linvix'

          // Check if client exists
          const existing = await db.cliente.findUnique({
            where: { codigo: String(clientData.codigo) },
          })

          if (existing) {
            // Only update fields that have new data from Linvix
            // Skip if no meaningful changes (avoid unnecessary writes)
            const updateData: Record<string, unknown> = { source: 'linvix' }
            let hasChanges = false

            for (const [key, newValue] of Object.entries(data)) {
              if (key === 'source') continue
              const oldValue = String((existing as any)[key] ?? '')
              const newStr = String(newValue ?? '')
              if (newStr !== '' && newStr !== oldValue) {
                // Don't overwrite existing M-Tech data with empty Linvix data
                updateData[key] = newValue
                hasChanges = true
              }
            }

            if (hasChanges) {
              await db.cliente.update({
                where: { codigo: String(clientData.codigo) },
                data: updateData,
              })
              updated++
            } else {
              skipped++
            }
          } else {
            // Create new client
            await db.cliente.create({
              data: {
                codigo: String(clientData.codigo),
                razaoSocial: String(data.razaoSocial || ''),
                nomeFantasia: String(data.nomeFantasia || ''),
                cnpj: cnpjNormalized,
                ieRg: String(data.ieRg || ''),
                telefone1: String(data.telefone1 || ''),
                telefone2: String(data.telefone2 || ''),
                telefone3: String(data.telefone3 || ''),
                telefone4: String(data.telefone4 || ''),
                email1: String(data.email1 || '').toLowerCase().trim(),
                email2: String(data.email2 || '').toLowerCase().trim(),
                email3: String(data.email3 || '').toLowerCase().trim(),
                pessoaContato: String(data.pessoaContato || ''),
                endereco: String(data.endereco || ''),
                numero: String(data.numero || ''),
                complemento: String(data.complemento || ''),
                bairro: String(data.bairro || ''),
                cidade: String(data.cidade || ''),
                cep: String(data.cep || ''),
                uf: String(data.uf || ''),
                situacaoCadastral: String(data.situacaoCadastral || ''),
                dataSituacao: String(data.dataSituacao || ''),
                dataAbertura: String(data.dataAbertura || ''),
                cnaePrincipal: String(data.cnaePrincipal || ''),
                naturezaJuridica: String(data.naturezaJuridica || ''),
                porte: String(data.porte || ''),
                regSimples: String(data.regSimples || ''),
                vendedor: String(data.vendedor || ''),
                observacoes: String(data.observacoes || ''),
                source: 'linvix',
                tipo: 'REVENDA',
                carteira: Carteira.SEM_VENDEDOR,
              },
            })
            created++
          }
        } catch (err: any) {
          errors++
          const msg = `Cliente ${clientData.codigo}: ${err.message?.substring(0, 100)}`
          errorDetails.push(msg)
          if (errors <= 5) console.error(`[sync/linvix] ${msg}`)
        }
      }

      // Log progress
      if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= clients.length) {
        console.log(`[sync/linvix] Progresso: ${Math.min(i + BATCH_SIZE, clients.length)}/${clients.length} processados`)
      }
    }

    // Update sync log
    await db.linvixSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: errors > 0 ? (created + updated > 0 ? 'partial' : 'error') : 'success',
        finishedAt: new Date(),
        createdCount: created,
        updatedCount: updated,
        skippedCount: skipped,
        errorCount: errors,
        errorMessage: errorDetails.slice(0, 10).join('\n'),
        durationMs: Date.now() - syncLog.startedAt.getTime(),
      },
    })

    const result = {
      syncLogId: syncLog.id,
      total: clients.length,
      created,
      updated,
      skipped,
      errors,
      errorDetails: errorDetails.slice(0, 20),
    }

    console.log(`[sync/linvix] Resultado:`, result)

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[sync/linvix] Erro geral:', err)
    return NextResponse.json(
      { error: 'Erro na sincronização', details: err.message?.substring(0, 200) },
      { status: 500 }
    )
  }
}
