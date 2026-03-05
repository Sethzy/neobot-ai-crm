/**
 * Processes transient data parts emitted by chat streams.
 * @module components/chat/data-stream-handler
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { threadKeys } from "@/hooks/use-threads";
import { useDataStream } from "./data-stream-provider";

export function DataStreamHandler() {
  const queryClient = useQueryClient();
  const { dataStream, setDataStream } = useDataStream();

  useEffect(() => {
    if (!dataStream.length) {
      return;
    }

    const pendingParts = dataStream.slice();
    setDataStream([]);

    for (const part of pendingParts) {
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "data-chat-title"
      ) {
        queryClient.invalidateQueries({ queryKey: threadKeys.all });
      }
    }
  }, [dataStream, queryClient, setDataStream]);

  return null;
}
