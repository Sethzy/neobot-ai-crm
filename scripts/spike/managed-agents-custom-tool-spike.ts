/**
 * Managed Agents custom-tool end-to-end spike.
 *
 * Validates the single hardest assumption in H3 before we build the full
 * chat adapter:
 *
 *   1. Create an ephemeral environment + agent with ONE custom tool
 *   2. Create a session pinned to that agent version
 *   3. Open the SSE event stream BEFORE sending the kickoff (§7)
 *   4. Send a user.message that forces the agent to call the custom tool
 *   5. Dispatch the tool (mock implementation here) and send back
 *      user.custom_tool_result for that exact custom_tool_use_id
 *   6. Let the agent loop resume and verify it reaches session.status_idle
 *      with stop_reason.type === "end_turn"
 *   7. Cleanup: delete the session, archive the agent, delete the environment
 *
 * If this works cleanly, H3's event translation loop is "just" scaling this
 * out. If any step surprises us, we find out before porting 38 tool factories.
 *
 * Usage:
 *   pnpm tsx scripts/spike/managed-agents-custom-tool-spike.ts
 *
 * Requires:
 *   ANTHROPIC_API_KEY in .env.local
 *
 * @module scripts/spike/managed-agents-custom-tool-spike
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaManagedAgentsStreamSessionEvents,
  BetaManagedAgentsAgentCustomToolUseEvent,
  BetaManagedAgentsSessionStatusIdleEvent,
} from "@anthropic-ai/sdk/resources/beta/sessions/events";

// ------ env loading ---------------------------------------------------------

function loadDotEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const rawLine of raw.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local missing is fine — env may be exported another way.
  }
}

// ------ logging helpers -----------------------------------------------------

const startedAt = Date.now();
function ts(): string {
  const ms = Date.now() - startedAt;
  return `t+${String(ms).padStart(5, " ")}ms`;
}
function section(title: string): void {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}
function log(msg: string, extra?: unknown): void {
  if (extra !== undefined) {
    console.log(`[${ts()}] ${msg}`, typeof extra === "string" ? extra : JSON.stringify(extra));
  } else {
    console.log(`[${ts()}] ${msg}`);
  }
}

// ------ mock tool dispatch --------------------------------------------------

/**
 * Mock implementation of the custom tool. Pretends to search a CRM and
 * returns two hardcoded "Sarah" contacts regardless of input. The real
 * dispatcher in H3 will run actual Supabase queries with user auth.
 */
function dispatchLookupContacts(input: Record<string, unknown>): {
  success: boolean;
  contacts: Array<{ name: string; phone: string; type: string }>;
} {
  log(`  ↳ dispatching lookup_contacts with input: ${JSON.stringify(input)}`);
  return {
    success: true,
    contacts: [
      { name: "Sarah Lim", phone: "+65 9123 4567", type: "buyer" },
      { name: "Sarah Tan", phone: "+65 8234 5678", type: "seller" },
    ],
  };
}

// ------ event helpers -------------------------------------------------------

type StreamEvent = BetaManagedAgentsStreamSessionEvents;

function isIdleTerminal(
  event: BetaManagedAgentsSessionStatusIdleEvent,
): "end_turn" | "retries_exhausted" | null {
  const stop = event.stop_reason;
  if (stop.type === "end_turn") return "end_turn";
  if (stop.type === "retries_exhausted") return "retries_exhausted";
  return null;
}

function isRequiresAction(
  event: BetaManagedAgentsSessionStatusIdleEvent,
): string[] | null {
  if (event.stop_reason.type !== "requires_action") return null;
  return event.stop_reason.event_ids;
}

// ------ spike ---------------------------------------------------------------

