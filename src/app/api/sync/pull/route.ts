import { NextResponse } from 'next/server'
import {
  pullFromSheet,
  getSyncConfig,
  updateSyncStatus,
} from '@/lib/google-sheets'
import { invalidateCache } from '@/lib/clientes-cache'

/**
 * POST /api/sync/pull — Pull data from Google Sheets to DB
 */
export async function POST() {
  try {
    const config = await getSyncConfig()

    if (!config?.connected || !config.spreadsheetId) {
      return NextResponse.json({ error: 'Planilha não conectada. Conecte primeiro.' }, { status: 400 })
    }

    const result = await pullFromSheet(config.spreadsheetId, config.sheetName, config.headerRow)

    // Update sync status
    await updateSyncStatus(config.id, result)

    // Invalidate main data cache so sheets records appear in the table
    invalidateCache()

    return NextResponse.json({
      success: result.success,
      pulled: result.pulled,
      created: result.created,
      updated: result.updated,
      errors: result.errors,
    })
  } catch (error) {
    console.error('Error pulling from sheet:', error)
    return NextResponse.json({ error: 'Erro ao importar da planilha' }, { status: 500 })
  }
}
