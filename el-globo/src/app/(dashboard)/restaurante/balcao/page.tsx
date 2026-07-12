import { prisma } from '@/lib/prisma'
import { getSession, REDIRECT_BY_ROLE } from '@/lib/auth'
import { redirect } from 'next/navigation'
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
      },
      orderBy: [{ categoria: { nome: 'asc' } }, { nome: 'asc' }],
    }),
    prisma.fichaTecnica.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
    }),
  ])

  const produtosMapeados = produtos.map(p => {
    const sc = p.stockCanais[0]
    return {
      id: p.id,
      nome: p.nome,
      imagemUrl: p.imagemUrl,
      precoVenda: Number(sc.precoVenda),
      stockAtual: Number(sc.stockAtual),
      categoria: { id: p.categoria.id, nome: p.categoria.nome, icone: p.categoria.icone },
    }
  })

  const fichasMapeadas = fichas.map(f => ({
    id: f.id,
    nome: f.nome,
    precoVenda: Number(f.precoVenda),
  }))

  return (
    <BalcaoClient
      produtos={produtosMapeados}
      fichas={fichasMapeadas}
      operador={session.nome}
    />
  )
}
