import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calcDiasSemVenda } from "@/lib/clientes";
import type { ClienteRecord } from "@/lib/types";
import { getRecords, invalidateCache, dbToRecord } from "@/lib/clientes-cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // ── Auth check ──
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const role = (session.user as any).role;
    const userId = (session.user as any).id;
    const userName = session.user.name || "";

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limitParam = searchParams.get("limit") || "50";
    const showAll = limitParam === "all";
    const limit = showAll ? 999999 : parseInt(limitParam);
    const search = searchParams.get("search") || "";
    const situacaoCadastral = searchParams.get("situacao_cadastral") || "";
    const vendedor = searchParams.get("vendedor") || "";
    const cidade = searchParams.get("cidade") || "";
    const uf = searchParams.get("uf") || "";
    const carteira = searchParams.get("carteira") || "";
    const sortBy = searchParams.get("sort_by") || "";
    const sortOrder = searchParams.get("sort_order") || "asc";

    const allRecords = await getRecords();

    // ── Role-based filtering for VENDEDOR ──
    let visibleRecords = allRecords;
    if (role === "VENDEDOR") {
      visibleRecords = allRecords.filter(
        (r) =>
          r.parsed.vendedor.toLowerCase() === userName.toLowerCase() ||
          r.carteira === "BOLSAO" ||
          (r.carteira === "CARTEIRA_REVENDAS" && !r.vendedor_id)
      );
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

    if (cidade) {
      filtered = filtered.filter(
        (r) => r.cidade.toLowerCase() === cidade.toLowerCase()
      );
    }

    if (uf) {
      filtered = filtered.filter(
        (r) => r.uf.toLowerCase() === uf.toLowerCase()
      );
    }

    if (carteira) {
      filtered = filtered.filter(
        (r) => r.carteira === carteira
      );
    }

    // Sorting
    if (sortBy) {
      const getFieldValue = (r: ClienteRecord, field: string): string => {
        const fieldMap: Record<string, string> = {
          codigo: r.parsed.codigo,
          ie_rg: r.parsed.ie_rg,
          razao_social: r.razao_social,
          nome_fantasia: r.nome_fantasia,
          situacao_cadastral: r.situacao_cadastral,
          cnpj: r.cnpj,
          endereco: r.endereco,
          numero: r.numero,
          complemento: r.complemento,
          bairro: r.bairro,
          cidade: r.cidade,
          cep: r.cep,
          uf: r.uf,
          telefone1: r.telefone1,
          telefone2: r.telefone2,
          telefone3: r.telefone3,
          telefone4: r.telefone4,
          email1: r.email1,
          email2: r.email2,
          email3: r.email3,
          pessoa_contato: r.pessoa_contato,
          data_situacao: r.data_situacao,
          data_abertura: r.data_abertura,
          cnae_principal: r.cnae_principal,
          natureza_juridica: r.natureza_juridica,
          porte: r.porte,
          cadastro: r.parsed.cadastro,
          ultima_venda: r.parsed.ultima_venda,
          reg_simples: r.parsed.reg_simples,
          vendedor: r.parsed.vendedor,
          carteira: r.carteira,
        };
        return (fieldMap[field] || "").toLowerCase();
      };

      filtered = [...filtered].sort((a, b) => {
        const valA = getFieldValue(a, sortBy);
        const valB = getFieldValue(b, sortBy);
        const cmp = valA.localeCompare(valB, "pt-BR");
        return sortOrder === "desc" ? -cmp : cmp;
      });
    }

    // Get unique values for filters (from visibleRecords, not allRecords)
    const uniqueSituacaoCadastral = [...new Set(visibleRecords.map((r) => r.situacao_cadastral).filter(Boolean))];
    const uniqueVendedores = [...new Set(visibleRecords.map((r) => r.parsed.vendedor).filter(Boolean))];
    const uniqueCidades = [...new Set(visibleRecords.map((r) => r.cidade).filter(Boolean))];
    const uniqueUfs = [...new Set(visibleRecords.map((r) => r.uf).filter(Boolean))];
    const uniqueCarteiras = [...new Set(visibleRecords.map((r) => r.carteira).filter(Boolean))];

    // Summary stats (from visibleRecords)
    const situacaoCadastralStats: Record<string, number> = {};
    for (const r of visibleRecords) {
      const key = r.situacao_cadastral || "Sem info";
      situacaoCadastralStats[key] = (situacaoCadastralStats[key] || 0) + 1;
    }

    // Dias sem venda stats (0-48 verde, 49-90 amarelo, 91-150 laranja, 151+ vermelho)
    let verde = 0, amarelo = 0, laranja = 0, vermelho = 0;
    for (const r of visibleRecords) {
      const dias = calcDiasSemVenda(r.parsed.ultima_venda);
      if (dias === null) { vermelho++; continue; }
      if (dias <= 48) verde++;
      else if (dias <= 90) amarelo++;
      else if (dias <= 150) laranja++;
      else vermelho++;
    }
    const diasSemVendaStats = { verde, amarelo, laranja, vermelho };

    // Carteira stats
    let carteiraRevendas = 0, carteiraCorporativo = 0, bolsao = 0, carteiraFria = 0;
    for (const r of visibleRecords) {
      if (r.carteira === "CARTEIRA_REVENDAS") carteiraRevendas++;
      else if (r.carteira === "CARTEIRA_CORPORATIVO") carteiraCorporativo++;
      else if (r.carteira === "BOLSAO") bolsao++;
      else if (r.carteira === "CARTEIRA_FRIA") carteiraFria++;
    }
    const carteiraStats = { carteira_revendas: carteiraRevendas, carteira_corporativo: carteiraCorporativo, bolsao, carteira_fria: carteiraFria };

    // Pagination
    const total = filtered.length;
    const effectiveLimit = showAll ? total : limit;
    const totalPages = showAll ? 1 : Math.ceil(total / limit);
    const start = showAll ? 0 : (page - 1) * limit;
    const paginatedRecords = filtered.slice(start, start + effectiveLimit);

    return NextResponse.json({
      data: paginatedRecords,
      pagination: {
        page: showAll ? 1 : page,
        limit: showAll ? total : limit,
        total,
        totalPages,
        showAll,
      },
      filters: {
        situacao_cadastral: uniqueSituacaoCadastral.sort(),
        vendedores: uniqueVendedores.sort(),
        cidades: uniqueCidades.sort(),
        ufs: uniqueUfs.sort(),
        carteiras: uniqueCarteiras.sort(),
      },
      stats: {
        total: visibleRecords.length,
        situacao_cadastral: situacaoCadastralStats,
        dias_sem_venda: diasSemVendaStats,
        carteira: carteiraStats,
      },
    });
  } catch (error) {
    console.error("Error loading clients:", error);
    return NextResponse.json(
      { error: "Erro ao carregar clientes" },
      { status: 500 }
    );
  }
}

