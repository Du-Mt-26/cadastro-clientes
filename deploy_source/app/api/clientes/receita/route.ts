import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findRecordByCnpj } from "@/lib/clientes-cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // ── Auth check ──
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const cnpj = request.nextUrl.searchParams.get("cnpj") || "";

    // Clean CNPJ - digits only
    const digits = cnpj.replace(/\D/g, "");

    if (digits.length !== 14) {
      return NextResponse.json(
        { error: "CNPJ deve conter 14 dígitos" },
        { status: 400 }
      );
    }

    // Check if CNPJ already exists in cached data (XLSX + DB-created clients)
    const existingRecord = await findRecordByCnpj(digits);

    if (existingRecord) {
      return NextResponse.json({
        exists: true,
        codigo: existingRecord.parsed.codigo,
        razao_social: existingRecord.razao_social,
        source: "planilha",
        message: `Cliente já cadastrado na planilha com código ${existingRecord.parsed.codigo} — ${existingRecord.razao_social}`,
      });
    }

    // Also check DB directly for manually created clients
    const dbExisting = await db.cliente.findFirst({ where: { cnpj: digits } });
    if (dbExisting) {
      return NextResponse.json({
        exists: true,
        codigo: dbExisting.codigo,
        razao_social: dbExisting.razaoSocial,
        source: dbExisting.source === "manual" ? "cadastro_novo" : "planilha",
        message: `Cliente já cadastrado com código ${dbExisting.codigo} — ${dbExisting.razaoSocial}`,
      });
    }

    // Consult ReceitaWS public API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response;
    try {
      response = await fetch(
        `https://receitaws.com.br/v1/cnpj/${digits}`,
        {
          headers: {
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; MtechCadastro/1.0)",
          },
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ReceitaWS error:", response.status, errorText);
      
      if (response.status === 429) {
        return NextResponse.json(
          { error: "Muitas consultas. Aguarde alguns segundos e tente novamente." },
          { status: 429 }
        );
      }
      
      return NextResponse.json(
        { error: `Erro ao consultar ReceitaWS (status ${response.status})` },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.status === "ERROR") {
      return NextResponse.json(
        { error: data.message || "CNPJ não encontrado na Receita" },
        { status: 404 }
      );
    }

    // Map ReceitaWS response to our fields
    const mapped = {
      razao_social: data.nome || "",
      nome_fantasia: data.fantasia || "",
      situacao_cadastral: data.situacao || "",
      cnpj: data.cnpj ? data.cnpj.replace(/[\.\/\-]/g, "") : digits,
      endereco: data.logradouro || "",
      numero: data.numero || "",
      complemento: data.complemento || "",
      bairro: data.bairro || "",
      cidade: data.municipio || "",
      cep: data.cep ? data.cep.replace(/\D/g, "") : "",
      uf: data.uf || "",
      telefone1: data.telefone || "",
      email1: data.email || "",
      data_abertura: data.abertura || "",
      cnae_principal: data.atividade_principal?.[0]?.text || "",
      natureza_juridica: data.natureza_juridica || "",
      porte: data.porte || "",
      cnae_codigo: data.atividade_principal?.[0]?.code || "",
      data_situacao: data.data_situacao || "",
      capital_social: data.capital_social || "",
    };

    return NextResponse.json({ data: mapped, exists: false });
  } catch (error: unknown) {
    console.error("Error consulting ReceitaWS:", error);
    const isTimeout = error instanceof Error && (error.name === "AbortError" || error.message.includes("abort"));
    const message = isTimeout
      ? "Timeout ao consultar a Receita Federal. Tente novamente."
      : "Erro ao consultar a Receita Federal. Verifique sua conexão.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
