import { clearedCookie } from '@/lib/auth/server';

export async function POST() {
  return new Response(null, { status: 204, headers: { 'Set-Cookie': clearedCookie(), 'Cache-Control': 'no-store' } });
}
