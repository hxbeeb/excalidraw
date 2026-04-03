import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const publicRoutes = ['/', '/signin', '/signup']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublicRoute = publicRoutes.includes(pathname)

  const token = request.cookies.get('token')?.value || request.headers.get('authorization')?.replace('Bearer ', '')
  const inRoom = request.cookies.get('inRoom')?.value

  // If user is in a room, block all routes except the room itself
  if (inRoom && !pathname.startsWith(`/canvas/${inRoom}`)) {
    return NextResponse.redirect(new URL(`/canvas/${inRoom}`, request.url))
  }

  if (isPublicRoute) {
    return NextResponse.next()
  }

  if (!token) {
    const signinUrl = new URL('/signin', request.url)
    signinUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(signinUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
