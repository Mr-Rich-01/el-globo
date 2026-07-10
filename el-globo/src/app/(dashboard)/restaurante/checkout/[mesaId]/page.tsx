import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { CheckoutMesaClient } from './CheckoutMesaClient'

export const metadata = { title: 'Fechar Conta - EL Globo' }

export default async function CheckoutMesaPage({ params }: { params: Promise<{ mesaId: string }> }) {
  const { mesaId } = await params
  const session = await getSession()

  const mesa = await prisma.mesa.findUnique({
    where: { id: mesaId },
    include: {
      pedidos: {
        where: { estado: { notIn: ['ENTREGUE', 'CANCELADO'] } },
        include: { itens: { include: { produto: true, fichaTecnica: true } } },
        orderBy: { criadoEm: 'asc' },
      },
    },
  })
  if (!mesa) notFound()

  const linhas = mesa.pedidos.flatMap(p =>
    p.itens.map(i => ({
      id: i.id,
      nome: i.produto?.nome ?? i.fichaTecnica?.nome ?? 'Item',
      quantidade: i.quantidade,
      precoUnitario: Number(i.precoUnitario),
    }))
  )

  return (
    <CheckoutMesaClient
      mesaId={mesa.id}
      mesaNumero={mesa.numero}
      linhas={linhas}
      operador={session?.nome}
    />
  )
}
