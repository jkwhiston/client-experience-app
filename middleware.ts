import { NextResponse, type NextRequest } from 'next/server'

const AUTH_COOKIE = 'cet-auth'
const AUTH_TOKEN = 'authenticated'

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get(AUTH_COOKIE)
  const isAuthenticated = authCookie?.value === AUTH_TOKEN
  const isLoginPage = request.nextUrl.pathname.startsWith('/login')
  const isAuthApi = request.nextUrl.pathname.startsWith('/api/auth')

  // Allow auth API and login page through
  if (isAuthApi) {
    return NextResponse.next()
  }

  // Redirect unauthenticated users to login
  if (!isAuthenticated && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from login
  if (isAuthenticated && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
