import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { Role, CanalVenda } from '@prisma/client'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-in-production-min-32-chars'
)

export interface JWTPayload {
  sub: string    // user id
  email: string
  nome: string
  role: Role
  // Canal do utilizador. null = global (ADMIN). Tokens antigos sem este
  // campo são tratados como "sem canal" → utilizadores não-admin são
  // forçados a novo login pelo proxy.
  canal: CanalVenda | null
  iat?: number
  exp?: number
}

export async function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRY ?? '8h')
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('elglobo_token')?.value
  if (!token) return null
  return verifyToken(token)
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set('elglobo_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60, // 8 horas
    path: '/',
  })
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('elglobo_token')
}

// RBAC — permissões por role
export const PERMISSIONS = {
  ADMIN: [
    'dashboard:view', 'dashboard:admin',
    'restaurante:view', 'restaurante:manage',
    'bottlestore:view', 'bottlestore:manage',
    'piscina:view', 'piscina:manage',
    'stock:view', 'stock:manage',
    'relatorios:view', 'relatorios:stock-baixo', 'caixa:view', 'caixa:manage',
    'utilizadores:view', 'utilizadores:manage',
    'kds:view',
  ],
  GERENTE: [
    'dashboard:view',
    'restaurante:view', 'restaurante:manage',
    'bottlestore:view', 'bottlestore:manage',
    'piscina:view', 'piscina:manage',
    'stock:view', 'stock:manage',
    'relatorios:view', 'relatorios:stock-baixo', 'caixa:view', 'caixa:manage',
    'utilizadores:view',
    'kds:view',
  ],
  // Gestor de inventário: CRUD de stock e apenas o relatório de stock
  // baixo. Sem 'relatorios:view' — não vê a BI de vendas nem o ledger.
  GESTOR_STOCK: [
    'stock:view', 'stock:manage',
    'relatorios:stock-baixo',
  ],
  EMPREGADO_MESA: [
    'restaurante:view',
    'piscina:view', 'piscina:manage',
  ],
  OPERADOR_BALCAO: [
    'restaurante:view',
    'kds:view',
  ],
  OPERADOR_BOTTLESTORE: [
    'bottlestore:view', 'bottlestore:manage',
    'stock:view',
  ],
  COZINHEIRO: [
    'kds:view',
  ],
} as const

export type Permission = typeof PERMISSIONS[Role][number]

export function hasPermission(role: Role, permission: string): boolean {
  const perms = PERMISSIONS[role] as readonly string[]
  return perms.includes(permission)
}

// Rotas permitidas por role (para redirecionamento inicial)
export const REDIRECT_BY_ROLE: Record<Role, string> = {
  ADMIN: '/dashboard',
  GERENTE: '/dashboard',
  // Garçons aterram no POS tablet (fullscreen, com seletor de mesas
  // próprio); o mapa de mesas do dashboard continua acessível por URL.
  EMPREGADO_MESA: '/restaurante/comanda/tablet',
  OPERADOR_BALCAO: '/restaurante/mesas',
  OPERADOR_BOTTLESTORE: '/bottlestore/pos',
  COZINHEIRO: '/restaurante/kds',
  GESTOR_STOCK: '/stock/produtos',
}

// Scoping por canal (multi-gestor) — vive em lib/canais.ts porque é
// usado também em client components; re-exportado aqui por conveniência
// das API routes.
export {
  canaisPermitidos,
  podeAcederCanal,
  resolveCanal,
  CanalNaoAutorizadoError,
} from './canais'
