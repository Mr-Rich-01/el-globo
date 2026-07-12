import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPermission, canaisPermitidos } from '@/lib/auth'
import { CanalVenda } from '@prisma/client'
import { linhasStockBaixo } from '@/lib/stock-baixo'

// Snapshot dos produtos abaixo do stock mínimo (equivalente caixa/unidade).
// Sem paginação — a lista é pequena por natureza.
// RBAC: mesmo modelo do ledger — canal alheio devolve 403; sem canal,
// devolve os canais permitidos da sessão.

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  if (!hasPermission(session.role, 'relatorios:view')) {
    return NextResponse.json({ erro: 'Sem permissão para ver relatórios' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const canalParam = searchParams.get('canal')

  const permitidos = canaisPermitidos(session)
  if (canalParam && !permitidos.includes(canalParam as CanalVenda)) {
    return NextResponse.json({ erro: `Sem acesso ao canal ${canalParam}` }, { status: 403 })
  }

  const linhas = await linhasStockBaixo(canalParam ? [canalParam as CanalVenda] : permitidos)
  return NextResponse.json({ linhas })
}
