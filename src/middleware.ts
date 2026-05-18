import { getToken } from 'next-auth/jwt'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip auth for these paths
  if (
    pathname.startsWith('/api/auth') ||  // NextAuth routes
    pathname.startsWith('/api/sync/linvix') ||  // Linvix sync (API key auth) — covers linvix, linvix-auto, linvix-vendas
    pathname.startsWith('/api/sync/all') ||  // Combined sync (cron-job.org + Vercel Cron)
    pathname.startsWith('/api/clientes/backfill') ||  // Backfill endpoints (secret-based auth)
    pathname.startsWith('/api/clientes/diagnostic') ||  // Diagnostic (secret-based auth)
    pathname.startsWith('/api/clientes/auto-assign') ||  // Auto-assign vendedor (secret-based auth)
    pathname.startsWith('/api/clientes/remove-debora') ||  // Sync sem-vendedor from Linvix (secret-based auth)
    pathname.startsWith('/api/admin/reset-password') ||  // Password reset (secret-based auth)
    pathname.startsWith('/login') ||       // Login page
    pathname.startsWith('/_next') ||       // Next.js internals
    pathname.includes('favicon') ||        // Favicon
    pathname.includes('icon.png')          // Icon
  ) {
    return NextResponse.next()
  }

  // Get the JWT token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  })

  // No token → API routes return 401, page routes redirect to login
  if (!token) {
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
    /*
     * Match all request paths except:
     * - api/auth (NextAuth routes)
     * - login page
     * - _next/static, _next/image
     * - favicon, icon
     */
    '/((?!api/auth|login|_next/static|_next/image|favicon.ico|icon.png).*)',
  ],
}
