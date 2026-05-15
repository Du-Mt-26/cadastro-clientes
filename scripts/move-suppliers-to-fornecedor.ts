/**
 * Move supplier clients (fornecedor=true) from BOLSÃO → FORNECEDOR carteira.
 *
 * Updated: Uses carteira enum field instead of system user IDs.
 * After the migration, BOLSÃO/LISTA_FRIA/FORNECEDOR are carteira values, not users.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Move Suppliers from BOLSÃO → FORNECEDOR ===\n");

  // ── Find clients to move ─────────────────────────────────
  const clientsToMove = await prisma.cliente.findMany({
    where: {
      carteira: "BOLSAO",
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

  console.log(`📋 Found ${clientsToMove.length} supplier client(s) in BOLSÃO to move:\n`);

  if (clientsToMove.length === 0) {
    console.log("Nothing to do. Exiting.");
    await prisma.$disconnect();
    return;
  }

  for (const c of clientsToMove) {
    console.log(`   • [${c.codigo}] ${c.nomeFantasia || c.razaoSocial || "(sem nome)"} — CNPJ: ${c.cnpj || "N/A"}`);
  }

  // ── Perform the update ───────────────────────────────────
  console.log("\n⏳ Moving clients to FORNECEDOR...");

  const result = await prisma.cliente.updateMany({
    where: {
      carteira: "BOLSAO",
      fornecedor: true,
    },
    data: {
      carteira: "FORNECEDOR",
      dataEntradaBolsao: null,
    },
  });

  console.log(`\n✅ Done! ${result.count} client(s) moved from BOLSÃO → FORNECEDOR.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
