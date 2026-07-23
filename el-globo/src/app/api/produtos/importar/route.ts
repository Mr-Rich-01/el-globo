import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import {
  lerFicheiro,
  validarLinhas,
  type ContextoValidacao,
  type PlanoImportacao,
} from '@/lib/importacao-produtos'

// Importação em massa de produtos a partir do template Excel.
// Fluxo em 2 passos com o MESMO ficheiro:
//   1. sem `confirmar` → dry-run: valida tudo e devolve o preview por
//      linha (erros/avisos/ação prevista) SEM tocar na BD;
//   2. com `confirmar=1` → revalida e grava só as linhas válidas numa
//      única transação (ou grava tudo ou nada — um catálogo
//      meio-importado é pior do que repetir o upload).
// Stock: produto/canal NOVO recebe stock_inicial + MovimentacaoStock
// ENTRADA_COMPRA (mesmo padrão do POST /api/produtos). O stockAtual de
// linhas existentes NUNCA é tocado — isso é inventário e passa pelo
// ledger anti-race de Stock → Entradas.

const TAMANHO_MAX = 5 * 1024 * 1024 // 5 MB

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ erro: 'Apenas o administrador pode importar produtos' }, { status: 401 })
  }

  try {
    const form = await request.formData()
    const ficheiro = form.get('ficheiro')
    const confirmar = form.get('confirmar') === '1'

    if (!(ficheiro instanceof File)) {
      return NextResponse.json({ erro: 'Envie o ficheiro .xlsx no campo "ficheiro"' }, { status: 400 })
    }
    if (ficheiro.size > TAMANHO_MAX) {
      return NextResponse.json({ erro: 'Ficheiro demasiado grande (máx. 5 MB)' }, { status: 400 })
    }

    const linhasCruas = await lerFicheiro(await ficheiro.arrayBuffer())
    if (linhasCruas.length === 0) {
      return NextResponse.json({ erro: 'O ficheiro não tem linhas de produtos' }, { status: 400 })
    }

    const ctx = await carregarContexto(linhasCruas)
    const plano = validarLinhas(linhasCruas, ctx)

    if (!confirmar) {
      return NextResponse.json({ dryRun: true, linhas: plano.linhas, resumo: plano.resumo })
    }

    if (plano.produtos.length === 0) {
      return NextResponse.json(
        { erro: 'Nenhuma linha válida para importar', linhas: plano.linhas, resumo: plano.resumo },
        { status: 400 }
      )
    }

    const resultado = await executarImportacao(plano, session.sub)
    return NextResponse.json({
      ok: true,
      ...resultado,
      linhas: plano.linhas,
      resumo: plano.resumo,
    })
  } catch (error: unknown) {
    console.error('Erro na importação de produtos:', error)
    // Colisão benigna: outra importação/utilizador criou entretanto o mesmo
    // SKU, código de barras ou par (produto, canal). A constraint única
    // (stock_canal_produto_id_canal_key, users_email_key, etc.) disparou e a
    // transação inteira reverteu — nada foi gravado, nenhum movimento de
    // stock duplicado. Devolve 409 (não 500) para o utilizador repetir.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { erro: 'Conflito de SKU, código de barras ou canal criado entretanto por outra importação — repita a pré-visualização. Nada foi gravado.' },
        { status: 409 }
      )
    }
    const mensagem = error instanceof Error ? error.message : 'Erro ao importar produtos'
    return NextResponse.json({ erro: mensagem }, { status: 400 })
  }
}

// Busca à BD tudo o que a validação precisa (categorias, SKUs e códigos
// de barras já existentes, linhas StockCanal já criadas).
async function carregarContexto(linhasCruas: { valores: Record<string, string> }[]): Promise<ContextoValidacao> {
  const skus = [...new Set(linhasCruas.map(l => l.valores.sku.trim().toUpperCase()).filter(Boolean))]
  const codigosBarras = [...new Set(linhasCruas.map(l => l.valores.codigo_barras.trim()).filter(Boolean))]

  const [categorias, produtos, donosCodigoBarras] = await Promise.all([
    prisma.categoria.findMany({ where: { ativo: true }, select: { id: true, nome: true, parentCategoryId: true } }),
    prisma.produto.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true, codigoBarras: true, stockCanais: { select: { canal: true, stockAtual: true } } },
    }),
    prisma.produto.findMany({
      where: { codigoBarras: { in: codigosBarras } },
      select: { sku: true, codigoBarras: true },
    }),
  ])

  const produtosPorSku = new Map(produtos.map(p => [p.sku!, { id: p.id, codigoBarras: p.codigoBarras }]))
  const skuPorCodigoBarras = new Map(
    donosCodigoBarras.filter(p => p.sku).map(p => [p.codigoBarras!, p.sku!])
  )
  const stockCanaisExistentes = new Map<string, string>(
    produtos.flatMap(p => p.stockCanais.map(s => [`${p.id}:${s.canal}`, String(s.stockAtual)] as [string, string]))
  )

  return { categorias, produtosPorSku, skuPorCodigoBarras, stockCanaisExistentes }
}

