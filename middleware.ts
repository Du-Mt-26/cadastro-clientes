import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/login',
  '/api/auth',
]

// API routes that don't require authentication (use their own auth mechanism)
const PUBLIC_API_ROUTES = [
  '/api/sync/linvix',
  '/api/sync/linvix-auto',
  '/api/sync/linvix-vendas',
  '/api/sync/all',
  '/api/clientes/diagnostic',
  '/api/clientes/auto-assign-vendedores',
  '/api/clientes/backfill-cnpj-base',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Allow public API routes
  if (PUBLIC_API_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Allow static files and Next.js internals
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // Check authentication for all other routes
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET 
  })

  if (!token) {
    // Redirect to login for pages, return 401 for API routes
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt).*)',
  ],
}
