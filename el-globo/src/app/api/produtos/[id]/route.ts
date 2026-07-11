import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, canaisPermitidos } from '@/lib/auth'
import { z } from 'zod'
import { CanalVenda } from '@prisma/client'

const StockCanalSchema = z.object({
  canal: z.enum(['RESTAURANTE', 'BOTTLESTORE', 'PISCINA']),
  precoVenda: z.number().min(0),
  precoCusto: z.number().min(0).nullable().optional(),
  stockAtual: z.number().min(0),
  stockMinimo: z.number().min(0),
})

const ProdutoUpdateSchema = z.object({
  nome: z.string().min(1).optional(),
  sku: z.string().min(1).optional(),
  codigoBarras: z.string().nullable().optional(),
  categoriaId: z.string().min(1).optional(),
  unidadeMedida: z.enum(['UNIDADE', 'LITRO', 'MILILITRO', 'KG', 'GRAMA', 'PORCAO']).optional(),
  ativo: z.boolean().optional(),
  isIngrediente: z.boolean().optional(),
  descricao: z.string().nullable().optional(),
  imagemUrl: z.string().startsWith('/uploads/produtos/').nullable().optional(),
  parentProductId: z.string().nullable().optional(),
  fatorConversao: z.number().nullable().optional(),
  stocks: z.array(StockCanalSchema).optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !['ADMIN', 'GERENTE'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const parsed = ProdutoUpdateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })

    if (parsed.data.sku) {
      const existente = await prisma.produto.findUnique({ where: { sku: parsed.data.sku } })
      if (existente && existente.id !== id) return NextResponse.json({ erro: 'SKU já existe' }, { status: 409 })
    }

    if (parsed.data.codigoBarras) {
      const exCdb = await prisma.produto.findFirst({ where: { codigoBarras: parsed.data.codigoBarras } })
      if (exCdb && exCdb.id !== id) return NextResponse.json({ erro: 'Código de Barras já existe' }, { status: 409 })
    }

    const { stocks, ...produtoData } = parsed.data

    // Gestor só mexe nos SEUS canais: valida o que envia e só apaga/recria
    // linhas dos canais permitidos — as dos outros gestores ficam intactas.
    const permitidos = canaisPermitidos(session)
    if (stocks) {
      const foraDoCanal = stocks.find(s => !permitidos.includes(s.canal as CanalVenda))
      if (foraDoCanal) {
        return NextResponse.json({ erro: `Sem acesso ao canal ${foraDoCanal.canal}` }, { status: 403 })
      }
    }

    const produto = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.produto.update({
        where: { id },
        data: produtoData,
      })

      if (stocks) {
        // Guardar os valores atuais antes do delete/recreate para o ledger
        // não perder os ajustes de stock feitos na edição.
        const linhasAntes = await tx.stockCanal.findMany({
          where: { produtoId: id, canal: { in: permitidos } },
        })
        const stockAntesPorCanal = new Map(linhasAntes.map(l => [l.canal, Number(l.stockAtual)]))

        await tx.stockCanal.deleteMany({
          where: { produtoId: id, canal: { in: permitidos } },
        })

        await tx.stockCanal.createMany({
          data: stocks.map(s => ({
            produtoId: id,
            canal: s.canal as CanalVenda,
            precoVenda: s.precoVenda,
            precoCusto: s.precoCusto ?? null,
            stockAtual: s.stockAtual,
            stockMinimo: s.stockMinimo
          }))
        })

        for (const s of stocks) {
          const antes = stockAntesPorCanal.get(s.canal as CanalVenda) ?? 0
          const delta = s.stockAtual - antes
          if (delta === 0) continue
          await tx.movimentacaoStock.create({
            data: {
              produtoId: id,
              canal: s.canal as CanalVenda,
              tipo: delta > 0 ? 'ENTRADA_AJUSTE' : 'SAIDA_AJUSTE',
              quantidade: Math.abs(delta),
              stockAntes: antes,
              stockDepois: s.stockAtual,
              referencia: 'edicao-produto',
              notas: 'Ajuste de stock na edição do produto',
              userId: session.sub,
            },
          })
        }
      }

      return atualizado
    })

    return NextResponse.json({ ok: true, produto })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ erro: 'Erro ao atualizar produto' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !['ADMIN'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params

  try {
    await prisma.produto.update({
      where: { id },
      data: { ativo: false },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ erro: 'Erro ao apagar produto' }, { status: 500 })
  }
}
