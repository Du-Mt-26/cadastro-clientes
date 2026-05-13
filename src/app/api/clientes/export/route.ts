import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { formatPhone } from "@/lib/clientes";
import type { ClienteRecord } from "@/lib/types";
import { getRecords } from "@/lib/clientes-cache";
import { getServerSession } from "next-auth";
import { authOptions, getSystemUserIds, computeCarteira, canSeeListaFria, canSeeFornecedor, CARTEIRA_LABELS, type Role } from "@/lib/auth";

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
    const sortBy = searchParams.get("sort_by") || "";
    const sortOrder = searchParams.get("sort_order") || "asc";

    // Get system user IDs for carteira computation
    const systemUserIds = await getSystemUserIds();

    const allCachedRecords = await getRecords();

    // ── Compute carteira for each record ──
    for (const r of allCachedRecords) {
      r.carteira = computeCarteira(r.vendedor_id, r.tipo, systemUserIds);
    }

    // ── Role-based visibility (same as main GET /api/clientes) ──
    let visibleRecords = allCachedRecords;
    if (role === "VENDEDOR") {
      visibleRecords = allCachedRecords.filter(r => {
        if (r.fornecedor && r.carteira !== "FORNECEDOR") return false;
        if (r.vendedor_id === userId) return true;
        if (r.carteira === "BOLSAO") return true;
        if (r.carteira === "LISTA_FRIA" && canSeeListaFria(role)) return true;
        if (r.carteira === "FORNECEDOR" && canSeeFornecedor(role, userEmail)) return true;
        return false;
      });
    }

    // Convert to export-friendly column names
    const allRecords = visibleRecords.map((r) => ({
      "Código": r.parsed.codigo,
      "IE/RG": r.parsed.ie_rg,
      "Razão Social": r.razao_social,
      "Nome Fantasia": r.nome_fantasia,
      "Situação Cadastral": r.situacao_cadastral,
      "CNPJ": r.cnpj,
      "Endereço Rua/Avenida": r.endereco,
      "Numero": r.numero,
      "Complemento": r.complemento,
      "Bairro": r.bairro,
      "Cidade": r.cidade,
      "CEP": r.cep,
      "UF": r.uf,
      "Telefone 1": formatPhone(r.telefone1),
      "Telefone 2": formatPhone(r.telefone2),
      "Telefone 3": formatPhone(r.telefone3),
      "Telefone 4": formatPhone(r.telefone4),
      "Email 1": r.email1,
      "Email 2": r.email2,
      "Email 3": r.email3,
      "Pessoa de contato": r.pessoa_contato,
      "Data Situação": r.data_situacao,
      "Data Abertura": r.data_abertura,
      "CNAE Principal": r.cnae_principal,
      "Natureza Jurídica": r.natureza_juridica,
      "Porte": r.porte,
      "Cadastro": r.parsed.cadastro,
      "Última Venda": r.parsed.ultima_venda,
      "Reg. Simples": r.parsed.reg_simples,
      "Vendedor": r.parsed.vendedor,
      "Tipo": r.tipo,
      "Carteira": CARTEIRA_LABELS[r.carteira] || r.carteira,
    }));

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
        tipo: "Tipo",
        carteira: "Carteira",
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
