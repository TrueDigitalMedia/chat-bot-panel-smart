import { NextResponse, type NextRequest } from 'next/server'

const REALM = 'admin'

export function middleware(request: NextRequest): NextResponse {
  const password = process.env.ADMIN_PASSWORD
  const authHeader = request.headers.get('authorization')

  if (password && authHeader?.startsWith('Basic ')) {
    const decoded = atob(authHeader.slice('Basic '.length))
    const separatorIndex = decoded.indexOf(':')
    const user = separatorIndex === -1 ? decoded : decoded.slice(0, separatorIndex)
    const pass = separatorIndex === -1 ? '' : decoded.slice(separatorIndex + 1)
    if (user === 'admin' && pass === password) {
      return NextResponse.next()
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}"` },
  })
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
