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

    const produto = await prisma.produto.update({
      where: { id },
      data: produtoData,
    })

    if (stocks) {
      // Gestor só mexe nos SEUS canais: valida o que envia e só apaga/recria
      // linhas dos canais permitidos — as dos outros gestores ficam intactas.
      const permitidos = canaisPermitidos(session)
      const foraDoCanal = stocks.find(s => !permitidos.includes(s.canal as CanalVenda))
      if (foraDoCanal) {
        return NextResponse.json({ erro: `Sem acesso ao canal ${foraDoCanal.canal}` }, { status: 403 })
      }

      await prisma.stockCanal.deleteMany({
        where: { produtoId: id, canal: { in: permitidos } },
      })

      await prisma.stockCanal.createMany({
        data: stocks.map(s => ({
          produtoId: id,
          canal: s.canal as CanalVenda,
          precoVenda: s.precoVenda,
          precoCusto: s.precoCusto ?? null,
          stockAtual: s.stockAtual,
          stockMinimo: s.stockMinimo
        }))
      })
    }

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
