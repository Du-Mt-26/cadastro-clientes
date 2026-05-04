import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { db } from "@/lib/db";

function excelSerialToDate(serial: string): string {
  if (!serial) return "";
  const num = parseInt(serial, 10);
  if (isNaN(num) || num <= 0) return serial;
  const epoch = new Date(1899, 11, 30);
  const date = new Date(epoch.getTime() + num * 86400000);
  if (isNaN(date.getTime())) return serial;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Phone formatting for export
function formatPhone(raw: string): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0800") && digits.length >= 11) {
    return `0800-${digits.slice(4, 7)}-${digits.slice(7, 11)}`;
  }
  if (digits.startsWith("0800") && digits.length >= 7) {
    return `0800-${digits.slice(4, 7)}`;
  }
  if (digits.length === 11 && digits[2] === "9") {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length === 9 && digits[0] === "9") {
    return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
  }
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}`;
  }
  return raw;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return dateStr;
}

function parseObservacoes(obs: string): Record<string, string> {
  const defaults: Record<string, string> = {
    codigo: "",
    ie_rg: "",
    celular: "",
    fax: "",
    cadastro: "",
    ultima_venda: "",
    reg_simples: "",
    vendedor: "",
  };

  if (!obs) return defaults;

  const pairs = obs.split(";").map((s) => s.trim()).filter(Boolean);
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) continue;
    const key = pair.substring(0, colonIdx).trim().toLowerCase().replace(/\s+/g, "_");
    const value = pair.substring(colonIdx + 1).trim();
    if (key in defaults) {
      defaults[key] = value;
    }
  }

  defaults.cadastro = excelSerialToDate(defaults.cadastro);
  defaults.ultima_venda = excelSerialToDate(defaults.ultima_venda);

  return defaults;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const situacaoCadastral = searchParams.get("situacao_cadastral") || "";
    const vendedor = searchParams.get("vendedor") || "";
    const sortBy = searchParams.get("sort_by") || "";
    const sortOrder = searchParams.get("sort_order") || "asc";

    const filePath = path.join(
      process.cwd(),
      "upload",
      "Cadastro de Clientes -Mtech Geral _ Ativos e Inativos_corrigido_2026_04_23_parte_0_de_3.xlsx"
    );

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData: Record<string, string>[] = XLSX.utils.sheet_to_json(worksheet);

    // Load editable fields from DB
    const edits = await db.clienteEdit.findMany();
    const editMap = new Map(edits.map((e) => [e.codigo, e]));

    const allRecords = rawData
      .map((row) => {
        const parsed = parseObservacoes(row["Observações"] || "");
        const edit = editMap.get(parsed.codigo);
        return {
          "Código": parsed.codigo,
          "IE/RG": parsed.ie_rg,
          "Razão Social": row["Razão Social"] || "",
          "Nome Fantasia": row["Nome Fantasia"] || "",
          "Situação Cadastral": row["Situação Cadastral"] || "",
          "CNPJ": row["CNPJ"] || "",
          "Endereço Rua/Avenida": row["Endereço Rua/Avenida"] || "",
          "Numero": row["Numero"] || "",
          "Complemento": row["Complemento"] || "",
          "Bairro": row["Bairro"] || "",
          "Cidade": row["Cidade"] || "",
          "CEP": row["CEP"] || "",
          "UF": row["UF"] || "",
          "Telefone 1": formatPhone(edit?.telefone1 || row["Telefone 1"] || ""),
          "Telefone 2": formatPhone(edit?.telefone2 || row["Telefone 2"] || ""),
          "Telefone 3": formatPhone(edit?.telefone3 || parsed.celular || ""),
          "Telefone 4": formatPhone(edit?.telefone4 || parsed.fax || ""),
          "Email 1": edit?.email1 || row["Email 1"] || "",
          "Email 2": edit?.email2 || "",
          "Email 3": edit?.email3 || "",
          "Pessoa de contato": edit?.pessoaContato || row["Pessoa de contato"] || "",
          "Data Situação": formatDate(row["Data Situação"] || ""),
          "Data Abertura": formatDate(row["Data Abertura"] || ""),
          "CNAE Principal": row["CNAE Principal"] || "",
          "Natureza Jurídica": row["Natureza Jurídica"] || "",
          "Porte": row["Porte"] || "",
          "Cadastro": parsed.cadastro,
          "Última Venda": parsed.ultima_venda,
          "Reg. Simples": parsed.reg_simples,
          "Vendedor": parsed.vendedor,
        };
      })
      .filter((r) => r["Código"] !== "000000");

    // Apply filters
    let filtered = allRecords;

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r["Razão Social"].toLowerCase().includes(searchLower) ||
          r["Nome Fantasia"].toLowerCase().includes(searchLower) ||
          r["CNPJ"].includes(search) ||
          r["Código"].includes(search) ||
          r["Cidade"].toLowerCase().includes(searchLower) ||
          r["Vendedor"].toLowerCase().includes(searchLower) ||
          r["Email 1"].toLowerCase().includes(searchLower)
      );
    }

    if (situacaoCadastral) {
      filtered = filtered.filter(
        (r) => r["Situação Cadastral"].toLowerCase() === situacaoCadastral.toLowerCase()
      );
    }

    if (vendedor) {
      filtered = filtered.filter(
        (r) => r["Vendedor"].toLowerCase() === vendedor.toLowerCase()
      );
    }

    // Sorting
    if (sortBy) {
      const columnMap: Record<string, string> = {
        codigo: "Código",
        ie_rg: "IE/RG",
        razao_social: "Razão Social",
        nome_fantasia: "Nome Fantasia",
        situacao_cadastral: "Situação Cadastral",
        cnpj: "CNPJ",
        endereco: "Endereço Rua/Avenida",
        numero: "Numero",
        complemento: "Complemento",
        bairro: "Bairro",
        cidade: "Cidade",
        cep: "CEP",
        uf: "UF",
        telefone1: "Telefone 1",
        telefone2: "Telefone 2",
        telefone3: "Telefone 3",
        telefone4: "Telefone 4",
        email1: "Email 1",
        email2: "Email 2",
        email3: "Email 3",
        pessoa_contato: "Pessoa de contato",
        data_situacao: "Data Situação",
        data_abertura: "Data Abertura",
        cnae_principal: "CNAE Principal",
        natureza_juridica: "Natureza Jurídica",
        porte: "Porte",
        cadastro: "Cadastro",
        ultima_venda: "Última Venda",
        reg_simples: "Reg. Simples",
        vendedor: "Vendedor",
      };
      const colName = columnMap[sortBy] || "";
      if (colName) {
        filtered = [...filtered].sort((a, b) => {
          const valA = (a[colName as keyof typeof a] || "").toLowerCase();
          const valB = (b[colName as keyof typeof b] || "").toLowerCase();
          const cmp = valA.localeCompare(valB, "pt-BR");
          return sortOrder === "desc" ? -cmp : cmp;
        });
      }
    }

    // Create new workbook
    const newWorkbook = XLSX.utils.book_new();
    const newWorksheet = XLSX.utils.json_to_sheet(filtered);

    // Auto-size columns
    const colWidths = Object.keys(filtered[0] || {}).map((key) => {
      const maxLen = Math.max(
        key.length,
        ...filtered.map((r) => String(r[key as keyof typeof r] || "").length)
      );
      return { wch: Math.min(maxLen + 2, 50) };
    });
    newWorksheet["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, "Cadastro de Clientes");

    const outputBuffer = XLSX.write(newWorkbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Cadastro_Clientes_Mtech_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error exporting XLSX:", error);
    return NextResponse.json(
      { error: "Erro ao exportar o arquivo" },
      { status: 500 }
    );
  }
}
