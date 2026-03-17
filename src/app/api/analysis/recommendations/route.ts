import { readCache } from '@/lib/cache/compute';
import { NextResponse } from 'next/server';

// Reads pre-computed recommendations from cache (refreshed daily at 00:10 UTC).
// Zero Supabase queries - only 1 cache read.
export async function GET() {
  try {
    const cached = await readCache('recommendations_7');

    if (!cached) {
      return NextResponse.json({
        summary: {
          totalRecommendations: 0,
          criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0,
          estimatedTotalRevenueLift: 0,
        },
        recommendations: [],
        message: 'No recommendations data yet. Cache will be populated at next daily refresh (00:10 UTC).',
      });
    }

    return NextResponse.json(cached);
  } catch (error) {
    console.error('Recommendations API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
