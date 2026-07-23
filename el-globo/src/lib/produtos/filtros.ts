import { Prisma, CanalVenda } from '@prisma/client'

// ============================================================
// Filtro partilhado da listagem de Produtos.
// A MESMA função constrói o WHERE da vista de gestão (GET /api/produtos)
// e da exportação (GET /api/produtos/export) — duas cópias divergiriam
// em duas semanas. O estado dos filtros vive na URL (q/canal/ativo).
// ============================================================

const CANAIS_VALIDOS: CanalVenda[] = ['RESTAURANTE', 'BOTTLESTORE', 'PISCINA']

export interface FiltrosProdutos {
  // Termo livre: procura em nome, sku e código de barras.
  q?: string | null
  // Canal a exportar/listar. Só é aceite se for um canal real E estiver
  // dentro dos canais permitidos à sessão (scoping multi-gestor).
  canal?: string | null
  // 'true' = só ativos, 'false' = só inativos, qualquer outro/omisso = todos.
  ativo?: string | null
}

// Resolve o canal de filtro pedido contra os canais permitidos à sessão.
// Devolve null quando não há filtro (ou o pedido é inválido/sem acesso) —
// nesse caso a listagem/exportação abrange todos os canais permitidos.
export function resolverCanalFiltro(
  canal: string | null | undefined,
  permitidos: CanalVenda[],
): CanalVenda | null {
  if (!canal) return null
  const c = canal as CanalVenda
  return CANAIS_VALIDOS.includes(c) && permitidos.includes(c) ? c : null
}

export function construirWhereProdutos(
  filtros: FiltrosProdutos,
  permitidos: CanalVenda[],
): Prisma.ProdutoWhereInput {
  const and: Prisma.ProdutoWhereInput[] = []

  const q = filtros.q?.trim()
  if (q) {
    and.push({
      OR: [
        { nome: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { codigoBarras: { contains: q, mode: 'insensitive' } },
      ],
    })
  }

  if (filtros.ativo === 'true') and.push({ ativo: true })
  else if (filtros.ativo === 'false') and.push({ ativo: false })

  // Com canal indicado, restringe aos produtos que têm linha StockCanal
  // nesse canal. Sem canal NÃO se restringe por linha de stock: a
  // exportação inclui produtos sem canal com a coluna `canal` vazia.
  const canal = resolverCanalFiltro(filtros.canal, permitidos)
  if (canal) {
    and.push({ stockCanais: { some: { canal } } })
  }

  return and.length ? { AND: and } : {}
}
