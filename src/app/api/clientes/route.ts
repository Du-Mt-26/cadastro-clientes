import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dbToRecord, invalidateCache } from "@/lib/clientes-cache";
import { getServerSession } from "next-auth";
import { authOptions, getSystemUserIds, computeCarteira, canSeeListaFria, canSeeFornecedor, type Role } from "@/lib/auth";
import type { ClienteRecord } from "@/lib/types";
import {
  SORT_FIELD_MAP,
  COMPUTED_SORT_FIELDS,
  buildVisibilityWhere,
  buildFilterWhere,
  buildSearchWhere,
  combineWhere,
  fetchFilterOptions,
  fetchStats,
  handleComputedSort,
} from "@/lib/clientes-api-helpers";

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

    // ── Parse query params ──
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

    // ── Get system user IDs for carteira computation ──
    const systemUserIds = await getSystemUserIds();
    const systemUserIdList = [systemUserIds.bolsao, systemUserIds.listaFria, systemUserIds.fornecedor];

    // ── Build where clauses ──
    const visibilityWhere = buildVisibilityWhere(role, userId, userEmail, systemUserIds);
    const filterWhere = buildFilterWhere({
      situacaoCadastral,
      vendedor,
      cidade,
      uf,
      carteira,
      tipo: tipoFilter,
      role,
      systemUserIds,
      systemUserIdList,
    });
    const searchWhere = buildSearchWhere(search);
    const fullWhere = combineWhere(visibilityWhere, filterWhere, searchWhere);

    // ── Determine sort strategy ──
    const isComputedSort = Boolean(sortBy) && COMPUTED_SORT_FIELDS.has(sortBy);
    const prismaSortField = sortBy && SORT_FIELD_MAP[sortBy] ? SORT_FIELD_MAP[sortBy] : null;

    // ── Execute data + filters + stats in parallel ──
    const [dataResult, filtersData, statsData] = await Promise.all([
      // Data query (with pagination)
      (async (): Promise<{ records: ClienteRecord[]; total: number }> => {
        if (isComputedSort) {
          return handleComputedSort({
            fullWhere,
            sortBy,
            sortOrder,
            page,
            limit,
            showAll,
            systemUserIds,
          });
        }

        // Prisma-sortable field — use server-side orderBy + skip/take
        const orderBy = prismaSortField
          ? { [prismaSortField]: sortOrder as 'asc' | 'desc' }
          : { codigo: 'desc' as const };

        const [clientes, countResult] = await Promise.all([
          db.cliente.findMany({
            where: fullWhere,
            orderBy,
            ...(showAll ? {} : { skip: (page - 1) * limit, take: limit }),
          }),
          db.cliente.count({ where: fullWhere }),
        ]);

        return {
          total: countResult,
          records: clientes.map((c) => {
            const record = dbToRecord(c);
            record.carteira = computeCarteira(c.vendedorId, c.tipo, systemUserIds);
            return record;
          }),
        };
      })(),

      // Filter options (visibility-only where, no search/filter)
      fetchFilterOptions(visibilityWhere, role, userEmail),

      // Stats (visibility-only where, no search/filter)
      fetchStats(role, userId, systemUserIds),
    ]);

    // ── Pagination info ──
    const totalPages = showAll ? 1 : Math.ceil(dataResult.total / limit);

    return NextResponse.json({
      data: dataResult.records,
      pagination: {
        page: showAll ? 1 : page,
        limit: showAll ? dataResult.total : limit,
        total: dataResult.total,
        totalPages,
        showAll,
      },
      filters: filtersData,
      stats: statsData,
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
        email1: (body.email1 || "").toLowerCase().trim(),
        email2: (body.email2 || "").toLowerCase().trim(),
        email3: (body.email3 || "").toLowerCase().trim(),
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

    const emailFields = new Set(['email1', 'email2', 'email3']);

    for (const field of editableTextFields) {
      if (body[field] !== undefined) {
        let newValue = String(body[field]);
        const oldValue = String(existing[field as keyof typeof existing] ?? "");

        // Force lowercase for email fields
        if (emailFields.has(field)) {
          newValue = newValue.toLowerCase().trim();
        }

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
