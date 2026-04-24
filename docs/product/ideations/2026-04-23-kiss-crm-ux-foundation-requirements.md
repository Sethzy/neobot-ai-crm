---
date: 2026-04-23
topic: kiss-crm-ux-foundation
---

# KISS CRM UX Foundation

## Problem Frame

Sunder's CRM already has useful core functionality, but it still feels more like a set of separate pages than a coherent CRM product. People, Companies, Deals, and Tasks each work, but they do not yet share one strong operating model for switching views, opening records, and returning to saved ways of working.

At the same time, Sunder's CRM is also an agent system. The agent needs to query CRM data easily, reason over it with SQL, and safely reconfigure CRM vocabulary and fields. That means we should not copy a metadata-heavy reference implementation wholesale if doing so would make the data harder to read, analyze, or operate on.

The goal is to get most of the UX lift of a high-end CRM without rebuilding the product into a generalized metadata platform.

## Requirements

- R1. **Keep operational CRM data simple and queryable.** Core CRM records remain in normal relational tables: contacts, companies, deals, tasks, notes, attachments, and relationship tables. This remains the source of truth for day-to-day work and agent operations.

- R2. **Keep CRM configuration as a separate control layer.** CRM labels, vocabulary, and field definitions continue to be managed through the existing CRM configuration model rather than being folded into the main record tables or replaced by a generalized object platform.

- R3. **Introduce one shared CRM page shell.** People, Companies, Deals, and Tasks should all use one shared page structure for the top-level CRM experience. That shared structure should handle page framing, view switching, filters, content body, and record opening behavior so the CRM feels like one product instead of four custom pages.

- R4. **Upgrade saved views from presets into saved workspaces.** A saved view should remember the full way the user wants to work on a page, not just a filter. At minimum, a saved view should be able to remember the active mode, the visible records, the sort order, and the display setup needed to make returning to that workflow feel immediate and reliable.

- R5. **Keep saved view storage simple in the first version.** Saved views should move to a single richer state object rather than a fully normalized metadata system. The first version should favor one clear, durable saved-view model over a large family of specialized view tables.

- R6. **Support both quick-peek and full-page record detail.** The drawer remains for fast inspection, but People, Companies, and Deals should also have full record pages for deeper work. The intended experience is: quick peek in the drawer, serious work on the full page.

- R7. **Make CRM UX state configurable without over-platforming.** View and layout state should be stored separately from business records so the UI can become more capable without turning the CRM into a generic app builder.

- R8. **Improve agent and reporting reads with SQL-friendly read surfaces.** Add simple read-only SQL surfaces that flatten common CRM joins and computed labels so reporting, analysis, and agent querying stay easy and reliable without changing the core storage model.

- R9. **Preserve the relationship between CRM configuration and saved views.** CRM configuration remains the source of truth for what fields, labels, and options exist. Saved views sit on top of that. If CRM configuration changes in a way that affects saved views, the product should warn clearly and help the user understand what needs review.

## Success Criteria

- The CRM feels like one unified product across People, Companies, Deals, and Tasks instead of a set of related pages.
- Users can save and return to meaningful working setups without rebuilding the page each time.
- Users can move from overview to record detail in the way that fits the job: quick peek in a drawer or deeper work in a full page.
- The agent can still read CRM data easily using existing tools, and SQL-based reporting remains straightforward.
- CRM configuration stays understandable and safe even as views become more powerful.

## Scope Boundaries

- No arbitrary custom object engine.
- No generalized metadata platform.
- No attempt to copy Twenty's full backend philosophy.
- No immediate buildout of fully normalized view metadata such as separate field, filter, and group tables unless later planning proves they are necessary.
- No dynamic sidebar/folder system in the first pass.
- No rewrite of the core relational CRM data model.

## Key Decisions

- **Use Twenty as a UX reference, not a storage-model reference.** The reference is valuable for interaction quality, shared CRM structure, and record workflow. It is not the right model to copy blindly for storage because Sunder's agent and SQL tooling need a simpler, more readable data surface.

- **Favor 80% of the UX gain with the smallest durable move.** The right first move is not a full platform rebuild. It is a tighter shared CRM shell, stronger saved views, real record pages, and better read surfaces.

- **Keep business data separate from UX state.** CRM records are business data. Views, layouts, and similar UI behavior are product state. Keeping those concerns separate is what allows the CRM to get better without making the whole system harder to operate.

- **Keep saved views simple in storage, richer in experience.** The user should feel like they are saving a real workspace. Internally, the first version should still use one compact saved-view shape rather than a large system of specialized metadata tables.

- **Protect toolability as a product requirement.** Easy querying and understandable configuration are not implementation details. They are part of the product because the agent is a primary user of CRM data.

## Dependencies / Assumptions

- Existing CRM configuration tools remain the authority for labels, vocabulary, and field definitions.
- Existing relational CRM tables remain the source of truth for records.
- Saved views will need to coexist with CRM reconfiguration in a way that is understandable to end users.
- The current drawer-based detail experience can be extended rather than discarded.

## Outstanding Questions

### Deferred to Planning

- [Affects R4][Technical] What is the smallest saved-view state shape that gives the needed UX gain without introducing avoidable carrying cost?
- [Affects R6][Technical] Which record-detail sections should be shared between drawer and full-page record views so the experience stays consistent without duplicate work?
- [Affects R8][Technical] Which read-only SQL surfaces provide the highest immediate value in the first pass?
- [Affects R9][Needs research] What is the clearest user-facing behavior when a CRM configuration change makes part of a saved view invalid: warn only, auto-repair, or mark the view as needing review?

## Next Steps

→ `/plan` for structured implementation planning
