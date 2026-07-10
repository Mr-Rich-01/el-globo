-- AlterTable
ALTER TABLE "itens_pedido" ADD COLUMN     "custo_unitario" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "itens_venda" ADD COLUMN     "custo_unitario" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "is_ingrediente" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "quebras" ADD COLUMN     "canal" "CanalVenda";
