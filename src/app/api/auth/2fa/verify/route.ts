import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authenticator } from 'otplib'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// Configure TOTP
authenticator.options = { step: 30, window: 1 }

/**
 * POST /api/auth/2fa/verify
 * Verifies a TOTP code and enables 2FA for the user.
 * Also used to verify codes during login (handled by NextAuth authorize).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { code } = await request.json()
    if (!code) {
      return NextResponse.json({ error: 'Código é obrigatório' }, { status: 400 })
    }

    const userId = (session.user as any).id
    const user = await db.user.findUnique({ where: { id: userId } })

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    if (!user.twoFactorSecret) {
      return NextResponse.json({ error: '2FA não configurado. Configure primeiro.' }, { status: 400 })
    }

    const isValid = authenticator.verify({
      token: code,
      secret: user.twoFactorSecret,
    })

    if (!isValid) {
      return NextResponse.json({ error: 'Código inválido' }, { status: 400 })
    }

    // Enable 2FA
    await db.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    })

    return NextResponse.json({ success: true, message: '2FA ativado com sucesso!' })
  } catch (error) {
    console.error('2FA verify error:', error)
    return NextResponse.json(
      { error: 'Erro ao verificar 2FA' },
      { status: 500 }
    )
  }
}
