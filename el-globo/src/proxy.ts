import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, REDIRECT_BY_ROLE, hasPermission, canaisPermitidos } from '@/lib/auth'
import { Role, CanalVenda } from '@prisma/client'

// Rotas públicas (não precisam de auth).
// /menu = cardápio digital lido por QR code nas mesas (clientes sem conta);
// /uploads = fotos WebP dos produtos, referenciadas pelo cardápio público.
const PUBLIC_ROUTES = ['/login', '/api/auth/login', '/menu', '/uploads']

// Prefixos de rota → canal exigido (multi-gestor).
// A verificação usa canaisPermitidos: RESTAURANTE inclui PISCINA.
const CANAL_POR_ROTA: [string, CanalVenda][] = [
  ['/bottlestore', 'BOTTLESTORE'],
  ['/restaurante', 'RESTAURANTE'],
  ['/piscina', 'PISCINA'],
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Permitir rotas públicas
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // Verificar token
  const token = request.cookies.get('elglobo_token')?.value
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const session = await verifyToken(token)
  if (!session) {
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('elglobo_token')
    return response
  }

  // RBAC por rota
  const role = session.role as Role

  // Tokens antigos (sem canal) de utilizadores não-admin → novo login.
  // Sem isto, sessões emitidas antes da Fase 1 ficariam sem scoping.
  if (role !== 'ADMIN' && session.canal === undefined) {
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('elglobo_token')
    return response
  }

  // GESTOR_STOCK — perfil de inventário puro. Fica preso à área de Stock:
  // qualquer página fora de /stock volta aos produtos, e as APIs fora do
  // inventário respondem 403. Assim não toca em vendas, caixas, mesas,
  // abas nem dashboards financeiros, mesmo por URL direto.
  if (role === 'GESTOR_STOCK') {
    const API_STOCK_PERMITIDAS = [
      '/api/produtos',
      '/api/categorias',
      '/api/fichas-tecnicas',
      '/api/quebras',
      '/api/stock',
      '/api/relatorios/stock-baixo',
      '/api/auth/logout',
    ]
    if (pathname.startsWith('/api')) {
      if (!API_STOCK_PERMITIDAS.some((p) => pathname.startsWith(p))) {
        return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 })
      }
    } else if (pathname !== '/' && !pathname.startsWith('/stock')) {
      return NextResponse.redirect(new URL(REDIRECT_BY_ROLE[role], request.url))
    }
  }

  // Bloqueio por CANAL: o gestor da Bottlestore não entra nas rotas do
  // restaurante/piscina nem por URL direto, e vice-versa.
  const permitidos = canaisPermitidos(session)
  for (const [prefixo, canal] of CANAL_POR_ROTA) {
    if (pathname.startsWith(prefixo) && !permitidos.includes(canal)) {
      return NextResponse.redirect(new URL(REDIRECT_BY_ROLE[role], request.url))
    }
  }

  // Bottlestore — apenas OPERADOR_BOTTLESTORE, GERENTE, ADMIN
  if (pathname.startsWith('/bottlestore')) {
    if (!hasPermission(role, 'bottlestore:view')) {
      return NextResponse.redirect(new URL(REDIRECT_BY_ROLE[role], request.url))
    }
  }

  // Backoffice/Dashboard — apenas ADMIN, GERENTE
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/backoffice')) {
    if (!hasPermission(role, 'dashboard:view')) {
      return NextResponse.redirect(new URL(REDIRECT_BY_ROLE[role], request.url))
    }
  }

  // Stock — apenas ADMIN, GERENTE, OPERADOR_BOTTLESTORE
  if (pathname.startsWith('/stock')) {
    if (!hasPermission(role, 'stock:view')) {
      return NextResponse.redirect(new URL(REDIRECT_BY_ROLE[role], request.url))
    }
  }

  // Redirecionar raiz para rota adequada ao role
  if (pathname === '/') {
    return NextResponse.redirect(new URL(REDIRECT_BY_ROLE[role], request.url))
  }

  // Injetar headers com info do utilizador para as API routes
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', session.sub)
  requestHeaders.set('x-user-role', session.role)
  requestHeaders.set('x-user-email', session.email)

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw\\.js|icons/).*)',
  ],
}

export default proxy
