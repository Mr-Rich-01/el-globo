import { Prisma, CanalVenda } from '@prisma/client'

type Tx = Prisma.TransactionClient

export class StockInsuficienteError extends Error {
  constructor(nomeProduto: string, faltam?: number, unidadeLabel = 'unidades') {
    super(
      faltam != null && faltam > 0
        ? `Stock insuficiente para ${nomeProduto} — faltam ${faltam} ${unidadeLabel}`
        : `Stock insuficiente para ${nomeProduto}`
    )
    this.name = 'StockInsuficienteError'
  }
}

interface DescontarOpts {
  produtoId: string
  canal: CanalVenda
  quantidade: number
  userId: string
  referencia: string
  // Ingredientes de receita: a venda nunca é travada por falta de stock —
  // o decremento é incondicional e o stock pode ficar negativo (alerta
  // registado na movimentação) até o gestor regularizar as entradas.
  permitirNegativo?: boolean
}

export interface ResultadoDesconto {
  precoVenda: number
  // precoCusto do StockCanal usado — snapshot para a margem dos relatórios
  precoCusto: number | null
  // Pode diferir do canal pedido (fallback PISCINA → RESTAURANTE)
  canalUsado: CanalVenda
}

// Desconta stock de um produto no canal indicado, dentro de uma transação.
// - Decremento condicional (updateMany + gte) para nunca ficar negativo
//   mesmo com duas vendas simultâneas do último item.
// - Auto-unboxing: se faltarem unidades e o produto tiver um "pai" (caixa)
//   com fatorConversao, desmancha as caixas necessárias no mesmo canal.
// - A Piscina sem stock próprio consome do stock do Restaurante (é servida
//   pelo bar do restaurante).
// Devolve preço de venda, custo e o canal efetivamente usado.
export async function descontarStockCanal(tx: Tx, opts: DescontarOpts): Promise<ResultadoDesconto> {
  const { produtoId, quantidade, userId, referencia, permitirNegativo } = opts

  const produto = await tx.produto.findUniqueOrThrow({ where: { id: produtoId } })

  let stockCanal = await tx.stockCanal.findUnique({
    where: { produtoId_canal: { produtoId, canal: opts.canal } },
  })
  if ((!stockCanal || !stockCanal.ativo) && opts.canal === CanalVenda.PISCINA) {
    stockCanal = await tx.stockCanal.findUnique({
      where: { produtoId_canal: { produtoId, canal: CanalVenda.RESTAURANTE } },
    })
  }
  if (!stockCanal || !stockCanal.ativo) {
    if (!permitirNegativo) {
      throw new Error(`${produto.nome} não está disponível no canal ${opts.canal}`)
    }
    // Ingrediente sem linha de stock no canal: cria/reativa a linha a zero
    // para o défice ficar visível ao gestor no inventário.
    stockCanal = await tx.stockCanal.upsert({
      where: { produtoId_canal: { produtoId, canal: opts.canal } },
      update: {},
      create: { produtoId, canal: opts.canal, precoVenda: 0, stockAtual: 0 },
    })
  }
  const canal = stockCanal.canal

  // Auto-unboxing: desmanchar caixas do produto pai se faltarem unidades
  const stockAtualNum = Number(stockCanal.stockAtual)
  if (stockAtualNum < quantidade && produto.parentProductId && produto.fatorConversao) {
    const caixasNecessarias = Math.ceil((quantidade - stockAtualNum) / produto.fatorConversao)
    const desmanchadas = await desmancharCaixa(tx, {
      caixaProdutoId: produto.parentProductId,
      unidadeProdutoId: produtoId,
      canal,
      nrCaixas: caixasNecessarias,
      fatorConversao: produto.fatorConversao,
      userId,
      referencia: `auto-unboxing:${referencia}`,
      falharSeInsuficiente: false,
    })
    if (desmanchadas === 0 && stockAtualNum < quantidade && !permitirNegativo) {
      throw new StockInsuficienteError(produto.nome)
    }
  }

  // Decremento condicional anti-race: só desconta se houver stock suficiente
  // (exceto ingredientes com permitirNegativo — nunca travam a venda).
  const r = await tx.stockCanal.updateMany({
    where: {
      id: stockCanal.id,
      ...(permitirNegativo ? {} : { stockAtual: { gte: quantidade } }),
    },
    data: { stockAtual: { decrement: quantidade } },
  })
  if (r.count === 0) {
    const atual = await tx.stockCanal.findUniqueOrThrow({ where: { id: stockCanal.id } })
    throw new StockInsuficienteError(produto.nome, quantidade - Number(atual.stockAtual))
  }

  const depois = await tx.stockCanal.findUniqueOrThrow({ where: { id: stockCanal.id } })
  await tx.movimentacaoStock.create({
    data: {
      produtoId,
      canal,
      tipo: 'SAIDA_VENDA',
      quantidade,
      stockAntes: Number(depois.stockAtual) + quantidade,
      stockDepois: depois.stockAtual,
      referencia,
      notas: Number(depois.stockAtual) < 0 ? 'ATENÇÃO: stock ficou negativo' : undefined,
      userId,
    },
  })

  return {
    precoVenda: Number(stockCanal.precoVenda),
    precoCusto: stockCanal.precoCusto != null ? Number(stockCanal.precoCusto) : null,
    canalUsado: canal,
  }
}

