/**
 * Migration seed: 
 * 1. Migrates existing carteira from computed (vendedorId-based) to explicit Carteira enum
 * 2. Seeds default permissions for all roles
 * 3. Removes system users (isSystemUser=true)
 * 
 * Run: npx prisma db seed (or manually with npx tsx prisma/seed-migration-carteira.ts)
 */

import { PrismaClient, Carteira } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

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

  // ─── Step 1: Find system users ──────────────────────
  const systemUsers = await prisma.user.findMany({
    where: { isSystemUser: true },
    select: { id: true, email: true, name: true },
  })

  const systemUserMap = new Map(systemUsers.map(u => [u.id, u.email]))
  const bolsaoId = systemUsers.find(u => u.email === 'bolsao@sistema.mtech')?.id
  const listaFriaId = systemUsers.find(u => u.email === 'lista-fria@sistema.mtech')?.id
  const fornecedorId = systemUsers.find(u => u.email === 'fornecedor@sistema.mtech')?.id

  console.log(`Found ${systemUsers.length} system users:`, systemUsers.map(u => u.email))

  // ─── Step 2: Migrate carteira ───────────────────────
  console.log('📊 Migrating carteira field...')

  const allClientes = await prisma.cliente.findMany({
    select: { id: true, vendedorId: true, fornecedor: true },
  })

  let migrated = 0
  for (const c of allClientes) {
    let carteira: Carteira

    if (!c.vendedorId) {
      carteira = Carteira.SEM_VENDEDOR
    } else if (c.vendedorId === bolsaoId) {
      carteira = Carteira.BOLSAO
    } else if (c.vendedorId === listaFriaId) {
      carteira = Carteira.LISTA_FRIA
    } else if (c.vendedorId === fornecedorId) {
      carteira = Carteira.FORNECEDOR
    } else {
      carteira = Carteira.COM_VENDEDOR
    }

    // For system user assignments, clear vendedorId since we now use carteira field
    const isSystemAssignment = c.vendedorId && systemUserMap.has(c.vendedorId)

    await prisma.cliente.update({
      where: { id: c.id },
      data: {
        carteira,
        // Clear vendedorId if it was pointing to a system user
        ...(isSystemAssignment ? { vendedorId: null, vendedor: '' } : {}),
      },
    })
    migrated++
  }

  console.log(`✅ Migrated ${migrated} clients with carteira field`)

  // ─── Step 3: Delete system users ────────────────────
  if (systemUsers.length > 0) {
    // First, delete any favorites referencing system users
    await prisma.favorite.deleteMany({
      where: { userId: { in: systemUsers.map(u => u.id) } },
    })

    // Delete system users
    await prisma.user.deleteMany({
      where: { isSystemUser: true },
    })
    console.log(`🗑️ Deleted ${systemUsers.length} system users`)
  }

  // ─── Step 4: Remove isSystemUser column ─────────────
  // This will be done via prisma db push (schema already doesn't have the field)

  // ─── Step 5: Seed permissions ───────────────────────
  console.log('🔐 Seeding permissions...')

  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description, category: perm.category },
      create: perm,
    })
  }
  console.log(`✅ Seeded ${PERMISSIONS.length} permissions`)

  // ─── Step 6: Seed role permissions ──────────────────
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
