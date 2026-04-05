#!/usr/bin/env npx tsx
/**
 * Diagnostic: sends the stamp-duty prompt to a fresh thread and logs
 * every SSE event. Run this while watching the dev server terminal.
 *
 * Usage: npx tsx scripts/qa/diag-stamp-duty.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const BASE_URL = process.env.QA_BASE_URL ?? "http://localhost:3001";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const QA_EMAIL = process.env.QA_USER_EMAIL ?? "";
const QA_PASSWORD = process.env.QA_USER_PASSWORD ?? "";

const SUPABASE_REF = SUPABASE_URL.match(/https:\/\/([a-z]+)\.supabase\.co/)?.[1] ?? "unknown";
const COOKIE_KEY = `sb-${SUPABASE_REF}-auth-token`;
const MAX_CHUNK_SIZE = 3180;

async function buildAuthCookies(): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email: QA_EMAIL, password: QA_PASSWORD });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  console.log(`Signed in as ${data.user.email}`);

  const sessionJson = JSON.stringify(data.session);
  const encoded = encodeURIComponent(sessionJson);
  if (encoded.length <= MAX_CHUNK_SIZE) return `${COOKIE_KEY}=${sessionJson}`;

  const chunks: string[] = [];
  let remaining = encoded;
  while (remaining.length > 0) {
    let head = remaining.slice(0, MAX_CHUNK_SIZE);
    const lastPct = head.lastIndexOf("%");
    if (lastPct > MAX_CHUNK_SIZE - 3) head = head.slice(0, lastPct);
    chunks.push(decodeURIComponent(head));
    remaining = remaining.slice(head.length);
  }
  return chunks.map((chunk, i) => `${COOKIE_KEY}.${i}=${chunk}`).join("; ");
}

async function main() {
  const cookieHeader = await buildAuthCookies();
  const threadId = randomUUID();
  const messageId = randomUUID();

  console.log(`\nThread: ${threadId}`);
  console.log(`Prompt: "Property price is $800,000. Stamp duty is 3% on the first $180K and 4% above that. Calculate stamp duty."`);
  console.log(`POST ${BASE_URL}/api/chat\n`);

  const start = Date.now();
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({
      id: threadId,
      message: {
        id: messageId,
        role: "user",
        parts: [{ type: "text", text: "Property price is $800,000. Stamp duty is 3% on the first $180K and 4% above that. Calculate stamp duty." }],
      },
    }),
  });

  console.log(`HTTP ${res.status} (${Date.now() - start}ms)`);
  console.log(`Headers: content-type=${res.headers.get("content-type")}\n`);

  if (!res.ok || !res.body) {
    console.log("No stream body. Raw response:");
    console.log(await res.text());
    return;
  }

  // Read stream and log every SSE event
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let eventCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    totalBytes += value.byteLength;

    // Parse SSE events from chunk
    const lines = chunk.split("\n");
    for (const line of lines) {
      if (line.startsWith("data:") || line.startsWith("event:")) {
        eventCount++;
        const preview = line.length > 200 ? line.substring(0, 200) + "..." : line;
        console.log(`  [${eventCount}] ${preview}`);
      }
    }
  }

  const elapsed = Date.now() - start;
  console.log(`\n--- Stream complete ---`);
  console.log(`  Total bytes: ${totalBytes}`);
  console.log(`  Total events: ${eventCount}`);
  console.log(`  Duration: ${elapsed}ms`);

  // Wait for server-side persistence, then check DB
  console.log(`\nWaiting 3s for server-side persistence...`);
  await new Promise(r => setTimeout(r, 3000));

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await supabase.auth.signInWithPassword({ email: QA_EMAIL, password: QA_PASSWORD });

  const { data: messages, error: msgError } = await supabase
    .from("conversation_messages")
    .select("role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (msgError) {
    console.log(`  DB query error: ${msgError.message} (code: ${msgError.code})`);
  }

  console.log(`\nDB messages for thread ${threadId}:`);
  if (!messages || messages.length === 0) {
    console.log("  (none found)");
  } else {
    for (const msg of messages) {
      const preview = msg.content ? msg.content.substring(0, 120) : "(no content)";
      console.log(`  [${msg.role}] ${preview}`);
    }
  }

  const assistantMsg = messages?.find(m => m.role === "assistant");
  console.log(`\n${assistantMsg ? "PASS — assistant message persisted" : "FAIL — assistant message MISSING from DB"}`);

  // Also check the original failed thread from the QA run
  const originalThread = "b33b513a-a745-4211-9f5e-5bc99018a90b";
  const { data: origMessages } = await supabase
    .from("conversation_messages")
    .select("role, content, created_at")
    .eq("thread_id", originalThread)
    .order("created_at", { ascending: true });

  console.log(`\n--- Original QA thread (${originalThread}) ---`);
  if (!origMessages || origMessages.length === 0) {
    console.log("  (none found — may be RLS filtered)");
  } else {
    console.log(`  ${origMessages.length} messages:`);
    for (const msg of origMessages) {
      const preview = msg.content ? msg.content.substring(0, 100) : "(no content)";
      console.log(`  [${msg.role}] ${preview}`);
    }
    const lastMsg = origMessages[origMessages.length - 1];
    console.log(`\n  Last message role: ${lastMsg?.role} — ${lastMsg?.role === "assistant" ? "stamp-duty response EXISTS" : "stamp-duty response MISSING"}`);
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
