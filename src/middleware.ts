import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Skip middleware for socket.io requests with EIO query param
  if (request.nextUrl.searchParams.has('EIO')) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  // Add CORS headers for socket.io requests
  if (request.nextUrl.pathname.startsWith('/api/socketio')) {
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', '*');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Max-Age', '86400');

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { 
        status: 200, 
        headers: response.headers 
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    // Exclude static files and other paths that don't need middleware
    '/((?!_next/static|favicon.ico|public/).*)',
  ],
};
