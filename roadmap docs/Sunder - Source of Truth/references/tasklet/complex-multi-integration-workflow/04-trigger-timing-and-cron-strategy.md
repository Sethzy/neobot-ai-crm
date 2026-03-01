# Trigger Timing and Cron Strategy

## Timing constraint

Target behavior: briefing arrives roughly before first meeting.

## Main design options

1. Fixed early trigger + in-run delay
- limited practicality in one-shot run models

2. Fixed trigger + immediate send with first-meeting context
- simple and reliable
- does not guarantee exact minus-30-minute delivery

3. Multi-trigger probing window
- closer timing accuracy
- higher complexity and idempotency requirements

## Chosen tradeoff in source

Fixed weekday morning trigger with immediate send and explicit first-meeting timestamp in subject/body.

## Timezone concerns

- UTC cron conversion must be explicit.
- DST-observing zones can shift local delivery hour.
- travel/timezone changes can make "morning" semantics drift.

## Guardrail

Document timezone assumptions and provide adjustment instructions for users who travel or change locale.

