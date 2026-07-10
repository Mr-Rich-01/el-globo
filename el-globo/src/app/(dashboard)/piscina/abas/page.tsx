import { prisma } from '@/lib/prisma'
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

  return <AbasClient abas={abas as any} />
}
