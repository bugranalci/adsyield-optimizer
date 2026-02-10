import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// 1x1 transparent GIF
const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// GET - Receive pixel fire from Limelight
// This endpoint must be fast and lightweight
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    // Accept both PRD short params (ts, pub, ua, make, model, crid, ssp, imp)
    // and legacy long params (timestamp, pubId, userAgent, deviceMake, etc.)
    const impression = {
      timestamp: params.get('ts') || params.get('timestamp') || new Date().toISOString(),
      pub_id: params.get('pub') || params.get('pubId') || null,
      bundle: params.get('bundle') || null,
      ifa: params.get('ifa') || null,
      ip: params.get('ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: params.get('ua') || params.get('userAgent') || request.headers.get('user-agent') || null,
      device_make: params.get('make') || params.get('deviceMake') || null,
      device_model: params.get('model') || params.get('deviceModel') || null,
      os: params.get('os') || null,
      os_version: params.get('osv') || null,
      creative_id: params.get('crid') || params.get('creativeId') || null,
      origin_ssp_pub_id: params.get('ssp') || params.get('originSspPubId') || null,
      lat: params.get('lat') ? parseFloat(params.get('lat')!) : null,
      lon: params.get('lon') ? parseFloat(params.get('lon')!) : null,
      imp_id: params.get('imp') || params.get('impId') || null,
    };

    // Fire and forget: insert asynchronously, don't block the pixel response
    const supabase = createServiceClient();
    supabase
      .from('ivt_impressions')
      .insert(impression)
      .then(({ error }) => {
        if (error && !error.message.includes('duplicate')) {
          console.error('IVT pixel insert error:', error);
        }
      });

    // Return 1x1 GIF immediately
    return new NextResponse(PIXEL_GIF, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Content-Length': String(PIXEL_GIF.length),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('IVT pixel error:', error);
    // Still return the pixel even if storage fails
    return new NextResponse(PIXEL_GIF, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-cache, no-store',
      },
    });
  }
}