// Deduz os ingredientes de uma receita/ficha técnica. Nunca trava a venda:
// o stock do ingrediente pode ficar negativo (decisão de negócio) — o
// alerta fica na MovimentacaoStock e o défice visível no inventário.
// Devolve o custo somado dos ingredientes POR UNIDADE da receita (null se
// nenhum ingrediente tiver precoCusto) — usado como custo do prato/cocktail.
export async function descontarIngredientesReceita(tx: Tx, opts: {
  ingredientes: { produtoId: string; quantidade: Prisma.Decimal | number }[]
  canal: CanalVenda
  multiplicador: number
  userId: string
  referencia: string
}): Promise<number | null> {
  let custoUnitario: number | null = null
  for (const ingrediente of opts.ingredientes) {
    const res = await descontarStockCanal(tx, {
      produtoId: ingrediente.produtoId,
      canal: opts.canal,
      quantidade: Number(ingrediente.quantidade) * opts.multiplicador,
      userId: opts.userId,
      referencia: opts.referencia,
      permitirNegativo: true,
    })
    if (res.precoCusto != null) {
      custoUnitario = (custoUnitario ?? 0) + res.precoCusto * Number(ingrediente.quantidade)
    }
  }
  return custoUnitario
}

// Prato/bebida final com receita associada: deduz o stock do próprio
// produto (guarda bloqueante normal) e, se existir FichaTecnica ativa com
// produtoId = produto, deduz também os ingredientes proporcionais no MESMO
// canal de onde o produto saiu (canalUsado cobre o fallback PISCINA→RESTAURANTE).
export async function descontarProdutoComReceita(tx: Tx, opts: DescontarOpts): Promise<ResultadoDesconto> {
  const res = await descontarStockCanal(tx, opts)

  const ficha = await tx.fichaTecnica.findFirst({
    where: { produtoId: opts.produtoId, ativo: true },
    orderBy: { criadoEm: 'desc' },
    include: { ingredientes: true },
  })
  if (ficha) {
    const custoIngredientes = await descontarIngredientesReceita(tx, {
      ingredientes: ficha.ingredientes,
      canal: res.canalUsado,
      multiplicador: opts.quantidade,
      userId: opts.userId,
      referencia: `${opts.referencia}:receita-${ficha.nome}`,
    })
    // Se o produto final não tem custo próprio, o custo real do prato é o
    // dos ingredientes consumidos (sem somar ambos — evita dupla contagem).
    if (res.precoCusto == null && custoIngredientes != null) {
      return { ...res, precoCusto: custoIngredientes }
    }
  }

  return res
}

