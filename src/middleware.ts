import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Skip middleware for socket.io requests
  if (request.nextUrl.pathname.startsWith('/api/socketio') || 
      request.nextUrl.pathname.startsWith('/socket.io') ||
      request.nextUrl.pathname === '/api/socket') {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|favicon.ico|public/).*)',
  ],
};
