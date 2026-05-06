/**
 * Shared cache module for Clientes data.
 *
 * All routes that need access to the client records should use
 * `getRecords()` so that the in-memory cache (and JSON cache file)
 * is reused across requests instead of re-parsing the XLSX every time.
 *
 * This module is server-only (uses fs, path, XLSX, db).
 */

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { db } from "@/lib/db";
import { parseObservacoes, formatDate } from "@/lib/clientes";
import type { ParsedFields, ClienteRecord, EditableFields } from "@/lib/types";

// ---------------------------------------------------------------------------
// Convert a DB ClienteNovo record to ClienteRecord format
// ---------------------------------------------------------------------------

export function dbToRecord(c: {
  id: string;
  codigo: string;
  ieRg: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacaoCadastral: string;
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
  pessoaContato: string;
  dataSituacao: string;
  dataAbertura: string;
  cnaePrincipal: string;
  naturezaJuridica: string;
  porte: string;
  cadastro: string;
  ultimaVenda: string;
  regSimples: string;
  vendedor: string;
}): ClienteRecord {
  return {
    razao_social: c.razaoSocial,
    nome_fantasia: c.nomeFantasia,
    situacao_cadastral: c.situacaoCadastral,
    cnpj: c.cnpj,
    endereco: c.endereco,
    numero: c.numero,
    complemento: c.complemento,
    bairro: c.bairro,
    cidade: c.cidade,
    cep: c.cep,
    uf: c.uf,
    telefone1: c.telefone1,
    telefone2: c.telefone2,
    telefone3: c.telefone3,
    telefone4: c.telefone4,
    email1: c.email1,
    email2: c.email2,
    email3: c.email3,
    pessoa_contato: c.pessoaContato,
    data_situacao: c.dataSituacao,
    data_abertura: c.dataAbertura,
    cnae_principal: c.cnaePrincipal,
    natureza_juridica: c.naturezaJuridica,
    porte: c.porte,
    parsed: {
      codigo: c.codigo,
      ie_rg: c.ieRg,
      celular: "",
      fax: "",
      cadastro: c.cadastro,
      ultima_venda: c.ultimaVenda,
      reg_simples: c.regSimples,
      vendedor: c.vendedor,
    },
    editable: {
      telefone1: c.telefone1,
      telefone2: c.telefone2,
      telefone3: c.telefone3,
      telefone4: c.telefone4,
      email1: c.email1,
      email2: c.email2,
      email3: c.email3,
      pessoaContato: c.pessoaContato,
      observacoes: (c as Record<string, unknown>).observacoes as string || "",
    },
  };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const JSON_CACHE_PATH = path.join(process.cwd(), "upload", "clientes_cache.json");
const XLSX_FILE_PATH = path.join(
  process.cwd(),
  "upload",
  "Cadastro de Clientes -Mtech Geral _ Ativos e Inativos_corrigido_2026_04_23_parte_0_de_3.xlsx"
);

/** In-memory cache — never expire, invalidate on write */
let cachedRecords: ClienteRecord[] | null = null;

/**
 * Load all client records.
 *
 * 1. Return in-memory cache if available.
 * 2. Otherwise try the JSON cache file (much faster than XLSX parse).
 * 3. Fall back to parsing the XLSX file.
 * 4. Merge DB edits (ClienteEdit) and new clients (ClienteNovo).
 */
export async function getRecords(): Promise<ClienteRecord[]> {
  if (cachedRecords) return cachedRecords;

  // Try JSON cache first (much faster, less memory than XLSX parse)
  let rawData: Record<string, string>[];

  if (fs.existsSync(JSON_CACHE_PATH)) {
    rawData = JSON.parse(fs.readFileSync(JSON_CACHE_PATH, "utf-8"));
  } else {
    // Fallback to XLSX parse
    const fileBuffer = fs.readFileSync(XLSX_FILE_PATH);
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    rawData = XLSX.utils.sheet_to_json(worksheet);
  }

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
          observacoes: edit?.observacoes || "",
        },
      };
    })
    .filter((r) => r.parsed.codigo !== "000000");

  // Also load new clients from DB
  const novos = await db.clienteNovo.findMany();
  const novoRecords = novos.map(dbToRecord);
  cachedRecords = [...cachedRecords, ...novoRecords];

  return cachedRecords;
}

/**
 * Invalidate the in-memory cache.
 *
 * Call this after any write operation (POST, PATCH) so that the next
 * `getRecords()` call re-reads from the JSON cache / XLSX + DB.
 */
export function invalidateCache(): void {
  cachedRecords = null;
}

/**
 * Find a record by CNPJ (digits only) from the cached records.
 *
 * Returns `undefined` if not found.
 */
export async function findRecordByCnpj(cnpj: string): Promise<ClienteRecord | undefined> {
  const records = await getRecords();
  const digits = cnpj.replace(/\D/g, "");
  return records.find((r) => r.cnpj.replace(/\D/g, "") === digits);
}
