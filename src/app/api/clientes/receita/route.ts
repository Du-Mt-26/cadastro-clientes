import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const cnpj = request.nextUrl.searchParams.get("cnpj") || "";

    // Clean CNPJ - digits only
    const digits = cnpj.replace(/\D/g, "");

    if (digits.length !== 14) {
      return NextResponse.json(
        { error: "CNPJ deve conter 14 dígitos" },
        { status: 400 }
      );
    }

    // Consult ReceitaWS public API
    const response = await fetch(
      `https://receitaws.com.br/v1/cnpj/${digits}`,
      {
        headers: {
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(15000), // 15s timeout
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ReceitaWS error:", response.status, errorText);
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
      // CNAE code
      cnae_codigo: data.atividade_principal?.[0]?.code || "",
      // Additional info
      data_situacao: data.data_situacao || "",
      // Secondary activities
      atividades_secundarias: data.atividades_secundarias || [],
      // Capital social
      capital_social: data.capital_social || "",
      // Quadro societário
      qsa: data.qsa || [],
    };

    return NextResponse.json({ data: mapped });
  } catch (error: unknown) {
    console.error("Error consulting ReceitaWS:", error);
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "Timeout ao consultar a Receita Federal. Tente novamente."
        : "Erro ao consultar a Receita Federal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
