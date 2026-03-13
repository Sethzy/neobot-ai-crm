/**
 * Quick single-message test to debug 500 errors.
 * @module scripts/qa/test-single
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

async function main() {
  const email = process.env.QA_USER_EMAIL ?? "";
  const password = process.env.QA_USER_PASSWORD ?? "";
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    console.error("Auth failed:", error?.message);
    return;
  }

  console.log("Signed in as:", data.user.email);

  // Build cookie
  const ref = supabaseUrl.match(/https:\/\/([a-z]+)\.supabase\.co/)?.[1] ?? "unknown";
  const cookieKey = `sb-${ref}-auth-token`;
  const sessionJson = JSON.stringify(data.session);
  const encoded = encodeURIComponent(sessionJson);

  let cookieHeader: string;
  if (encoded.length <= 3180) {
    cookieHeader = `${cookieKey}=${sessionJson}`;
  } else {
    const chunks: string[] = [];
    let remaining = encoded;
    while (remaining.length > 0) {
      let head = remaining.slice(0, 3180);
      const lastPct = head.lastIndexOf("%");
      if (lastPct > 3180 - 3) head = head.slice(0, lastPct);
      chunks.push(decodeURIComponent(head));
      remaining = remaining.slice(head.length);
    }
    cookieHeader = chunks.map((c, i) => `${cookieKey}.${i}=${c}`).join("; ");
  }

  console.log("Cookie chunks:", cookieHeader.split("; ").length);

  const threadId = randomUUID();
  console.log("Thread:", threadId);

  const res = await fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify({
      id: threadId,
      message: {
        id: randomUUID(),
        role: "user",
        parts: [{ type: "text", text: "What is 2+2?" }],
      },
    }),
  });

  console.log("Status:", res.status);
  console.log("Content-Type:", res.headers.get("content-type"));

  const text = await res.text();
  console.log(`Body (${text.length}B):`, text.slice(0, 1000));
}

main().catch(console.error);
