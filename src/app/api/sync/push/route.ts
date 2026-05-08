import { NextResponse } from 'next/server'
import { getSyncConfig } from '@/lib/google-sheets'

/**
 * POST /api/sync/push — Push data from DB to Google Sheets
 *
 * Push requires write access (Service Account credentials).
 * Currently only reading (pull/import) from public sheets is supported.
 */
export async function POST() {
  try {
    const config = await getSyncConfig()

    if (!config?.connected || !config.spreadsheetId) {
      return NextResponse.json({ error: 'Planilha não conectada. Conecte primeiro.' }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      pushed: 0,
      errors: ['Envio para a planilha requer credenciais de escrita. Atualmente só é possível importar (ler) dados da planilha pública.'],
    })
  } catch (error) {
    console.error('Error pushing to sheet:', error)
    return NextResponse.json({ error: 'Erro ao enviar para a planilha' }, { status: 500 })
  }
}
