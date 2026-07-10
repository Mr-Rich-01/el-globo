-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "garcon_id" TEXT,
ADD COLUMN     "identificador_cliente" TEXT;

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "identificador_cliente" TEXT;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_garcon_id_fkey" FOREIGN KEY ("garcon_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
