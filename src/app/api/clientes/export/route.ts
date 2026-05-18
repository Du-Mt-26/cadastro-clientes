import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { formatPhone, calcDiasSemVenda } from "@/lib/clientes";
import { dbToRecord } from "@/lib/clientes-cache";
import { db } from "@/lib/db";

/** Format CNPJ (14 digits) or CPF (11 digits) for export */
function formatDocumento(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  return raw
}
import { getServerSession } from "next-auth";
import { authOptions, canSeeListaFria, canSeeFornecedor, CARTEIRA_LABELS, type Role } from "@/lib/auth";
import {
  buildVisibilityWhere,
  buildFilterWhere,
  buildSearchWhere,
  combineWhere,
} from "@/lib/clientes-api-helpers";
import type { ClienteRecord } from "@/lib/types";

/**
 * Column definitions for export — matches the exact column order shown on the site
 * (DEFAULT_COLUMNS from types.ts), including "Observações" and "Dias S/ Venda".
 */
const EXPORT_COLUMNS: { key: string; label: string; value: (r: ClienteRecord) => string }[] = [
  { key: 'codigo',            label: 'Código',            value: r => r.parsed.codigo },
  { key: 'razao_social',      label: 'Razão Social',      value: r => r.razao_social },
  { key: 'cnpj',              label: 'CNPJ/CPF',          value: r => formatDocumento(r.cnpj) },
  { key: 'dias_sem_venda',    label: 'Dias S/ Venda',     value: r => { const d = calcDiasSemVenda(r.parsed.ultima_venda); return d !== null ? String(d) : '' } },
  { key: 'pessoa_contato',    label: 'Contato',           value: r => r.pessoa_contato },
  { key: 'telefone1',         label: 'Tel. 1',            value: r => formatPhone(r.telefone1) },
  { key: 'telefone2',         label: 'Tel. 2',            value: r => formatPhone(r.telefone2) },
  { key: 'whatsapp',          label: 'WhatsApp',          value: r => formatPhone(r.whatsapp) },
  { key: 'email1',            label: 'Email 1',           value: r => r.email1 },
  { key: 'email2',            label: 'Email 2',           value: r => r.email2 },
  { key: 'email3',            label: 'Email 3',           value: r => r.email3 },
  { key: 'vendedor',          label: 'Vendedora',         value: r => r.parsed.vendedor },
  { key: 'tipo',              label: 'Tipo',              value: r => r.tipo },
  { key: 'carteira',          label: 'Carteira',          value: r => CARTEIRA_LABELS[r.carteira] || r.carteira },
  { key: 'situacao_cadastral', label: 'Sit. Cadastral',  value: r => r.situacao_cadastral },
  { key: 'nome_fantasia',     label: 'Nome Fantasia',     value: r => r.nome_fantasia },
  { key: 'ie_rg',             label: 'IE/RG',             value: r => r.parsed.ie_rg },
  { key: 'reg_simples',       label: 'Reg. Simples',      value: r => r.parsed.reg_simples },
  { key: 'observacoes',       label: 'Observações',       value: r => r.editable.observacoes },
  { key: 'telefone4',         label: 'Tel. 4',            value: r => formatPhone(r.telefone4) },
  { key: 'endereco',          label: 'Endereço',          value: r => r.endereco },
  { key: 'numero',            label: 'Número',            value: r => r.numero },
  { key: 'complemento',       label: 'Complemento',       value: r => r.complemento },
  { key: 'bairro',            label: 'Bairro',            value: r => r.bairro },
  { key: 'cidade',            label: 'Cidade',            value: r => r.cidade },
  { key: 'cep',               label: 'CEP',               value: r => r.cep },
  { key: 'uf',                label: 'Estado',            value: r => r.uf },
  { key: 'data_situacao',     label: 'Data Situação',     value: r => r.data_situacao },
  { key: 'data_abertura',     label: 'Data Abertura',     value: r => r.data_abertura },
  { key: 'cnae_principal',    label: 'CNAE Principal',    value: r => r.cnae_principal },
  { key: 'natureza_juridica', label: 'Natureza Jurídica', value: r => r.natureza_juridica },
  { key: 'porte',             label: 'Porte',             value: r => r.porte },
  { key: 'cadastro',          label: 'Cadastro',          value: r => r.parsed.cadastro },
  { key: 'ultima_venda',      label: 'Última Venda',      value: r => r.parsed.ultima_venda },
]

