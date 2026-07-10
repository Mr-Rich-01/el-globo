import { redirect } from 'next/navigation'
import { getSession, canaisPermitidos, hasPermission, REDIRECT_BY_ROLE } from '@/lib/auth'
import { RelatoriosClient } from './RelatoriosClient'

export const metadata = {
  title: 'Relatórios & BI - EL Globo',
}

export default async function RelatoriosPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!hasPermission(session.role, 'relatorios:view')) {
    redirect(REDIRECT_BY_ROLE[session.role])
  }

  return <RelatoriosClient canais={canaisPermitidos(session)} />
}
