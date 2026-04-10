/**
 * Trigger.dev schedule that replaces the Vercel Cron ticker for scanning due
 * agent triggers.
 * @module src/trigger/scan-triggers
 */
import { logger, schedules } from "@trigger.dev/sdk/v3";

/**
 * Scanner tick that calls the existing cron route over HTTPS every minute.
 *
 * The scanner logic intentionally stays inside the Next.js route so this
 * migration remains a reversible ticker swap rather than an architectural
 * refactor.
 */
export const scanTriggers = schedules.task({
  id: "scan-triggers",
  cron: "* * * * *",
  maxDuration: 60,
  run: async () => {
    const directBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const vercelUrl = process.env.VERCEL_URL?.trim();
    const baseUrl = directBaseUrl || (vercelUrl ? `https://${vercelUrl}` : null);

    if (!baseUrl) {
      throw new Error("NEXT_PUBLIC_APP_URL or VERCEL_URL must be set");
    }

    if (!process.env.CRON_SECRET) {
      throw new Error("CRON_SECRET must be set");
    }

    const response = await fetch(`${baseUrl}/api/cron/scan`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    });

    const body = (await response.json()) as unknown;

    if (!response.ok) {
      logger.error("Scanner call failed", {
        status: response.status,
        body,
      });
      throw new Error(`scan failed: ${response.status}`);
    }

    logger.info("Scanner tick ok", { body });
    return body;
  },
});