// Regista uma quebra de stock: decremento condicional direto no canal
// exato (sem auto-unboxing nem fallback de canal — a quebra é física e
// aconteceu onde aconteceu), linha em `quebras` e movimentação
// SAIDA_QUEBRA. Falha se não houver stock suficiente.
export async function registarQuebraStock(tx: Tx, opts: {
  produtoId: string
  canal: CanalVenda
  quantidade: number
  motivo: string
  notas?: string | null
  userId: string
}) {
  const { produtoId, canal, quantidade, motivo, notas, userId } = opts

  const produto = await tx.produto.findUniqueOrThrow({ where: { id: produtoId } })
  const stockCanal = await tx.stockCanal.findUnique({
    where: { produtoId_canal: { produtoId, canal } },
  })
  if (!stockCanal) {
    throw new Error(`${produto.nome} não tem stock no canal ${canal}`)
  }

  const r = await tx.stockCanal.updateMany({
    where: { id: stockCanal.id, stockAtual: { gte: quantidade } },
    data: { stockAtual: { decrement: quantidade } },
  })
  if (r.count === 0) {
    const atual = await tx.stockCanal.findUniqueOrThrow({ where: { id: stockCanal.id } })
    throw new StockInsuficienteError(produto.nome, quantidade - Number(atual.stockAtual))
  }

  const quebra = await tx.quebra.create({
    data: { produtoId, canal, quantidade, motivo, notas: notas ?? null, userId },
  })

  const depois = await tx.stockCanal.findUniqueOrThrow({ where: { id: stockCanal.id } })
  await tx.movimentacaoStock.create({
    data: {
      produtoId,
      canal,
      tipo: 'SAIDA_QUEBRA',
      quantidade,
      stockAntes: Number(depois.stockAtual) + quantidade,
      stockDepois: depois.stockAtual,
      referencia: quebra.id,
      notas: motivo,
      userId,
    },
  })

  return quebra
}

// Regista uma ENTRADA manual de stock (receção de compra/reposição):
// incremento no canal exato + movimentação ENTRADA_COMPRA com
// stockAntes/stockDepois. Se vier precoCusto, atualiza o custo da linha
// (o custo da última compra passa a ser o custo de referência).
// Exige linha StockCanal existente — entrada num canal onde o produto
// nunca foi ativado é quase sempre engano.
export async function registarEntradaStock(tx: Tx, opts: {
  produtoId: string
  canal: CanalVenda
  quantidade: number
  precoCusto?: number | null
  referencia?: string
  notas?: string | null
  userId: string
}): Promise<{ stockDepois: number }> {
  const { produtoId, canal, quantidade, precoCusto, notas, userId } = opts

  const produto = await tx.produto.findUniqueOrThrow({ where: { id: produtoId } })
  const stockCanal = await tx.stockCanal.findUnique({
    where: { produtoId_canal: { produtoId, canal } },
  })
  if (!stockCanal) {
    throw new Error(`${produto.nome} não está ativo no canal ${canal} — edite o produto e ative-o nesse canal primeiro`)
  }

  const depois = await tx.stockCanal.update({
    where: { id: stockCanal.id },
    data: {
      stockAtual: { increment: quantidade },
      ...(precoCusto != null ? { precoCusto } : {}),
    },
  })

  await tx.movimentacaoStock.create({
    data: {
      produtoId,
      canal,
      tipo: 'ENTRADA_COMPRA',
      quantidade,
      stockAntes: Number(depois.stockAtual) - quantidade,
      stockDepois: depois.stockAtual,
      referencia: opts.referencia ?? 'entrada-manual',
      notas: notas ?? null,
      userId,
    },
  })

  return { stockDepois: Number(depois.stockAtual) }
}

interface DesmancharOpts {
  caixaProdutoId: string
  unidadeProdutoId: string
  canal: CanalVenda
  nrCaixas: number
  fatorConversao: number
  userId: string
  referencia: string
  falharSeInsuficiente?: boolean
}

// Desmancha N caixas em unidades no mesmo canal (usado pelo auto-unboxing
// e pela ação manual "Desmanchar caixa" do gestor de stock).
// Devolve o número de caixas efetivamente desmanchadas.
export async function desmancharCaixa(tx: Tx, opts: DesmancharOpts): Promise<number> {
  const { caixaProdutoId, unidadeProdutoId, canal, nrCaixas, fatorConversao, userId, referencia } = opts

  const stockCaixa = await tx.stockCanal.findUnique({
    where: { produtoId_canal: { produtoId: caixaProdutoId, canal } },
  })
  if (!stockCaixa) {
    if (opts.falharSeInsuficiente !== false) throw new Error('Caixa sem stock neste canal')
    return 0
  }

  // Decremento condicional das caixas
  const r = await tx.stockCanal.updateMany({
    where: { id: stockCaixa.id, stockAtual: { gte: nrCaixas } },
    data: { stockAtual: { decrement: nrCaixas } },
  })
  if (r.count === 0) {
    if (opts.falharSeInsuficiente !== false) {
      const caixa = await tx.produto.findUnique({ where: { id: caixaProdutoId } })
      throw new StockInsuficienteError(
        caixa?.nome ?? 'Caixa',
        nrCaixas - Number(stockCaixa.stockAtual),
        'caixas'
      )
    }
    return 0
  }

  const unidades = nrCaixas * fatorConversao
  const stockUnidade = await tx.stockCanal.upsert({
    where: { produtoId_canal: { produtoId: unidadeProdutoId, canal } },
    update: { stockAtual: { increment: unidades } },
    create: { produtoId: unidadeProdutoId, canal, precoVenda: 0, stockAtual: unidades },
  })

  const caixaDepois = await tx.stockCanal.findUniqueOrThrow({ where: { id: stockCaixa.id } })
  await tx.movimentacaoStock.create({
    data: {
      produtoId: caixaProdutoId,
      canal,
      tipo: 'SAIDA_DESMANCHE',
      quantidade: nrCaixas,
      stockAntes: Number(caixaDepois.stockAtual) + nrCaixas,
      stockDepois: caixaDepois.stockAtual,
      referencia,
      userId,
    },
  })
  await tx.movimentacaoStock.create({
    data: {
      produtoId: unidadeProdutoId,
      canal,
      tipo: 'ENTRADA_DESMANCHE',
      quantidade: unidades,
      stockAntes: Number(stockUnidade.stockAtual) - unidades,
      stockDepois: stockUnidade.stockAtual,
      referencia,
      userId,
    },
  })

  return nrCaixas
}

