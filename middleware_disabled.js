import { NextResponse } from 'next/server';

export const config = {
  matcher: ['/api/webhook'],
};

// Janela deslizante em memória (Edge) — MVP, não compartilhada entre regiões.
// Para produção robusta, use Redis (Upstash) e substitua por verificação remota.
const WINDOW_MS = 5_000;      // 5s
const MAX_HITS = 25;          // até 25 req em 5s por IP
const buckets = new Map();    // { ip: [timestamps] }

export function middleware(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const now = Date.now();
  const arr = (buckets.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  buckets.set(ip, arr);
  if (arr.length > MAX_HITS) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  // Rejeita corpos gigantes/inválidos
  const ct = req.headers.get('content-type') || '';
  const len = Number(req.headers.get('content-length') || 0);
  if (req.method === 'POST' && (!ct.includes('application/json') || len > 256 * 1024)) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  return NextResponse.next();
}
