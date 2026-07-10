/*
  Warnings:

  - You are about to drop the column `imagem` on the `produtos` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "categorias" ADD COLUMN     "parent_category_id" TEXT;

-- AlterTable
ALTER TABLE "produtos" DROP COLUMN "imagem",
ADD COLUMN     "imagem_url" TEXT;

-- CreateIndex
CREATE INDEX "categorias_parent_category_id_idx" ON "categorias"("parent_category_id");

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
