import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

// Gestão de utilizadores — exclusivo do ADMIN (dono do complexo).
// É aqui que se atribui a cada gestor/funcionário o seu canal.

const UtilizadorSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  senha: z.string().min(6),
  role: z.enum(['ADMIN', 'GERENTE', 'EMPREGADO_MESA', 'OPERADOR_BOTTLESTORE', 'COZINHEIRO']),
  canal: z.enum(['RESTAURANTE', 'BOTTLESTORE', 'PISCINA']).nullable(),
})

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const users = await prisma.user.findMany({
    select: { id: true, nome: true, email: true, role: true, canal: true, ativo: true, criadoEm: true },
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
  })

  return NextResponse.json(users)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = UtilizadorSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })

    const { nome, email, senha, role, canal } = parsed.data

    // Todos exceto ADMIN precisam de canal — é a base do isolamento
    if (role !== 'ADMIN' && !canal) {
      return NextResponse.json({ erro: 'Utilizadores não-admin precisam de um canal atribuído' }, { status: 400 })
    }

    const existente = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existente) return NextResponse.json({ erro: 'Email já registado' }, { status: 409 })

    const user = await prisma.user.create({
      data: {
        nome,
        email: email.toLowerCase(),
        senha: await bcrypt.hash(senha, 12),
        role,
        canal: role === 'ADMIN' ? null : canal,
      },
      select: { id: true, nome: true, email: true, role: true, canal: true, ativo: true },
    })

    return NextResponse.json({ ok: true, user }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ erro: 'Erro ao criar utilizador' }, { status: 500 })
  }
}
