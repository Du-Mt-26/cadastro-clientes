/**
 * Seed script: Create vendor users and link existing clients to them via vendedorId.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." bun run prisma/seed-vendedores.ts
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Vendors from the image + existing users
const VENDEDORES = [
  { name: 'ALICE', email: 'alice@mtech.com.br', password: 'Mtech@2026', role: 'VENDEDOR' },
  { name: 'DEBORA PHILIPI MATOS', email: 'debora@mtech.com.br', password: 'Mtech@2026', role: 'VENDEDOR' },
  { name: 'MALU FERREIRA JARDIM', email: 'malu@mtech.com.br', password: 'Mtech@2026', role: 'VENDEDOR' },
  { name: 'MARIA EDUARDA', email: 'mariaeduarda@mtech.com.br', password: 'Mtech@2026', role: 'VENDEDOR' },
  { name: 'MARIANE GARCIA DA LUZ', email: 'mariane@mtech.com.br', password: 'Mtech@2026', role: 'VENDEDOR' },
]

// Existing admin/manager users — these are already in the DB, don't recreate
const EXISTING_USERS = [
  'Renato Alves Filho',    // ADMIN
  'Artur',                  // ADMIN
  'Priscila Neusa Ferreira', // DIRETOR_COMERCIAL
  'Michelly',               // GERENTE_COMERCIAL
  'Débora',                 // VENDEDOR (already exists)
]

async function main() {
  console.log('🔄 Seeding vendor users...')

  // 1. Create vendor user accounts
  for (const v of VENDEDORES) {
    const existing = await prisma.user.findUnique({ where: { email: v.email } })
    if (existing) {
      console.log(`  ⏭️  User ${v.name} (${v.email}) already exists, updating name if needed...`)
      // Update the name to match exactly what's in the Cliente.vendedor field
      if (existing.name !== v.name) {
        await prisma.user.update({ where: { id: existing.id }, data: { name: v.name } })
        console.log(`  ✏️  Updated name: ${existing.name} → ${v.name}`)
      }
      continue
    }

    const hashedPassword = await bcrypt.hash(v.password, 12)
    const user = await prisma.user.create({
      data: {
        name: v.name,
        email: v.email,
        password: hashedPassword,
        role: v.role,
        active: true,
      },
    })
    console.log(`  ✅ Created user: ${user.name} (${user.email}) [${user.role}]`)
  }

  // 2. Link existing clients to vendor users via vendedorId
  console.log('\n🔄 Linking clients to vendor users...')

  // Get all vendor users (VENDEDOR role)
  const vendedorUsers = await prisma.user.findMany({
    where: { role: 'VENDEDOR' },
  })

  let totalLinked = 0

  for (const user of vendedorUsers) {
    // Find clients where the vendedor text matches the user's name (case-insensitive)
    const clients = await prisma.cliente.findMany({
      where: {
        vendedor: { equals: user.name, mode: 'insensitive' },
        vendedorId: null, // Only update unlinked clients
      },
    })

    if (clients.length > 0) {
      const result = await prisma.cliente.updateMany({
        where: {
          vendedor: { equals: user.name, mode: 'insensitive' },
          vendedorId: null,
        },
        data: {
          vendedorId: user.id,
        },
      })
      console.log(`  ✅ Linked ${result.count} clients to ${user.name} (${user.email})`)
      totalLinked += result.count
    } else {
      console.log(`  ⏭️  No unlinked clients found for ${user.name}`)
    }
  }

  // 3. Also link clients to DIRETOR_COMERCIAL users if their name matches
  const diretorUsers = await prisma.user.findMany({
    where: { role: 'DIRETOR_COMERCIAL' },
  })

  for (const user of diretorUsers) {
    const clients = await prisma.cliente.findMany({
      where: {
        vendedor: { equals: user.name, mode: 'insensitive' },
        vendedorId: null,
      },
    })

    if (clients.length > 0) {
      const result = await prisma.cliente.updateMany({
        where: {
          vendedor: { equals: user.name, mode: 'insensitive' },
          vendedorId: null,
        },
        data: {
          vendedorId: user.id,
        },
      })
      console.log(`  ✅ Linked ${result.count} clients to ${user.name} (${user.email}) [${user.role}]`)
      totalLinked += result.count
    }
  }

  console.log(`\n✅ Done! Total clients linked: ${totalLinked}`)

  // 4. Summary
  const allUsers = await prisma.user.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      _count: { select: { clientes: true } },
    },
  })

  console.log('\n📊 User Summary:')
  for (const u of allUsers) {
    console.log(`  ${u.active ? '✅' : '❌'} ${u.name} (${u.email}) [${u.role}] — ${u._count.clientes} clients`)
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
