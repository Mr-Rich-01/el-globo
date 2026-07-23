import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, canaisPermitidos } from '@/lib/auth'
import { construirWhereProdutos, resolverCanalFiltro } from '@/lib/produtos/filtros'
import { construirWorkbookExport, type LinhaExport } from '@/lib/produtos/export-produtos'

// Exportação da listagem de Produtos para .xlsx.
// Aceita os mesmos filtros da listagem (q, canal, ativo) e exporta
// EXACTAMENTE o conjunto filtrado que o utilizador está a ver. Uma linha
// por par (produto, canal); produto sem linha de canal sai com `canal`
// vazio. O ficheiro é re-importável (mesmo layout do template).
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const filtros = {
    q: searchParams.get('q'),
    canal: searchParams.get('canal'),
    // Default alinhado com a listagem: sem parâmetro = só ativos.
    ativo: searchParams.get('ativo') ?? 'true',
  }

  const permitidos = canaisPermitidos(session)
  const canalAlvo = resolverCanalFiltro(filtros.canal, permitidos)
  const canaisAlvo = canalAlvo ? [canalAlvo] : permitidos

  const produtos = await prisma.produto.findMany({
    where: construirWhereProdutos(filtros, permitidos),
    include: {
      categoria: { include: { parent: true } },
      // Só as linhas dos canais acessíveis (e, se filtrado, só esse canal)
      stockCanais: { where: { canal: { in: canaisAlvo } } },
    },
  })

  const linhas: LinhaExport[] = []
  for (const p of produtos) {
    const temPai = p.categoria.parentCategoryId != null
    // grupo = categoria pai (ou a própria, se for grupo de topo);
    // subcategoria = a própria categoria quando tem pai.
    const grupo = temPai ? (p.categoria.parent?.nome ?? '') : p.categoria.nome
    const subcategoria = temPai ? p.categoria.nome : ''
    const base = {
      nome: p.nome,
      sku: p.sku,
      codigoBarras: p.codigoBarras,
      grupo,
      subcategoria,
      descricao: p.descricao,
      unidade: p.unidadeMedida as string,
      isIngrediente: p.isIngrediente,
      ativo: p.ativo,
    }

    if (p.stockCanais.length === 0) {
      // Produto sem linha de canal (nos canais acessíveis): não se omite.
      linhas.push({ ...base, canal: '', precoVenda: null, precoCusto: null, stockInicial: null, stockMinimo: null })
      continue
    }

    for (const sc of p.stockCanais) {
      linhas.push({
        ...base,
        canal: sc.canal,
        // Decimal → Number só aqui, na montagem da célula; sem aritmética.
        precoVenda: Number(sc.precoVenda),
        precoCusto: sc.precoCusto != null ? Number(sc.precoCusto) : null,
        // A coluna stock_inicial carrega o SALDO ACTUAL; na reimportação é
        // ignorada para pares existentes (ver importacao-produtos.ts).
        stockInicial: Number(sc.stockAtual),
        stockMinimo: Number(sc.stockMinimo),
      })
    }
  }

  // Ordenação: grupo → subcategoria → nome (canal como desempate estável
  // das linhas multi-canal do mesmo produto).
  linhas.sort((a, b) =>
    a.grupo.localeCompare(b.grupo, 'pt') ||
    a.subcategoria.localeCompare(b.subcategoria, 'pt') ||
    a.nome.localeCompare(b.nome, 'pt') ||
    a.canal.localeCompare(b.canal, 'pt')
  )

  const wb = construirWorkbookExport(linhas)
  const buffer = await wb.xlsx.writeBuffer()
  const hoje = new Date().toISOString().slice(0, 10)

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="produtos_${hoje}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
