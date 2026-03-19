/**
 * Client-side auth flow state for Browser-Use platform connections.
 * @module hooks/use-browser-auth
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type BrowserAuthStatus =
  | "idle"
  | "connecting"
  | "awaiting-login"
  | "verifying"
  | "done"
  | "error";

interface PendingBrowserAuthSession {
  sessionId: string;
  authToken: string;
  liveUrl: string;
}

interface BrowserAuthState {
  status: BrowserAuthStatus;
  liveUrl: string | null;
  sessionId: string | null;
  authToken: string | null;
  platform: string | null;
}

const STORAGE_PREFIX = "sunder-browser-auth:";

function getStorageKey(platform: string): string {
  return `${STORAGE_PREFIX}${platform.toLowerCase()}`;
}

function readPendingSession(platform: string): PendingBrowserAuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(getStorageKey(platform));
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as PendingBrowserAuthSession;
  } catch {
    window.sessionStorage.removeItem(getStorageKey(platform));
    return null;
  }
}

function writePendingSession(platform: string, session: PendingBrowserAuthSession): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(getStorageKey(platform), JSON.stringify(session));
}

function clearPendingSession(platform: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(getStorageKey(platform));
}

function getInitialBrowserAuthState(platform?: string): BrowserAuthState {
  if (!platform) {
    return {
      status: "idle",
      liveUrl: null,
      sessionId: null,
      authToken: null,
      platform: null,
    };
  }

  const pendingSession = readPendingSession(platform);
  if (!pendingSession) {
    return {
      status: "idle",
      liveUrl: null,
      sessionId: null,
      authToken: null,
      platform: null,
    };
  }

  return {
    status: "awaiting-login",
    liveUrl: pendingSession.liveUrl,
    sessionId: pendingSession.sessionId,
    authToken: pendingSession.authToken,
    platform,
  };
}

async function cleanupPendingBrowserSession(platform: string): Promise<void> {
  const pendingSession = readPendingSession(platform);

  if (!pendingSession) {
    return;
  }

  try {
    await fetch("/api/browser/session/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authToken: pendingSession.authToken }),
    });
  } catch {
    // Cleanup is best-effort; a failed cleanup should not block client recovery.
  }
}

/**
 * Creates and verifies Browser-Use auth sessions for one platform at a time.
 */
export function useBrowserAuth(platform?: string) {
  const [state, setState] = useState<BrowserAuthState>(() => getInitialBrowserAuthState(platform));

  useEffect(() => {
    if (!platform) {
      return;
    }

    const hydratedState = getInitialBrowserAuthState(platform);
    if (hydratedState.status === "awaiting-login") {
      setState(hydratedState);
    }
  }, [platform]);

  const connect = useCallback(async (platform: string) => {
    await cleanupPendingBrowserSession(platform);

    setState({
      status: "connecting",
      liveUrl: null,
      sessionId: null,
      authToken: null,
      platform,
    });

    try {
      const response = await fetch("/api/browser/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const payload = await response.json() as {
        error?: string;
        sessionId?: string;
        liveUrl?: string;
        authToken?: string;
      };

      if (
        !response.ok ||
        typeof payload.sessionId !== "string" ||
        typeof payload.liveUrl !== "string" ||
        typeof payload.authToken !== "string"
      ) {
        toast.error(payload.error ?? "Failed to create browser session.");
        setState((currentState) => ({ ...currentState, status: "error" }));
        return;
      }

      writePendingSession(platform, {
        sessionId: payload.sessionId,
        authToken: payload.authToken,
        liveUrl: payload.liveUrl,
      });

      setState({
        status: "awaiting-login",
        liveUrl: payload.liveUrl,
        sessionId: payload.sessionId,
        authToken: payload.authToken,
        platform,
      });
    } catch {
      toast.error("Failed to create browser session.");
      setState((currentState) => ({ ...currentState, status: "error" }));
    }
  }, []);

  const verify = useCallback(async (platform: string) => {
    const pendingSession = readPendingSession(platform);

    if (!pendingSession) {
      toast.error("No pending login session found. Connect the platform again.");
      setState((currentState) => ({ ...currentState, status: "error" }));
      return;
    }

    setState((currentState) => ({ ...currentState, status: "verifying", platform }));

    try {
      const response = await fetch("/api/browser/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authToken: pendingSession.authToken,
        }),
      });
      const payload = await response.json() as { success?: boolean; error?: string };

      if (!response.ok || payload.success !== true) {
        toast.error(payload.error ?? "Login could not be verified. Please try again.");
        clearPendingSession(platform);
        setState((currentState) => ({ ...currentState, status: "error" }));
        return;
      }

      clearPendingSession(platform);
      toast.success(`Connected ${platform}. Retry your request when you're ready.`);
      setState((currentState) => ({
        ...currentState,
        status: "done",
        liveUrl: null,
      }));
    } catch {
      toast.error("Failed to verify browser login.");
      setState((currentState) => ({ ...currentState, status: "error" }));
    }
  }, []);

  const reset = useCallback(async (platform?: string) => {
    if (platform) {
      await cleanupPendingBrowserSession(platform);
      clearPendingSession(platform);
    }

    setState({
      status: "idle",
      liveUrl: null,
      sessionId: null,
      authToken: null,
      platform: null,
    });
  }, []);

  return {
    state,
    connect,
    verify,
    reset,
  };
}
