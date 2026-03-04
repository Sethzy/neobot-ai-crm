import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/",
  "/demo",
  "/login",
  "/register",
  "/forgot-password",
  "/update-password",
  "/auth/confirm",
];

const AUTH_ONLY_ROUTES = ["/login", "/register"];
/** Routes that need auth checks even though they're public (to redirect logged-in users). */
const AUTH_CHECK_ROUTES = ["/", "/login", "/register"];

const STATIC_FILE_REGEX = /\.[^/]+$/;
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

function isInfrastructurePath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/exports/") ||
    pathname.startsWith("/.well-known/") ||
    pathname === "/favicon.svg" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/service-worker.js" ||
    STATIC_FILE_REGEX.test(pathname)
  );
}

function isPublicRoute(pathname: string): boolean {
  return (
    isInfrastructurePath(pathname) ||
    PUBLIC_ROUTES.includes(pathname) ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/use-cases") ||
    pathname.startsWith("/industries") ||
    pathname.startsWith("/market") ||
    pathname.startsWith("/agents") ||
    pathname.startsWith("/properties") ||
    pathname.startsWith("/hdb") ||
    pathname.startsWith("/agencies") ||
    pathname.startsWith("/areas")
  );
}

export async function middleware(request: NextRequest) {
  const mwStart = performance.now();
  const pathname = request.nextUrl.pathname;

  // Skip auth checks for static/infrastructure requests and non-auth public pages.
  // AUTH_CHECK_ROUTES need auth checks to redirect logged-in users.
  if (isPublicRoute(pathname) && !AUTH_CHECK_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  let response = NextResponse.next({ request });

  const supabaseStart = performance.now();
  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession() validates the JWT locally — no network round-trip.
  // Use getUser() in Server Components / API routes where you need
  // a verified identity from Supabase, not in the hot middleware path.
  const getSessionStart = performance.now();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  const getSessionMs = (performance.now() - getSessionStart).toFixed(0);
  const supabaseMs = (performance.now() - supabaseStart).toFixed(0);

  console.log(
    `[middleware] ${pathname} | getSession: ${getSessionMs}ms | supabase total: ${supabaseMs}ms`
  );

  if (!user && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (AUTH_ONLY_ROUTES.includes(pathname) || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  const totalMs = (performance.now() - mwStart).toFixed(0);
  response.headers.set(
    "Server-Timing",
    `middleware;dur=${totalMs}, supabase-session;dur=${getSessionMs}`
  );

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/webpack-hmr).*)",
  ],
};
