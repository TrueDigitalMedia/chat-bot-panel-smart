import { NextResponse, type NextRequest } from 'next/server'
import { verifySessionCookie, SESSION_COOKIE_NAME } from '@/lib/auth/session'

// Legacy public URLs that moved under /admin (spec 009 US3) — redirect rather than 404.
const LEGACY_REDIRECTS: Array<[RegExp, string]> = [
  [/^\/conversations\/([^/]+)$/, '/admin/conversations/$1'],
  [/^\/conversations$/, '/admin/conversations'],
]

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  for (const [pattern, replacement] of LEGACY_REDIRECTS) {
    const match = pathname.match(pattern)
    if (match) {
      const target = replacement.replace(/\$(\d)/g, (_, i) => match[Number(i)] ?? '')
      return NextResponse.redirect(new URL(target, request.url), 308)
    }
  }

  const secret = process.env.SESSION_SECRET
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const hasValidSession = secret ? await verifySessionCookie(secret, sessionCookie) : false

  if (hasValidSession) {
    return NextResponse.next()
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return new NextResponse('Authentication required', { status: 401 })
  }

  const loginUrl = new URL('/', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/conversations/:path*',
    '/api/evals/:path*',
    '/conversations',
    '/conversations/:path*',
  ],
}
