-- CreateEnum
CREATE TYPE "TipoDivisao" AS ENUM ('IGUAL', 'POR_ITEM');

-- AlterTable
ALTER TABLE "movimentacoes_stock" ADD COLUMN     "canal" "CanalVenda";

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "entregue_em" TIMESTAMP(3),
ADD COLUMN     "pronto_em" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "stock_canal" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "preco_custo" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "canal" "CanalVenda";

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "divisao_detalhe" JSONB,
ADD COLUMN     "divisao_partes" INTEGER,
ADD COLUMN     "divisao_tipo" "TipoDivisao",
ADD COLUMN     "mesa_id" TEXT;

-- CreateIndex
CREATE INDEX "movimentacoes_stock_canal_idx" ON "movimentacoes_stock"("canal");

-- CreateIndex
CREATE INDEX "stock_canal_canal_ativo_idx" ON "stock_canal"("canal", "ativo");

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
