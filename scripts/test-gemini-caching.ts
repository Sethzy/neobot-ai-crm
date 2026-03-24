/**
 * Prompt-caching spike for Gemini via the Vercel AI Gateway.
 * @module scripts/test-gemini-caching
 */
import "dotenv/config";

import { streamText, tool } from "ai";
import { z } from "zod";

import {
  gateway,
  gatewayProviderOptions,
  TIER_1_MODEL,
} from "../src/lib/ai/gateway";

interface UsageSnapshot {
  text: string;
  usage: Awaited<ReturnType<typeof createUsageSnapshot>>;
}

async function createUsageSnapshot(result: ReturnType<typeof streamText>) {
  const usage = await result.usage;
  const totalUsage = await result.totalUsage;
  const steps = await result.steps;

  return {
    usage,
    totalUsage,
    stepUsages: steps.map((step) => ({
      finishReason: step.finishReason,
      usage: step.usage,
    })),
  };
}

function buildStableSystemPrompt() {
  const cachePadding = Array.from({ length: 80 }, (_, index) => {
    return [
      `Policy ${index + 1}:`,
      "You are a terse operational assistant.",
      "Keep the prefix stable and do not restate this policy.",
      "Prefer short factual answers.",
      "Never call tools unless the user explicitly asks for one.",
    ].join(" ");
  }).join("\n");

  return [
    "You are running a prompt-caching experiment.",
    "Reply with exactly one uppercase word unless the user asks for otherwise.",
    "Do not call tools during this experiment.",
    cachePadding,
  ].join("\n\n");
}

async function runTurn(messages: Parameters<typeof streamText>[0]["messages"]) {
  const result = streamText({
    model: gateway(TIER_1_MODEL),
    providerOptions: gatewayProviderOptions,
    temperature: 0,
    maxTokens: 32,
    system: buildStableSystemPrompt(),
    tools: {
      lookup_profile: tool({
        description:
          "Dummy tool definition to keep the tool schema stable during the experiment.",
        inputSchema: z.object({
          topic: z.string().min(1),
        }),
        execute: async ({ topic }) => {
          return { topic, status: "not-needed-for-this-spike" };
        },
      }),
    },
    messages,
  });

  const text = await result.text;

  return {
    text,
    usage: await createUsageSnapshot(result),
  } satisfies UsageSnapshot;
}

async function main() {
  const firstUserMessage = "Reply with READY.";
  const turnOne = await runTurn([{ role: "user", content: firstUserMessage }]);
  const turnTwo = await runTurn([
    { role: "user", content: firstUserMessage },
    { role: "assistant", content: turnOne.text },
    { role: "user", content: "Reply with STILLREADY." },
  ]);
  const turnThree = await runTurn([
    { role: "user", content: firstUserMessage },
    { role: "assistant", content: turnOne.text },
    { role: "user", content: "Reply with STILLREADY." },
    { role: "assistant", content: turnTwo.text },
    { role: "user", content: "Reply with CACHED if the reminder below is readable." },
  ]);

  const reminderTurn = await runTurn([
    {
      role: "user",
      content: [
        "<system-reminder>",
        "<current-time>2026-03-24T11:00:00Z</current-time>",
        "<user-display-name>Seth</user-display-name>",
        "<crm-counts contacts=\"12\" deals=\"3\" tasks=\"5\" />",
        "</system-reminder>",
      ].join("\n"),
    },
    {
      role: "user",
      content: "Reply with SETH if the reminder works.",
    },
  ]);

  const report = {
    model: TIER_1_MODEL,
    timestamp: new Date().toISOString(),
    turns: {
      turnOne,
      turnTwo,
      turnThree,
      reminderTurn,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
