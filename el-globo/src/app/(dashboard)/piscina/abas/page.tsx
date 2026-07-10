import { prisma } from '@/lib/prisma'
import { semDecimais } from '@/lib/serializar'
import { AbasClient } from './AbasClient'

export default async function AbasPage() {
  const abas = await prisma.aba.findMany({
    where: { estado: 'ABERTA' },
    include: {
      pedidos: {
        include: { itens: { include: { produto: true, fichaTecnica: true } } },
        where: { estado: { notIn: ['CANCELADO'] } },
      },
    },
    orderBy: { abertaEm: 'asc' },
  })

  return <AbasClient abas={semDecimais(abas) as any} />
}
