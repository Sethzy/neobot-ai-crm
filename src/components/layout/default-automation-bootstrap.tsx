/**
 * Client bootstrapper that seeds Daily Orchestrator once for authenticated dashboard loads.
 * @module components/layout/default-automation-bootstrap
 */
"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { triggerKeys } from "@/hooks/use-triggers";

export function DefaultAutomationBootstrap() {
  const queryClient = useQueryClient();
  const hasBootstrappedRef = useRef(false);

  useEffect(() => {
    if (hasBootstrappedRef.current) {
      return;
    }
    hasBootstrappedRef.current = true;

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    void fetch("/api/automations/bootstrap-default", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timezone }),
    }).then(async (response) => {
      if (!response.ok) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: triggerKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["threads"] }),
      ]);
    }).catch(() => {
      // Best effort only. If bootstrap fails, the rest of the dashboard still works.
    });
  }, [queryClient]);

  return null;
}
