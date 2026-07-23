import { redirect } from 'next/navigation'
import { getSession, canaisPermitidos } from '@/lib/auth'
import { ProdutosClient } from './ProdutosClient'

export const metadata = {
  title: 'Gestão de Produtos - EL Globo',
}

// Os filtros (q/canal/ativo) vivem na URL. O Server Component lê-os do
// searchParams e passa-os por prop — a listagem e a exportação partilham
// o mesmo estado sem useSearchParams no cliente (evita Suspense/deopt).
export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const sp = await searchParams
  const filtros = {
    q: typeof sp.q === 'string' ? sp.q : '',
    canal: typeof sp.canal === 'string' ? sp.canal : '',
    // Default histórico da listagem: só ativos.
    ativo: typeof sp.ativo === 'string' ? sp.ativo : 'true',
  }

  return <ProdutosClient role={session.role} canais={canaisPermitidos(session)} filtros={filtros} />
}
