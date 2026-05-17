import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

// ─── POST /api/admin/reset-password ────────────────────
// Temporary endpoint to reset a user's password
// Will be removed after use

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, newPassword, secret } = body

    if (!email || !newPassword || !secret) {
      return NextResponse.json({ error: 'Email, nova senha e secret são obrigatórios' }, { status: 400 })
    }

    // Simple secret check (not CRON_SECRET, just a hardcoded value for one-time use)
    if (secret !== 'mtech-reset-2026') {
      return NextResponse.json({ error: 'Secret inválido' }, { status: 401 })
    }

    const user = await db.user.findFirst({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const hash = await bcrypt.hash(newPassword, 10)
    await db.user.update({
      where: { id: user.id },
      data: { password: hash },
    })

    return NextResponse.json({ success: true, message: `Senha atualizada para ${user.name}` })
  } catch (error) {
    console.error('Error resetting password:', error)
    return NextResponse.json({ error: 'Erro ao resetar senha' }, { status: 500 })
  }
}
