import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

const MAX_FAVORITES = 50;

// GET /api/clientes/favoritos — list user's favorites
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const favorites = await db.favorite.findMany({
    where: { userId },
    orderBy: { ordem: 'asc' },
    select: { codigo: true, ordem: true },
  });

  return NextResponse.json({ data: favorites.map(f => f.codigo) });
}

// POST /api/clientes/favoritos — toggle favorite
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const body = await req.json();
  const { codigo, action } = body as { codigo: string; action: 'add' | 'remove' };

  if (!codigo) {
    return NextResponse.json({ error: 'Código é obrigatório' }, { status: 400 });
  }

  if (action === 'remove') {
    await db.favorite.deleteMany({
      where: { userId, codigo },
    });
    // Re-order remaining favorites
    const remaining = await db.favorite.findMany({
      where: { userId },
      orderBy: { ordem: 'asc' },
    });
    for (let i = 0; i < remaining.length; i++) {
      await db.favorite.update({
        where: { id: remaining[i].id },
        data: { ordem: i },
      });
    }
    return NextResponse.json({ ok: true, favorited: false });
  }

  // action === 'add'
  const existing = await db.favorite.findUnique({
    where: { userId_codigo: { userId, codigo } },
  });

  if (existing) {
    // Already favorited — toggle off
    await db.favorite.delete({ where: { id: existing.id } });
    // Re-order remaining
    const remaining = await db.favorite.findMany({
      where: { userId },
      orderBy: { ordem: 'asc' },
    });
    for (let i = 0; i < remaining.length; i++) {
      await db.favorite.update({
        where: { id: remaining[i].id },
        data: { ordem: i },
      });
    }
    return NextResponse.json({ ok: true, favorited: false });
  }

  // Check limit
  const count = await db.favorite.count({
    where: { userId },
  });

  if (count >= MAX_FAVORITES) {
    return NextResponse.json({ error: `Limite de ${MAX_FAVORITES} favoritos atingido` }, { status: 400 });
  }

  // Add favorite
  await db.favorite.create({
    data: {
      userId,
      codigo,
      ordem: count, // Add at the end
    },
  });

  return NextResponse.json({ ok: true, favorited: true });
}
