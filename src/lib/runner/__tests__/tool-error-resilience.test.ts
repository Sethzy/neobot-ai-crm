/**
 * Verifies AI SDK tool-error behavior so runner tools can keep native throw semantics.
 * @module lib/runner/__tests__/tool-error-resilience
 */
import { generateText, tool } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";

function createUsage(inputTotal: number, outputTotal: number) {
  return {
    inputTokens: {
      total: inputTotal,
      noCache: inputTotal,
      cacheRead: 0,
      cacheWrite: 0,
    },
    outputTokens: {
      total: outputTotal,
      text: outputTotal,
      reasoning: 0,
    },
  };
}

describe("tool error resilience", () => {
  it("converts thrown tool execution errors into tool-error content without crashing", async () => {
    const errorMessage = "Supabase connection timeout";

    const failingTool = tool({
      description: "Always throws to verify AI SDK error handling.",
      inputSchema: z.object({}),
      execute: async () => {
        throw new Error(errorMessage);
      },
    });

    const mockModel = new MockLanguageModelV3({
      doGenerate: async () => {
        return {
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "failing_tool",
              input: "{}",
            },
          ],
          finishReason: "tool-calls",
          usage: createUsage(12, 4),
          warnings: [],
        };
      },
    });

    const result = await generateText({
      model: mockModel,
      prompt: "Use failing_tool and report the result.",
      tools: { failing_tool: failingTool },
      maxSteps: 2,
    });

    expect(result.steps).toHaveLength(1);
    expect(
      result.steps.some((step) =>
        step.content.some((part) => part.type === "tool-error"),
      ),
    ).toBe(true);
    const firstToolError = result.steps[0]?.content.find((part) => part.type === "tool-error");
    expect(firstToolError).toBeDefined();
    expect(String(firstToolError && "error" in firstToolError ? firstToolError.error : "")).toContain(
      errorMessage,
    );
  });
});
