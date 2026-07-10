import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, podeAcederCanal } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  try {
    const body = await request.json()
    const { contagemFisica, notas } = body

    const sessao = await prisma.sessaoCaixa.findUnique({ where: { id } })
    if (!sessao) return NextResponse.json({ erro: 'Sessão não encontrada' }, { status: 404 })
    if (sessao.estado === 'FECHADA') return NextResponse.json({ erro: 'Sessão já fechada' }, { status: 400 })
    if (sessao.userId !== session.sub && !['ADMIN', 'GERENTE'].includes(session.role)) {
      return NextResponse.json({ erro: 'Não pode fechar sessão de outro utilizador' }, { status: 403 })
    }
    // Gestor só fecha caixas dos seus canais (o da loja não fecha o restaurante)
    if (!podeAcederCanal(session, sessao.canal)) {
      return NextResponse.json({ erro: `Sem acesso ao canal ${sessao.canal}` }, { status: 403 })
    }

    // 1. Encontrar todas as vendas pagas neste canal, por este user, desde a abertura
    const vendas = await prisma.venda.findMany({
      where: {
        canal: sessao.canal,
        userId: sessao.userId,
        estado: 'PAGA',
        criadoEm: { gte: sessao.abertoEm }
      }
    })

    // 2. Calcular totais (agregando os decimais com segurança)
    let totalVendas = 0
    let totalDinheiro = 0
    let totalCartao = 0
    let totalMobile = 0

    vendas.forEach(v => {
      totalVendas += Number(v.total)
      if (v.metodoPagamento === 'DINHEIRO') totalDinheiro += Number(v.total)
      else if (v.metodoPagamento === 'CARTAO') totalCartao += Number(v.total)
      else if (v.metodoPagamento === 'MOBILE_MONEY') totalMobile += Number(v.total)
      else if (v.metodoPagamento === 'MISTO') {
        totalDinheiro += Number(v.valorDinheiro || 0)
        totalCartao += Number(v.valorCartao || 0)
        totalMobile += Number(v.valorMobile || 0)
      }
    })

    // Diferença apenas em relação ao dinheiro físico (Fundo inicial + Entradas em dinheiro)
    const valorEmCaixaEsperado = Number(sessao.fundoInicial) + totalDinheiro
    const diferenca = Number(contagemFisica) - valorEmCaixaEsperado

    // 3. Atualizar a sessão
    const sessaoFechada = await prisma.sessaoCaixa.update({
      where: { id },
      data: {
        estado: 'FECHADA',
        fechadoEm: new Date(),
        totalVendas,
        totalDinheiro,
        totalCartao,
        totalMobile,
        nrTransacoes: vendas.length,
        diferenca,
        notas
      }
    })

    return NextResponse.json({ ok: true, sessao: sessaoFechada })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ erro: 'Erro ao fechar caixa' }, { status: 500 })
  }
}
