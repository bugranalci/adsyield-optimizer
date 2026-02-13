import { readCache } from '@/lib/cache/compute';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = Number(searchParams.get('period') || '7');

    if (period === 7 || ![7, 14, 30].includes(period)) {
      const cached = await readCache('quality_7');
      if (cached) return NextResponse.json(cached);
    }

    return NextResponse.json({ summary: { avgQualityScore: 0, totalPublishers: 0, highQuality: 0, lowQuality: 0 }, publishers: [] });
  } catch (error) {
    console.error('Supply Quality API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
