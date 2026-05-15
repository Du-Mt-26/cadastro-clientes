import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { formatPhone, calcDiasSemVenda } from "@/lib/clientes";
import type { ClienteRecord } from "@/lib/types";
import { getRecords } from "@/lib/clientes-cache";
import { getServerSession } from "next-auth";
import { authOptions, canSeeListaFria, canSeeFornecedor, CARTEIRA_LABELS, type Role } from "@/lib/auth";

/**
 * Column definitions for export — matches the exact column order shown on the site
 * (DEFAULT_COLUMNS from types.ts), including "Observações" and "Dias S/ Venda".
 *
 * Each entry defines: { key (field name), label (header in the export), value (extractor fn) }
 */
const EXPORT_COLUMNS: { key: string; label: string; value: (r: ClienteRecord) => string }[] = [
  { key: 'codigo',            label: 'Código',            value: r => r.parsed.codigo },
  { key: 'razao_social',      label: 'Razão Social',      value: r => r.razao_social },
  { key: 'cnpj',              label: 'CNPJ',              value: r => r.cnpj },
  { key: 'dias_sem_venda',    label: 'Dias S/ Venda',     value: r => { const d = calcDiasSemVenda(r.parsed.ultima_venda); return d !== null ? String(d) : '' } },
  { key: 'pessoa_contato',    label: 'Contato',           value: r => r.pessoa_contato },
  { key: 'telefone1',         label: 'Tel. 1',            value: r => formatPhone(r.telefone1) },
  { key: 'telefone2',         label: 'Tel. 2',            value: r => formatPhone(r.telefone2) },
  { key: 'telefone3',         label: 'Tel. 3',            value: r => formatPhone(r.telefone3) },
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
    const format = searchParams.get("format") || "xlsx"; // "xlsx" or "csv"

    // Get all cached records — carteira is now read directly from DB field
    const allCachedRecords = await getRecords();

    // ── Role-based visibility (same as main GET /api/clientes) ──
    let visibleRecords = allCachedRecords;
    if (role === "VENDEDOR") {
      visibleRecords = allCachedRecords.filter(r => {
        if (r.fornecedor && r.carteira !== "FORNECEDOR") return false;
        if (r.vendedor_id === userId) return true;
        if (r.carteira === "BOLSAO") return true;
        if (r.carteira === "LISTA_FRIA" && canSeeListaFria(role)) return true;
        if (r.carteira === "FORNECEDOR" && canSeeFornecedor(role)) return true;
        return false;
      });
    }

    // Apply filters
    let filtered = visibleRecords;

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
          r.email1.toLowerCase().includes(searchLower)
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

    if (carteiraFilter) {
      filtered = filtered.filter(
        (r) => r.carteira.toLowerCase() === carteiraFilter.toLowerCase()
      );
    }

    if (tipoFilter) {
      filtered = filtered.filter(
        (r) => r.tipo.toLowerCase() === tipoFilter.toLowerCase()
      );
    }

    if (cidadeFilter) {
      filtered = filtered.filter(
        (r) => r.cidade.toLowerCase() === cidadeFilter.toLowerCase()
      );
    }

    if (ufFilter) {
      filtered = filtered.filter(
        (r) => r.uf.toLowerCase() === ufFilter.toLowerCase()
      );
    }

    // Sorting
    if (sortBy) {
      const colDef = EXPORT_COLUMNS.find(c => c.key === sortBy);
      if (colDef) {
        filtered = [...filtered].sort((a, b) => {
          const valA = colDef.value(a).toLowerCase();
          const valB = colDef.value(b).toLowerCase();
          // Numeric sort for dias_sem_venda
          if (sortBy === 'dias_sem_venda') {
            const numA = parseInt(valA) || 0;
            const numB = parseInt(valB) || 0;
            return sortOrder === "desc" ? numB - numA : numA - numB;
          }
          const cmp = valA.localeCompare(valB, "pt-BR");
          return sortOrder === "desc" ? -cmp : cmp;
        });
      }
    }

    // Build export rows with columns in the SAME ORDER as the site
    const headers = EXPORT_COLUMNS.map(c => c.label);
    const rows = filtered.map(r => EXPORT_COLUMNS.map(c => c.value(r)));

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
