import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { MesasClient } from './MesasClient'

export default async function MesasPage() {
  const session = await getSession()
  const [mesas, volantes] = await Promise.all([
    prisma.mesa.findMany({
      where: { ativo: true },
      orderBy: [{ zona: 'asc' }, { numero: 'asc' }],
      include: {
        pedidos: {
          where: { estado: { notIn: ['ENTREGUE', 'CANCELADO'] }, vendaId: null },
          select: { id: true, criadoEm: true, estado: true },
        },
      },
    }),
    // Pedidos volantes (sem mesa/aba) por faturar — clientes de pé/balcão
    prisma.pedido.findMany({
      where: {
        mesaId: null,
        abaId: null,
        canal: { in: ['RESTAURANTE', 'PISCINA'] },
        estado: { notIn: ['CANCELADO'] },
        vendaId: null,
      },
      include: {
        itens: { select: { quantidade: true, precoUnitario: true } },
        garcom: { select: { nome: true } },
      },
      orderBy: { criadoEm: 'asc' },
    }),
  ])

  const volantesMapeados = volantes.map(v => ({
    id: v.id,
    identificadorCliente: v.identificadorCliente ?? 'Balcão',
    garcom: v.garcom?.nome ?? '—',
    estado: v.estado,
    criadoEm: v.criadoEm,
    nrItens: v.itens.reduce((acc, i) => acc + i.quantidade, 0),
    total: v.itens.reduce((acc, i) => acc + Number(i.precoUnitario) * i.quantidade, 0),
  }))

  return <MesasClient mesas={mesas} volantes={volantesMapeados} role={session?.role ?? ''} />
}
