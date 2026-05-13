import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions, type Role } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // ── Auth check ──
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const role = (session.user as any).role as Role;

    // Only ADMIN, DIRETOR_COMERCIAL, and GERENTE_COMERCIAL can view audit logs
    if (role !== "ADMIN" && role !== "DIRETOR_COMERCIAL" && role !== "GERENTE_COMERCIAL") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const codigo = request.nextUrl.searchParams.get("codigo");
    if (!codigo) {
      return NextResponse.json({ error: "Código é obrigatório" }, { status: 400 });
    }

    const logs = await db.auditLog.findMany({
      where: { codigo },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ data: logs });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return NextResponse.json({ error: "Erro ao buscar logs" }, { status: 500 });
  }
}
