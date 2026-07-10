import { Role, CanalVenda } from '@prisma/client'

// Helpers de scoping por canal (multi-gestor). Módulo puro e isomórfico:
// usado nas API routes (via re-export em lib/auth.ts), no proxy e em
// client components (Sidebar, CaixaClient) — por isso NÃO pode importar
// next/headers nem nada server-only.

export interface SessaoCanal {
  role: Role
  canal: CanalVenda | null
}

const TODOS_CANAIS: CanalVenda[] = ['RESTAURANTE', 'BOTTLESTORE', 'PISCINA']

// A Piscina é servida pelo pessoal do restaurante, por isso o canal
// RESTAURANTE inclui acesso à PISCINA. A Bottlestore é totalmente isolada.
export function canaisPermitidos(session: SessaoCanal): CanalVenda[] {
  if (session.role === 'ADMIN') return TODOS_CANAIS
  if (!session.canal) return [] // token antigo ou utilizador mal configurado
  if (session.canal === 'RESTAURANTE') return ['RESTAURANTE', 'PISCINA']
  return [session.canal]
}

export function podeAcederCanal(session: SessaoCanal, canal: CanalVenda): boolean {
  return canaisPermitidos(session).includes(canal)
}

// Resolve o canal efetivo de uma operação: o ADMIN pode escolher;
// os restantes ficam presos ao(s) canal(is) deles — o que o cliente
// enviar só é aceite se estiver dentro do permitido.
export function resolveCanal(session: SessaoCanal, canalPedido?: string | null): CanalVenda {
  const permitidos = canaisPermitidos(session)
  if (permitidos.length === 0) {
    throw new CanalNaoAutorizadoError('Sessão sem canal atribuído — inicie sessão novamente')
  }
  if (canalPedido) {
    if (!permitidos.includes(canalPedido as CanalVenda)) {
      throw new CanalNaoAutorizadoError(`Sem acesso ao canal ${canalPedido}`)
    }
    return canalPedido as CanalVenda
  }
  return session.canal ?? permitidos[0]
}

export class CanalNaoAutorizadoError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'CanalNaoAutorizadoError'
  }
}
