'use client';

/**
 * @fileoverview React hook for AI Analyst chat with localStorage persistence.
 *
 * Features:
 * - localStorage persistence for messages and container ID
 * - Stale data detection (warns when new documents uploaded since session start)
 * - Pure Anthropic SDK streaming for all messages (first and follow-up)
 * - Container expiry handling (inline on send)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  type ChatSession,
  CHAT_STORAGE_KEY,
  type AnthropicContentBlock,
  type BashCodeExecutionOutput,
  type StreamingMetadataEvent,
  type UploadedFile,
} from "@/lib/analyst/types";
import { fileToBase64 } from "@/lib/analyst/image-utils";

// ============================================================================
// Types
// ============================================================================

/**
 * UI message type - compatible with AI SDK UIMessage but defined locally
 * to avoid dependency on @ai-sdk/react.
 */
export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  parts: Array<
    | { type: "text"; text: string }
    | { type: "reasoning"; text: string }
    | {
        type: "dynamic-tool";
        toolCallId: string;
        toolName: string;
        state: "input-available" | "output-available" | "output-error";
        input: unknown;
        output?: unknown;
        errorText?: string;
      }
    | { type: "file"; url: string; mediaType: string; filename?: string }
    | { type: "image"; data: string; mediaType: string }
  >;
}

interface UseAnalystChatOptions {
  /** The case ID for this chat session */
  caseId: string;
  /** Enable extended thinking - gives Claude a thinking budget for deeper reasoning */
  extendedThinking?: boolean;
}

