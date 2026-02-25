/**
 * Auth utility functions for route protection.
 * Pure functions that determine redirect behavior based on auth state.
 */
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/** Routes accessible without authentication */
const PUBLIC_ROUTES = [
  "/",
  "/demo",
  "/login",
  "/register",
  "/forgot-password",
  "/update-password",
  "/auth/confirm",
  "/mockup-preview", // For Playwright screenshot generation
];

/** Routes that authenticated users should be redirected away from */
const AUTH_ONLY_ROUTES = ["/login", "/register"];

/**
 * Returns true when a path can render without auth state.
 */
export function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_ROUTES.includes(pathname) ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/use-cases") ||
    pathname.startsWith("/industries")
  );
}

/**
 * Determines if a redirect is needed based on auth state and current path.
 * @param pathname - Current route pathname
 * @param session - Current auth session (null if unauthenticated)
 * @returns Redirect path or null if no redirect needed
 */
export function getAuthRedirect(
  pathname: string,
  session: Session | null
): string | null {
  const routeIsPublic = isPublicRoute(pathname);

  // Unauthenticated user on protected route -> redirect to login
  if (!session && !routeIsPublic) {
    return "/login";
  }

  // Authenticated user on auth-only route -> redirect to chat (home)
  if (session && AUTH_ONLY_ROUTES.includes(pathname)) {
    return "/chat";
  }

  return null;
}

/** Cached session to avoid async calls in beforeLoad */
let cachedSession: Session | null = null;
let sessionInitialized = false;
let initPromise: Promise<Session | null> | null = null;
let authListenerAttached = false;

function attachAuthStateListener() {
  if (authListenerAttached) return;
  authListenerAttached = true;

  supabase.auth.onAuthStateChange((_event, session) => {
    cachedSession = session;
  });
}

/**
 * Initialize auth by loading session from Supabase.
 * Safe to call multiple times; concurrent callers share one in-flight promise.
 */
export async function initializeAuth(): Promise<Session | null> {
  if (sessionInitialized) {
    return cachedSession;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = supabase.auth
    .getSession()
    .then(({ data: { session } }) => {
      cachedSession = session;
      sessionInitialized = true;
      attachAuthStateListener();
      return session;
    })
    .catch((error) => {
      // Never block app startup on auth transport errors.
      console.error("Failed to initialize auth session", error);
      cachedSession = null;
      sessionInitialized = true;
      attachAuthStateListener();
      return null;
    })
    .finally(() => {
      initPromise = null;
    });

  return initPromise;
}

/**
 * Get the cached session synchronously.
 * May be null before initialization completes.
 */
export function getCachedSession(): Session | null {
  return cachedSession;
}

/**
 * Check if auth has been initialized.
 */
export function isAuthInitialized(): boolean {
  return sessionInitialized;
}

/**
 * Ensure auth is initialized only for routes that require auth.
 * Public routes render immediately without waiting.
 */
export async function ensureAuthForPath(pathname: string): Promise<Session | null> {
  if (!isPublicRoute(pathname) && !sessionInitialized) {
    await initializeAuth();
  }
  return cachedSession;
}
