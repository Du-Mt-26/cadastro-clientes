import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

// ─── POST /api/admin/reset-password ────────────────────
// One-time use endpoint to reset a user's password
// Protected by CRON_SECRET

export async function POST(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { email, newPassword } = body

    if (!email || !newPassword) {
      return NextResponse.json({ error: 'Email e nova senha são obrigatórios' }, { status: 400 })
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
