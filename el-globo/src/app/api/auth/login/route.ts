import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken, setSessionCookie, REDIRECT_BY_ROLE } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const LoginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = LoginSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ erro: 'Dados inválidos.' }, { status: 400 })
    }

    const { email, senha } = parsed.data

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (!user || !user.ativo) {
      return NextResponse.json(
        { erro: 'Credenciais inválidas ou conta desativada.' },
        { status: 401 }
      )
    }

    const senhaCorreta = await bcrypt.compare(senha, user.senha)
    if (!senhaCorreta) {
      return NextResponse.json({ erro: 'Credenciais inválidas.' }, { status: 401 })
    }

    const token = await signToken({
      sub: user.id,
      email: user.email,
      nome: user.nome,
      role: user.role,
      canal: user.canal,
    })

    await setSessionCookie(token)

    return NextResponse.json({
      ok: true,
      user: { id: user.id, nome: user.nome, email: user.email, role: user.role, canal: user.canal },
      redirect: REDIRECT_BY_ROLE[user.role],
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ erro: 'Erro interno do servidor.' }, { status: 500 })
  }
}
