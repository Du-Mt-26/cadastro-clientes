import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { db } from "@/lib/db";

// All parsed fields from Observações column
interface ParsedFields {
  codigo: string;
  ie_rg: string;
  celular: string;
  fax: string;
  cadastro: string;
  ultima_venda: string;
  reg_simples: string;
  vendedor: string;
  [key: string]: string;
}

// Full record with ALL columns from the spreadsheet
interface ClienteRecord {
  razao_social: string;
  nome_fantasia: string;
  situacao_cadastral: string;
  cnpj: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  cep: string;
  uf: string;
  telefone1: string;
  telefone2: string;
  telefone3: string;
  telefone4: string;
  email1: string;
  email2: string;
  email3: string;
  pessoa_contato: string;
  data_situacao: string;
  data_abertura: string;
  cnae_principal: string;
  natureza_juridica: string;
  porte: string;
  parsed: ParsedFields;
  editable: {
    telefone1: string;
    telefone2: string;
    telefone3: string;
    telefone4: string;
    email1: string;
    email2: string;
    email3: string;
    pessoaContato: string;
  };
}

// Convert Excel serial date number to dd/mm/aaaa string
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

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return dateStr;
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

// Cache the parsed data in memory
let cachedRecords: ClienteRecord[] | null = null;
let cachedTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getRecords(): Promise<ClienteRecord[]> {
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

  // Load all editable fields from DB
  const edits = await db.clienteEdit.findMany();
  const editMap = new Map(edits.map((e) => [e.codigo, e]));

  cachedRecords = rawData
    .map((row) => {
      const parsed = parseObservacoes(row["Observações"] || "");
      const edit = editMap.get(parsed.codigo);
      return {
        razao_social: row["Razão Social"] || "",
        nome_fantasia: row["Nome Fantasia"] || "",
        situacao_cadastral: row["Situação Cadastral"] || "",
        cnpj: row["CNPJ"] || "",
        endereco: row["Endereço Rua/Avenida"] || "",
        numero: row["Numero"] || "",
        complemento: row["Complemento"] || "",
        bairro: row["Bairro"] || "",
        cidade: row["Cidade"] || "",
        cep: row["CEP"] || "",
        uf: row["UF"] || "",
        telefone1: edit?.telefone1 || row["Telefone 1"] || "",
        telefone2: edit?.telefone2 || row["Telefone 2"] || "",
        telefone3: edit?.telefone3 || parsed.celular || "",
        telefone4: edit?.telefone4 || parsed.fax || "",
        email1: edit?.email1 || row["Email 1"] || "",
        email2: edit?.email2 || "",
        email3: edit?.email3 || "",
        pessoa_contato: edit?.pessoaContato || row["Pessoa de contato"] || "",
        data_situacao: formatDate(row["Data Situação"] || ""),
        data_abertura: formatDate(row["Data Abertura"] || ""),
        cnae_principal: row["CNAE Principal"] || "",
        natureza_juridica: row["Natureza Jurídica"] || "",
        porte: row["Porte"] || "",
        parsed,
        editable: {
          telefone1: edit?.telefone1 || "",
          telefone2: edit?.telefone2 || "",
          telefone3: edit?.telefone3 || "",
          telefone4: edit?.telefone4 || "",
          email1: edit?.email1 || "",
          email2: edit?.email2 || "",
          email3: edit?.email3 || "",
          pessoaContato: edit?.pessoaContato || "",
        },
      };
    })
    .filter((r) => r.parsed.codigo !== "000000");
  cachedTimestamp = now;

  return cachedRecords;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const search = searchParams.get("search") || "";
    const situacaoCadastral = searchParams.get("situacao_cadastral") || "";
    const vendedor = searchParams.get("vendedor") || "";

    const filePath = path.join(
      process.cwd(),
      "upload",
      "Cadastro de Clientes -Mtech Geral _ Ativos e Inativos_corrigido_2026_04_23_parte_0_de_3.xlsx"
    );

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
    }

    const allRecords = await getRecords();

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
          r.email1.toLowerCase().includes(searchLower) ||
          r.bairro.toLowerCase().includes(searchLower) ||
          r.uf.toLowerCase().includes(searchLower)
      );
    }

    if (situacaoCadastral) {
      filtered = filtered.filter(
        (r) => r.situacao_cadastral.toLowerCase() === situacaoCadastral.toLowerCase()
      );
    }

    if (vendedor) {
      filtered = filtered.filter(
        (r) => r.parsed.vendedor.toLowerCase() === vendedor.toLowerCase()
      );
    }

    // Get unique values for filters
    const uniqueSituacaoCadastral = [...new Set(allRecords.map((r) => r.situacao_cadastral).filter(Boolean))];
    const uniqueVendedores = [...new Set(allRecords.map((r) => r.parsed.vendedor).filter(Boolean))];

    // Summary stats
    const situacaoCadastralStats: Record<string, number> = {};
    for (const r of allRecords) {
      const key = r.situacao_cadastral || "Sem info";
      situacaoCadastralStats[key] = (situacaoCadastralStats[key] || 0) + 1;
    }

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
        situacao_cadastral: uniqueSituacaoCadastral.sort(),
        vendedores: uniqueVendedores.sort(),
      },
      stats: {
        total: allRecords.length,
        situacao_cadastral: situacaoCadastralStats,
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

// PATCH - Save editable fields for a client
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { codigo, telefone1, telefone2, telefone3, telefone4, email1, email2, email3, pessoaContato } = body;

    if (!codigo) {
      return NextResponse.json({ error: "Código é obrigatório" }, { status: 400 });
    }

    const edit = await db.clienteEdit.upsert({
      where: { codigo },
      update: {
        telefone1: telefone1 ?? undefined,
        telefone2: telefone2 ?? undefined,
        telefone3: telefone3 ?? undefined,
        telefone4: telefone4 ?? undefined,
        email1: email1 ?? undefined,
        email2: email2 ?? undefined,
        email3: email3 ?? undefined,
        pessoaContato: pessoaContato ?? undefined,
      },
      create: {
        codigo,
        telefone1: telefone1 || "",
        telefone2: telefone2 || "",
        telefone3: telefone3 || "",
        telefone4: telefone4 || "",
        email1: email1 || "",
        email2: email2 || "",
        email3: email3 || "",
        pessoaContato: pessoaContato || "",
      },
    });

    // Invalidate cache so next read picks up changes
    cachedRecords = null;

    return NextResponse.json({ success: true, edit });
  } catch (error) {
    console.error("Error saving edit:", error);
    return NextResponse.json(
      { error: "Erro ao salvar edição" },
      { status: 500 }
    );
  }
}
