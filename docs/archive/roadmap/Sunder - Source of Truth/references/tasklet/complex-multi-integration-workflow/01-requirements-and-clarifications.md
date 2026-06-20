# Requirements and Clarifications

## Workflow goal

Weekday briefing automation that:
- reads meetings from calendar
- researches attendees and companies
- generates briefing document
- delivers via email before meetings

## Decomposed requirements

1. Triggering
- weekday schedule
- timezone-aware execution

2. Inputs
- calendar provider integration
- attendee and meeting metadata

3. Processing
- person-level research
- company-level research
- cache-aware incremental retrieval

4. Outputs
- structured briefing content
- delivery channel (email + optional attachment)

## Blocking vs non-blocking clarification policy

Blocking:
- calendar provider selection

Optional defaults (can be refined later):
- document format
- internal-meeting filtering policy
- cache strategy and freshness window
- early-morning behavior constraints

## Practical setup stance

Ask minimal required questions, then proceed with explicit defaults and document those defaults in config files.

