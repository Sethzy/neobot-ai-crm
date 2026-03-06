/**
 * Shared type definitions for chat UI state.
 * @module types/chat
 */
import type { ChatStatus as SDKChatStatus } from "ai";

/** In-memory thread model for PR2; replaced by DB-backed threads in PR3. */
export interface Thread {
  id: string;
  title: string;
  isPinned: boolean;
  createdAt: Date;
}

/** AI SDK chat status values. */
export type ChatStatus = SDKChatStatus;

/** Ordered chat statuses used by tests/UI comparisons. */
export const CHAT_STATUSES: ChatStatus[] = ["ready", "submitted", "streaming", "error"];
