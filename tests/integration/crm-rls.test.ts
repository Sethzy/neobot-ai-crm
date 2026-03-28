/**
 * Integration test: CRM row-level security policies.
 * Verifies tenant isolation — client A cannot read/write client B's data.
 * Tests against real Postgres RLS policies via local Supabase.
 *
 * Skipped automatically when local Supabase is not running.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { cleanupAll, cleanupAuthUsers } from "./helpers/cleanup";
import { seedClient, seedCrmData, seedThread, type SeededClient } from "./helpers/seed";
import {
  createServiceClient,
  createAnonClient,
  signInTestUser,
  isSupabaseRunning,
  type TestSupabaseClient,
} from "./helpers/supabase-local";

const canRun = await isSupabaseRunning();

let serviceClient: TestSupabaseClient;

let clientA: SeededClient;
let clientB: SeededClient;
let crmA: Awaited<ReturnType<typeof seedCrmData>>;
let crmB: Awaited<ReturnType<typeof seedCrmData>>;
let authedClientA: TestSupabaseClient;
let authedClientB: TestSupabaseClient;

beforeAll(async () => {
  serviceClient = createServiceClient();
});

afterAll(async () => {
  if (canRun) {
    await cleanupAll(serviceClient);
    await cleanupAuthUsers(serviceClient);
  }
});

beforeEach(async () => {
  if (!canRun) return;

  await cleanupAll(serviceClient);
  await cleanupAuthUsers(serviceClient);

  // Seed two isolated clients with CRM data
  clientA = await seedClient(serviceClient, { email: "client-a@rls.test" });
  clientB = await seedClient(serviceClient, { email: "client-b@rls.test" });

  crmA = await seedCrmData(serviceClient, clientA.clientId);
  crmB = await seedCrmData(serviceClient, clientB.clientId);

  // Create authenticated anon clients for each user
  const anonA = createAnonClient();
  const anonB = createAnonClient();
  authedClientA = await signInTestUser(anonA, "client-a@rls.test");
  authedClientB = await signInTestUser(anonB, "client-b@rls.test");
});

describe.runIf(canRun)("CRM RLS — Contacts", () => {
  it("client A can read own contacts", async () => {
    const { data, error } = await authedClientA.from("contacts").select("*");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].contact_id).toBe(crmA.contactId);
  });

  it("client A cannot read client B contacts", async () => {
    const { data, error } = await authedClientA
      .from("contacts")
      .select("*")
      .eq("contact_id", crmB.contactId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("client A cannot insert into client B scope", async () => {
    const { error } = await authedClientA.from("contacts").insert({
      client_id: clientB.clientId,
      first_name: "Injected",
      last_name: "Contact",
      type: "buyer",
    });

    // Should fail — RLS blocks cross-client inserts
    expect(error).toBeTruthy();
  });

  it("client A cannot update client B contacts", async () => {
    const { data } = await authedClientA
      .from("contacts")
      .update({ first_name: "Hacked" })
      .eq("contact_id", crmB.contactId)
      .select();

    // Update returns empty — RLS filters out the row
    expect(data).toHaveLength(0);
  });

  it("client A cannot delete client B contacts", async () => {
    const { data } = await authedClientA
      .from("contacts")
      .delete()
      .eq("contact_id", crmB.contactId)
      .select();

    expect(data).toHaveLength(0);

    // Verify B's contact still exists
    const { data: stillThere } = await serviceClient
      .from("contacts")
      .select("contact_id")
      .eq("contact_id", crmB.contactId);
    expect(stillThere).toHaveLength(1);
  });
});

describe.runIf(canRun)("CRM RLS — Companies", () => {
  it("client A sees only own companies", async () => {
    const { data } = await authedClientA.from("companies").select("*");
    expect(data).toHaveLength(1);
    expect(data![0].company_id).toBe(crmA.companyId);
  });

  it("client B sees only own companies", async () => {
    const { data } = await authedClientB.from("companies").select("*");
    expect(data).toHaveLength(1);
    expect(data![0].company_id).toBe(crmB.companyId);
  });
});

describe.runIf(canRun)("CRM RLS — Deals", () => {
  it("client A sees only own deals", async () => {
    const { data } = await authedClientA.from("deals").select("*");
    expect(data).toHaveLength(1);
    expect(data![0].deal_id).toBe(crmA.dealId);
  });

  it("client A cannot read client B deals by ID", async () => {
    const { data } = await authedClientA
      .from("deals")
      .select("*")
      .eq("deal_id", crmB.dealId);

    expect(data).toHaveLength(0);
  });
});

describe.runIf(canRun)("CRM RLS — Deal Contacts (Junction)", () => {
  it("client A sees own deal_contacts", async () => {
    const { data } = await authedClientA.from("deal_contacts").select("*");
    expect(data).toHaveLength(1);
  });

  it("client A cannot see client B deal_contacts", async () => {
    const { data } = await authedClientA
      .from("deal_contacts")
      .select("*")
      .eq("deal_id", crmB.dealId);

    expect(data).toHaveLength(0);
  });
});

describe.runIf(canRun)("CRM RLS — Service Role Bypass", () => {
  it("service role can read all clients' data", async () => {
    const { data } = await serviceClient.from("contacts").select("*");
    // Both client A and B contacts visible
    expect(data!.length).toBeGreaterThanOrEqual(2);
  });

  it("service role can read cross-client by ID", async () => {
    const { data } = await serviceClient
      .from("deals")
      .select("*")
      .eq("deal_id", crmB.dealId);

    expect(data).toHaveLength(1);
  });
});

describe.runIf(canRun)("CRM RLS — Conversation Threads", () => {
  it("client A cannot read client B threads", async () => {
    // Seed threads for both clients
    await seedThread(serviceClient, clientA.clientId, { title: "A's thread" });
    await seedThread(serviceClient, clientB.clientId, { title: "B's thread" });

    const { data } = await authedClientA
      .from("conversation_threads")
      .select("*");

    // Client A should see only their own threads (never B's).
    // May include >1 if other tests/bootstrap created threads for this client.
    const titles = data!.map((t) => t.title);
    expect(titles).toContain("A's thread");
    expect(titles).not.toContain("B's thread");

    // Verify all visible threads belong to client A
    for (const thread of data!) {
      expect(thread.client_id).toBe(clientA.clientId);
    }
  });
});

describe.runIf(canRun)("CRM RLS — Runs", () => {
  it("client A cannot see client B runs", async () => {
    const threadA = await seedThread(serviceClient, clientA.clientId);
    const threadB = await seedThread(serviceClient, clientB.clientId);

    // Create runs via service client
    await serviceClient.from("runs").insert({
      thread_id: threadA.threadId,
      client_id: clientA.clientId,
      status: "running",
      run_type: "chat",
    });

    await serviceClient.from("runs").insert({
      thread_id: threadB.threadId,
      client_id: clientB.clientId,
      status: "running",
      run_type: "chat",
    });

    const { data } = await authedClientA.from("runs").select("*");
    expect(data).toHaveLength(1);
    expect(data![0].client_id).toBe(clientA.clientId);
  });
});

describe.runIf(canRun)("CRM RLS — Approval Events", () => {
  it("client A cannot see client B approval events", async () => {
    const threadA = await seedThread(serviceClient, clientA.clientId);
    const threadB = await seedThread(serviceClient, clientB.clientId);

    // Create runs first (approval_events references runs)
    const { data: runA } = await serviceClient
      .from("runs")
      .insert({
        thread_id: threadA.threadId,
        client_id: clientA.clientId,
        status: "running",
        run_type: "chat",
      })
      .select("run_id")
      .single();

    const { data: runB } = await serviceClient
      .from("runs")
      .insert({
        thread_id: threadB.threadId,
        client_id: clientB.clientId,
        status: "running",
        run_type: "chat",
      })
      .select("run_id")
      .single();

    // Insert approval events via service client
    await serviceClient.from("approval_events").insert({
      client_id: clientA.clientId,
      thread_id: threadA.threadId,
      run_id: runA!.run_id,
      tool_name: "send_email",
      approval_id: "approval-a",
    });

    await serviceClient.from("approval_events").insert({
      client_id: clientB.clientId,
      thread_id: threadB.threadId,
      run_id: runB!.run_id,
      tool_name: "send_email",
      approval_id: "approval-b",
    });

    const { data } = await authedClientA.from("approval_events").select("*");
    expect(data).toHaveLength(1);
    expect(data![0].approval_id).toBe("approval-a");
  });
});
