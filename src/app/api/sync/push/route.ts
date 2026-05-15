import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, type Role } from '@/lib/auth'
import { getSyncConfig, pushToSheet, updateSyncStatus } from '@/lib/google-sheets'

/**
 * POST /api/sync/push — Push data from DB to Google Sheets
 *
 * Writes all client data to the connected Google Sheet with columns
 * in the same order as displayed on the site.
 *
 * Requires:
 *  - Connected sheet (via /api/sync POST)
 *  - Service Account credentials (GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY)
 *  - Sheet shared with the Service Account email (Editor permission)
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const role = (session.user as any).role as Role
    if (role !== 'ADMIN' && role !== 'DIRETOR_COMERCIAL' && role !== 'GERENTE_COMERCIAL') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const config = await getSyncConfig()

    if (!config?.connected || !config.spreadsheetId) {
      return NextResponse.json({ error: 'Planilha não conectada. Conecte primeiro.' }, { status: 400 })
    }

    const gidMatch = config.sheetsUrl?.match(/[#&]gid=(\d+)/)
    const gid = gidMatch?.[1]

    const result = await pushToSheet(config.spreadsheetId, config.sheetName, gid)

    await updateSyncStatus(config.id, result)

    if (result.success) {
      return NextResponse.json({
        success: true,
        pushed: result.pushed,
        errors: [],
      })
    }

    return NextResponse.json({
      success: false,
      pushed: 0,
      errors: result.errors,
    }, { status: 400 })
  } catch (error) {
    console.error('Error pushing to sheet:', error)
    return NextResponse.json({ error: 'Erro ao enviar para a planilha' }, { status: 500 })
  }
}
