import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { searchAdsTxt } from '@/lib/ads-txt/search-engine';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const body = await request.json();

    const { searchLine } = body;

    if (!searchLine || typeof searchLine !== 'string' || !searchLine.trim()) {
      return NextResponse.json(
        { error: 'searchLine is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    // Fetch active publishers
    const { data: publishers, error: pubError } = await supabase
      .from('publisher_domains_web')
      .select('url')
      .eq('status', 'active');

    if (pubError) throw pubError;

    if (!publishers || publishers.length === 0) {
      return NextResponse.json(
        {
          error: 'No active publishers found. Add publishers first via the Publishers tab.',
        },
        { status: 404 }
      );
    }

    const publisherUrls = publishers.map((p) => p.url);

    // Run search
    const searchResponse = await searchAdsTxt(searchLine.trim(), publisherUrls);

    // Save to search history
    const { error: historyError } = await supabase
      .from('ads_txt_search_history')
      .insert({
        search_line: searchLine.trim(),
        total_publishers: searchResponse.totalPublishers,
        found_count: searchResponse.foundCount,
        duration_ms: searchResponse.durationMs,
      });

    if (historyError) {
      console.error('[Ads-Txt Search] Failed to save history:', historyError.message);
    }

    return NextResponse.json(searchResponse);
  } catch (error) {
    console.error('[Ads-Txt Search] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to perform search' },
      { status: 500 }
    );
  }
}
