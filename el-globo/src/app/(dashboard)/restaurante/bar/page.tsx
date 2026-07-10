import { EcraPreparo } from '@/components/EcraPreparo'

// BDS — Bar Display System: monitor fixo do bar físico. Mostra em
// tempo real (SSE) as bebidas pendentes de cada pedido; ao marcar
// "Pronto" dispara o ProntoAlert para o tablet do garçom respetivo.
export default function BDSPage() {
  return <EcraPreparo destino="BAR" />
}
