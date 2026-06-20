# Trigger Run and Notification Logic

## Trigger model

Schedule trigger fires periodically (for example every 6 hours), starting a fresh model invocation.

## Runtime sequence

1. Load monitor record from SQL.
2. Invoke price-scraper subagent.
3. Evaluate threshold condition.
4. Update last price/check timestamps.
5. Send notification only when notification policy allows.

## Re-arm behavior

Typical anti-spam baseline:
- notify on first crossing below threshold
- suppress repeats while still below threshold
- re-arm when price moves back above threshold

## Recommended hardening

- atomic update guards (`WHERE notification_sent_at IS NULL` style)
- dedupe by last notified price/time window
- explicit cooldown interval support

