import { redirect } from 'next/navigation'
import { getSession, canaisPermitidos, hasPermission, REDIRECT_BY_ROLE } from '@/lib/auth'
import { StockBaixoTab } from '../../backoffice/relatorios/StockBaixoTab'

export const metadata = {
  title: 'Stock Baixo — EL Globo',
}

// Página dedicada de reposição — o GESTOR_STOCK não entra em /backoffice,
// por isso o relatório de stock baixo vive também aqui, dentro da área de
// Stock. Reutiliza o mesmo componente da tab de Relatórios.
export default async function StockBaixoPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (
    !hasPermission(session.role, 'relatorios:view') &&
    !hasPermission(session.role, 'relatorios:stock-baixo')
  ) {
    redirect(REDIRECT_BY_ROLE[session.role])
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800 }}>⚠️ Stock Baixo</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '4px' }}>
          Produtos abaixo do mínimo definido — priorize a reposição pelos mais críticos.
        </p>
      </div>
      <StockBaixoTab canais={canaisPermitidos(session)} />
    </div>
  )
}
