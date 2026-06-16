/**
 * Shared DB seeding utilities for integration tests.
 * All functions use service-role client (bypasses RLS).
 * @module tests/integration/helpers/seed
 */
import { randomUUID } from "crypto";

import type { TestSupabaseClient } from "./supabase-local";

export interface SeededClient {
  clientId: string;
  userId: string;
  email: string;
}

export interface SeededThread {
  threadId: string;
  clientId: string;
}

/**
 * Creates a test auth user. The `handle_new_user` DB trigger auto-creates
 * the matching `clients` row, so we just look it up after user creation.
 */
export async function seedClient(
  supabase: TestSupabaseClient,
  opts?: { email?: string },
): Promise<SeededClient> {
  const email = opts?.email ?? `test-${randomUUID()}@integration.test`;

  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password: "test-password-123!",
      email_confirm: true,
    });

  if (authError) throw new Error(`seedClient auth: ${authError.message}`);

  const userId = authData.user.id;

  // The on_auth_user_created trigger auto-inserts a clients row.
  // Just look it up instead of inserting again.
  const { data, error } = await supabase
    .from("clients")
    .select("client_id")
    .eq("user_id", userId)
    .single();

  if (error) throw new Error(`seedClient lookup: ${error.message}`);

  return { clientId: data.client_id, userId, email };
}

/**
 * Creates a conversation thread for a client.
 */
export async function seedThread(
  supabase: TestSupabaseClient,
  clientId: string,
  opts?: { title?: string },
): Promise<SeededThread> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .insert({ client_id: clientId, title: opts?.title ?? "Integration test thread" })
    .select("thread_id")
    .single();

  if (error) throw new Error(`seedThread: ${error.message}`);

  return { threadId: data.thread_id, clientId };
}

/**
 * Inserts one or more conversation messages into a thread.
 * Returns the inserted message IDs in chronological order.
 */
export async function seedMessages(
  supabase: TestSupabaseClient,
  threadId: string,
  messages: Array<{ role: string; content: string; created_at?: string }>,
): Promise<string[]> {
  // Insert one at a time to preserve ordering when using explicit created_at.
  const ids: string[] = [];
  for (const msg of messages) {
    const { data, error } = await supabase
      .from("conversation_messages")
      .insert({
        thread_id: threadId,
        role: msg.role,
        content: msg.content,
        ...(msg.created_at ? { created_at: msg.created_at } : {}),
      })
      .select("message_id")
      .single();

    if (error) throw new Error(`seedMessages: ${error.message}`);
    ids.push(data.message_id);
  }

  return ids;
}

/**
 * Seeds CRM data for a client: companies, contacts, deals, deal_contacts.
 * Returns IDs for use in assertions.
 */
export async function seedCrmData(
  supabase: TestSupabaseClient,
  clientId: string,
) {
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .insert({ client_id: clientId, name: "Test Corp" })
    .select("company_id")
    .single();
  if (companyErr) throw new Error(`seedCrmData company: ${companyErr.message}`);

  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .insert({
      client_id: clientId,
      first_name: "Alice",
      last_name: "Test",
      type: "buyer",
      email: "alice@test.com",
    })
    .select("contact_id")
    .single();
  if (contactErr) throw new Error(`seedCrmData contact: ${contactErr.message}`);

  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .insert({
      client_id: clientId,
      address: "123 Test Street",
      stage: "leads",
      amount: 500000,
    })
    .select("deal_id")
    .single();
  if (dealErr) throw new Error(`seedCrmData deal: ${dealErr.message}`);

  const { error: linkErr } = await supabase.from("deal_contacts").insert({
    client_id: clientId,
    deal_id: deal.deal_id,
    contact_id: contact.contact_id,
    role: "buyer",
    is_primary: true,
  });
  if (linkErr) throw new Error(`seedCrmData deal_contacts: ${linkErr.message}`);

  return {
    companyId: company.company_id,
    contactId: contact.contact_id,
    dealId: deal.deal_id,
  };
}
