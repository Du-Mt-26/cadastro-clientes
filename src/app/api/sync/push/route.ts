import { NextResponse } from 'next/server'
import {
  pushToSheet,
  getSyncConfig,
  updateSyncStatus,
} from '@/lib/google-sheets'

/**
 * POST /api/sync/push — Push data from DB to Google Sheets
 */
export async function POST() {
  try {
    const config = await getSyncConfig()

    if (!config?.connected || !config.spreadsheetId) {
      return NextResponse.json({ error: 'Planilha não conectada. Conecte primeiro.' }, { status: 400 })
    }

    const result = await pushToSheet(config.spreadsheetId, config.sheetName, config.headerRow)

    // Update sync status
    await updateSyncStatus(config.id, result)

    return NextResponse.json({
      success: result.success,
      pushed: result.pushed,
      errors: result.errors,
    })
  } catch (error) {
    console.error('Error pushing to sheet:', error)
    return NextResponse.json({ error: 'Erro ao enviar para a planilha' }, { status: 500 })
  }
}
