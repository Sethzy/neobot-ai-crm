/** Tests for centralized environment variable validation. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { getServerEnv, _resetForTesting } from "../env";

describe("getServerEnv", () => {
  afterEach(() => {
    _resetForTesting();
    vi.unstubAllEnvs();
  });

  const REQUIRED = {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    AI_GATEWAY_API_KEY: "test-gateway-key",
  };

  function stubAllRequired() {
    for (const [key, value] of Object.entries(REQUIRED)) {
      vi.stubEnv(key, value);
    }
  }

  it("returns validated env when all required vars are set", () => {
    stubAllRequired();
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");

    const env = getServerEnv();
    expect(env.SUPABASE_URL).toBe(REQUIRED.NEXT_PUBLIC_SUPABASE_URL);
    expect(env.SUPABASE_ANON_KEY).toBe(REQUIRED.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe(REQUIRED.SUPABASE_SERVICE_ROLE_KEY);
    expect(env.AI_GATEWAY_API_KEY).toBe(REQUIRED.AI_GATEWAY_API_KEY);
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
  });

  it("throws with descriptive message when a required var is missing", () => {
    stubAllRequired();
    vi.stubEnv("AI_GATEWAY_API_KEY", "");

    expect(() => getServerEnv()).toThrow(/AI_GATEWAY_API_KEY/);
  });

  it("throws when SUPABASE_URL is missing from both NEXT_PUBLIC and fallback", () => {
    stubAllRequired();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    expect(() => getServerEnv()).toThrow(/SUPABASE_URL/);
  });

  it("falls back to SUPABASE_URL when NEXT_PUBLIC variant is missing", () => {
    stubAllRequired();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_URL", "https://fallback.supabase.co");

    const env = getServerEnv();
    expect(env.SUPABASE_URL).toBe("https://fallback.supabase.co");
  });

  it("falls back to SUPABASE_ANON_KEY when NEXT_PUBLIC variant is missing", () => {
    stubAllRequired();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "fallback-anon-key");

    const env = getServerEnv();
    expect(env.SUPABASE_ANON_KEY).toBe("fallback-anon-key");
  });

  it("accepts optional vars as undefined", () => {
    stubAllRequired();

    const env = getServerEnv();
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it("caches result on subsequent calls", () => {
    stubAllRequired();

    const first = getServerEnv();
    vi.stubEnv("AI_GATEWAY_API_KEY", "changed");
    const second = getServerEnv();

    expect(first).toBe(second);
  });

  it("trims whitespace from values", () => {
    stubAllRequired();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "  https://test.supabase.co  ");

    const env = getServerEnv();
    expect(env.SUPABASE_URL).toBe("https://test.supabase.co");
  });

  it("treats whitespace-only values as empty (missing)", () => {
    stubAllRequired();
    vi.stubEnv("AI_GATEWAY_API_KEY", "   ");

    expect(() => getServerEnv()).toThrow(/AI_GATEWAY_API_KEY/);
  });

  describe("sandbox env vars", () => {
    it("exposes optional SANDBOX_GOLDEN_SNAPSHOT_ID", () => {
      stubAllRequired();
      vi.stubEnv("SANDBOX_GOLDEN_SNAPSHOT_ID", "snap_abc123");
      _resetForTesting();
      const env = getServerEnv();
      expect(env.SANDBOX_GOLDEN_SNAPSHOT_ID).toBe("snap_abc123");
    });

    it("SANDBOX_GOLDEN_SNAPSHOT_ID defaults to undefined", () => {
      stubAllRequired();
      _resetForTesting();
      const env = getServerEnv();
      expect(env.SANDBOX_GOLDEN_SNAPSHOT_ID).toBeUndefined();
    });

    it("exposes optional VERCEL_OIDC_TOKEN", () => {
      stubAllRequired();
      vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc_token_123");
      _resetForTesting();
      const env = getServerEnv();
      expect(env.VERCEL_OIDC_TOKEN).toBe("oidc_token_123");
    });

    it("exposes optional VERCEL_TOKEN", () => {
      stubAllRequired();
      vi.stubEnv("VERCEL_TOKEN", "vercel_token_123");
      _resetForTesting();
      const env = getServerEnv();
      expect(env.VERCEL_TOKEN).toBe("vercel_token_123");
    });

    it("exposes optional VERCEL_TEAM_ID and VERCEL_PROJECT_ID", () => {
      stubAllRequired();
      vi.stubEnv("VERCEL_TEAM_ID", "team_abc");
      vi.stubEnv("VERCEL_PROJECT_ID", "prj_xyz");
      _resetForTesting();
      const env = getServerEnv();
      expect(env.VERCEL_TEAM_ID).toBe("team_abc");
      expect(env.VERCEL_PROJECT_ID).toBe("prj_xyz");
    });

    it("trims whitespace from sandbox vars", () => {
      stubAllRequired();
      vi.stubEnv("SANDBOX_GOLDEN_SNAPSHOT_ID", "  snap_abc123  ");
      _resetForTesting();
      const env = getServerEnv();
      expect(env.SANDBOX_GOLDEN_SNAPSHOT_ID).toBe("snap_abc123");
    });
  });

  describe("managed agents env vars", () => {
    it("exposes optional ANTHROPIC_AGENT_ID", () => {
      stubAllRequired();
      vi.stubEnv("ANTHROPIC_AGENT_ID", "agent_abc123");
      const env = getServerEnv();
      expect(env.ANTHROPIC_AGENT_ID).toBe("agent_abc123");
    });

    it("ANTHROPIC_AGENT_ID defaults to undefined", () => {
      stubAllRequired();
      const env = getServerEnv();
      expect(env.ANTHROPIC_AGENT_ID).toBeUndefined();
    });

    it("exposes optional ANTHROPIC_AGENT_VERSION", () => {
      stubAllRequired();
      vi.stubEnv("ANTHROPIC_AGENT_VERSION", "3");
      const env = getServerEnv();
      expect(env.ANTHROPIC_AGENT_VERSION).toBe("3");
    });

    it("ANTHROPIC_AGENT_VERSION defaults to undefined", () => {
      stubAllRequired();
      const env = getServerEnv();
      expect(env.ANTHROPIC_AGENT_VERSION).toBeUndefined();
    });

    it("exposes optional ANTHROPIC_ENVIRONMENT_ID", () => {
      stubAllRequired();
      vi.stubEnv("ANTHROPIC_ENVIRONMENT_ID", "env_xyz");
      const env = getServerEnv();
      expect(env.ANTHROPIC_ENVIRONMENT_ID).toBe("env_xyz");
    });

    it("ANTHROPIC_ENVIRONMENT_ID defaults to undefined", () => {
      stubAllRequired();
      const env = getServerEnv();
      expect(env.ANTHROPIC_ENVIRONMENT_ID).toBeUndefined();
    });

    it("trims whitespace from managed agents env vars", () => {
      stubAllRequired();
      vi.stubEnv("ANTHROPIC_AGENT_ID", "  agent_abc123  ");
      const env = getServerEnv();
      expect(env.ANTHROPIC_AGENT_ID).toBe("agent_abc123");
    });
  });
});
