/**
 * Seed script — creates initial users for the system.
 *
 * Run: bun prisma db seed
 * Or:  bunx ts-node prisma/seed-users.ts
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding users...')

  const users = [
    { name: 'Renato', email: 'renato@mtech.com.br', password: 'Mtech@2024', role: 'ADMIN' },
    { name: 'Artur', email: 'artur@mtech.com.br', password: 'Mtech@2024', role: 'ADMIN' },
    { name: 'Priscila', email: 'priscila@mtech.com.br', password: 'Mtech@2024', role: 'DIRETOR_COMERCIAL' },
    { name: 'Michelly', email: 'michelly@mtech.com.br', password: 'Mtech@2024', role: 'GERENTE_COMERCIAL' },
    { name: 'Débora', email: 'debora@mtech.com.br', password: 'Mtech@2024', role: 'VENDEDOR' },
  ]

  for (const u of users) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } })
    if (existing) {
      console.log(`  ⏭️  ${u.name} (${u.email}) already exists, skipping`)
      continue
    }

    const hashedPassword = await bcrypt.hash(u.password, 12)

    await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        password: hashedPassword,
        role: u.role,
        active: true,
      },
    })

    console.log(`  ✅ ${u.name} (${u.email}) — ${u.role}`)
  }

  // Also assign existing clients to vendors based on the `vendedor` field
  console.log('\n📋 Linking existing clients to vendors...')

  const allUsers = await prisma.user.findMany({ where: { active: true } })

  // Get all clients without vendedorId
  const unassigned = await prisma.cliente.findMany({
    where: { vendedorId: null, vendedor: { not: '' } },
    select: { id: true, vendedor: true },
  })

  for (const user of allUsers) {
    const firstName = user.name.split(' ')[0].toLowerCase()
    // SQLite doesn't support case-insensitive contains, so we filter in JS
    const matching = unassigned.filter(c =>
      c.vendedor.toLowerCase().includes(firstName)
    )

    if (matching.length > 0) {
      for (const c of matching) {
        await prisma.cliente.update({
          where: { id: c.id },
          data: { vendedorId: user.id },
        })
      }
      console.log(`  ✅ ${user.name}: ${matching.length} clients linked`)
    }
  }

  console.log('\n✨ Seed complete!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