async function main() {
  loadDotEnvLocal();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Put it in .env.local or export it.",
    );
  }

  const client = new Anthropic({ apiKey });
  const cleanup: Array<() => Promise<unknown>> = [];

  let agentId: string | undefined;
  let agentVersion: number | undefined;
  let environmentId: string | undefined;
  let sessionId: string | undefined;

  try {
    // --- 1. Create environment ---
    section("1. Create environment");
    const environment = await client.beta.environments.create({
      name: `sunder-spike-${Date.now()}`,
      description: "Temporary environment for H3 custom-tool spike — safe to delete.",
      config: {
        type: "cloud",
        networking: { type: "unrestricted" },
      },
    });
    environmentId = environment.id;
    log(`✓ environment.id = ${environmentId}`);
    cleanup.push(() =>
      client.beta.environments.delete(environmentId!).catch((e) => {
        console.error(`  cleanup: failed to delete environment: ${String(e)}`);
      }),
    );

    // --- 2. Create agent with ONE custom tool ---
    section("2. Create agent with one custom tool");
    const agent = await client.beta.agents.create({
      name: `sunder-spike-agent-${Date.now()}`,
      description: "H3 custom-tool dispatch spike",
      model: "claude-sonnet-4-6",
      system: [
        "You are a CRM assistant.",
        "When the user asks about contacts, you MUST call the `lookup_contacts` tool with a `query` string to search the CRM.",
        "Do not answer from memory. Always use the tool.",
        "After the tool returns, summarise the result to the user in one sentence.",
      ].join("\n\n"),
      tools: [
        {
          type: "custom",
          name: "lookup_contacts",
          description:
            "Search the CRM for contacts matching a query string. Returns a list of matching contacts with their name, phone, and type.",
          input_schema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Free-text search query, e.g. a first name.",
              },
            },
            required: ["query"],
          },
        },
      ],
    });
    agentId = agent.id;
    agentVersion = agent.version;
    log(`✓ agent.id = ${agentId}`);
    log(`✓ agent.version = ${agentVersion}`);
    cleanup.push(() =>
      client.beta.agents.archive(agentId!).catch((e) => {
        console.error(`  cleanup: failed to archive agent: ${String(e)}`);
      }),
    );

    // --- 3. Create session pinned to this version ---
    section("3. Create session");
    const session = await client.beta.sessions.create({
      agent: { type: "agent", id: agentId, version: agentVersion },
      environment_id: environmentId,
      title: "Spike: lookup_contacts end-to-end",
    });
    sessionId = session.id;
    log(`✓ session.id = ${sessionId}`);
    log(`  initial status = ${session.status}`);
    cleanup.push(() =>
      client.beta.sessions.delete(sessionId!).catch((e) => {
        // Post-idle delete race can 400 — log but don't fail the spike.
        console.error(`  cleanup: failed to delete session (may be harmless): ${String(e)}`);
      }),
    );

    // --- 4. Open SSE stream FIRST, then send kickoff (§7) ---
    section("4. Open SSE stream, then send kickoff");
    log("opening stream...");
    const stream = await client.beta.sessions.events.stream(sessionId);
    log("✓ stream open");

    log("sending kickoff user.message...");
    // Fire-and-forget: the stream is already listening so any events the
    // kickoff triggers flow into the iteration loop below.
    const kickoffPromise = client.beta.sessions.events.send(sessionId, {
      events: [
        {
          type: "user.message",
          content: [
            {
              type: "text",
              text: "How many contacts do I have named Sarah?",
            },
          ],
        },
      ],
    });

    // --- 5. Iterate events, dispatch tool, wait for terminal ---
    section("5. Stream iteration");

    const eventCounts: Record<string, number> = {};
    const pendingToolCalls = new Map<string, BetaManagedAgentsAgentCustomToolUseEvent>();
    const toolDispatches: Array<Promise<unknown>> = [];
    let finalAgentText = "";
    let terminalReason: string | null = null;
    let tokensIn = 0;
    let tokensOut = 0;

    const iterationDeadline = Date.now() + 90_000; // 90s hard cap

    for await (const event of stream as AsyncIterable<StreamEvent>) {
      if (Date.now() > iterationDeadline) {
        log("⚠️  iteration deadline reached, breaking");
        terminalReason = "deadline";
        break;
      }

      const type = event.type;
      eventCounts[type] = (eventCounts[type] ?? 0) + 1;

      switch (type) {
        case "session.status_running":
          log(`← ${type}`);
          break;

        case "span.model_request_start":
          log(`← ${type}`);
          break;

        case "span.model_request_end": {
          const usage = event.model_usage;
          tokensIn += usage.input_tokens;
          tokensOut += usage.output_tokens;
          log(
            `← ${type}  in=${usage.input_tokens} out=${usage.output_tokens}  cache_read=${usage.cache_read_input_tokens}  cache_create=${usage.cache_creation_input_tokens}`,
          );
          break;
        }

        case "agent.message": {
          const text = event.content.map((b) => b.text).join("");
          finalAgentText = text;
          log(`← ${type}  text="${text.slice(0, 200)}${text.length > 200 ? "…" : ""}"`);
          break;
        }

        case "agent.thinking":
          log(`← ${type}`);
          break;

        case "agent.custom_tool_use": {
          const toolEvent = event;
          pendingToolCalls.set(toolEvent.id, toolEvent);
          log(
            `← ${type}  name=${toolEvent.name}  id=${toolEvent.id}  input=${JSON.stringify(toolEvent.input)}`,
          );

          // Dispatch immediately (fire-and-forget). H3's real dispatcher
          // will look identical but run Supabase queries.
          const dispatchPromise = (async () => {
            const result = dispatchLookupContacts(toolEvent.input);
            const sendResult = await client.beta.sessions.events.send(sessionId!, {
              events: [
                {
                  type: "user.custom_tool_result",
                  custom_tool_use_id: toolEvent.id,
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(result),
                    },
                  ],
                  is_error: false,
                },
              ],
            });
            log(`  ↳ sent user.custom_tool_result for ${toolEvent.id}`);
            return sendResult;
          })().catch((e) => {
            console.error(`  ↳ failed to send tool result for ${toolEvent.id}: ${String(e)}`);
          });
          toolDispatches.push(dispatchPromise);
          break;
        }

        case "session.status_idle": {
          const idleEvent = event;
          const terminal = isIdleTerminal(idleEvent);
          const requiresAction = isRequiresAction(idleEvent);

          if (terminal) {
            log(`← ${type}  stop_reason=${terminal}  (TERMINAL)`);
            terminalReason = terminal;
          } else if (requiresAction) {
            log(
              `← ${type}  stop_reason=requires_action  event_ids=[${requiresAction.join(", ")}]  (NOT terminal — waiting for tool results)`,
            );
            // Don't break — the fire-and-forget dispatches above will send
            // back user.custom_tool_result and the stream will resume.
          } else {
            log(`← ${type}  stop_reason=${idleEvent.stop_reason.type}  (unknown — treating as non-terminal)`);
          }
          break;
        }

        case "session.status_terminated":
          log(`← ${type}  (TERMINAL FAILURE)`);
          terminalReason = "terminated";
          break;

        case "session.error":
          log(`← ${type}  error=${JSON.stringify(event.error)}  (surfaced, not terminal)`);
          break;

        default:
          log(`← ${type}`);
          break;
      }

      if (terminalReason) break;
    }

    // Make sure our fire-and-forget dispatches have actually completed.
    await Promise.allSettled(toolDispatches);
    await kickoffPromise.catch(() => undefined);

    // --- 6. Summary ---
    section("6. Summary");
    log(`terminal reason    : ${terminalReason}`);
    log(`events processed   : ${Object.values(eventCounts).reduce((a, b) => a + b, 0)}`);
    log("event counts by type:");
    for (const [k, v] of Object.entries(eventCounts).sort()) {
      console.log(`  ${k.padEnd(40)} ${v}`);
    }
    log(`tool calls dispatched: ${pendingToolCalls.size}`);
    log(`tokens_in            : ${tokensIn}`);
    log(`tokens_out           : ${tokensOut}`);
    log(`final agent text     : "${finalAgentText}"`);

    // --- Assertions ---
    section("7. Assertions");
    const assertions: Array<{ name: string; pass: boolean; detail: string }> = [
      {
        name: "terminal reason is end_turn",
        pass: terminalReason === "end_turn",
        detail: `got: ${terminalReason}`,
      },
      {
        name: "at least one custom tool call was dispatched",
        pass: pendingToolCalls.size >= 1,
        detail: `dispatched ${pendingToolCalls.size}`,
      },
      {
        name: "final agent text mentions both Sarahs",
        pass:
          finalAgentText.toLowerCase().includes("2")
          || finalAgentText.toLowerCase().includes("two")
          || (finalAgentText.toLowerCase().includes("lim")
            && finalAgentText.toLowerCase().includes("tan")),
        detail: `text: "${finalAgentText.slice(0, 120)}"`,
      },
      {
        name: "at least one agent.message event",
        pass: (eventCounts["agent.message"] ?? 0) >= 1,
        detail: `count: ${eventCounts["agent.message"] ?? 0}`,
      },
      {
        name: "session.status_idle fired at least twice (requires_action + end_turn)",
        pass: (eventCounts["session.status_idle"] ?? 0) >= 2,
        detail: `count: ${eventCounts["session.status_idle"] ?? 0}`,
      },
    ];

    let allPass = true;
    for (const a of assertions) {
      const mark = a.pass ? "✅" : "❌";
      console.log(`  ${mark} ${a.name}  (${a.detail})`);
      if (!a.pass) allPass = false;
    }

    section(allPass ? "✅ SPIKE PASSED" : "❌ SPIKE FAILED");
    if (!allPass) process.exitCode = 1;
  } finally {
    // --- Cleanup (reverse order) ---
    section("Cleanup");
    for (const fn of cleanup.reverse()) {
      await fn();
    }
    log("cleanup complete");
  }
}

main().catch((err) => {
  console.error("\n❌ spike crashed:");
  console.error(err);
  process.exit(1);
});
