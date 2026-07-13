import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, resolveCanal, CanalNaoAutorizadoError } from '@/lib/auth'
import { desmancharCaixa, StockInsuficienteError } from '@/lib/stock'
import { z } from 'zod'

// Desmanche MANUAL de caixa em unidades — reutiliza a mesma lógica do
// auto-unboxing (lib/stock.ts). GERENTE só desmancha nos seus canais.

const DesmancharSchema = z.object({
  produtoId: z.string().min(1), // a caixa (produto pai)
  quantidade: z.number().int().positive(),
  canal: z.enum(['RESTAURANTE', 'BOTTLESTORE', 'PISCINA']).optional(),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || !['ADMIN', 'GERENTE', 'GESTOR_STOCK'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = DesmancharSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })
    }

    const { produtoId, quantidade } = parsed.data
    // Nunca confiar no canal do body para não-admins
    const canal = resolveCanal(session, parsed.data.canal)

    const caixa = await prisma.produto.findUnique({
      where: { id: produtoId },
      include: { filhos: { where: { ativo: true } } },
    })
    if (!caixa) {
      return NextResponse.json({ erro: 'Produto não encontrado' }, { status: 404 })
    }

    const unidade = caixa.filhos.find(f => f.fatorConversao && f.fatorConversao > 0)
    if (!unidade || !unidade.fatorConversao) {
      return NextResponse.json(
        { erro: `${caixa.nome} não é uma caixa — não tem produto "unidade" associado` },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      await desmancharCaixa(tx, {
        caixaProdutoId: caixa.id,
        unidadeProdutoId: unidade.id,
        canal,
        nrCaixas: quantidade,
        fatorConversao: unidade.fatorConversao!,
        userId: session.sub,
        referencia: 'desmanche-manual',
      })
    })

    return NextResponse.json({
      ok: true,
      mensagem: `${quantidade} caixa(s) desmanchada(s) em ${quantidade * unidade.fatorConversao} unidades de ${unidade.nome}`,
    })
  } catch (error: unknown) {
    const status =
      error instanceof CanalNaoAutorizadoError ? 403 :
      error instanceof StockInsuficienteError ? 400 : 400
    const mensagem = error instanceof Error ? error.message : 'Erro ao desmanchar caixa'
    console.error('Erro ao desmanchar caixa:', error)
    return NextResponse.json({ erro: mensagem }, { status })
  }
}
