import { Prisma } from '@prisma/client'

// Converte recursivamente os Decimal do Prisma em number para que os dados
// possam atravessar a fronteira Server → Client Component (o React só aceita
// objetos planos — Decimal dispara "Only plain objects can be passed...").
// Datas e restantes valores passam intactos.
export function semDecimais<T>(valor: T): T {
  if (valor === null || typeof valor !== 'object') return valor
  if (Prisma.Decimal.isDecimal(valor)) return Number(valor) as unknown as T
  if (valor instanceof Date) return valor
  if (Array.isArray(valor)) return valor.map(semDecimais) as unknown as T
  const plano: Record<string, unknown> = {}
  for (const [chave, v] of Object.entries(valor)) plano[chave] = semDecimais(v)
  return plano as T
}
