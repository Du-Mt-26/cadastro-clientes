import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

interface ParsedFields {
  codigo: string;
  ie_rg: string;
  celular: string;
  fax: string;
  cadastro: string;
  ultima_venda: string;
  reg_simples: string;
  situacao: string;
  vendedor: string;
  [key: string]: string;
}

interface ClienteRecord {
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  cidade: string;
  uf: string;
  situacao_cadastral: string;
  email: string;
  telefone: string;
  parsed: ParsedFields;
}

// Convert Excel serial date number to dd/mm/aaaa string
function excelSerialToDate(serial: string): string {
  if (!serial) return "";
  const num = parseInt(serial, 10);
  if (isNaN(num) || num <= 0) return serial; // return as-is if not a valid serial

  // Excel serial date: Day 1 = Jan 1, 1900 (with leap year bug, effective epoch = Dec 30, 1899)
  const epoch = new Date(1899, 11, 30); // Dec 30, 1899
  const date = new Date(epoch.getTime() + num * 86400000); // add days in ms

  if (isNaN(date.getTime())) return serial; // fallback

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

function parseObservacoes(obs: string): ParsedFields {
  const defaults: ParsedFields = {
    codigo: "",
    ie_rg: "",
    celular: "",
    fax: "",
    cadastro: "",
    ultima_venda: "",
    reg_simples: "",
    situacao: "",
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

  // Convert date fields from Excel serial to dd/mm/aaaa
  defaults.cadastro = excelSerialToDate(defaults.cadastro);
  defaults.ultima_venda = excelSerialToDate(defaults.ultima_venda);

  return defaults;
}

// Cache the parsed data in memory
let cachedRecords: ClienteRecord[] | null = null;
let cachedTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getRecords(): ClienteRecord[] {
  const now = Date.now();
  if (cachedRecords && (now - cachedTimestamp) < CACHE_TTL) {
    return cachedRecords;
  }

  const filePath = path.join(
    process.cwd(),
    "upload",
    "Cadastro de Clientes -Mtech Geral _ Ativos e Inativos_corrigido_2026_04_23_parte_0_de_3.xlsx"
  );

  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData: Record<string, string>[] = XLSX.utils.sheet_to_json(worksheet);

  cachedRecords = rawData.map((row) => ({
    razao_social: row["Razão Social"] || "",
    nome_fantasia: row["Nome Fantasia"] || "",
    cnpj: row["CNPJ"] || "",
    cidade: row["Cidade"] || "",
    uf: row["UF"] || "",
    situacao_cadastral: row["Situação Cadastral"] || "",
    email: row["Email 1"] || "",
    telefone: row["Telefone 1"] || "",
    parsed: parseObservacoes(row["Observações"] || ""),
  }));
  cachedTimestamp = now;

  return cachedRecords;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const search = searchParams.get("search") || "";
    const situacao = searchParams.get("situacao") || "";
    const vendedor = searchParams.get("vendedor") || "";

    const filePath = path.join(
      process.cwd(),
      "upload",
      "Cadastro de Clientes -Mtech Geral _ Ativos e Inativos_corrigido_2026_04_23_parte_0_de_3.xlsx"
    );

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
    }

    const allRecords = getRecords();

    // Apply filters
    let filtered = allRecords;

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.razao_social.toLowerCase().includes(searchLower) ||
          r.nome_fantasia.toLowerCase().includes(searchLower) ||
          r.cnpj.includes(search) ||
          r.parsed.codigo.includes(search) ||
          r.cidade.toLowerCase().includes(searchLower) ||
          r.parsed.vendedor.toLowerCase().includes(searchLower) ||
          r.email.toLowerCase().includes(searchLower)
      );
    }

    if (situacao) {
      filtered = filtered.filter(
        (r) => r.parsed.situacao.toLowerCase() === situacao.toLowerCase()
      );
    }

    if (vendedor) {
      filtered = filtered.filter(
        (r) => r.parsed.vendedor.toLowerCase() === vendedor.toLowerCase()
      );
    }

    // Get unique values for filters
    const uniqueSituacoes = [...new Set(allRecords.map((r) => r.parsed.situacao).filter(Boolean))];
    const uniqueVendedores = [...new Set(allRecords.map((r) => r.parsed.vendedor).filter(Boolean))];

    // Summary stats
    const totalAtivos = allRecords.filter((r) => r.parsed.situacao.toLowerCase() === "ativo").length;
    const totalInativos = allRecords.filter((r) => r.parsed.situacao.toLowerCase() === "inativo").length;

    // Pagination
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paginatedRecords = filtered.slice(start, start + limit);

    return NextResponse.json({
      data: paginatedRecords,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      filters: {
        situacoes: uniqueSituacoes.sort(),
        vendedores: uniqueVendedores.sort(),
      },
      stats: {
        total: allRecords.length,
        ativos: totalAtivos,
        inativos: totalInativos,
      },
    });
  } catch (error) {
    console.error("Error reading XLSX file:", error);
    return NextResponse.json(
      { error: "Erro ao processar o arquivo" },
      { status: 500 }
    );
  }
}
