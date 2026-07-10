/*
  Warnings:

  - You are about to drop the column `disponivel_bottlestore` on the `produtos` table. All the data in the column will be lost.
  - You are about to drop the column `disponivel_piscina` on the `produtos` table. All the data in the column will be lost.
  - You are about to drop the column `disponivel_restaurante` on the `produtos` table. All the data in the column will be lost.
  - You are about to drop the column `preco_compra` on the `produtos` table. All the data in the column will be lost.
  - You are about to drop the column `preco_venda` on the `produtos` table. All the data in the column will be lost.
  - You are about to drop the column `stock_atual` on the `produtos` table. All the data in the column will be lost.
  - You are about to drop the column `stock_maximo` on the `produtos` table. All the data in the column will be lost.
  - You are about to drop the column `stock_minimo` on the `produtos` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "produtos" DROP COLUMN "disponivel_bottlestore",
DROP COLUMN "disponivel_piscina",
DROP COLUMN "disponivel_restaurante",
DROP COLUMN "preco_compra",
DROP COLUMN "preco_venda",
DROP COLUMN "stock_atual",
DROP COLUMN "stock_maximo",
DROP COLUMN "stock_minimo",
ADD COLUMN     "fator_conversao" INTEGER,
ADD COLUMN     "parent_product_id" TEXT;

-- CreateTable
CREATE TABLE "stock_canal" (
    "id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "canal" "CanalVenda" NOT NULL,
    "stock_atual" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "stock_minimo" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "preco_venda" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "stock_canal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_canal_produto_id_canal_key" ON "stock_canal"("produto_id", "canal");

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_canal" ADD CONSTRAINT "stock_canal_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
