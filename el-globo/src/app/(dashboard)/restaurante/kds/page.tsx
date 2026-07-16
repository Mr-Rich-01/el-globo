import { EcraPreparo } from '@/components/EcraPreparo'

// KDS — ecrã da Cozinha: mostra apenas os itens de comida de cada
// pedido; as bebidas vão para o BDS em /restaurante/bar.
// Kanban: Pendente → Em Preparação → Pronto, um botão por cartão.
export default function KDSPage() {
  return <EcraPreparo destino="COZINHA" variant="kanban" />
}
