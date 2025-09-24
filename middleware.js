/*
  Middleware disabled to avoid unsupported modules in Vercel Edge environment.
  Allows all requests to pass through without modification.
*/

export const config = {
  matcher: ['/api/webhook'],
};

export default function middleware(req) {
  // Return a simple response; Next.js will continue handling the request.
  return new Response(null, { status: 200 });
}
