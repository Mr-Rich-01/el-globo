import { redirect } from 'next/navigation'
import { getSession, canaisPermitidos } from '@/lib/auth'
import { ProdutosClient } from './ProdutosClient'

export const metadata = {
  title: 'Gestão de Produtos - EL Globo',
}

export default async function ProdutosPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return <ProdutosClient role={session.role} canais={canaisPermitidos(session)} />
}
