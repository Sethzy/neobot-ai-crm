/**
 * Supabase queries for persisted Browser-Use profiles.
 * @module lib/browser-use/profiles
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

type BrowserProfileSupabaseClient = SupabaseClient<Database>;

const browserProfileRowSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  platform: z.string().min(1),
  browser_use_profile_id: z.string().min(1),
  label: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

const browserProfileUpsertSchema = z.object({
  clientId: z.string().uuid(),
  platform: z.string().min(1),
  browserUseProfileId: z.string().min(1),
  label: z.string().min(1).optional(),
});

export type BrowserProfile = z.infer<typeof browserProfileRowSchema>;

/**
 * Loads one persisted browser profile for a client and platform, if it exists.
 */
export async function getProfileForPlatform(
  supabase: BrowserProfileSupabaseClient,
  clientId: string,
  platform: string,
): Promise<BrowserProfile | null> {
  const { data, error } = await supabase
    .from("browser_profiles")
    .select("*")
    .eq("client_id", clientId)
    .eq("platform", platform)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load browser profile: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return browserProfileRowSchema.parse(data);
}

/**
 * Creates or updates one persisted browser profile mapping.
 */
export async function upsertProfile(
  supabase: BrowserProfileSupabaseClient,
  params: {
    clientId: string;
    platform: string;
    browserUseProfileId: string;
    label?: string;
  },
): Promise<BrowserProfile> {
  const parsedInput = browserProfileUpsertSchema.parse(params);
  const { data, error } = await supabase
    .from("browser_profiles")
    .upsert(
      {
        client_id: parsedInput.clientId,
        platform: parsedInput.platform,
        browser_use_profile_id: parsedInput.browserUseProfileId,
        label: parsedInput.label ?? null,
      },
      { onConflict: "client_id,platform" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to upsert browser profile: ${error.message}`);
  }

  return browserProfileRowSchema.parse(data);
}

/**
 * Lists all persisted browser profiles for one client.
 */
export async function listProfiles(
  supabase: BrowserProfileSupabaseClient,
  clientId: string,
): Promise<BrowserProfile[]> {
  const { data, error } = await supabase
    .from("browser_profiles")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list browser profiles: ${error.message}`);
  }

  return browserProfileRowSchema.array().parse(data ?? []);
}
