import { CaixaClient } from './CaixaClient'
import { getSession } from '@/lib/auth'
import { canaisPermitidos } from '@/lib/canais'

export const metadata = {
  title: 'Fecho de Caixa - EL Globo',
}

export default async function CaixaPage() {
  const session = await getSession()
  const canais = session ? canaisPermitidos({ role: session.role, canal: session.canal ?? null }) : []

  return <CaixaClient canaisDisponiveis={canais} />
}