interface UseAnalystChatReturn {
  /** Current chat messages */
  messages: UIMessage[];
  /** Send a message. Pass selectedTags on first message only. Optionally attach images and template files. */
  send: (text: string, selectedTags?: string[], images?: File[], templateFiles?: File[]) => Promise<void>;
  /** Error from last operation */
  error: Error | undefined;
  /** Reload last message */
  reload: () => void;
  /** Chat status: 'ready' | 'streaming' | 'error' */
  status: string;
  /** True if new documents uploaded since session started */
  isStale: boolean;
  /** Clear chat and start fresh */
  startFresh: () => void;
  /** True if any message is being processed */
  isLoading: boolean;
  /** True specifically during first message */
  isFirstMessageProcessing: boolean;
  /** Selected tags from existing session (for restoring locked filter state) */
  sessionTags: string[] | undefined;
  /** Manually trigger stale check */
  checkStale: () => Promise<void>;
  /** True when checkStale is in progress */
  isCheckingStale: boolean;
  /** True if response may be incomplete due to stream interruption */
  wasInterrupted: boolean;
  /** Uploaded template files metadata (from first message) */
  uploadedFiles: UploadedFile[] | undefined;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Streaming event callback type for SSE handling.
 */
type StreamEventCallback = (event: {
  type: string;
  contentBlocks: AnthropicContentBlock[];
  containerId: string | null;
  savedFiles: StreamingMetadataEvent["savedFiles"];
  isDone: boolean;
  isTextComplete: boolean;
}) => void;

/**
 * Parse SSE line from API response.
 */
function parseSSELine(line: string): unknown | null {
  if (!line.startsWith("data: ")) return null;
  const jsonStr = line.slice(6);
  if (!jsonStr || jsonStr === "[DONE]") return null;
  try {
    return JSON.parse(jsonStr);
  } catch {
    console.warn("[parseSSELine] Failed to parse:", jsonStr);
    return null;
  }
}

/** Template file data for API request */
interface TemplateFileData {
  name: string;
  content: string; // base64
  mimeType: string;
}

/**
 * Stream message via Anthropic SDK with SSE streaming.
 * Includes visibility detection to handle tab switches gracefully.
 */
async function streamMessage(
  messages: UIMessage[],
  caseId: string,
  containerId: string | null,
  selectedTags: string[] | undefined,
  onEvent: StreamEventCallback,
  abortSignal?: AbortSignal,
  templateFiles?: TemplateFileData[],
  extendedThinking?: boolean
): Promise<{ interrupted: boolean }> {
  console.log('[stream] Starting streamMessage', { caseId, containerId, timestamp: Date.now() });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
    },
    body: JSON.stringify({
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts,
      })),
      caseId,
      containerId,
      selectedTags: selectedTags?.length ? selectedTags : undefined,
      templateFiles: templateFiles?.length ? templateFiles : undefined,
      extendedThinking,
    }),
    signal: abortSignal,
  });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const errData = await res.json();
      const errorMsg = errData.details
        ? `${errData.error}: ${errData.details}`
        : errData.error || "Failed to start chat";
      throw new Error(errorMsg);
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  const contentBlocks: AnthropicContentBlock[] = [];
  let responseContainerId: string | null = null;
  let savedFiles: StreamingMetadataEvent["savedFiles"] = [];
  const partialInputs = new Map<number, string>();
  let lastActivityTime = Date.now();
  let lastReadTime = Date.now();
  let eventCount = 0;
  let readCount = 0;
  let wasInterruptedByVisibility = false;

  // Activity timeout detection (30s without data = stalled)
  const STALL_TIMEOUT_MS = 30000;
  const stallCheckInterval = setInterval(() => {
    const elapsed = Date.now() - lastActivityTime;
    console.log('[stream] Stall check', { elapsed, eventCount, readCount, timestamp: Date.now() });
    if (elapsed > STALL_TIMEOUT_MS) {
      console.warn('[stream] Stream stalled - no activity for 30s, aborting', { eventCount, readCount });
      wasInterruptedByVisibility = true;
      reader.cancel('Stream stalled').catch(() => {});
      clearInterval(stallCheckInterval);
    }
  }, 5000);

  try {
    while (true) {
      // Check abort signal
      if (abortSignal?.aborted) {
        console.log('[stream] Abort signal received');
        wasInterruptedByVisibility = true;
        break;
      }

      const { done, value } = await reader.read();
      const now = Date.now();
      const readGap = now - lastReadTime;
      lastReadTime = now;
      lastActivityTime = now;
      readCount++;

      // Log if there was a significant gap (> 2s) between reads - indicates throttling
      if (readGap > 2000) {
        console.warn('[stream] Long read gap detected (throttling?)', {
          readGap,
          readCount,
          eventCount,
          timestamp: now
        });
      }

      if (done) {
        console.log('[stream] Reader done', { eventCount, readCount, timestamp: now });
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const event = parseSSELine(line.trim());
        if (!event || typeof event !== "object") continue;

        eventCount++;
        const evt = event as Record<string, unknown>;

        // Log significant events
        if (evt.type === "message_stop" || evt.type === "metadata" || evt.type === "error") {
          console.log('[stream] Event received', { type: evt.type, eventCount, timestamp: Date.now() });
        }

        switch (evt.type) {
          case "content_block_start": {
            const index = evt.index as number;
            const block = evt.content_block as AnthropicContentBlock;
            contentBlocks[index] = block;
            if (
              block.type === "server_tool_use" ||
              block.type === "bash_code_execution_tool_use" ||
              block.type === "text_editor_code_execution_tool_use"
            ) {
              partialInputs.set(index, "");
            }
            onEvent({ type: "content_block_start", contentBlocks, containerId: responseContainerId, savedFiles, isDone: false, isTextComplete: false });
            break;
          }

          case "content_block_delta": {
            const index = evt.index as number;
            const delta = evt.delta as Record<string, unknown>;

            if (delta.type === "text_delta" && typeof delta.text === "string") {
              const block = contentBlocks[index];
              if (block?.type === "text") {
                (block as { type: "text"; text: string }).text += delta.text;
              }
            }

            if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
              const block = contentBlocks[index];
              if (block?.type === "thinking") {
                (block as { type: "thinking"; thinking: string }).thinking += delta.thinking;
              }
            }

            if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
              partialInputs.set(index, (partialInputs.get(index) ?? "") + delta.partial_json);
            }

            if (delta.type === "bash_code_execution_input_delta" && typeof delta.input_json_delta === "string") {
              partialInputs.set(index, (partialInputs.get(index) ?? "") + delta.input_json_delta);
            }

            if (delta.type === "text_editor_code_execution_input_delta" && typeof delta.input_json_delta === "string") {
              partialInputs.set(index, (partialInputs.get(index) ?? "") + delta.input_json_delta);
            }

            onEvent({ type: "content_block_delta", contentBlocks, containerId: responseContainerId, savedFiles, isDone: false, isTextComplete: false });
            break;
          }

          case "content_block_stop": {
            const index = evt.index as number;
            const partialJson = partialInputs.get(index);
            if (partialJson) {
              try {
                const block = contentBlocks[index];
                if (block && "input" in block) {
                  (block as { input: unknown }).input = JSON.parse(partialJson);
                }
              } catch {
                // Ignore parse errors
              }
              partialInputs.delete(index);
            }
            onEvent({ type: "content_block_stop", contentBlocks, containerId: responseContainerId, savedFiles, isDone: false, isTextComplete: false });
            break;
          }

          case "message_stop": {
            onEvent({ type: "message_stop", contentBlocks, containerId: responseContainerId, savedFiles, isDone: false, isTextComplete: true });
            break;
          }

          case "metadata": {
            responseContainerId = (evt.containerId as string) ?? null;
            savedFiles = (evt.savedFiles as StreamingMetadataEvent["savedFiles"]) ?? [];
            onEvent({ type: "metadata", contentBlocks, containerId: responseContainerId, savedFiles, isDone: true, isTextComplete: true });
            break;
          }

          case "error": {
            const errMsg = (evt.error as string) ?? "Unknown streaming error";
            const isContainerExpired =
              errMsg.includes("CONTAINER_EXPIRED") ||
              errMsg.includes("Session expired") ||
              (evt.code as string) === "CONTAINER_EXPIRED";
            if (isContainerExpired) {
              const expiredError = new Error("Session expired") as Error & { code?: string };
              expiredError.code = "CONTAINER_EXPIRED";
              throw expiredError;
            }
            throw new Error(errMsg);
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const event = parseSSELine(buffer.trim());
      if (event && typeof event === "object") {
        const evt = event as Record<string, unknown>;
        if (evt.type === "metadata") {
          console.log('[stream] Metadata from buffer', { timestamp: Date.now() });
          responseContainerId = (evt.containerId as string) ?? null;
          savedFiles = (evt.savedFiles as StreamingMetadataEvent["savedFiles"]) ?? [];
          onEvent({ type: "metadata", contentBlocks, containerId: responseContainerId, savedFiles, isDone: true, isTextComplete: true });
        }
      }
    }

    console.log('[stream] Stream completed', { eventCount, readCount, wasInterruptedByVisibility, timestamp: Date.now() });
    return { interrupted: wasInterruptedByVisibility };
  } finally {
    clearInterval(stallCheckInterval);
  }
}

