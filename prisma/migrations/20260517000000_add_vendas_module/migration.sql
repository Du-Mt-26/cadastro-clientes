-- CreateTable: Venda (NF-e)
CREATE TABLE "Venda" (
    "id" TEXT NOT NULL,
    "linvixId" INTEGER NOT NULL,
    "uuid" TEXT NOT NULL DEFAULT '',
    "faturamento" INTEGER NOT NULL DEFAULT 0,
    "numeroPedido" INTEGER NOT NULL DEFAULT 0,
    "numero" TEXT NOT NULL DEFAULT '',
    "serie" TEXT NOT NULL DEFAULT '1',
    "clienteCodigo" TEXT NOT NULL,
    "finalidade" TEXT NOT NULL DEFAULT '',
    "situacao" TEXT NOT NULL DEFAULT '',
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dataEmissao" TIMESTAMP(3),
    "dataSaida" TIMESTAMP(3),
    "operador" TEXT NOT NULL DEFAULT '',
    "naturezaOperacao" TEXT NOT NULL DEFAULT '',
    "emitente" TEXT NOT NULL DEFAULT '',
    "chave" TEXT NOT NULL DEFAULT '',
    "transportadora" TEXT NOT NULL DEFAULT '',
    "devolvido" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT NOT NULL DEFAULT '',
    "valorVenda" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorPago" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorProdutos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorFrete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorFinal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "formaPagamento" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'linvix',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable: VendaItem (Produtos da NF-e)
CREATE TABLE "VendaItem" (
    "id" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "item" INTEGER NOT NULL DEFAULT 0,
    "codigoProduto" TEXT NOT NULL DEFAULT '',
    "descricao" TEXT NOT NULL DEFAULT '',
    "unidade" TEXT NOT NULL DEFAULT '',
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "precoVenda" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorCusto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vendedor" TEXT NOT NULL DEFAULT '',
    "ncm" TEXT NOT NULL DEFAULT '',
    "cfop" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Venda_linvixId_key" ON "Venda"("linvixId");

-- CreateIndex
CREATE INDEX "Venda_clienteCodigo_idx" ON "Venda"("clienteCodigo");

-- CreateIndex
CREATE INDEX "Venda_dataEmissao_idx" ON "Venda"("dataEmissao");

-- CreateIndex
CREATE INDEX "Venda_situacao_idx" ON "Venda"("situacao");

-- CreateIndex
CREATE INDEX "Venda_numero_idx" ON "Venda"("numero");

-- CreateIndex
CREATE INDEX "Venda_faturamento_idx" ON "Venda"("faturamento");

-- CreateIndex
CREATE INDEX "VendaItem_vendaId_idx" ON "VendaItem"("vendaId");

-- CreateIndex
CREATE INDEX "VendaItem_codigoProduto_idx" ON "VendaItem"("codigoProduto");

-- AddForeignKey: Venda → Cliente
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_clienteCodigo_fkey" FOREIGN KEY ("clienteCodigo") REFERENCES "Cliente"("codigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: VendaItem → Venda
ALTER TABLE "VendaItem" ADD CONSTRAINT "VendaItem_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
