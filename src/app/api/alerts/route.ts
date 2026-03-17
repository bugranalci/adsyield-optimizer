import { readCache } from '@/lib/cache/compute';
import { NextResponse } from 'next/server';

// Reads pre-computed alerts from cache (refreshed daily at 00:10 UTC).
// Zero Supabase queries - only 1 cache read.
export async function GET() {
  try {
    const cached = await readCache('alerts_7');

    if (!cached) {
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        summary: { total: 0, critical: 0, warning: 0, info: 0 },
        alerts: [],
        message: 'No alerts data yet. Cache will be populated at next daily refresh (00:10 UTC).',
      });
    }

    return NextResponse.json(cached);
  } catch (error) {
    console.error('[Alerts] API error:', error);
    return NextResponse.json(
      { error: 'Failed to load alerts' },
      { status: 500 }
    );
  }
}
