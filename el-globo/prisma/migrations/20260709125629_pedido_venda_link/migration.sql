-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "venda_id" TEXT;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "vendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
