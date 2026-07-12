import { prisma } from '@/lib/prisma'
import { getSession, REDIRECT_BY_ROLE } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { disponibilidadeProduto, disponibilidadeFicha } from '@/lib/disponibilidade'
import { BalcaoClient } from './BalcaoClient'

// Venda ao Balcão (takeaway): pedido volante + pagamento imediato,
// sem mesa física. Pratos de cozinha seguem para o KDS na mesma.
export default async function BalcaoPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['ADMIN', 'GERENTE', 'OPERADOR_BALCAO'].includes(session.role)) {
    redirect(REDIRECT_BY_ROLE[session.role])
  }

  const [produtos, fichas] = await Promise.all([
    prisma.produto.findMany({
      where: {
        ativo: true,
        isIngrediente: false,
        stockCanais: { some: { canal: 'RESTAURANTE', ativo: true } },
      },
      include: {
        categoria: true,
        stockCanais: { where: { canal: 'RESTAURANTE', ativo: true } },
        // Stock da caixa-pai no mesmo canal — o auto-unboxing da venda
        // permite vender unidades enquanto houver caixas fechadas
        parent: {
          select: {
            stockCanais: { where: { canal: 'RESTAURANTE', ativo: true }, select: { stockAtual: true } },
          },
        },
      },
      orderBy: [{ categoria: { nome: 'asc' } }, { nome: 'asc' }],
    }),
    prisma.fichaTecnica.findMany({
      where: { ativo: true },
      include: {
        ingredientes: {
          select: {
            produtoId: true,
            quantidade: true,
            produto: {
              select: {
                stockCanais: { where: { canal: 'RESTAURANTE' }, select: { stockAtual: true } },
              },
            },
          },
        },
      },
      orderBy: { nome: 'asc' },
    }),
  ])

  const produtosMapeados = produtos.map(p => {
    const sc = p.stockCanais[0]
    const stockPai = p.parent?.stockCanais[0]
    return {
      id: p.id,
      nome: p.nome,
      imagemUrl: p.imagemUrl,
      precoVenda: Number(sc.precoVenda),
      stockAtual: Number(sc.stockAtual),
      disponivel: disponibilidadeProduto(
        Number(sc.stockAtual),
        stockPai ? Number(stockPai.stockAtual) : null,
        p.fatorConversao,
      ),
      categoria: { id: p.categoria.id, nome: p.categoria.nome, icone: p.categoria.icone },
    }
  })

  const fichasMapeadas = fichas.map(f => {
    const disp = disponibilidadeFicha(f.ingredientes.map(i => ({
      produtoId: i.produtoId,
      quantidade: Number(i.quantidade),
      stockAtual: Number(i.produto.stockCanais[0]?.stockAtual ?? 0),
    })))
    return {
      id: f.id,
      nome: f.nome,
      precoVenda: Number(f.precoVenda),
      // Infinity (ficha sem receita) não sobrevive à serialização RSC
      disponivel: Number.isFinite(disp) ? disp : null,
    }
  })

  return (
    <BalcaoClient
      produtos={produtosMapeados}
      fichas={fichasMapeadas}
      operador={session.nome}
    />
  )
}
