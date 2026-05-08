import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// Configure TOTP
authenticator.options = { step: 30, window: 1 }

/**
 * POST /api/auth/2fa/setup
 * Generates a TOTP secret and QR code for the current user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const secret = authenticator.generateSecret()

    // Save secret to DB (but don't enable 2FA yet — user must verify first)
    await db.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    })

    // Generate QR code
    const otpauth = authenticator.keyuri(
      session.user.email || '',
      'Mtech Cadastro',
      secret
    )

    const qrCodeDataUrl = await QRCode.toDataURL(otpauth)

    return NextResponse.json({
      secret,
      qrCode: qrCodeDataUrl,
    })
  } catch (error) {
    console.error('2FA setup error:', error)
    return NextResponse.json(
      { error: 'Erro ao configurar 2FA' },
      { status: 500 }
    )
  }
}
