import { readCache } from '@/lib/cache/compute';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = Number(searchParams.get('period') || '7');

    if (period === 7 || ![7, 14, 30].includes(period)) {
      const cached = await readCache('concentration_7');
      if (cached) return NextResponse.json(cached);
    }

    return NextResponse.json({
      demand: { hhi: 0, top5Share: 0, top10Share: 0, risk: 'low', count: 0, distribution: [] },
      publisher: { hhi: 0, top5Share: 0, top10Share: 0, risk: 'low', count: 0, distribution: [] },
      overallRisk: 'low', totalRevenue: 0,
    });
  } catch (error) {
    console.error('Revenue Concentration API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
