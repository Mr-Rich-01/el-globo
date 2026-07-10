import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { canaisPermitidos } from '@/lib/canais'
import { redirect } from 'next/navigation'
import { TabletClient } from './TabletClient'

export const metadata = { title: 'Comanda Tablet - EL Globo' }

export default async function TabletPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Canais operáveis no tablet: Restaurante e/ou Piscina
  const canais = canaisPermitidos({ role: session.role, canal: session.canal ?? null })
    .filter((c): c is 'RESTAURANTE' | 'PISCINA' => c === 'RESTAURANTE' || c === 'PISCINA')
  if (canais.length === 0) redirect('/login')

  const [mesas, volantes] = await Promise.all([
    prisma.mesa.findMany({
      where: { ativo: true },
      orderBy: [{ zona: 'asc' }, { numero: 'asc' }],
      select: { id: true, numero: true, nome: true, zona: true, estado: true },
    }),
    // Volantes abertos lançados por ESTE garçom
    prisma.pedido.findMany({
      where: {
        garconId: session.sub,
        mesaId: null,
        abaId: null,
        estado: { notIn: ['CANCELADO'] },
        vendaId: null,
      },
      include: {
        itens: { include: { produto: { select: { nome: true } }, fichaTecnica: { select: { nome: true } } } },
      },
      orderBy: { criadoEm: 'asc' },
    }),
  ])

  const volantesMapeados = volantes.map(v => ({
    id: v.id,
    identificadorCliente: v.identificadorCliente ?? 'Balcão',
    estado: v.estado,
    criadoEm: v.criadoEm.toISOString(),
    linhas: v.itens.map(i => ({
      id: i.id,
      nome: i.produto?.nome ?? i.fichaTecnica?.nome ?? 'Item',
      quantidade: i.quantidade,
      precoUnitario: Number(i.precoUnitario),
    })),
  }))

  return (
    <TabletClient
      garcom={{ id: session.sub, nome: session.nome }}
      canais={canais}
      mesas={mesas}
      volantes={volantesMapeados}
    />
  )
}
