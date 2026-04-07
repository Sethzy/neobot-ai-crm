# crm.cli — The headless CRM for your agent

> Source: https://x.com/dzhng/status/... · Author: @dzhng · Date: 2026-04-07

---

I just crawled through macOS kernel hell so your AI agent could read every CRM record like a file.

crm.cli is an open-source, headless CRM built for agents. No UI. No dashboard. Just a CLI and a FUSE-mounted filesystem.

## The problem

Every CRM assumes a human is clicking buttons. The most "AI-friendly" thing they've done is ship an MCP server with 15 half-documented tools.

Your agent doesn't need a createContact tool. It needs a /contacts/acme-corp.md file it can open, read, and edit.

## How it works

Mount your CRM as a directory. Contacts become files. Deals become files. Edit a file, the CRM updates. Update the CRM, the file changes. Unleash Claude Code on it to do deep research or mass updates.

```
$ ls ~/crm/contacts/
acme-corp.md
jane-doe.md

$ cat ~/crm/contacts/jane-doe.md
# Jane Doe
- Company: Acme Corp
- Email: jane@acme.com
- Stage: qualified
```

There's an llm.txt at the mount root — so when your agent lands in the directory, it immediately knows the schema, conventions, and how to work with the data. Zero onboarding.

Or use the CLI — crm contact add, crm deal show, crm pipeline view. Every operation as a command with structured output.

## Why files win

Point Claude Code or Codex at ~/crm and it just works. No auth tokens. No API docs. No tool schemas. The agent reads contacts like it reads any markdown file.

But unlike a folder of random markdown, crm.cli enforces structure — and this is where it earns its keep over a spreadsheet.

**Data normalization.** Paste a phone number in any format — (212) 555-1234, +1-212-555-1234, 212.555.1234 — it's stored as E.164 and searchable by any variant. Drop a LinkedIn URL, it extracts the handle. Websites get normalized. Emails get validated. Your data is clean whether a human entered it or an agent did.

**Fuzzy dedup and entity merging.** Add a contact that looks suspiciously like one you already have? crm.cli catches it. When duplicates slip through, crm merge combines two records — relinking every deal, activity, and reference to the surviving entity. No orphaned data.

**Pipeline and reporting.** Deal stages, win/loss tracking, conversion rates, deal velocity — the stuff you actually need a CRM for. crm report gives you pipeline health, stage-by-stage breakdown, and forecast in your terminal. Every stage transition is logged as an activity, so you get a full audit trail for free.

The CRM adds guardrails, then gets out of the way.

## Under the hood

On Linux, crm mount uses FUSE to present the SQLite database as a userspace filesystem — fast, well-supported, and fully bidirectional.

macOS is trickier. Apple killed kernel extensions, which breaks traditional FUSE. So crm.cli ships a lightweight NFS server written in Rust that presents the same SQLite data as a network filesystem. Your Mac thinks it's talking to a file server. It's actually talking to your CRM.

Both platforms get the same interface. crm mount ~/crm just works — you don't have to care which transport is underneath. Everything syncs back to a single SQLite database that never leaves your machine.

## Try it

- GitHub: https://github.com/dzhng/crm.cli
- Docs: https://dzhng.github.io/crm.cli/

```bash
npm install -g @dzhng/crm.cli
# or: bun install -g @dzhng/crm.cli
```
