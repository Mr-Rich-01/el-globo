import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { MenuClient, ItemMenu, GrupoMenu } from './MenuClient'

// Cardápio digital público — acedido pelos clientes nas mesas via QR code.
// Sem autenticação (rota isenta no proxy.ts). Apenas consulta: os preços
// vêm SEMPRE do canal RESTAURANTE e nada aqui permite criar pedidos.

export const metadata: Metadata = {
  title: 'Cardápio — EL Globo',
  description: 'Cardápio digital do EL Globo — Restaurante, Bar & Piscina',
}

// Preços mudam no backoffice e têm de refletir no próximo scan de QR
export const dynamic = 'force-dynamic'

const GRUPO_BAR: GrupoMenu = { id: 'BAR', nome: 'Cocktails & Bar' }

export default async function MenuPage() {
  const [produtos, fichas] = await Promise.all([
    prisma.produto.findMany({
      where: {
        ativo: true,
        isIngrediente: false,
        stockCanais: { some: { canal: 'RESTAURANTE', ativo: true, precoVenda: { gt: 0 } } },
      },
      include: {
        categoria: { include: { parent: true } },
        stockCanais: { where: { canal: 'RESTAURANTE', ativo: true } },
      },
      orderBy: [{ categoria: { ordem: 'asc' } }, { nome: 'asc' }],
    }),
    prisma.fichaTecnica.findMany({
      where: { ativo: true, precoVenda: { gt: 0 } },
      orderBy: { nome: 'asc' },
    }),
  ])

  const itens: ItemMenu[] = [
    ...produtos.map(p => {
      const grupo = p.categoria.parent ?? p.categoria
      return {
        id: `prod-${p.id}`,
        nome: p.nome,
        descricao: p.descricao,
        preco: Number(p.stockCanais[0].precoVenda),
        imagemUrl: p.imagemUrl,
        grupo: { id: grupo.id, nome: grupo.nome },
        sub: p.categoria.parent ? { id: p.categoria.id, nome: p.categoria.nome } : null,
      }
    }),
    // Cocktails / receitas do bar também fazem parte do cardápio
    ...fichas.map(f => ({
      id: `ficha-${f.id}`,
      nome: f.nome,
      descricao: f.descricao,
      preco: Number(f.precoVenda),
      imagemUrl: null,
      grupo: GRUPO_BAR,
      sub: null,
    })),
  ]

  // Secções agrupadas: mantém cada grupo pai junto (e o Bar no fim)
  itens.sort((a, b) => {
    if (a.grupo.id !== b.grupo.id) {
      if (a.grupo.id === GRUPO_BAR.id) return 1
      if (b.grupo.id === GRUPO_BAR.id) return -1
      return a.grupo.nome.localeCompare(b.grupo.nome, 'pt')
    }
    const subA = a.sub?.nome ?? ''
    const subB = b.sub?.nome ?? ''
    return subA.localeCompare(subB, 'pt') || a.nome.localeCompare(b.nome, 'pt')
  })

  return <MenuClient itens={itens} />
}
