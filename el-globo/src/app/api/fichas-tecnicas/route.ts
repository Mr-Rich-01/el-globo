import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, podeAcederCanal } from '@/lib/auth'
import { disponibilidadeFicha } from '@/lib/disponibilidade'
import { z } from 'zod'
import { CanalVenda } from '@prisma/client'

const FichaTecnicaSchema = z.object({
  nome: z.string().min(1),
  descricao: z.string().optional().nullable(),
  produtoId: z.string().optional().nullable(),
  precoVenda: z.number().min(0),
  ativo: z.boolean().default(true),
  ingredientes: z.array(z.object({
    produtoId: z.string().min(1),
    quantidade: z.number().min(0.0001),
    unidade: z.enum(['UNIDADE', 'LITRO', 'MILILITRO', 'KG', 'GRAMA', 'PORCAO'])
  })).min(1)
})

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const ativo = searchParams.get('ativo')
  // ?canal= (opcional, vista de venda): acrescenta `disponivel` calculado
  // pelo ingrediente mais escasso nesse canal. Sem o parâmetro a resposta
  // mantém-se exatamente igual (páginas de gestão de stock).
  const canalParam = searchParams.get('canal') as CanalVenda | null

  if (canalParam && !podeAcederCanal(session, canalParam)) {
    return NextResponse.json({ erro: `Sem acesso ao canal ${canalParam}` }, { status: 403 })
  }

  const where: Record<string, unknown> = {}
  if (ativo !== null) where.ativo = ativo === 'true'

  // PISCINA sem stock próprio consome do RESTAURANTE (lib/stock.ts)
  const canaisVista: CanalVenda[] | null = canalParam
    ? canalParam === 'PISCINA' ? ['PISCINA', 'RESTAURANTE'] : [canalParam]
    : null

  const fichas = await prisma.fichaTecnica.findMany({
    where,
    include: {
      produto: true,
      ingredientes: {
        include: {
          produto: canaisVista
            ? { include: { stockCanais: { where: { canal: { in: canaisVista } }, select: { canal: true, stockAtual: true, ativo: true } } } }
            : true,
        }
      }
    },
    orderBy: { nome: 'asc' },
  })

  if (!canalParam) return NextResponse.json(fichas)

  // Disponibilidade advisory (só de UI): a venda deduz ingredientes com
  // permitirNegativo e nunca é travada por eles. Resolução de canal por
  // ingrediente igual à do desconto: linha do canal se ativa, senão
  // fallback PISCINA→RESTAURANTE, senão 0.
  const stockIngrediente = (rows: { canal: CanalVenda; stockAtual: unknown; ativo: boolean }[]): number => {
    const propria = rows.find(s => s.canal === canalParam)
    if (propria?.ativo) return Number(propria.stockAtual)
    if (canalParam === 'PISCINA') {
      const rest = rows.find(s => s.canal === 'RESTAURANTE' && s.ativo)
      if (rest) return Number(rest.stockAtual)
    }
    return 0
  }

  const mapped = fichas.map(f => {
    const disp = disponibilidadeFicha(f.ingredientes.map(i => ({
      produtoId: i.produtoId,
      quantidade: Number(i.quantidade),
      stockAtual: stockIngrediente((i.produto as unknown as { stockCanais: { canal: CanalVenda; stockAtual: unknown; ativo: boolean }[] }).stockCanais),
    })))
    return {
      ...f,
      // Mantém o payload dos ingredientes igual ao da vista sem canal
      ingredientes: f.ingredientes.map(i => {
        const prod = i.produto as unknown as Record<string, unknown>
        const { stockCanais: _sc, ...produtoResto } = prod
        return { ...i, produto: produtoResto }
      }),
      // Infinity (ficha sem receita) não sobrevive à serialização JSON
      disponivel: Number.isFinite(disp) ? disp : null,
    }
  })

  return NextResponse.json(mapped)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || !['ADMIN', 'GERENTE', 'GESTOR_STOCK'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = FichaTecnicaSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })

    // Um produto final só pode ter UMA receita ativa — a dedução automática
    // de ingredientes na venda usa a ficha associada e tem de ser inequívoca.
    if (parsed.data.produtoId && parsed.data.ativo) {
      const fichaExistente = await prisma.fichaTecnica.findFirst({
        where: { produtoId: parsed.data.produtoId, ativo: true },
      })
      if (fichaExistente) {
        return NextResponse.json(
          { erro: `O produto já tem a receita ativa "${fichaExistente.nome}" — desative-a primeiro` },
          { status: 409 }
        )
      }
    }

    const ficha = await prisma.fichaTecnica.create({
      data: {
        nome: parsed.data.nome,
        descricao: parsed.data.descricao,
        produtoId: parsed.data.produtoId,
        precoVenda: parsed.data.precoVenda,
        ativo: parsed.data.ativo,
        ingredientes: {
          create: parsed.data.ingredientes.map(i => ({
            produtoId: i.produtoId,
            quantidade: i.quantidade,
            unidade: i.unidade
          }))
        }
      },
      include: { ingredientes: true }
    })

    return NextResponse.json({ ok: true, ficha }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ erro: 'Erro ao criar ficha técnica' }, { status: 500 })
  }
}