export async function GET(request: NextRequest) {
  try {
    // ── Auth check ──
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const role = (session.user as any).role as Role;
    const userId = (session.user as any).id;
    const userEmail = session.user.email || "";

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const situacaoCadastral = searchParams.get("situacao_cadastral") || "";
    const vendedor = searchParams.get("vendedor") || "";
    const carteiraFilter = searchParams.get("carteira") || "";
    const tipoFilter = searchParams.get("tipo") || "";
    const cidadeFilter = searchParams.get("cidade") || "";
    const ufFilter = searchParams.get("uf") || "";
    const sortBy = searchParams.get("sort_by") || "";
    const sortOrder = searchParams.get("sort_order") || "asc";
    const format = searchParams.get("format") || "xlsx";

    // ── Build where clauses using Prisma (server-side filtering) ──
    const visibilityWhere = buildVisibilityWhere(role, userId, userEmail);
    const filterWhere = buildFilterWhere({
      situacaoCadastral,
      vendedor,
      cidade: cidadeFilter,
      uf: ufFilter,
      carteira: carteiraFilter,
      tipo: tipoFilter,
      role,
    });
    const searchWhere = buildSearchWhere(search);
    const fullWhere = combineWhere(visibilityWhere, filterWhere, searchWhere);

    // ── Fetch filtered data directly from DB (no getRecords cache) ──
    const SORT_FIELD_MAP: Record<string, string> = {
      codigo: 'codigo', ie_rg: 'ieRg', razao_social: 'razaoSocial',
      nome_fantasia: 'nomeFantasia', situacao_cadastral: 'situacaoCadastral',
      cnpj: 'cnpj', endereco: 'endereco', numero: 'numero', complemento: 'complemento',
      bairro: 'bairro', cidade: 'cidade', cep: 'cep', uf: 'uf',
      telefone1: 'telefone1', telefone2: 'telefone2', whatsapp: 'whatsapp',
      email1: 'email1', email2: 'email2', email3: 'email3',
      pessoa_contato: 'pessoaContato', data_situacao: 'dataSituacao', data_abertura: 'dataAbertura',
      cnae_principal: 'cnaePrincipal', natureza_juridica: 'naturezaJuridica',
      porte: 'porte', cadastro: 'cadastro', ultima_venda: 'ultimaVenda',
      reg_simples: 'regSimples', vendedor: 'vendedor', tipo: 'tipo', carteira: 'carteira',
    }

    const prismaSortField = sortBy && SORT_FIELD_MAP[sortBy] ? SORT_FIELD_MAP[sortBy] : null
    const orderBy = prismaSortField
      ? { [prismaSortField]: sortOrder as 'asc' | 'desc' }
      : { codigo: 'desc' as const }

    const clientes = await db.cliente.findMany({
      where: fullWhere,
      orderBy,
    })

    // Convert to ClienteRecord format
    const records: ClienteRecord[] = clientes.map(c => {
      const record = dbToRecord(c)
      record.carteira = c.carteira
      return record
    })

    // ── Build export rows with columns in the SAME ORDER as the site ──
    const headers = EXPORT_COLUMNS.map(c => c.label);
    const rows = records.map(r => EXPORT_COLUMNS.map(c => c.value(r)));

    // ── Generate output ──
    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === "csv") {
      // CSV format — ideal for Google Sheets import
      const csvEscape = (val: string) => {
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return '"' + val.replace(/"/g, '""') + '"'
        }
        return val
      }
      const csvLines = [
        headers.map(csvEscape).join(','),
        ...rows.map(row => row.map(csvEscape).join(','))
      ]
      const csvContent = csvLines.join('\n')
      // Add BOM for Excel/Google Sheets to correctly detect UTF-8
      const bom = '\uFEFF'
      const buffer = Buffer.from(bom + csvContent, 'utf-8')

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="Cadastro_Clientes_Mtech_${timestamp}.csv"`,
        },
      })
    }

    // XLSX format (default)
    const newWorkbook = XLSX.utils.book_new();
    const worksheetData = [headers, ...rows];
    const newWorksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // Auto-size columns
    newWorksheet["!cols"] = headers.map((header, colIdx) => {
      const maxLen = Math.max(
        header.length,
        ...rows.map(row => String(row[colIdx] || "").length)
      );
      return { wch: Math.min(maxLen + 2, 50) };
    });

    XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, "Cadastro de Clientes");

    const outputBuffer = XLSX.write(newWorkbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Cadastro_Clientes_Mtech_${timestamp}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error exporting:", error);
    return NextResponse.json(
      { error: "Erro ao exportar o arquivo" },
      { status: 500 }
    );
  }
}
