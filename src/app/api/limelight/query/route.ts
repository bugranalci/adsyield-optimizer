import { NextResponse, NextRequest } from 'next/server';
import { fetchLimelightStats } from '@/lib/limelight/client';
import { transformLimelightResponse } from '@/lib/limelight/transformer';

// On-demand query for specific dimension breakdowns
// Used by pages that need BUNDLE, OS, COUNTRY, SIZE, CHANNEL_TYPE data
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const startDate = params.get('startDate');
    const endDate = params.get('endDate');
    const dimension = params.get('dimension'); // e.g., BUNDLE, OS, COUNTRY, SIZE

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    const validDimensions = ['BUNDLE', 'OS', 'COUNTRY', 'SIZE', 'CHANNEL_TYPE', 'DEMAND', 'PUBLISHER'];
    if (!dimension || !validDimensions.includes(dimension)) {
      return NextResponse.json(
        { error: `dimension must be one of: ${validDimensions.join(', ')}` },
        { status: 400 }
      );
    }

    const rawData = await fetchLimelightStats({
      startDate,
      endDate,
      dimensions: ['DATE', dimension],
    });

    const transformed = transformLimelightResponse(rawData);

    // Filter out rows with no meaningful data
    const filtered = transformed.filter(
      (row) => row.impressions > 0 || row.demand_payout > 0 || row.bid_requests > 0
    );

    return NextResponse.json({
      success: true,
      data: filtered,
      totalRows: rawData.length,
      filteredRows: filtered.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Query failed';
    console.error('Limelight query error:', message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