// POST - Create a new client
export async function POST(request: NextRequest) {
  try {
    // ── Auth check ──
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { cnpj } = body;

    if (!cnpj) {
      return NextResponse.json({ error: "CNPJ é obrigatório" }, { status: 400 });
    }

    const cnpjDigits = cnpj.replace(/\D/g, "");
    if (cnpjDigits.length !== 14) {
      return NextResponse.json({ error: "CNPJ deve conter 14 dígitos" }, { status: 400 });
    }

    // Check if CNPJ already exists
    const existing = await db.cliente.findFirst({ where: { cnpj: cnpjDigits } });
    if (existing) {
      return NextResponse.json({ error: "CNPJ já cadastrado" }, { status: 409 });
    }

    // Generate next codigo
    const lastClient = await db.cliente.findFirst({
      orderBy: { codigo: "desc" },
    });
    let nextNum = 1;
    if (lastClient?.codigo) {
      const parsed = parseInt(lastClient.codigo, 10);
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }
    const codigo = String(nextNum).padStart(6, "0");

    const novo = await db.cliente.create({
      data: {
        codigo,
        ieRg: body.ieRg || "",
        razaoSocial: body.razaoSocial || "",
        nomeFantasia: body.nomeFantasia || "",
        situacaoCadastral: body.situacaoCadastral || "",
        cnpj: cnpjDigits,
        endereco: body.endereco || "",
        numero: body.numero || "",
        complemento: body.complemento || "",
        bairro: body.bairro || "",
        cidade: body.cidade || "",
        cep: body.cep || "",
        uf: body.uf || "",
        telefone1: body.telefone1 || "",
        telefone2: body.telefone2 || "",
        telefone3: body.telefone3 || "",
        telefone4: body.telefone4 || "",
        email1: body.email1 || "",
        email2: body.email2 || "",
        email3: body.email3 || "",
        pessoaContato: body.pessoaContato || "",
        dataSituacao: body.dataSituacao || "",
        dataAbertura: body.dataAbertura || "",
        cnaePrincipal: body.cnaePrincipal || "",
        naturezaJuridica: body.naturezaJuridica || "",
        porte: body.porte || "",
        cadastro: new Date().toLocaleDateString("pt-BR"),
        ultimaVenda: "",
        regSimples: body.regSimples || "",
        vendedor: body.vendedor || "",
        source: "manual",
      },
    });

    // Invalidate cache
    invalidateCache();

    return NextResponse.json({ success: true, cliente: dbToRecord(novo) }, { status: 201 });
  } catch (error) {
    console.error("Error creating client:", error);
    return NextResponse.json(
      { error: "Erro ao criar cliente" },
      { status: 500 }
    );
  }
}

