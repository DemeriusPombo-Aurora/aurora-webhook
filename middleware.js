import { NextResponse } from 'next/server';

export const config = {
  matcher: ['/api/webhook'],
};

export default function middleware(req) {
  // Allow requests to pass through to API route
  return NextResponse.next();
}
