import { NextResponse, NextRequest } from 'next/server';
import { runIVTAnalysis } from '@/lib/ivt/analyzer';

// GET - Vercel Cron trigger
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret if configured
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runIVTAnalysis();
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'IVT analysis failed';
    console.error('IVT analyze GET error:', message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// POST - Manual trigger (from dashboard)
export async function POST() {
  try {
    const result = await runIVTAnalysis();
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'IVT analysis failed';
    console.error('IVT analyze POST error:', message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
