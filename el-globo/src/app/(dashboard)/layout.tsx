import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { Sidebar } from '@/components/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar user={session} />
      <main className="layout-with-sidebar" style={{ flex: 1, padding: '0' }}>
        {children}
      </main>
    </div>
  )
}