async function executarImportacao(plano: PlanoImportacao, userId: string) {
  return prisma.$transaction(
    async (tx) => {
      let criados = 0
      let atualizados = 0

      for (const p of plano.produtos) {
        if (!p.produtoExistenteId) {
          const criado = await tx.produto.create({
            data: {
              nome: p.nome,
              sku: p.sku,
              codigoBarras: p.codigoBarras,
              descricao: p.descricao,
              categoriaId: p.categoriaId,
              unidadeMedida: p.unidadeMedida,
              isIngrediente: p.isIngrediente,
              ativo: p.ativo,
              stockCanais: {
                create: p.stocks.map(s => ({
                  canal: s.canal,
                  precoVenda: s.precoVenda,
                  precoCusto: s.precoCusto,
                  stockAtual: s.stockInicial,
                  stockMinimo: s.stockMinimo,
                })),
              },
            },
          })
          for (const s of p.stocks) {
            if (Number(s.stockInicial) > 0) {
              await tx.movimentacaoStock.create({
                data: {
                  produtoId: criado.id,
                  canal: s.canal,
                  tipo: 'ENTRADA_COMPRA',
                  quantidade: s.stockInicial,
                  stockAntes: 0,
                  stockDepois: s.stockInicial,
                  referencia: 'importacao-excel',
                  notas: 'Stock inicial via importação Excel',
                  userId,
                },
              })
            }
          }
          criados++
          continue
        }

        // Lock pessimista do produto: a decisão INSERT vs UPDATE por
        // (produto, canal) é tomada AQUI, dentro da transação, não pela
        // classificação do dry-run — que pode ter ficado obsoleta se outra
        // linha do mesmo ficheiro (ou outro utilizador) criou o par
        // entretanto. O FOR UPDATE serializa importações concorrentes do
        // mesmo produto até ao commit.
        await tx.$queryRaw`SELECT id FROM produtos WHERE id = ${p.produtoExistenteId} FOR UPDATE`

        // SKU existente: atualiza o catálogo; campos opcionais em branco
        // no ficheiro mantêm o valor atual (não apagam dados).
        await tx.produto.update({
          where: { id: p.produtoExistenteId },
          data: {
            nome: p.nome,
            categoriaId: p.categoriaId,
            unidadeMedida: p.unidadeMedida,
            isIngrediente: p.isIngrediente,
            ativo: p.ativo,
            ...(p.descricao != null ? { descricao: p.descricao } : {}),
            ...(p.codigoBarras != null ? { codigoBarras: p.codigoBarras } : {}),
          },
        })

        for (const s of p.stocks) {
          const linhaStock = await tx.stockCanal.findUnique({
            where: { produtoId_canal: { produtoId: p.produtoExistenteId, canal: s.canal } },
          })
          if (linhaStock) {
            // Nunca tocar em stockAtual de linhas existentes
            await tx.stockCanal.update({
              where: { id: linhaStock.id },
              data: {
                precoVenda: s.precoVenda,
                stockMinimo: s.stockMinimo,
                ativo: true,
                ...(s.precoCusto != null ? { precoCusto: s.precoCusto } : {}),
              },
            })
          } else {
            // Canal novo num produto existente: a linha nasce agora, por
            // isso o stock inicial é seguro (não há vendas concorrentes
            // num canal que ainda não existia).
            await tx.stockCanal.create({
              data: {
                produtoId: p.produtoExistenteId,
                canal: s.canal,
                precoVenda: s.precoVenda,
                precoCusto: s.precoCusto,
                stockAtual: s.stockInicial,
                stockMinimo: s.stockMinimo,
              },
            })
            if (Number(s.stockInicial) > 0) {
              await tx.movimentacaoStock.create({
                data: {
                  produtoId: p.produtoExistenteId,
                  canal: s.canal,
                  tipo: 'ENTRADA_COMPRA',
                  quantidade: s.stockInicial,
                  stockAntes: 0,
                  stockDepois: s.stockInicial,
                  referencia: 'importacao-excel',
                  notas: 'Stock inicial via importação Excel (canal novo)',
                  userId,
                },
              })
            }
          }
        }
        atualizados++
      }

      return { criados, atualizados }
    },
    // Catálogos grandes: bem acima do default de 5s do Prisma
    { timeout: 120_000, maxWait: 10_000 }
  )
}
