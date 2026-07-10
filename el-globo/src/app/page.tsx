import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { REDIRECT_BY_ROLE } from '@/lib/auth'

export default async function RootPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  redirect(REDIRECT_BY_ROLE[session.role])
}
