import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { CheckoutPedidoClient } from './CheckoutPedidoClient'

export const metadata = { title: 'Fechar Pedido Volante - EL Globo' }

export default async function CheckoutPedidoPage({ params }: { params: Promise<{ pedidoId: string }> }) {
  const { pedidoId } = await params
  const session = await getSession()

  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: {
      itens: { include: { produto: true, fichaTecnica: true } },
      garcom: { select: { nome: true } },
    },
  })
  if (!pedido || pedido.mesaId || pedido.abaId) notFound()

  const linhas = pedido.vendaId
    ? [] // já faturado — o client mostra o aviso
    : pedido.itens.map(i => ({
        id: i.id,
        nome: i.produto?.nome ?? i.fichaTecnica?.nome ?? 'Item',
        quantidade: i.quantidade,
        precoUnitario: Number(i.precoUnitario),
      }))

  return (
    <CheckoutPedidoClient
      pedidoId={pedido.id}
      identificador={pedido.identificadorCliente ?? 'Balcão'}
      garcom={pedido.garcom?.nome}
      linhas={linhas}
      operador={session?.nome}
    />
  )
}
