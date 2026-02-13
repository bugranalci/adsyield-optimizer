import { NextRequest, NextResponse } from 'next/server';
import { refreshAllCaches } from '@/lib/cache/compute';

export const maxDuration = 300;

// GET - Cron job (runs 10 min after sync at 04:10 UTC)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const start = Date.now();
    await refreshAllCaches();
    const durationMs = Date.now() - start;

    return NextResponse.json({ success: true, durationMs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Cache refresh failed';
    console.error('Cache refresh error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - Manual trigger
export async function POST() {
  try {
    const start = Date.now();
    await refreshAllCaches();
    const durationMs = Date.now() - start;

    return NextResponse.json({ success: true, durationMs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Cache refresh failed';
    console.error('Cache refresh error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
