-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'GERENTE', 'EMPREGADO_MESA', 'OPERADOR_BOTTLESTORE', 'COZINHEIRO');

-- CreateEnum
CREATE TYPE "CanalVenda" AS ENUM ('RESTAURANTE', 'BOTTLESTORE', 'PISCINA');

-- CreateEnum
CREATE TYPE "EstadoMesa" AS ENUM ('LIVRE', 'OCUPADA', 'CONTA_PEDIDA', 'RESERVADA');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('PENDENTE', 'EM_PREPARACAO', 'PRONTO', 'ENTREGUE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoAba" AS ENUM ('ABERTA', 'FECHADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "MetodoPagamento" AS ENUM ('DINHEIRO', 'CARTAO', 'MOBILE_MONEY', 'MISTO', 'CREDITO');

-- CreateEnum
CREATE TYPE "EstadoVenda" AS ENUM ('PENDENTE', 'PAGA', 'CANCELADA', 'REEMBOLSADA');

-- CreateEnum
CREATE TYPE "UnidadeMedida" AS ENUM ('UNIDADE', 'LITRO', 'MILILITRO', 'KG', 'GRAMA', 'PORCAO');

-- CreateEnum
CREATE TYPE "TipoCategoria" AS ENUM ('BEBIDA_ALCOOLICA', 'BEBIDA_NAO_ALCOOLICA', 'COMIDA', 'TABACO', 'SNACK', 'OUTRO');

-- CreateEnum
CREATE TYPE "EstadoSessaoCaixa" AS ENUM ('ABERTA', 'FECHADA');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPREGADO_MESA',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoCategoria" NOT NULL,
    "icone" TEXT,
    "cor" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "codigo_barras" TEXT,
    "sku" TEXT,
    "categoria_id" TEXT NOT NULL,
    "preco_venda" DECIMAL(10,2) NOT NULL,
    "preco_compra" DECIMAL(10,2),
    "unidade_medida" "UnidadeMedida" NOT NULL,
    "stock_atual" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "stock_minimo" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "stock_maximo" DECIMAL(10,3),
    "disponivel_restaurante" BOOLEAN NOT NULL DEFAULT true,
    "disponivel_bottlestore" BOOLEAN NOT NULL DEFAULT true,
    "disponivel_piscina" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "imagem" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fichas_tecnicas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "produto_id" TEXT,
    "preco_venda" DECIMAL(10,2) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fichas_tecnicas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fichas_tecnicas_itens" (
    "id" TEXT NOT NULL,
    "ficha_tecnica_id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "quantidade" DECIMAL(10,4) NOT NULL,
    "unidade" "UnidadeMedida" NOT NULL,

    CONSTRAINT "fichas_tecnicas_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacoes_stock" (
    "id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" DECIMAL(10,3) NOT NULL,
    "stock_antes" DECIMAL(10,3) NOT NULL,
    "stock_depois" DECIMAL(10,3) NOT NULL,
    "referencia" TEXT,
    "notas" TEXT,
    "user_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacoes_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quebras" (
    "id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "quantidade" DECIMAL(10,3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "notas" TEXT,
    "user_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quebras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mesas" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "nome" TEXT,
    "zona" TEXT,
    "estado" "EstadoMesa" NOT NULL DEFAULT 'LIVRE',
    "lugares" INTEGER NOT NULL DEFAULT 4,
    "posX" INTEGER,
    "posY" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mesas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "canal" "CanalVenda" NOT NULL,
    "mesa_id" TEXT,
    "aba_id" TEXT,
    "user_id" TEXT NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'PENDENTE',
    "notas" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_pedido" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "produto_id" TEXT,
    "ficha_tecnica_id" TEXT,
    "quantidade" INTEGER NOT NULL,
    "preco_unitario" DECIMAL(10,2) NOT NULL,
    "notas" TEXT,
    "estado_kds" "EstadoPedido" NOT NULL DEFAULT 'PENDENTE',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itens_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abas" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "nome_cliente" TEXT,
    "telefone" TEXT,
    "estado" "EstadoAba" NOT NULL DEFAULT 'ABERTA',
    "notas" TEXT,
    "aberta_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechada_em" TIMESTAMP(3),

    CONSTRAINT "abas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendas" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "canal" "CanalVenda" NOT NULL,
    "aba_id" TEXT,
    "user_id" TEXT NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "desconto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "metodo_pagamento" "MetodoPagamento" NOT NULL,
    "valor_dinheiro" DECIMAL(10,2),
    "valor_cartao" DECIMAL(10,2),
    "valor_mobile" DECIMAL(10,2),
    "valor_recebido" DECIMAL(10,2),
    "troco" DECIMAL(10,2),
    "estado" "EstadoVenda" NOT NULL DEFAULT 'PAGA',
    "notas" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_venda" (
    "id" TEXT NOT NULL,
    "venda_id" TEXT NOT NULL,
    "produto_id" TEXT,
    "nome_produto" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "preco_unitario" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "itens_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes_caixa" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "canal" "CanalVenda" NOT NULL,
    "estado" "EstadoSessaoCaixa" NOT NULL DEFAULT 'ABERTA',
    "fundo_inicial" DECIMAL(10,2) NOT NULL,
    "total_vendas" DECIMAL(10,2),
    "total_dinheiro" DECIMAL(10,2),
    "total_cartao" DECIMAL(10,2),
    "total_mobile" DECIMAL(10,2),
    "nr_transacoes" INTEGER,
    "diferenca" DECIMAL(10,2),
    "notas" TEXT,
    "aberto_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechado_em" TIMESTAMP(3),

    CONSTRAINT "sessoes_caixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'string',

    CONSTRAINT "configuracoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_codigo_barras_key" ON "produtos"("codigo_barras");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_sku_key" ON "produtos"("sku");

-- CreateIndex
CREATE INDEX "produtos_codigo_barras_idx" ON "produtos"("codigo_barras");

-- CreateIndex
CREATE INDEX "produtos_categoria_id_idx" ON "produtos"("categoria_id");

-- CreateIndex
CREATE INDEX "produtos_nome_idx" ON "produtos"("nome");

-- CreateIndex
CREATE INDEX "movimentacoes_stock_produto_id_idx" ON "movimentacoes_stock"("produto_id");

-- CreateIndex
CREATE INDEX "movimentacoes_stock_criado_em_idx" ON "movimentacoes_stock"("criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "mesas_numero_key" ON "mesas"("numero");

-- CreateIndex
CREATE INDEX "pedidos_canal_idx" ON "pedidos"("canal");

-- CreateIndex
CREATE INDEX "pedidos_mesa_id_idx" ON "pedidos"("mesa_id");

-- CreateIndex
CREATE INDEX "pedidos_aba_id_idx" ON "pedidos"("aba_id");

-- CreateIndex
CREATE INDEX "pedidos_estado_idx" ON "pedidos"("estado");

-- CreateIndex
CREATE INDEX "pedidos_criado_em_idx" ON "pedidos"("criado_em");

-- CreateIndex
CREATE INDEX "itens_pedido_pedido_id_idx" ON "itens_pedido"("pedido_id");

-- CreateIndex
CREATE INDEX "itens_pedido_estado_kds_idx" ON "itens_pedido"("estado_kds");

-- CreateIndex
CREATE INDEX "abas_estado_idx" ON "abas"("estado");

-- CreateIndex
CREATE INDEX "abas_identificador_idx" ON "abas"("identificador");

-- CreateIndex
CREATE UNIQUE INDEX "vendas_aba_id_key" ON "vendas"("aba_id");

-- CreateIndex
CREATE INDEX "vendas_canal_idx" ON "vendas"("canal");

-- CreateIndex
CREATE INDEX "vendas_criado_em_idx" ON "vendas"("criado_em");

-- CreateIndex
CREATE INDEX "vendas_estado_idx" ON "vendas"("estado");

-- CreateIndex
CREATE INDEX "sessoes_caixa_canal_estado_idx" ON "sessoes_caixa"("canal", "estado");

-- CreateIndex
CREATE INDEX "sessoes_caixa_aberto_em_idx" ON "sessoes_caixa"("aberto_em");

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_chave_key" ON "configuracoes"("chave");

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_tecnicas" ADD CONSTRAINT "fichas_tecnicas_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_tecnicas_itens" ADD CONSTRAINT "fichas_tecnicas_itens_ficha_tecnica_id_fkey" FOREIGN KEY ("ficha_tecnica_id") REFERENCES "fichas_tecnicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_tecnicas_itens" ADD CONSTRAINT "fichas_tecnicas_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_stock" ADD CONSTRAINT "movimentacoes_stock_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_stock" ADD CONSTRAINT "movimentacoes_stock_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quebras" ADD CONSTRAINT "quebras_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quebras" ADD CONSTRAINT "quebras_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_aba_id_fkey" FOREIGN KEY ("aba_id") REFERENCES "abas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pedido" ADD CONSTRAINT "itens_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pedido" ADD CONSTRAINT "itens_pedido_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pedido" ADD CONSTRAINT "itens_pedido_ficha_tecnica_id_fkey" FOREIGN KEY ("ficha_tecnica_id") REFERENCES "fichas_tecnicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_aba_id_fkey" FOREIGN KEY ("aba_id") REFERENCES "abas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_venda" ADD CONSTRAINT "itens_venda_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "vendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_venda" ADD CONSTRAINT "itens_venda_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes_caixa" ADD CONSTRAINT "sessoes_caixa_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
