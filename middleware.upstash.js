// /middleware.upstash.js
import { NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export const config = {
  matcher: ['/api/webhook'],
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(25, '5 s'),
})

export async function middleware(req) {
  const identifier = req.headers.get('x-forwarded-for') || 'anonymous'
  const { success } = await ratelimit.limit(identifier)
  if (!success) {
    return new NextResponse('Too Many Requests', { status: 429 })
  }

  const ct = req.headers.get('content-type') || ''
  const len = Number(req.headers.get('content-length') || 0)
  if (req.method === 'POST' && (!ct.includes('application/json') || len > 256 * 1024)) {
    return new NextResponse('Bad Request', { status: 400 })
  }

  return NextResponse.next()
}