// PATCH - Save editable fields for a client
export async function PATCH(request: NextRequest) {
  try {
    // ── Auth check ──
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const changedBy = session.user.name || session.user.email || "user";

    const body = await request.json();
    const { codigo, telefone1, telefone2, telefone3, telefone4, email1, email2, email3, pessoaContato, observacoes } = body;

    if (!codigo) {
      return NextResponse.json({ error: "Código é obrigatório" }, { status: 400 });
    }

    // Get old values for audit logging
    const existing = await db.cliente.findUnique({ where: { codigo } });

    if (!existing) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const oldValues: Record<string, string> = {
      telefone1: existing.telefone1,
      telefone2: existing.telefone2,
      telefone3: existing.telefone3,
      telefone4: existing.telefone4,
      email1: existing.email1,
      email2: existing.email2,
      email3: existing.email3,
      pessoaContato: existing.pessoaContato,
      observacoes: existing.observacoes,
    };

    // Create audit logs for changed fields
    const fields: Record<string, string | undefined> = { telefone1, telefone2, telefone3, telefone4, email1, email2, email3, pessoaContato, observacoes };
    for (const [field, newValue] of Object.entries(fields)) {
      if (newValue !== undefined) {
        const oldVal = oldValues[field] ?? "";
        if (oldVal !== newValue) {
          await db.auditLog.create({
            data: { codigo, field, oldValue: oldVal, newValue, changedBy },
          });
        }
      }
    }

    // Update the Cliente record directly
    const updated = await db.cliente.update({
      where: { codigo },
      data: {
        telefone1: telefone1 ?? undefined,
        telefone2: telefone2 ?? undefined,
        telefone3: telefone3 ?? undefined,
        telefone4: telefone4 ?? undefined,
        email1: email1 ?? undefined,
        email2: email2 ?? undefined,
        email3: email3 ?? undefined,
        pessoaContato: pessoaContato ?? undefined,
        observacoes: observacoes ?? undefined,
      },
    });

    // Invalidate cache so next read picks up changes
    invalidateCache();

    return NextResponse.json({ success: true, edit: dbToRecord(updated) });
  } catch (error) {
    console.error("Error saving edit:", error);
    return NextResponse.json(
      { error: "Erro ao salvar edição" },
      { status: 500 }
    );
  }
}
