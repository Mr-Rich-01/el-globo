import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, canaisPermitidos } from '@/lib/auth'
import { construirWhereProdutos, resolverCanalFiltro } from '@/lib/produtos/filtros'
import { construirWorkbookExport, montarLinhasExport } from '@/lib/produtos/export-produtos'

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

  const linhas = montarLinhasExport(produtos)
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
