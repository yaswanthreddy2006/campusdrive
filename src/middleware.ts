import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Ignore static assets, internal Next.js files, and icons
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/fonts') ||
    pathname.startsWith('/images') ||
    pathname === '/favicon.ico' ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const driverSession = req.cookies.get('driver_session')?.value
  const studentSession =
    req.cookies.get('next-auth.session-token')?.value ||
    req.cookies.get('__Secure-next-auth.session-token')?.value
  const lastRole = req.cookies.get('last_role')?.value

  // 1. Guard /driver/* routes
  if (pathname.startsWith('/driver')) {
    // /driver/login is the entry point
    if (pathname === '/driver/login') {
      if (driverSession) {
        return NextResponse.redirect(new URL('/driver/dashboard', req.url))
      }
      return NextResponse.next()
    }

    // Protect all other /driver/* routes
    if (!driverSession) {
      // Block students from accessing driver pages
      if (studentSession) {
        return NextResponse.redirect(new URL('/student/dashboard', req.url))
      }
      return NextResponse.redirect(new URL('/driver/login', req.url))
    }

    // Synchronize last_role=driver if needed
    const response = NextResponse.next()
    if (lastRole !== 'driver') {
      response.cookies.set('last_role', 'driver', {
        path: '/',
        maxAge: 31536000,
        sameSite: 'lax',
      })
    }
    return response
  }

  // 2. Guard /student/* routes
  if (pathname.startsWith('/student')) {
    if (!studentSession) {
      return NextResponse.redirect(new URL('/api/auth/signin', req.url))
    }

    // Synchronize last_role=student if needed
    const response = NextResponse.next()
    if (lastRole !== 'student') {
      response.cookies.set('last_role', 'student', {
        path: '/',
        maxAge: 31536000,
        sameSite: 'lax',
      })
    }
    return response
  }

  // 3. Guard /api/driver/* routes
  if (pathname.startsWith('/api/driver')) {
    // Allow driver login endpoint publicly
    if (pathname === '/api/driver/login') {
      return NextResponse.next()
    }

    if (!driverSession) {
      if (studentSession) {
        return NextResponse.json(
          { error: 'Forbidden: Driver access only.' },
          { status: 403 }
        )
      }
      return NextResponse.json(
        { error: 'Unauthorized: Driver session required.' },
        { status: 401 }
      )
    }

    return NextResponse.next()
  }

  // 4. Guard /api/student/* and student booking routes
  const isStudentBookingRoute =
    pathname === '/api/bookings/student' ||
    pathname === '/api/bookings/create' ||
    pathname === '/api/bookings/cancel' ||
    pathname === '/api/bookings/board'

  if (pathname.startsWith('/api/student') || isStudentBookingRoute) {
    if (!studentSession) {
      return NextResponse.json(
        { error: 'Unauthorized: Student authentication required.' },
        { status: 401 }
      )
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files, images, and favicons
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
