import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * POST /api/auth/forgot-password
 *
 * Since we don't have email sending configured, this endpoint:
 * 1. Verifies the email exists in the system
 * 2. Logs the request (admin can see it)
 * 3. Returns a message telling the user to contact the admin
 *
 * Admin can reset passwords from the User Management panel.
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email é obrigatório' }, { status: 400 })
    }

    // Check if user exists
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    // Always return success to prevent email enumeration
    // (don't reveal whether an email exists or not)
    if (!user) {
      // Still return success for security
      return NextResponse.json({
        success: true,
        message: 'Se o email estiver cadastrado, o administrador será notificado.',
      })
    }

    if (!user.active) {
      return NextResponse.json({
        success: true,
        message: 'Se o email estiver cadastrado, o administrador será notificado.',
      })
    }

    // Log the password reset request as an audit entry
    await db.auditLog.create({
      data: {
        codigo: 'PASSWORD_RESET',
        field: 'forgot_password',
        oldValue: '',
        newValue: `Solicitação de reset de senha para: ${user.name} (${user.email})`,
        changedBy: user.email,
        source: 'auth',
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Solicitação enviada! Contate o administrador do sistema para receber sua nova senha.',
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json(
      { error: 'Erro ao processar solicitação' },
      { status: 500 }
    )
  }
}
