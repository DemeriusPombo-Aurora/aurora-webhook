import { NextResponse } from 'next/server';

export const config = {
  matcher: ['/api/webhook'],
};

export default function middleware(req) {
  // Allow all requests to continue to the API route
  return NextResponse.next();
}
