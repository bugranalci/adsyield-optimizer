import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_JWT_HEADER, accessConfig, verifyAccessJwt } from '@/lib/cloudflare-access';

/**
 * Layer one: Cloudflare Access (Google Workspace + WebAuthn MFA) on every route except
 * the Limelight IVT pixel (fired from outside, on wizard.adsyield.com) and Vercel cron
 * calls carrying CRON_SECRET. Skipped while CF_ACCESS_* are unset (local development).
 * Layer two (below): the Supabase sign-in.
 */
async function requireCloudflareAccess(request: NextRequest): Promise<NextResponse | null> {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith('/api/ivt/pixel')) return null;

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`) return null;

  const access = accessConfig();
  if (access === 'misconfigured') {
    return new NextResponse('Wizard is misconfigured: incomplete CF_ACCESS_* settings.', {
      status: 503,
    });
  }
  if (!access) return null;

  const identity = await verifyAccessJwt(request.headers.get(ACCESS_JWT_HEADER), access);
  if (identity) return null;

  // Any other hostname (wizard.adsyield.com, *.vercel.app) is sent through Access.
  const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase();
  if (host !== access.appHost) {
    const target = new URL(`https://${access.appHost}`);
    target.pathname = pathname;
    target.search = search;
    return NextResponse.redirect(target);
  }
  return new NextResponse('Forbidden', { status: 403 });
}

export async function middleware(request: NextRequest) {
  const denied = await requireCloudflareAccess(request);
  if (denied) return denied;

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public routes that don't need auth
  const publicPaths = ['/login', '/api/ivt/pixel'];
  const isPublicPath = publicPaths.some(path => request.nextUrl.pathname.startsWith(path));

  // API routes that use cron secret
  const isCronRoute =
    request.nextUrl.pathname.startsWith('/api/limelight/sync') ||
    request.nextUrl.pathname.startsWith('/api/ivt/analyze') ||
    request.nextUrl.pathname.startsWith('/api/ivt/cleanup');

  if (isPublicPath || isCronRoute) {
    return supabaseResponse;
  }

  // Redirect to login if not authenticated
  if (!user && !request.nextUrl.pathname.startsWith('/api/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Check admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user?.id)
      .single();

    if (profile?.role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // .well-known/acme-challenge is Vercel's certificate renewal path; Access bypasses it too.
    '/((?!_next/static|_next/image|favicon.ico|\\.well-known/acme-challenge/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
