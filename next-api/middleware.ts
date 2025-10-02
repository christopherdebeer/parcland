import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Only handle root path
  if (request.nextUrl.pathname === '/') {
    // Rewrite to serve index.html from public directory
    return NextResponse.rewrite(new URL('/index.html', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Match all paths except API routes and static files
  matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)',
};
