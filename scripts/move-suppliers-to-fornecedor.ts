/**
 * Move supplier clients (fornecedor=true) from BOLSÃO → FORNECEDOR system user.
 *
 * Steps:
 * 1. Find the FORNECEDOR system user
 * 2. Find the BOLSÃO system user
 * 3. Count & list clients currently assigned to BOLSÃO with fornecedor=true
 * 4. Update those clients: vendedorId → FORNECEDOR, dataEntradaBolsao → null
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Move Suppliers from BOLSÃO → FORNECEDOR ===\n");

  // ── Step 1: Find FORNECEDOR system user ──────────────────────────
  const fornecedorUser = await prisma.user.findFirst({
    where: {
      isSystemUser: true,
      OR: [
        { name: "FORNECEDOR" },
        { email: "fornecedor@sistema.mtech" },
      ],
    },
  });

  if (!fornecedorUser) {
    console.error("❌ FORNECEDOR system user not found!");
    process.exit(1);
  }
  console.log(`✅ Found FORNECEDOR user: ${fornecedorUser.name} (${fornecedorUser.email}) [id=${fornecedorUser.id}]`);

  // ── Step 2: Find BOLSÃO system user ──────────────────────────────
  const bolsaoUser = await prisma.user.findFirst({
    where: {
      isSystemUser: true,
      OR: [
        { name: "BOLSÃO" },
        { email: "bolsao@sistema.mtech" },
      ],
    },
  });

  if (!bolsaoUser) {
    console.error("❌ BOLSÃO system user not found!");
    process.exit(1);
  }
  console.log(`✅ Found BOLSÃO user: ${bolsaoUser.name} (${bolsaoUser.email}) [id=${bolsaoUser.id}]`);

  // ── Step 3: Find clients to move ─────────────────────────────────
  const clientsToMove = await prisma.cliente.findMany({
    where: {
      vendedorId: bolsaoUser.id,
      fornecedor: true,
    },
    select: {
      id: true,
      codigo: true,
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
      dataEntradaBolsao: true,
    },
  });

  console.log(`\n📋 Found ${clientsToMove.length} supplier client(s) in BOLSÃO to move:\n`);

  if (clientsToMove.length === 0) {
    console.log("Nothing to do. Exiting.");
    await prisma.$disconnect();
    return;
  }

  for (const c of clientsToMove) {
    console.log(`   • [${c.codigo}] ${c.nomeFantasia || c.razaoSocial || "(sem nome)"} — CNPJ: ${c.cnpj || "N/A"} — dataEntradaBolsao: ${c.dataEntradaBolsao ?? "null"}`);
  }

  // ── Step 4: Perform the update ───────────────────────────────────
  console.log("\n⏳ Moving clients to FORNECEDOR...");

  const result = await prisma.cliente.updateMany({
    where: {
      vendedorId: bolsaoUser.id,
      fornecedor: true,
    },
    data: {
      vendedorId: fornecedorUser.id,
      dataEntradaBolsao: null,
    },
  });

  console.log(`\n✅ Done! ${result.count} client(s) moved from BOLSÃO → FORNECEDOR.`);

  // ── Verification ─────────────────────────────────────────────────
  const remaining = await prisma.cliente.count({
    where: {
      vendedorId: bolsaoUser.id,
      fornecedor: true,
    },
  });

  const nowWithFornecedor = await prisma.cliente.count({
    where: {
      vendedorId: fornecedorUser.id,
      fornecedor: true,
    },
  });

  console.log(`\n🔍 Verification:`);
  console.log(`   • Remaining suppliers in BOLSÃO: ${remaining} (should be 0)`);
  console.log(`   • Suppliers now in FORNECEDOR: ${nowWithFornecedor}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
