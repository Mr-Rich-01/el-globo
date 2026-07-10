-- Correção de regra de negócio: snacks (ex: Batatas Fritas em porção)
-- são preparados na Cozinha, não no Bar. Reencaminha os itens já
-- backfilled pela migração bar_display_destino_preparo.
UPDATE "itens_pedido" ip
SET "destino" = 'COZINHA'
FROM "produtos" p
JOIN "categorias" c ON c."id" = p."categoria_id"
WHERE ip."produto_id" = p."id"
  AND c."tipo" = 'SNACK';
