import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calcDiasSemVenda } from "@/lib/clientes";
import type { ClienteRecord } from "@/lib/types";
import { getRecords, invalidateCache, dbToRecord } from "@/lib/clientes-cache";
import { getServerSession } from "next-auth";
import { authOptions, getSystemUserIds, computeCarteira, canSeeListaFria, canSeeFornecedor, type Role } from "@/lib/auth";

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
    const tipoFilter = searchParams.get("tipo") || "";
    const sortBy = searchParams.get("sort_by") || "";
    const sortOrder = searchParams.get("sort_order") || "asc";

    // Get system user IDs for carteira computation
    const systemUserIds = await getSystemUserIds();

    const allRecords = await getRecords();

    // ── Compute carteira for each record ──
    for (const r of allRecords) {
      r.carteira = computeCarteira(r.vendedor_id, r.tipo, systemUserIds);
    }

    // ── Role-based visibility ──
    // ADMIN, DIRETOR_COMERCIAL, GERENTE_COMERCIAL → see all clients (including fornecedores)
    // VENDEDOR → see only own clients + BOLSAO + (LISTA_FRIA if PRISCILA) + (FORNECEDOR if PRISCILA/FORNECEDOR user)
    let visibleRecords = allRecords;
    if (role === "VENDEDOR") {
      visibleRecords = allRecords.filter(r => {
        // Never show fornecedor-flagged clients to regular vendedores
        // (unless they are in FORNECEDOR carteira and user has access)
        if (r.fornecedor && r.carteira !== "FORNECEDOR") return false;

        // Own clients
        if (r.vendedor_id === userId) return true;
        // Bolsão — all vendedores can see
        if (r.carteira === "BOLSAO") return true;
        // Lista Fria — only authorized roles
        if (r.carteira === "LISTA_FRIA" && canSeeListaFria(role)) return true;
        // Fornecedor — only authorized roles + FORNECEDOR system user
        if (r.carteira === "FORNECEDOR" && canSeeFornecedor(role, userEmail)) return true;
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
      // For VENDEDOR role, skip the vendedor filter - their visibility
      // is already controlled by role-based rules above.
      // Bolsão clients have a different vendedor name, so applying
      // this filter would incorrectly hide them.
      if (role !== 'VENDEDOR') {
        filtered = filtered.filter(
          (r) => r.parsed.vendedor.toLowerCase() === vendedor.toLowerCase()
        );
      }
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

    // Carteira filter
    if (carteira) {
      if (carteira === "FORNECEDOR") {
        filtered = filtered.filter((r) => r.carteira === "FORNECEDOR");
      } else if (carteira === "LISTA_FRIA") {
        filtered = filtered.filter((r) => r.carteira === "LISTA_FRIA");
      } else if (carteira === "BOLSAO") {
        filtered = filtered.filter((r) => r.carteira === "BOLSAO");
      } else if (carteira === "COM_VENDEDOR") {
        filtered = filtered.filter((r) => r.carteira === "COM_VENDEDOR");
      } else if (carteira === "SEM_VENDEDOR") {
        filtered = filtered.filter((r) => r.carteira === "SEM_VENDEDOR");
      }
    }

    // Tipo filter
    if (tipoFilter) {
      filtered = filtered.filter((r) => r.tipo === tipoFilter);
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
          tipo: r.tipo,
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
    const systemUserNames = new Set(['BOLSÃO', 'LISTA FRIA', 'FORNECEDOR']);
    const uniqueVendedores = [...new Set(visibleRecords.map((r) => r.parsed.vendedor).filter(v => v && !systemUserNames.has(v.toUpperCase())))];
    const uniqueCidades = [...new Set(visibleRecords.map((r) => r.cidade).filter(Boolean))];
    const uniqueUfs = [...new Set(visibleRecords.map((r) => r.uf).filter(Boolean))];

    // Available carteiras based on user role
    const availableCarteiras = ['COM_VENDEDOR', 'BOLSAO', 'SEM_VENDEDOR'];
    if (canSeeListaFria(role)) availableCarteiras.push('LISTA_FRIA');
    if (canSeeFornecedor(role, userEmail)) availableCarteiras.push('FORNECEDOR');

    // Get all active vendor users (including system users) for assignment dropdown
    const vendedorUsers = await db.user.findMany({
      where: { active: true, role: { in: ['VENDEDOR', 'DIRETOR_COMERCIAL'] } },
      orderBy: [{ isSystemUser: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, role: true, isSystemUser: true, email: true },
    });

    // Also include system users for admin assignment
    const systemUsers = await db.user.findMany({
      where: { isSystemUser: true, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true, isSystemUser: true, email: true },
    });

    // Merge and deduplicate
    const allUsers = [...vendedorUsers];
    for (const su of systemUsers) {
      if (!allUsers.some(u => u.id === su.id)) {
        allUsers.push(su);
      }
    }

    // Cidades grouped by UF (for cascading filter)
    const cidadesPorUf: Record<string, string[]> = {};
    for (const r of visibleRecords) {
      if (r.uf && r.cidade) {
        if (!cidadesPorUf[r.uf]) cidadesPorUf[r.uf] = [];
        if (!cidadesPorUf[r.uf].includes(r.cidade)) cidadesPorUf[r.uf].push(r.cidade);
      }
    }
    for (const ufKey of Object.keys(cidadesPorUf)) {
      cidadesPorUf[ufKey].sort();
    }

    // ── Stats computation ──
    // For VENDEDOR: split into "own" (vendedor_id === userId) and "bolsao" (carteira === BOLSAO)
    // For others: all visibleRecords
    const isVendedor = role === "VENDEDOR";
    const ownRecords = isVendedor
      ? visibleRecords.filter(r => r.vendedor_id === userId)
      : visibleRecords.filter(r => !r.fornecedor);
    const bolsaoRecords = isVendedor
      ? visibleRecords.filter(r => r.carteira === "BOLSAO")
      : [];

    // Summary stats (from ownRecords for vendedor, visibleRecords for others)
    const statsSource = isVendedor ? ownRecords : visibleRecords;
    const situacaoCadastralStats: Record<string, number> = {};
    for (const r of statsSource) {
      const key = r.situacao_cadastral || "Sem info";
      situacaoCadastralStats[key] = (situacaoCadastralStats[key] || 0) + 1;
    }

    // Dias sem venda stats (0-45 verde, 46-90 amarelo, 91-150 laranja, 151+ vermelho)
    let verde = 0, amarelo = 0, laranja = 0, vermelho = 0;
    for (const r of statsSource) {
      if (r.fornecedor) continue; // skip fornecedores from dias stats
      const dias = calcDiasSemVenda(r.parsed.ultima_venda);
      if (dias === null) { vermelho++; continue; }
      if (dias <= 45) verde++;
      else if (dias <= 90) amarelo++;
      else if (dias <= 150) laranja++;
      else vermelho++;
    }
    const diasSemVendaStats = { verde, amarelo, laranja, vermelho };

    // Carteira stats
    let comVendedor = 0, bolsao = 0, listaFria = 0, fornecedores = 0;
    if (isVendedor) {
      comVendedor = ownRecords.filter(r => !r.fornecedor).length;
      bolsao = bolsaoRecords.filter(r => !r.fornecedor).length;
      // Vendedor doesn't see lista_fria or fornecedores
    } else {
      for (const r of visibleRecords) {
        if (r.carteira === "COM_VENDEDOR" && !r.fornecedor) comVendedor++;
        else if (r.carteira === "BOLSAO" && !r.fornecedor) bolsao++;
        else if (r.carteira === "LISTA_FRIA" && !r.fornecedor) listaFria++;
        else if (r.carteira === "FORNECEDOR" || r.fornecedor) fornecedores++;
      }
    }
    const carteiraStats = {
      com_vendedor: comVendedor,
      bolsao,
      lista_fria: listaFria,
      fornecedores,
    };

    // Tipo stats (from own records for vendedor)
    let revendas = 0, corporativo = 0;
    for (const r of statsSource) {
      if (!r.fornecedor) {
        if (r.tipo === 'CORPORATIVO') corporativo++;
        else revendas++;
      }
    }
    const tipoStats = { revendas, corporativo };

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
        cidadesPorUf,
        carteiras: availableCarteiras,
        vendedorUsers: allUsers.map(v => ({
          id: v.id,
          name: v.name,
          role: v.role,
          isSystemUser: v.isSystemUser,
          email: v.email,
        })),
      },
      stats: {
        total: statsSource.filter(r => !r.fornecedor).length,
        situacao_cadastral: situacaoCadastralStats,
        dias_sem_venda: diasSemVendaStats,

        carteira: carteiraStats,
        tipo: tipoStats,
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

    // Validate tipo
    const tipo = body.tipo === "CORPORATIVO" ? "CORPORATIVO" : "REVENDA";

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
        tipo,
      },
    });

    // Invalidate cache
    invalidateCache();

    // Compute carteira for the new record
    const systemUserIds = await getSystemUserIds();
    const record = dbToRecord(novo);
    record.carteira = computeCarteira(novo.vendedorId, novo.tipo, systemUserIds);

    return NextResponse.json({ success: true, cliente: record }, { status: 201 });
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
    const role = (session.user as any).role as Role;

    const body = await request.json();
    const { codigo } = body;

    if (!codigo) {
      return NextResponse.json({ error: "Código é obrigatório" }, { status: 400 });
    }

    // Get old values for audit logging
    const existing = await db.cliente.findUnique({ where: { codigo } });

    if (!existing) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    // All editable text fields (basic info + contact)
    const editableTextFields = [
      'razaoSocial', 'nomeFantasia', 'tipo', 'cidade', 'uf', 'endereco',
      'numero', 'complemento', 'bairro', 'cep', 'cnpj',
      'situacaoCadastral', 'dataSituacao', 'dataAbertura',
      'cnaePrincipal', 'naturezaJuridica', 'porte', 'regSimples',
      'telefone1', 'telefone2', 'telefone3', 'telefone4',
      'email1', 'email2', 'email3',
      'pessoaContato', 'observacoes',
    ];

    const updateData: Record<string, unknown> = {};
    const auditEntries: Array<{ field: string; oldValue: string; newValue: string }> = [];

    for (const field of editableTextFields) {
      if (body[field] !== undefined) {
        const newValue = String(body[field]);
        const oldValue = String(existing[field as keyof typeof existing] ?? "");

        // Validate tipo
        if (field === 'tipo' && newValue !== 'REVENDA' && newValue !== 'CORPORATIVO') {
          continue; // Skip invalid tipo values
        }

        // Vendedores can only edit contact/obs fields
        const isContactOrObs = ['telefone1', 'telefone2', 'telefone3', 'telefone4',
          'email1', 'email2', 'email3', 'pessoaContato', 'observacoes'].includes(field);

        if (role === 'VENDEDOR' && !isContactOrObs) {
          continue; // Skip fields that vendedores can't edit
        }

        if (oldValue !== newValue) {
          updateData[field] = newValue;
          auditEntries.push({ field, oldValue, newValue });
        }
      }
    }

    // Handle carteira changes via vendedorId assignment (not direct carteira field)
    // The carteira is computed, so to change it we change vendedorId
    // This is handled by the /api/vendedores/assign route

    // Create audit logs for changed fields
    for (const entry of auditEntries) {
      await db.auditLog.create({
        data: {
          codigo,
          field: entry.field,
          oldValue: entry.oldValue,
          newValue: entry.newValue,
          changedBy,
        },
      });
    }

    if (Object.keys(updateData).length === 0) {
      // No changes to make
      const systemUserIds = await getSystemUserIds();
      const record = dbToRecord(existing);
      record.carteira = computeCarteira(existing.vendedorId, existing.tipo, systemUserIds);
      return NextResponse.json({ success: true, edit: record });
    }

    const updated = await db.cliente.update({
      where: { codigo },
      data: updateData,
    });

    // Invalidate cache so next read picks up changes
    invalidateCache();

    const systemUserIds = await getSystemUserIds();
    const record = dbToRecord(updated);
    record.carteira = computeCarteira(updated.vendedorId, updated.tipo, systemUserIds);

    return NextResponse.json({ success: true, edit: record });
  } catch (error) {
    console.error("Error saving edit:", error);
    return NextResponse.json(
      { error: "Erro ao salvar edição" },
      { status: 500 }
    );
  }
}
