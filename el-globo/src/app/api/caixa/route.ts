import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, resolveCanal, canaisPermitidos, CanalNaoAutorizadoError } from '@/lib/auth'
import { EstadoSessaoCaixa } from '@prisma/client'

// Listar sessões de caixa — cada gestor vê apenas os seus canais
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session || !['ADMIN', 'GERENTE'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const estado = searchParams.get('estado')
  const permitidos = canaisPermitidos(session)

  const sessoes = await prisma.sessaoCaixa.findMany({
    where: {
      canal: { in: permitidos },
      ...(estado ? { estado: estado as EstadoSessaoCaixa } : {}),
    },
    include: { user: { select: { nome: true } } },
    orderBy: { abertoEm: 'desc' },
    take: 50,
  })

  return NextResponse.json(sessoes)
}

// Abrir nova sessão de caixa — canal validado contra a sessão
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  try {
    const body = await request.json()
    const { fundoInicial } = body

    if (fundoInicial === undefined) {
      return NextResponse.json({ erro: 'fundoInicial é obrigatório' }, { status: 400 })
    }

    const canal = resolveCanal(session, body.canal)

    // Verificar se já existe uma sessão aberta para o utilizador neste canal
    const existente = await prisma.sessaoCaixa.findFirst({
      where: { userId: session.sub, canal, estado: 'ABERTA' },
    })

    if (existente) {
      return NextResponse.json({ erro: 'Já existe uma sessão aberta para si neste canal' }, { status: 400 })
    }

    const novaSessao = await prisma.sessaoCaixa.create({
      data: {
        userId: session.sub,
        canal,
        fundoInicial,
        estado: 'ABERTA',
      },
    })

    return NextResponse.json({ ok: true, sessao: novaSessao }, { status: 201 })
  } catch (error) {
    if (error instanceof CanalNaoAutorizadoError) {
      return NextResponse.json({ erro: error.message }, { status: 403 })
    }
    console.error(error)
    return NextResponse.json({ erro: 'Erro ao abrir caixa' }, { status: 500 })
  }
}
