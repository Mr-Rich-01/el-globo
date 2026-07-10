-- CreateEnum
CREATE TYPE "DestinoPreparo" AS ENUM ('COZINHA', 'BAR');

-- AlterEnum
ALTER TYPE "EstadoPedido" ADD VALUE 'PARCIALMENTE_PRONTO';

-- AlterTable
ALTER TABLE "itens_pedido" ADD COLUMN     "destino" "DestinoPreparo" NOT NULL DEFAULT 'COZINHA';

-- CreateIndex
CREATE INDEX "itens_pedido_destino_estado_kds_idx" ON "itens_pedido"("destino", "estado_kds");

-- Backfill: itens existentes de produtos cuja categoria pertence ao Bar
UPDATE "itens_pedido" ip
SET "destino" = 'BAR'
FROM "produtos" p
JOIN "categorias" c ON c."id" = p."categoria_id"
WHERE ip."produto_id" = p."id"
  AND c."tipo" IN ('BEBIDA_ALCOOLICA', 'BEBIDA_NAO_ALCOOLICA', 'TABACO', 'SNACK');

-- Backfill: itens de ficha técnica (cocktails/doses) — vão para o Bar
-- quando todos os ingredientes da receita são bebidas
UPDATE "itens_pedido" ip
SET "destino" = 'BAR'
WHERE ip."ficha_tecnica_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "fichas_tecnicas_itens" fti
    JOIN "produtos" p ON p."id" = fti."produto_id"
    JOIN "categorias" c ON c."id" = p."categoria_id"
    WHERE fti."ficha_tecnica_id" = ip."ficha_tecnica_id"
      AND c."tipo" NOT IN ('BEBIDA_ALCOOLICA', 'BEBIDA_NAO_ALCOOLICA')
  );
