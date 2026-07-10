import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const UpdateSchema = z.object({
  nome: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'GERENTE', 'EMPREGADO_MESA', 'OPERADOR_BOTTLESTORE', 'COZINHEIRO']).optional(),
  canal: z.enum(['RESTAURANTE', 'BOTTLESTORE', 'PISCINA']).nullable().optional(),
  ativo: z.boolean().optional(),
  senha: z.string().min(6).optional(), // reset de password
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })

    const { senha, ...dados } = parsed.data

    // O admin não pode desativar-se nem despromover-se a si próprio
    if (id === session.sub && (dados.ativo === false || (dados.role && dados.role !== 'ADMIN'))) {
      return NextResponse.json({ erro: 'Não pode desativar ou despromover a própria conta' }, { status: 400 })
    }

    const roleFinal = dados.role ?? (await prisma.user.findUniqueOrThrow({ where: { id } })).role
    if (roleFinal !== 'ADMIN' && dados.canal === null) {
      return NextResponse.json({ erro: 'Utilizadores não-admin precisam de um canal atribuído' }, { status: 400 })
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...dados,
        ...(roleFinal === 'ADMIN' ? { canal: null } : {}),
        ...(senha ? { senha: await bcrypt.hash(senha, 12) } : {}),
      },
      select: { id: true, nome: true, email: true, role: true, canal: true, ativo: true },
    })

    // Nota: alterações de role/canal só têm efeito no próximo login
    // (o token JWT atual do utilizador expira em 8h no máximo).
    return NextResponse.json({ ok: true, user })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ erro: 'Erro ao atualizar utilizador' }, { status: 500 })
  }
}
