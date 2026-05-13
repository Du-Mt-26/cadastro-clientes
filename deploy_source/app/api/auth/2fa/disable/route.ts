import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authenticator } from 'otplib'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

authenticator.options = { step: 30, window: 1 }

/**
 * POST /api/auth/2fa/disable
 * Disables 2FA for the current user (requires current 2FA code to confirm).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { code } = await request.json()
    if (!code) {
      return NextResponse.json({ error: 'Código 2FA é obrigatório para desativar' }, { status: 400 })
    }

    const userId = (session.user as any).id
    const user = await db.user.findUnique({ where: { id: userId } })

    if (!user?.twoFactorSecret) {
      return NextResponse.json({ error: '2FA não está configurado' }, { status: 400 })
    }

    const isValid = authenticator.verify({
      token: code,
      secret: user.twoFactorSecret,
    })

    if (!isValid) {
      return NextResponse.json({ error: 'Código 2FA inválido' }, { status: 400 })
    }

    await db.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    })

    return NextResponse.json({ success: true, message: '2FA desativado' })
  } catch (error) {
    console.error('2FA disable error:', error)
    return NextResponse.json({ error: 'Erro ao desativar 2FA' }, { status: 500 })
  }
}
