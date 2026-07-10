import type { DestinoPreparo, EstadoPedido, TipoCategoria } from '@prisma/client'

// Regras de encaminhamento Cozinha vs. Bar.
// A comida (incl. snacks preparados, ex: batatas fritas) sai da Cozinha
// (KDS); bebidas e tabaco são entregues pelo balcão do Bar (BDS).
// Se o negócio mudar (ex: snacks passarem ao bar), basta ajustar o mapa.
const DESTINO_POR_TIPO: Record<TipoCategoria, DestinoPreparo> = {
  BEBIDA_ALCOOLICA: 'BAR',
  BEBIDA_NAO_ALCOOLICA: 'BAR',
  TABACO: 'BAR',
  SNACK: 'COZINHA',
  COMIDA: 'COZINHA',
  OUTRO: 'COZINHA',
}

export function destinoDoTipoCategoria(tipo: TipoCategoria): DestinoPreparo {
  return DESTINO_POR_TIPO[tipo] ?? 'COZINHA'
}

// Fichas técnicas (receitas): se a ficha está ligada a um produto final,
// manda a categoria desse produto; senão, uma receita cujos ingredientes
// são todos bebidas (cocktail, dose) é do Bar — o resto é da Cozinha.
export function destinoDeFicha(ficha: {
  produto?: { categoria: { tipo: TipoCategoria } } | null
  ingredientes: { produto: { categoria: { tipo: TipoCategoria } } }[]
}): DestinoPreparo {
  if (ficha.produto) return destinoDoTipoCategoria(ficha.produto.categoria.tipo)
  if (ficha.ingredientes.length === 0) return 'COZINHA'
  const todosBebida = ficha.ingredientes.every(i =>
    i.produto.categoria.tipo === 'BEBIDA_ALCOOLICA' || i.produto.categoria.tipo === 'BEBIDA_NAO_ALCOOLICA'
  )
  return todosBebida ? 'BAR' : 'COZINHA'
}

// Estado agregado do pedido a partir dos estados dos itens.
// PRONTO só quando TODAS as secções (Cozinha E Bar) terminaram;
// PARCIALMENTE_PRONTO quando parte dos itens já está pronta.
export function calcularEstadoAgregado(
  itens: { estadoKDS: EstadoPedido }[]
): Extract<EstadoPedido, 'PENDENTE' | 'EM_PREPARACAO' | 'PARCIALMENTE_PRONTO' | 'PRONTO'> {
  const ativos = itens.filter(i => i.estadoKDS !== 'CANCELADO')
  if (ativos.length === 0) return 'PENDENTE'

  const prontos = ativos.filter(i => i.estadoKDS === 'PRONTO' || i.estadoKDS === 'ENTREGUE')
  if (prontos.length === ativos.length) return 'PRONTO'
  if (prontos.length > 0) return 'PARCIALMENTE_PRONTO'
  if (ativos.some(i => i.estadoKDS === 'EM_PREPARACAO')) return 'EM_PREPARACAO'
  return 'PENDENTE'
}
