import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

// Layout fullscreen para os tablets dos garçons — sem a sidebar
// administrativa do grupo (dashboard). Só exige sessão válida;
// o bloqueio por canal é feito pelo proxy (prefixo /restaurante).
export default async function TabletLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  return <main style={{ minHeight: '100dvh' }}>{children}</main>
}
