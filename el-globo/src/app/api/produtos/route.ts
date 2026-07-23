import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, canaisPermitidos, podeAcederCanal } from '@/lib/auth'
import { disponibilidadeProduto } from '@/lib/disponibilidade'
import { construirWhereProdutos, resolverCanalFiltro } from '@/lib/produtos/filtros'
import { z } from 'zod'
import { CanalVenda } from '@prisma/client'

const StockCanalSchema = z.object({
  canal: z.enum(['RESTAURANTE', 'BOTTLESTORE', 'PISCINA']),
  precoVenda: z.number().min(0),
  precoCusto: z.number().min(0).nullable().optional(),
  stockAtual: z.number().min(0),
  stockMinimo: z.number().min(0),
})

const ProdutoSchema = z.object({
  nome: z.string().min(1),
  sku: z.string().min(1),
  codigoBarras: z.string().optional().nullable(),
  categoriaId: z.string().min(1),
  unidadeMedida: z.enum(['UNIDADE', 'LITRO', 'MILILITRO', 'KG', 'GRAMA', 'PORCAO']),
  ativo: z.boolean().default(true),
  isIngrediente: z.boolean().default(false),
  descricao: z.string().nullable().optional(),
  // Apenas paths gerados pela nossa API de upload — nunca URLs externas
  imagemUrl: z.string().startsWith('/uploads/produtos/').nullable().optional(),
  parentProductId: z.string().nullable().optional(),
  fatorConversao: z.number().int().positive().nullable().optional(),
  stocks: z.array(StockCanalSchema).min(1),
})

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const canalParam = searchParams.get('canal') as CanalVenda | null

  if (canalParam && !podeAcederCanal(session, canalParam)) {
    return NextResponse.json({ erro: `Sem acesso ao canal ${canalParam}` }, { status: 403 })
  }

  if (canalParam) {
    // Vista de venda (POS/Comanda): só produtos vendáveis no canal, com
    // preço/stock achatados no produto. Ingredientes de preparação ficam
    // estritamente fora das listagens de venda.
    // A PISCINA é servida pelo bar do restaurante: espelha a resolução de
    // canal de descontarStockCanal — linha PISCINA ativa, senão fallback
    // para a linha RESTAURANTE.
    const canaisVista: CanalVenda[] =
      canalParam === 'PISCINA' ? ['PISCINA', 'RESTAURANTE'] : [canalParam]

    const produtos = await prisma.produto.findMany({
      where: {
        ativo: true,
        isIngrediente: false,
        stockCanais: { some: { canal: { in: canaisVista }, ativo: true } },
      },
      include: {
        // parent da categoria: permite ao POS/Tablet agrupar por
        // Grupo Pai → chips de subcategoria dependentes
        categoria: { include: { parent: true } },
        // Sem filtro `ativo` — a resolução (com fallback) é feita abaixo
        stockCanais: { where: { canal: { in: canaisVista } } },
        // Stock da caixa-pai: o auto-unboxing da venda desmancha caixas no
        // canal resolvido, por isso a disponibilidade conta-as também
        parent: {
          select: {
            stockCanais: { where: { canal: { in: canaisVista } }, select: { canal: true, stockAtual: true } },
          },
        },
      },
      orderBy: [{ categoria: { nome: 'asc' } }, { nome: 'asc' }],
    })

    const mapped = produtos.flatMap(p => {
      // Mesma resolução de linha que descontarStockCanal (lib/stock.ts):
      // linha do canal se ativa; senão, para PISCINA, a do RESTAURANTE.
      const propria = p.stockCanais.find(s => s.canal === canalParam)
      const sc = propria?.ativo
        ? propria
        : canalParam === 'PISCINA'
          ? p.stockCanais.find(s => s.canal === 'RESTAURANTE' && s.ativo) ?? null
          : null
      if (!sc) return [] // sem linha vendável — a venda também falharia

      // Caixa-pai no MESMO canal de onde a venda sairia (desmancharCaixa
      // não filtra por ativo — só a existência da linha conta)
      const stockPai = p.parent?.stockCanais.find(s => s.canal === sc.canal)
      const { stockCanais: _sc, parent: _p, ...resto } = p
      return [{
        ...resto,
        precoVenda: Number(sc.precoVenda),
        stockAtual: Number(sc.stockAtual),
        stockMinimo: Number(sc.stockMinimo),
        disponivel: disponibilidadeProduto(
          Number(sc.stockAtual),
          stockPai ? Number(stockPai.stockAtual) : null,
          p.fatorConversao,
        ),
      }]
    })
    return NextResponse.json(mapped)
  }

  // Vista de gestão: o catálogo é partilhado, mas cada gestor só vê as
  // linhas de preço/stock dos seus canais. Filtros (q/canal/ativo) vêm da
  // URL e usam o MESMO where da exportação. O canal chega como
  // `canalFiltro` — `canal` está reservado à vista de venda achatada acima.
  const permitidos = canaisPermitidos(session)
  const filtros = {
    q: searchParams.get('q'),
    canal: searchParams.get('canalFiltro'),
    ativo: searchParams.get('ativo') ?? 'true', // default histórico: só ativos
  }
  const canalAlvo = resolverCanalFiltro(filtros.canal, permitidos)
  const canaisAlvo = canalAlvo ? [canalAlvo] : permitidos
  const produtos = await prisma.produto.findMany({
    where: construirWhereProdutos(filtros, permitidos),
    include: {
      categoria: { include: { parent: true } },
      stockCanais: { where: { canal: { in: canaisAlvo } } },
      parent: { select: { id: true, nome: true, sku: true } },
      filhos: { select: { id: true, nome: true, sku: true, fatorConversao: true } },
    },
    orderBy: [{ categoria: { nome: 'asc' } }, { nome: 'asc' }],
  })

  const mapped = produtos.map(p => ({
    ...p,
    stockCanais: p.stockCanais.map(s => ({
      ...s,
      precoVenda: Number(s.precoVenda),
      precoCusto: s.precoCusto != null ? Number(s.precoCusto) : null,
      stockAtual: Number(s.stockAtual),
      stockMinimo: Number(s.stockMinimo),
    })),
  }))

  return NextResponse.json(mapped)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || !['ADMIN', 'GERENTE', 'GESTOR_STOCK'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = ProdutoSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })

    const existente = await prisma.produto.findUnique({ where: { sku: parsed.data.sku } })
    if (existente) return NextResponse.json({ erro: 'SKU já existe' }, { status: 409 })

    if (parsed.data.codigoBarras) {
      const exCdb = await prisma.produto.findFirst({ where: { codigoBarras: parsed.data.codigoBarras } })
      if (exCdb) return NextResponse.json({ erro: 'Código de Barras já existe' }, { status: 409 })
    }

    const { stocks, ...produtoData } = parsed.data

    // Gestor só pode definir preço/stock nos seus canais
    const permitidos = canaisPermitidos(session)
    const foraDoCanal = stocks.find(s => !permitidos.includes(s.canal as CanalVenda))
    if (foraDoCanal) {
      return NextResponse.json({ erro: `Sem acesso ao canal ${foraDoCanal.canal}` }, { status: 403 })
    }

    const produto = await prisma.$transaction(async (tx) => {
      const criado = await tx.produto.create({
        data: {
          ...produtoData,
          stockCanais: {
            create: stocks.map(s => ({
              canal: s.canal as CanalVenda,
              precoVenda: s.precoVenda,
              precoCusto: s.precoCusto ?? null,
              stockAtual: s.stockAtual,
              stockMinimo: s.stockMinimo,
            })),
          },
        },
        include: { stockCanais: true },
      })

      // Movimentações de stock inicial por canal
      for (const sc of criado.stockCanais) {
        if (Number(sc.stockAtual) > 0) {
          await tx.movimentacaoStock.create({
            data: {
              produtoId: criado.id,
              canal: sc.canal,
              tipo: 'ENTRADA_COMPRA',
              quantidade: sc.stockAtual,
              stockAntes: 0,
              stockDepois: sc.stockAtual,
              referencia: 'Stock Inicial',
              userId: session.sub,
            },
          })
        }
      }

      return criado
    })

    return NextResponse.json({ ok: true, produto }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ erro: 'Erro ao criar produto' }, { status: 500 })
  }
}
