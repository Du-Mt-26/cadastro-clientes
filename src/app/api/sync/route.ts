import { NextRequest, NextResponse } from 'next/server'
import {
  parseFlexibleUrl,
  connectToSheet,
  saveSyncConfig,
  getSyncConfig,
  hasCredentials,
  getServiceAccountEmail,
} from '@/lib/google-sheets'

/**
 * GET /api/sync — Get current sync status and configuration
 */
export async function GET() {
  try {
    const config = await getSyncConfig()
    const credentialsConfigured = hasCredentials()
    const serviceEmail = getServiceAccountEmail()

    return NextResponse.json({
      configured: !!config,
      connected: config?.connected || false,
      credentialsConfigured,
      serviceEmail,
      config: config ? {
        id: config.id,
        sheetsUrl: config.sheetsUrl,
        spreadsheetId: config.spreadsheetId,
        sheetName: config.sheetName,
        connected: config.connected,
        headerRow: config.headerRow,
        syncMode: config.syncMode,
        autoSync: config.autoSync,
        autoSyncMinutes: config.autoSyncMinutes,
        lastSyncAt: config.lastSyncAt,
        lastSyncStatus: config.lastSyncStatus,
        lastSyncCount: config.lastSyncCount,
        lastSyncError: config.lastSyncError,
      } : null,
    })
  } catch (error) {
    console.error('Error getting sync config:', error)
    return NextResponse.json({ error: 'Erro ao buscar configuração de sync' }, { status: 500 })
  }
}

/**
 * POST /api/sync — Connect to a Google Sheet by URL
 *
 * Body: { url: string, sheetName?: string, headerRow?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url } = body

    if (!url) {
      return NextResponse.json({ error: 'URL é obrigatória' }, { status: 400 })
    }

    // Parse URL (handles shortened URLs too)
    const parsed = await parseFlexibleUrl(url)

    if (!parsed) {
      return NextResponse.json({
        error: 'URL inválida. Use uma URL do Google Sheets como: https://docs.google.com/spreadsheets/d/.../edit',
      }, { status: 400 })
    }

    // Try to connect
    const result = await connectToSheet(parsed.spreadsheetId)

    if (!result.success) {
      // Save as disconnected config
      await saveSyncConfig({
        sheetsUrl: url,
        spreadsheetId: parsed.spreadsheetId,
        sheetName: '',
        connected: false,
      })

      return NextResponse.json({
        success: false,
        error: result.error,
        spreadsheetId: parsed.spreadsheetId,
      }, { status: 400 })
    }

    // Save connected config
    await saveSyncConfig({
      sheetsUrl: url,
      spreadsheetId: parsed.spreadsheetId,
      sheetName: result.sheetName,
      connected: true,
      headerRow: body.headerRow || 1,
    })

    return NextResponse.json({
      success: true,
      spreadsheetId: parsed.spreadsheetId,
      title: result.title,
      sheetName: result.sheetName,
      rowCount: result.rowCount,
      headers: result.headers,
    })
  } catch (error) {
    console.error('Error connecting to sheet:', error)
    return NextResponse.json({ error: 'Erro ao conectar à planilha' }, { status: 500 })
  }
}

/**
 * DELETE /api/sync — Disconnect from Google Sheets
 */
export async function DELETE() {
  try {
    const config = await getSyncConfig()
    if (config) {
      await saveSyncConfig({
        sheetsUrl: '',
        spreadsheetId: '',
        sheetName: '',
        connected: false,
      })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error disconnecting:', error)
    return NextResponse.json({ error: 'Erro ao desconectar' }, { status: 500 })
  }
}
