import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { ImportarClient } from './ImportarClient'

export const metadata = {
  title: 'Importar Produtos - EL Globo',
}

// Importação em massa é exclusiva do ADMIN (cria/atualiza catálogo e
// stock inicial em qualquer canal).
export default async function ImportarProdutosPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'ADMIN') redirect('/stock/produtos')

  return <ImportarClient />
}
