import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { db } from "@/lib/db";

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

    // Check if CNPJ already exists in XLSX data
    let existsInXlsx = false;
    let existingCodigo = "";
    let existingRazao = "";
    try {
      const filePath = path.join(
        process.cwd(),
        "upload",
        "Cadastro de Clientes -Mtech Geral _ Ativos e Inativos_corrigido_2026_04_23_parte_0_de_3.xlsx"
      );
      if (fs.existsSync(filePath)) {
        const fileBuffer = fs.readFileSync(filePath);
        const workbook = XLSX.read(fileBuffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData: Record<string, string>[] = XLSX.utils.sheet_to_json(worksheet);

        for (const row of rawData) {
          const rowCnpj = (row["CNPJ"] || "").replace(/\D/g, "");
          if (rowCnpj === digits) {
            existsInXlsx = true;
            // Parse observações for codigo
            const obs = row["Observações"] || "";
            const codigoMatch = obs.match(/codigo:\s*([^;]+)/i);
            existingCodigo = codigoMatch ? codigoMatch[1].trim() : "";
            existingRazao = row["Razão Social"] || "";
            break;
          }
        }
      }
    } catch (e) {
      console.error("Error checking XLSX:", e);
    }

    // Check if CNPJ already exists in DB (ClienteNovo)
    let existsInDb = false;
    let dbCodigo = "";
    let dbRazao = "";
    try {
      const existing = await db.clienteNovo.findUnique({ where: { cnpj: digits } });
      if (existing) {
        existsInDb = true;
        dbCodigo = existing.codigo;
        dbRazao = existing.razaoSocial;
      }
    } catch (e) {
      console.error("Error checking DB:", e);
    }

    if (existsInXlsx || existsInDb) {
      return NextResponse.json({
        exists: true,
        codigo: existsInXlsx ? existingCodigo : dbCodigo,
        razao_social: existsInXlsx ? existingRazao : dbRazao,
        source: existsInXlsx ? "planilha" : "cadastro_novo",
        message: `Cliente já cadastrado${existsInXlsx ? " na planilha" : ""} com código ${existsInXlsx ? existingCodigo : dbCodigo} — ${existsInXlsx ? existingRazao : dbRazao}`,
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