/**
 * Convert Anthropic content blocks to UIMessage parts.
 */
function convertAnthropicContentToParts(
  content: AnthropicContentBlock[],
  savedFiles?: StreamingMetadataEvent["savedFiles"]
): UIMessage["parts"] {
  const fileMap = new Map(savedFiles?.map(f => [f.fileId, f]) ?? []);

  return content.flatMap((block): UIMessage["parts"] => {
    switch (block.type) {
      case "text":
        return [{ type: "text", text: block.text }];

      case "thinking":
        return [{ type: "reasoning", text: block.thinking }];

      case "server_tool_use": {
        let resultContent: unknown = undefined;
        let hasError = false;

        const serverResult = content.find(
          (b): b is Extract<AnthropicContentBlock, { type: "server_tool_result" }> =>
            b.type === "server_tool_result" && b.tool_use_id === block.id
        );
        if (serverResult) {
          resultContent = serverResult.content;
          hasError = serverResult.is_error === true;
        }

        if (!resultContent && block.name === "bash_code_execution") {
          const bashResult = content.find(
            (b): b is Extract<AnthropicContentBlock, { type: "bash_code_execution_tool_result" }> =>
              b.type === "bash_code_execution_tool_result" && b.tool_use_id === block.id
          );
          if (bashResult) {
            resultContent = bashResult.content;
            hasError = bashResult.content?.type === "bash_code_execution_error";
          }
        }

        if (!resultContent && block.name === "text_editor_code_execution") {
          const editorResult = content.find(
            (b): b is Extract<AnthropicContentBlock, { type: "text_editor_code_execution_tool_result" }> =>
              b.type === "text_editor_code_execution_tool_result" && b.tool_use_id === block.id
          );
          if (editorResult) {
            resultContent = editorResult.content;
          }
        }

        if (!resultContent) {
          return [{ type: "dynamic-tool", toolCallId: block.id, toolName: block.name, state: "input-available", input: block.input }];
        }
        if (hasError) {
          return [{ type: "dynamic-tool", toolCallId: block.id, toolName: block.name, state: "output-error", input: block.input, errorText: String(resultContent) }];
        }
        return [{ type: "dynamic-tool", toolCallId: block.id, toolName: block.name, state: "output-available", input: block.input, output: resultContent }];
      }

      case "server_tool_result":
        return [];

      case "bash_code_execution_tool_use": {
        const result = content.find(
          (b): b is Extract<AnthropicContentBlock, { type: "bash_code_execution_tool_result" }> =>
            b.type === "bash_code_execution_tool_result" && (b.tool_use_id === block.id || !b.tool_use_id)
        );
        const hasError = result?.content?.type === "bash_code_execution_error";
        const isComplete = !!result || content.some(b => b.type === "bash_code_execution_tool_result");

        if (hasError) {
          return [{ type: "dynamic-tool", toolCallId: block.id, toolName: "bash", state: "output-error", input: block.input, errorText: result?.content?.stderr || "Unknown error" }];
        }
        if (isComplete) {
          return [{ type: "dynamic-tool", toolCallId: block.id, toolName: "bash", state: "output-available", input: block.input, output: result?.content }];
        }
        return [{ type: "dynamic-tool", toolCallId: block.id, toolName: "bash", state: "input-available", input: block.input }];
      }

      case "text_editor_code_execution_tool_use": {
        const result = content.find(
          (b): b is Extract<AnthropicContentBlock, { type: "text_editor_code_execution_tool_result" }> =>
            b.type === "text_editor_code_execution_tool_result" && (b.tool_use_id === block.id || !b.tool_use_id)
        );
        const isComplete = !!result || content.some(b => b.type === "text_editor_code_execution_tool_result");

        if (isComplete) {
          return [{ type: "dynamic-tool", toolCallId: block.id, toolName: "str_replace_editor", state: "output-available", input: block.input, output: result?.content }];
        }
        return [{ type: "dynamic-tool", toolCallId: block.id, toolName: "str_replace_editor", state: "input-available", input: block.input }];
      }

      case "bash_code_execution_tool_result": {
        const result = block.content;
        if (result.type === "bash_code_execution_result" && result.content) {
          const parts: UIMessage["parts"] = [];
          for (const output of result.content as BashCodeExecutionOutput[]) {
            if (output.type === "bash_code_execution_output" && output.file_id) {
              const savedFile = fileMap.get(output.file_id);
              const downloadUrl = savedFile?.signedUrl ?? output.downloadUrl;
              if (downloadUrl) {
                parts.push({
                  type: "file",
                  url: downloadUrl,
                  mediaType: "application/octet-stream",
                  filename: savedFile?.filename ?? output.filename ?? `file_${output.file_id.slice(-8)}`,
                });
              }
            }
          }
          return parts;
        }
        return [];
      }

      case "text_editor_code_execution_tool_result":
        return [];

      default:
        console.warn(`[chat] Unknown content block type:`, block);
        return [];
    }
  });
}

