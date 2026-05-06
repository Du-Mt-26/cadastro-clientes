import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
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
