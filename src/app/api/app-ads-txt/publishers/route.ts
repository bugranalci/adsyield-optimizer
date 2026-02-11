import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { DEFAULT_PUBLISHERS, extractDomain } from '@/lib/app-ads-txt/default-publishers';

export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('publisher_domains')
      .select('*')
      .order('domain', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ publishers: data || [] });
  } catch (error) {
    console.error('[App-Ads-Txt Publishers] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch publishers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const body = await request.json();

    // Case 1: Reset to defaults
    if (body.action === 'reset_defaults') {
      const { error: deleteError } = await supabase
        .from('publisher_domains')
        .delete()
        .neq('id', 0);

      if (deleteError) throw deleteError;

      const rows = DEFAULT_PUBLISHERS.map((url) => ({
        domain: extractDomain(url),
        url,
        status: 'active' as const,
      }));

      const { error: insertError } = await supabase
        .from('publisher_domains')
        .upsert(rows, { onConflict: 'domain' });

      if (insertError) throw insertError;

      return NextResponse.json({
        success: true,
        message: `Reset to ${DEFAULT_PUBLISHERS.length} default publishers`,
        count: DEFAULT_PUBLISHERS.length,
      });
    }

    // Case 2: Clear all publishers
    if (body.action === 'clear_all') {
      const { error: deleteError } = await supabase
        .from('publisher_domains')
        .delete()
        .neq('id', 0);

      if (deleteError) throw deleteError;

      return NextResponse.json({
        success: true,
        message: 'All publishers cleared',
      });
    }

    // Case 3: Bulk add URLs
    if (body.urls && Array.isArray(body.urls)) {
      // Normalize URLs: ensure they have protocol and /app-ads.txt
      const rows = body.urls
        .map((url: string) => {
          let normalized = url.trim();
          if (!normalized) return null;
          if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
            normalized = 'https://' + normalized;
          }
          if (!normalized.endsWith('/app-ads.txt')) {
            normalized = normalized.replace(/\/?$/, '/app-ads.txt');
          }
          return {
            domain: extractDomain(normalized),
            url: normalized,
            status: 'active' as const,
          };
        })
        .filter(Boolean);

      if (rows.length === 0) {
        return NextResponse.json(
          { error: 'No valid URLs provided' },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from('publisher_domains')
        .upsert(rows, { onConflict: 'domain' })
        .select();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: `Added ${rows.length} publishers`,
        publishers: data || [],
      }, { status: 201 });
    }

    // Case 4: Add single URL
    if (body.url && typeof body.url === 'string') {
      let normalized = body.url.trim();
      if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        normalized = 'https://' + normalized;
      }

      const { data, error } = await supabase
        .from('publisher_domains')
        .upsert(
          {
            domain: extractDomain(normalized),
            url: normalized,
            status: 'active' as const,
          },
          { onConflict: 'domain' }
        )
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({ success: true, publisher: data }, { status: 201 });
    }

    return NextResponse.json(
      { error: 'Invalid request body. Provide url, urls, or action.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[App-Ads-Txt Publishers] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to add publisher(s)' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { searchParams } = new URL(request.url);

    // Support both id and url for deletion
    const id = searchParams.get('id');
    const url = searchParams.get('url');

    if (!id && !url) {
      return NextResponse.json(
        { error: 'id or url query parameter is required' },
        { status: 400 }
      );
    }

    let query = supabase.from('publisher_domains').delete();

    if (id) {
      query = query.eq('id', parseInt(id, 10));
    } else if (url) {
      query = query.eq('url', url);
    }

    const { error } = await query;

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[App-Ads-Txt Publishers] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete publisher' },
      { status: 500 }
    );
  }
}