// ============================================================================
// Helper to load initial state from localStorage
// ============================================================================

interface InitialState {
  messages: UIMessage[];
  containerId: string | null;
  startedAt: string | null;
  selectedTags: string[] | undefined;
  uploadedFiles: UploadedFile[] | undefined;
}

/**
 * Load initial state from localStorage.
 */
function getInitialState(caseId: string): InitialState {
  if (typeof window === "undefined") {
    return { messages: [], containerId: null, startedAt: null, selectedTags: undefined, uploadedFiles: undefined };
  }

  const stored = localStorage.getItem(CHAT_STORAGE_KEY(caseId));
  if (!stored) {
    return { messages: [], containerId: null, startedAt: null, selectedTags: undefined, uploadedFiles: undefined };
  }

  try {
    const session: ChatSession = JSON.parse(stored);
    if (session.caseId !== caseId) {
      return { messages: [], containerId: null, startedAt: null, selectedTags: undefined, uploadedFiles: undefined };
    }

    // Clear old sessions that don't have startedAt (old format)
    if (!session.startedAt) {
      localStorage.removeItem(CHAT_STORAGE_KEY(caseId));
      return { messages: [], containerId: null, startedAt: null, selectedTags: undefined, uploadedFiles: undefined };
    }

    return {
      messages: session.messages as UIMessage[],
      containerId: session.containerId,
      startedAt: session.startedAt,
      selectedTags: session.selectedTags,
      uploadedFiles: session.uploadedFiles,
    };
  } catch {
    return { messages: [], containerId: null, startedAt: null, selectedTags: undefined, uploadedFiles: undefined };
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for AI Analyst chat functionality.
 *
 * @example
 * const { messages, send, isLoading, isStale, startFresh } = useAnalystChat({
 *   caseId: "case-123",
 * });
 */
export function useAnalystChat({ caseId, extendedThinking }: UseAnalystChatOptions): UseAnalystChatReturn {
  // Load initial state from localStorage
  const [initial] = useState(() => getInitialState(caseId));

  const [messages, setMessages] = useState<UIMessage[]>(initial.messages);
  const [containerId, setContainerId] = useState<string | null>(initial.containerId);
  const [startedAt, setStartedAt] = useState<string | null>(initial.startedAt);
  const [sessionTags, setSessionTags] = useState<string[] | undefined>(initial.selectedTags);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[] | undefined>(initial.uploadedFiles);
  const [isStale, setIsStale] = useState(false);
  const [isCheckingStale, setIsCheckingStale] = useState(false);
  const [isFirstMessageProcessing, setIsFirstMessageProcessing] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [rawStatus, setRawStatus] = useState<"ready" | "streaming" | "error">("ready");
  const [wasInterrupted, setWasInterrupted] = useState(false);

  // Wrapper to log ALL status changes with stack trace
  const setStatus = (newStatus: "ready" | "streaming" | "error") => {
    console.log('[status-change]', rawStatus, '->', newStatus, Date.now());
    console.trace('[status-change] call stack');
    setRawStatus(newStatus);
  };
  const status = rawStatus;
  const lastUserMessageRef = useRef<{ text: string; tags?: string[] } | null>(null);

  /** Ref to track latest messages (avoids stale closure in send) */
  const messagesRef = useRef<UIMessage[]>(messages);
  /** Mutex to prevent concurrent sends */
  const isSendingRef = useRef(false);

  /**
   * Check if new documents were uploaded since session started.
   * @param silent - If true, skip setting isCheckingStale (no spinner). Used for background checks.
   */
  const checkStale = useCallback(async (silent = false) => {
    if (!startedAt) return;

    if (!silent) setIsCheckingStale(true);
    try {
      const { count } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("case_id", caseId)
        .gt("created_at", startedAt);

      setIsStale((count ?? 0) > 0);
    } catch (err) {
      console.error("Failed to check stale status:", err);
    } finally {
      if (!silent) setIsCheckingStale(false);
    }
  }, [caseId, startedAt]);

  // Track hook lifecycle
  useEffect(() => {
    const instanceId = Math.random().toString(36).slice(2, 8);
    console.log('[hook-lifecycle] useAnalystChat MOUNTED', { instanceId, caseId, timestamp: Date.now() });
    return () => {
      console.log('[hook-lifecycle] useAnalystChat UNMOUNTED', { instanceId, caseId, timestamp: Date.now() });
    };
  }, [caseId]);

  // Keep messagesRef in sync with state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Check stale on mount and window focus (silent - no spinner for background checks)
  useEffect(() => {
    if (!startedAt) return;

    checkStale(true);

    const onFocus = () => checkStale(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [checkStale, startedAt]);

  // Persist to localStorage whenever session state changes
  useEffect(() => {
    if (messages.length === 0 || !startedAt) return;

    const session: ChatSession = {
      caseId,
      messages: messages as ChatSession["messages"],
      containerId,
      startedAt,
      selectedTags: sessionTags,
      uploadedFiles,
    };
    try {
      localStorage.setItem(CHAT_STORAGE_KEY(caseId), JSON.stringify(session));
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        console.warn("[chat] localStorage quota exceeded");
      }
    }
  }, [messages, containerId, caseId, startedAt, sessionTags, uploadedFiles]);

  /**
   * Send a message.
   * Includes visibility change detection to handle tab switches gracefully.
   * Template files are only uploaded on first message.
   */
  const send = useCallback(
    async (text: string, selectedTags?: string[], images?: File[], templateFiles?: File[]) => {
      // Prevent concurrent sends (race condition fix)
      if (isSendingRef.current) {
        toast.warning("Please wait for the current message to complete");
        return;
      }
      isSendingRef.current = true;

      const isFirstMsg = !containerId;

      setStatus("streaming");
      setError(undefined);
      setWasInterrupted(false);
      if (isFirstMsg) {
        setIsFirstMessageProcessing(true);
      }

      lastUserMessageRef.current = { text, tags: selectedTags };

      // Build user message parts - images first, then text
      const userParts: UIMessage["parts"] = [];

      // Convert and add images
      if (images && images.length > 0) {
        for (const file of images) {
          try {
            const base64 = await fileToBase64(file);
            userParts.push({ type: "image", data: base64, mediaType: file.type });
          } catch (err) {
            console.error("[chat] Failed to convert image:", file.name, err);
            toast.error(`Failed to attach ${file.name}. Please try again.`);
            // Continue with other images
          }
        }
      }

      // Add text
      userParts.push({ type: "text", text });

      const userMessage: UIMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        parts: userParts,
      };

      // Use ref to get latest messages (avoids stale closure)
      const currentMessages = messagesRef.current;
      const messagesToSend = [...currentMessages, userMessage];
      setMessages(messagesToSend);

      // Set session start time on first message
      let templateFilesData: TemplateFileData[] | undefined;
      if (isFirstMsg) {
        setStartedAt(new Date().toISOString());
        setSessionTags(selectedTags);

        // Convert template files to base64 for API upload
        if (templateFiles && templateFiles.length > 0) {
          const fileMetadata: UploadedFile[] = [];
          templateFilesData = [];

          for (const file of templateFiles) {
            try {
              const base64 = await fileToBase64(file);
              templateFilesData.push({
                name: file.name,
                content: base64,
                mimeType: file.type,
              });
              fileMetadata.push({ name: file.name, size: file.size });
            } catch (err) {
              console.error("[chat] Failed to convert template file:", file.name, err);
              toast.error(`Failed to attach ${file.name}. Please try again.`);
            }
          }

          // Store file metadata for display
          if (fileMetadata.length > 0) {
            setUploadedFiles(fileMetadata);
          }
        }
      }

      const assistantMsgId = `assistant-${Date.now()}`;
      let streamCompletedProperly = false;

      // Create abort controller for visibility change handling
      const abortController = new AbortController();
      let visibilityChangedWhileStreaming = false;

      // Track visibility changes during streaming
      const handleVisibilityChange = () => {
        if (document.hidden) {
          console.log('[chat-client] Tab hidden during streaming', Date.now());
          visibilityChangedWhileStreaming = true;
          // Don't abort immediately - just track it happened
        } else {
          console.log('[chat-client] Tab visible again', Date.now());
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);

      try {
        const result = await streamMessage(
          messagesToSend,
          caseId,
          containerId,
          isFirstMsg ? selectedTags : sessionTags,
          ({ contentBlocks, containerId: newContainerId, savedFiles, isDone, isTextComplete }) => {
            if (newContainerId) {
              setContainerId(newContainerId);
            }

            const parts = convertAnthropicContentToParts(contentBlocks, savedFiles);

            const assistantMessage: UIMessage = {
              id: assistantMsgId,
              role: "assistant",
              parts: parts.length > 0 ? parts : [{ type: "text", text: "" }],
            };
            setMessages([...messagesToSend, assistantMessage]);

            // Enable input immediately when text is complete (message_stop received)
            if (isTextComplete) {
              console.log('[chat-client] isTextComplete=true, calling setStatus("ready")', Date.now());
              setStatus("ready");
              setIsFirstMessageProcessing(false);
            }

            // Track that stream completed properly (metadata received)
            if (isDone) {
              console.log('[chat-client] isDone=true (metadata received)', Date.now());
              streamCompletedProperly = true;
            }
          },
          abortController.signal,
          templateFilesData,
          extendedThinking
        );

        // Handle stream ending without metadata (connection drop, timeout, stall)
        const wasInterruptedByStream = result?.interrupted ?? false;
        if (!streamCompletedProperly || wasInterruptedByStream) {
          console.log('[chat-client] Stream incomplete', {
            streamCompletedProperly,
            wasInterruptedByStream,
            visibilityChangedWhileStreaming,
            timestamp: Date.now()
          });
          setStatus("ready");
          setIsFirstMessageProcessing(false);
          setWasInterrupted(true);
        }
      } catch (err) {
        console.error("[chat-client] Chat error:", err);
        const chatError = err instanceof Error ? err : new Error(String(err));

        // Check if this was an abort due to visibility change or stall
        const isAbortError = chatError.name === "AbortError" ||
          chatError.message.includes("aborted") ||
          chatError.message.includes("Stream stalled");

        if (isAbortError) {
          console.log('[chat-client] Stream aborted/stalled', { visibilityChangedWhileStreaming, timestamp: Date.now() });
          setStatus("ready");
          setIsFirstMessageProcessing(false);
          setWasInterrupted(true);
          // Don't show toast for abort - the banner will explain
        } else {
          setError(chatError);
          setStatus("error");

          const isContainerExpired =
            (err as Error & { code?: string })?.code === "CONTAINER_EXPIRED" ||
            chatError.message.includes("CONTAINER_EXPIRED") ||
            chatError.message.includes("Session expired");

          if (isContainerExpired) {
            localStorage.removeItem(CHAT_STORAGE_KEY(caseId));
            setContainerId(null);
            setStartedAt(null);
            setMessages([]);
            toast.error("Session expired. Please try again.");
          } else {
            toast.error(chatError.message || "Failed to send message");
            if (isFirstMsg) {
              setMessages([]);
              setSessionTags(undefined);
              setStartedAt(null);
            } else {
              // Restore to state before this send attempt
              setMessages(currentMessages);
            }
          }
        }

        setIsFirstMessageProcessing(false);
      } finally {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        isSendingRef.current = false;
      }
    },
    [caseId, containerId, sessionTags, extendedThinking]
  );

  const startFresh = useCallback(() => {
    localStorage.removeItem(CHAT_STORAGE_KEY(caseId));
    setContainerId(null);
    setStartedAt(null);
    setMessages([]);
    messagesRef.current = [];
    setIsStale(false);
    setSessionTags(undefined);
    setUploadedFiles(undefined);
    setError(undefined);
    setStatus("ready");
    setWasInterrupted(false);
    lastUserMessageRef.current = null;
    isSendingRef.current = false;
  }, [caseId]);

  const reload = useCallback(() => {
    const lastUserMsg = lastUserMessageRef.current;
    if (!lastUserMsg) {
      console.warn("[chat] Cannot reload - no last user message");
      return;
    }

    // Use ref for latest messages
    let newMessages = [...messagesRef.current];
    if (newMessages.at(-1)?.role === "assistant") {
      newMessages = newMessages.slice(0, -1);
    }
    if (newMessages.at(-1)?.role === "user") {
      newMessages = newMessages.slice(0, -1);
    }

    // Update both state and ref before calling send
    setMessages(newMessages);
    messagesRef.current = newMessages;
    send(lastUserMsg.text, lastUserMsg.tags);
  }, [send]);

  const isLoading = status === "streaming" || isFirstMessageProcessing;

  // Debug: log when isLoading changes
  useEffect(() => {
    console.log('[chat-client] isLoading changed to:', isLoading, 'status:', status, 'isFirstMessageProcessing:', isFirstMessageProcessing, Date.now());
  }, [isLoading, status, isFirstMessageProcessing]);

  return {
    messages,
    send,
    error,
    reload,
    status,
    isStale,
    startFresh,
    isLoading,
    isFirstMessageProcessing,
    sessionTags,
    checkStale,
    isCheckingStale,
    wasInterrupted,
    uploadedFiles,
  };
}
