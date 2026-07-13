import { redirect } from 'next/navigation'
import { getSession, canaisPermitidos, REDIRECT_BY_ROLE } from '@/lib/auth'
import { QuebrasClient } from './QuebrasClient'

export const metadata = {
  title: 'Quebras de Stock - EL Globo',
}

export default async function QuebrasPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  // O proxy só exige stock:view (que o operador da loja também tem);
  // o registo/consulta de quebras é exclusivo de ADMIN/GERENTE/GESTOR_STOCK.
  if (!['ADMIN', 'GERENTE', 'GESTOR_STOCK'].includes(session.role)) {
    redirect(REDIRECT_BY_ROLE[session.role])
  }

  return <QuebrasClient canais={canaisPermitidos(session)} />
}
