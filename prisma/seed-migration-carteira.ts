/**
 * Migration seed:
 * 1. Migrates existing carteira from computed (vendedorId-based) to explicit Carteira enum
 * 2. Seeds default permissions for all roles
 * 3. Removes system users (found by their known email addresses)
 *
 * IMPORTANT: Run `prisma db push` BEFORE running this script.
 *   - `prisma db push` creates the Carteira enum + carteira column (default SEM_VENDEDOR)
 *   - Then this script populates carteira based on existing vendedorId assignments
 *   - Then deletes system users
 *
 * Run: npx tsx prisma/seed-migration-carteira.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ─── Known system user emails ────────────────────────
const SYSTEM_USER_EMAILS = [
  'bolsao@sistema.mtech',
  'lista-fria@sistema.mtech',
  'fornecedor@sistema.mtech',
]

// ─── Default permissions ──────────────────────────────

const PERMISSIONS = [
  // Clientes
  { key: 'clients.view_all', description: 'Ver todos os clientes', category: 'clientes' },
  { key: 'clients.edit_all_fields', description: 'Editar todos os campos do cliente', category: 'clientes' },
  { key: 'clients.edit_contact', description: 'Editar contato e observações', category: 'clientes' },
  { key: 'clients.export', description: 'Exportar XLSX', category: 'clientes' },
  { key: 'clients.receita', description: 'Consultar Receita Federal', category: 'clientes' },
  { key: 'clients.audit', description: 'Ver histórico de alterações', category: 'clientes' },
  { key: 'clients.bulk_import', description: 'Importação em massa', category: 'clientes' },
  { key: 'clients.create', description: 'Criar novo cliente', category: 'clientes' },
  { key: 'clients.edit_commercial', description: 'Editar dados comerciais', category: 'clientes' },
  { key: 'clients.view_reports', description: 'Ver relatórios e estatísticas', category: 'clientes' },
  // Bolsão / Carteira
  { key: 'bolsao.check', description: 'Verificar Bolsão', category: 'bolsao' },
  { key: 'bolsao.pull', description: 'Puxar cliente do Bolsão', category: 'bolsao' },
  { key: 'bolsao.move', description: 'Mover para Lista Fria/Fornecedor', category: 'bolsao' },
  { key: 'bolsao.abordar', description: 'Marcar cliente como abordado', category: 'bolsao' },
  // Usuários
  { key: 'users.manage', description: 'Gerenciar usuários', category: 'users' },
  { key: 'users.assign_clients', description: 'Atribuir clientes a usuários', category: 'users' },
  // Planilha
  { key: 'sheets.manage', description: 'Gerenciar Google Sheets', category: 'sheets' },
  // Favoritos
  { key: 'favorites.use', description: 'Usar favoritos', category: 'geral' },
  // Permissões
  { key: 'permissions.manage', description: 'Gerenciar permissões do sistema', category: 'users' },
]

// Default permissions per role (true = allowed)
const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<string, boolean>> = {
  ADMIN: {
    'clients.view_all': true,
    'clients.edit_all_fields': true,
    'clients.edit_contact': true,
    'clients.export': true,
    'clients.receita': true,
    'clients.audit': true,
    'clients.bulk_import': true,
    'clients.create': true,
    'clients.edit_commercial': true,
    'clients.view_reports': true,
    'bolsao.check': true,
    'bolsao.pull': true,
    'bolsao.move': true,
    'bolsao.abordar': true,
    'users.manage': true,
    'users.assign_clients': true,
    'sheets.manage': true,
    'favorites.use': true,
    'permissions.manage': true,
  },
  DIRETOR_COMERCIAL: {
    'clients.view_all': true,
    'clients.edit_all_fields': true,
    'clients.edit_contact': true,
    'clients.export': true,
    'clients.receita': true,
    'clients.audit': true,
    'clients.bulk_import': true,
    'clients.create': true,
    'clients.edit_commercial': true,
    'clients.view_reports': true,
    'bolsao.check': true,
    'bolsao.pull': true,
    'bolsao.move': true,
    'bolsao.abordar': true,
    'users.manage': false,
    'users.assign_clients': true,
    'sheets.manage': true,
    'favorites.use': true,
    'permissions.manage': false,
  },
  GERENTE_COMERCIAL: {
    'clients.view_all': true,
    'clients.edit_all_fields': false,
    'clients.edit_contact': true,
    'clients.export': false,
    'clients.receita': true,
    'clients.audit': true,
    'clients.bulk_import': false,
    'clients.create': true,
    'clients.edit_commercial': true,
    'clients.view_reports': true,
    'bolsao.check': true,
    'bolsao.pull': true,
    'bolsao.move': true,
    'bolsao.abordar': true,
    'users.manage': false,
    'users.assign_clients': true,
    'sheets.manage': false,
    'favorites.use': true,
    'permissions.manage': false,
  },
  VENDEDOR: {
    'clients.view_all': false,
    'clients.edit_all_fields': false,
    'clients.edit_contact': true,
    'clients.export': false,
    'clients.receita': true,
    'clients.audit': false,
    'clients.bulk_import': false,
    'clients.create': true,
    'clients.edit_commercial': false,
    'clients.view_reports': false,
    'bolsao.check': false,
    'bolsao.pull': true,
    'bolsao.move': false,
    'bolsao.abordar': true,
    'users.manage': false,
    'users.assign_clients': false,
    'sheets.manage': false,
    'favorites.use': true,
    'permissions.manage': false,
  },
}

async function main() {
  console.log('🚀 Starting migration: carteira + permissions...')

  // ─── Step 1: Find system users by their known emails ──
  // Using raw SQL because isSystemUser column may or may not exist
  console.log('🔍 Finding system users by email...')

  const systemUsers = await prisma.user.findMany({
    where: { email: { in: SYSTEM_USER_EMAILS } },
    select: { id: true, email: true, name: true },
  })

  const bolsaoId = systemUsers.find(u => u.email === 'bolsao@sistema.mtech')?.id
  const listaFriaId = systemUsers.find(u => u.email === 'lista-fria@sistema.mtech')?.id
  const fornecedorId = systemUsers.find(u => u.email === 'fornecedor@sistema.mtech')?.id

  console.log(`Found ${systemUsers.length} system users:`, systemUsers.map(u => `${u.name} (${u.email})`))
  if (bolsaoId) console.log(`  BOLSÃO ID: ${bolsaoId}`)
  if (listaFriaId) console.log(`  LISTA FRIA ID: ${listaFriaId}`)
  if (fornecedorId) console.log(`  FORNECEDOR ID: ${fornecedorId}`)

  // ─── Step 2: Migrate carteira field ───────────────────
  // Update carteira from default SEM_VENDEDOR to the correct value
  // based on vendedorId pointing to system users or real vendors
  console.log('📊 Migrating carteira field...')

  // Clients with vendedorId pointing to BOLSÃO
  if (bolsaoId) {
    const result = await prisma.cliente.updateMany({
      where: { vendedorId: bolsaoId },
      data: { carteira: 'BOLSAO', vendedorId: null, vendedor: '' },
    })
    console.log(`  BOLSÃO: updated ${result.count} clients`)
  }

  // Clients with vendedorId pointing to LISTA FRIA
  if (listaFriaId) {
    const result = await prisma.cliente.updateMany({
      where: { vendedorId: listaFriaId },
      data: { carteira: 'LISTA_FRIA', vendedorId: null, vendedor: '' },
    })
    console.log(`  LISTA FRIA: updated ${result.count} clients`)
  }

  // Clients with vendedorId pointing to FORNECEDOR
  if (fornecedorId) {
    const result = await prisma.cliente.updateMany({
      where: { vendedorId: fornecedorId },
      data: { carteira: 'FORNECEDOR', vendedorId: null, vendedor: '' },
    })
    console.log(`  FORNECEDOR: updated ${result.count} clients`)
  }

  // Clients with fornecedor=true but not yet FORNECEDOR carteira
  const fornecedorClientes = await prisma.cliente.updateMany({
    where: { fornecedor: true, carteira: 'SEM_VENDEDOR' },
    data: { carteira: 'FORNECEDOR' },
  })
  console.log(`  FORNECEDOR (fornecedor=true): updated ${fornecedorClientes.count} clients`)

  // Clients with a real vendedorId (not system user) → COM_VENDEDOR
  const systemUserIds = systemUsers.map(u => u.id)
  const comVendedor = await prisma.cliente.updateMany({
    where: {
      vendedorId: { not: null },
      NOT: { vendedorId: { in: systemUserIds } },
      carteira: 'SEM_VENDEDOR',
    },
    data: { carteira: 'COM_VENDEDOR' },
  })
  console.log(`  COM_VENDEDOR: updated ${comVendedor.count} clients`)

  // Remaining clients with null vendedorId and fornecedor=false stay as SEM_VENDEDOR (default)
  const semVendedor = await prisma.cliente.count({
    where: { carteira: 'SEM_VENDEDOR', vendedorId: null, fornecedor: false },
  })
  console.log(`  SEM_VENDEDOR: ${semVendedor} clients (already set by default)`)

  // ─── Step 3: Delete system users ────────────────────
  if (systemUsers.length > 0) {
    // First, delete any favorites referencing system users
    await prisma.favorite.deleteMany({
      where: { userId: { in: systemUserIds } },
    })

    // Delete system users (onDelete: SetNull will clear vendedorId on their clients)
    await prisma.user.deleteMany({
      where: { email: { in: SYSTEM_USER_EMAILS } },
    })
    console.log(`🗑️ Deleted ${systemUsers.length} system users`)
  } else {
    console.log('ℹ️ No system users found (may have already been removed)')
  }

  // ─── Step 4: Seed permissions ───────────────────────
  console.log('🔐 Seeding permissions...')

  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description, category: perm.category },
      create: perm,
    })
  }
  console.log(`✅ Seeded ${PERMISSIONS.length} permissions`)

  // ─── Step 5: Seed role permissions ──────────────────
  console.log('🔑 Seeding role permissions...')

  let rpCount = 0
  for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    for (const [key, allowed] of Object.entries(perms)) {
      await prisma.rolePermission.upsert({
        where: { role_permissionKey: { role, permissionKey: key } },
        update: { allowed },
        create: { role, permissionKey: key, allowed },
      })
      rpCount++
    }
  }
  console.log(`✅ Seeded ${rpCount} role-permission overrides`)

  console.log('🎉 Migration complete!')
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