interface TransferirOpts {
  produtoId: string
  canalOrigem: CanalVenda
  canalDestino: CanalVenda
  quantidade: number
  userId: string
  referencia: string
  // Preço de venda a usar se a linha StockCanal de destino não existir
  // (senão herda o preço da origem).
  precoVendaDestino?: number
}

// Transfere stock de um canal para outro na mesma transação:
// decremento condicional anti-race na origem + incremento no destino,
// com duas movimentações (saída na origem, entrada no destino).
// Se a linha de destino não existir, é criada herdando o preço da origem
// (ou usando precoVendaDestino, se fornecido).
export async function transferirStock(tx: Tx, opts: TransferirOpts): Promise<void> {
  const { produtoId, canalOrigem, canalDestino, quantidade, userId, referencia } = opts

  if (canalOrigem === canalDestino) {
    throw new Error('O canal de origem e o de destino têm de ser diferentes')
  }

  const produto = await tx.produto.findUniqueOrThrow({ where: { id: produtoId } })

  const stockOrigem = await tx.stockCanal.findUnique({
    where: { produtoId_canal: { produtoId, canal: canalOrigem } },
  })
  if (!stockOrigem) {
    throw new Error(`${produto.nome} não tem stock no canal ${canalOrigem}`)
  }

  // Decremento condicional anti-race na origem
  const r = await tx.stockCanal.updateMany({
    where: { id: stockOrigem.id, stockAtual: { gte: quantidade } },
    data: { stockAtual: { decrement: quantidade } },
  })
  if (r.count === 0) {
    const atual = await tx.stockCanal.findUniqueOrThrow({ where: { id: stockOrigem.id } })
    throw new StockInsuficienteError(produto.nome, quantidade - Number(atual.stockAtual))
  }

  const stockDestino = await tx.stockCanal.upsert({
    where: { produtoId_canal: { produtoId, canal: canalDestino } },
    update: { stockAtual: { increment: quantidade } },
    create: {
      produtoId,
      canal: canalDestino,
      precoVenda: opts.precoVendaDestino ?? stockOrigem.precoVenda,
      precoCusto: stockOrigem.precoCusto,
      stockAtual: quantidade,
    },
  })

  const origemDepois = await tx.stockCanal.findUniqueOrThrow({ where: { id: stockOrigem.id } })
  await tx.movimentacaoStock.create({
    data: {
      produtoId,
      canal: canalOrigem,
      tipo: 'SAIDA_TRANSFERENCIA',
      quantidade,
      stockAntes: Number(origemDepois.stockAtual) + quantidade,
      stockDepois: origemDepois.stockAtual,
      referencia,
      notas: `Transferência ${canalOrigem} → ${canalDestino}`,
      userId,
    },
  })
  await tx.movimentacaoStock.create({
    data: {
      produtoId,
      canal: canalDestino,
      tipo: 'ENTRADA_TRANSFERENCIA',
      quantidade,
      stockAntes: Number(stockDestino.stockAtual) - quantidade,
      stockDepois: stockDestino.stockAtual,
      referencia,
      notas: `Transferência ${canalOrigem} → ${canalDestino}`,
      userId,
    },
  })
}
