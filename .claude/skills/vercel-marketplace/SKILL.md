---
name: vercel-marketplace
description: "Add, manage, and configure third-party services from the Vercel Marketplace using the Vercel CLI. Use this skill whenever the user wants to install a Vercel integration (Resend, Neon, Upstash, Stripe, etc.), provision a new marketplace resource, pull environment variables from an integration, check what integrations are available, view setup guides, or manage billing/balances for marketplace products. Also use when the user mentions 'vercel install', 'vercel integration', or asks about connecting a third-party service to their Vercel project."
---

# Vercel Marketplace CLI

This skill handles adding and managing third-party services from the Vercel Marketplace entirely through the Vercel CLI. The goal is zero context-switching — no browser tabs, no manual env var copy-paste.

## Prerequisites

- Vercel CLI installed and authenticated (`pnpm i -g vercel@latest`)
- Project linked to Vercel (`vercel link`)

## Workflow

### 1. Discover what's available

If the user isn't sure which integration they need, or wants to browse:

```bash
vercel integration discover
```

For machine-readable output (useful for scripting):

```bash
vercel integration discover --format=json
```

This lists all available marketplace integrations and their products. Multi-product integrations show each product separately with a compound slug (e.g., `aws/aws-dynamodb`).

### 2. Check what the integration needs

Before installing, check what options are available (plans, metadata, products):

```bash
vercel integration add <integration-name> --help
```

This shows available products, metadata keys, and billing plans. For multi-product integrations, use slash syntax:

```bash
vercel integration add <integration>/<product> --help
```

### 3. Install the integration

Interactive (prompts for choices):

```bash
vercel integration add <integration-name>
```

Non-interactive (CI/scripted — provide all options via flags):

```bash
vercel integration add <integration-name> \
  --name my-resource \
  --plan <plan-id> \
  -e production -e preview -e development \
  -m key=value \
  --format=json
```

**Key flags:**

| Flag | Short | What it does |
|------|-------|-------------|
| `--name` | `-n` | Custom name for the resource |
| `--plan` | `-p` | Billing plan ID |
| `--environment` | `-e` | Which envs to connect (production/preview/development). Repeatable. Defaults to all three |
| `--metadata` | `-m` | Metadata as `KEY=VALUE`. Repeatable |
| `--prefix` | | Prefix for env var names (e.g., `--prefix DB2_` creates `DB2_DATABASE_URL`) |
| `--format` | `-F` | Use `json` for machine-readable output |
| `--no-connect` | | Skip connecting resource to current project |
| `--no-env-pull` | | Skip auto `vercel env pull` after provisioning |
| `--installation-id` | | Pick a specific installation when multiple exist |

**Post-install behavior** — the CLI automatically:
1. Prints a dashboard link for the resource
2. Connects the resource to the currently linked project
3. Runs `vercel env pull` to sync env vars to `.env.local`

So after `vercel integration add resend`, your `.env.local` already has `RESEND_API_KEY`.

### 4. Get the setup guide

After installing, get framework-specific code snippets:

```bash
vercel integration guide <integration-name>
```

For a specific framework without prompts:

```bash
vercel integration guide <integration-name> --framework nextjs
```

Available frameworks: `nextjs`, `remix`, `astro`, `nuxtjs`, `sveltekit`.

### 5. Verify it worked

List installed resources for the current project:

```bash
vercel integration list
```

Filter to a specific integration:

```bash
vercel integration list --integration <name>
```

List all resources across the team:

```bash
vercel integration list --all
```

## Other useful commands

**Check billing balance** (for prepaid integrations):

```bash
vercel integration balance <integration-name>
```

**Open provider dashboard** via SSO (no separate login needed):

```bash
vercel integration open <integration-name>
```

**Remove an integration** (must remove all resources first):

```bash
vercel integration remove <integration-name> --yes
```

## Common integrations and their env vars

| Integration | Slug | Key env vars |
|------------|------|-------------|
| Resend | `resend` | `RESEND_API_KEY` |
| Neon | `neon` | `DATABASE_URL`, `PGHOST`, `PGPASSWORD`, etc. |
| Upstash Redis | `upstash/upstash-redis` | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Upstash QStash | `upstash/upstash-qstash` | `QSTASH_TOKEN`, `QSTASH_URL` |

## Quick-start recipe

The most common flow for adding a new service:

```bash
# 1. See what's available (optional)
vercel integration discover

# 2. Check options
vercel integration add resend --help

# 3. Install (interactive — walks you through plan selection)
vercel integration add resend

# 4. Env vars are already in .env.local. Get code snippets:
vercel integration guide resend --framework nextjs

# 5. Install the SDK
pnpm add resend

# 6. Use it
# process.env.RESEND_API_KEY is ready to go
```

## Tips

- The `vercel integration add` command is aliased as `vercel install` and `vercel i` for convenience.
- If you connect multiple resources of the same type to one project, use `--prefix` to namespace env vars.
- The `--format=json` flag on any command gives structured output, useful for automation.
- After adding an integration, you can open the provider's own dashboard (with auto-SSO) using `vercel integration open <name>`.
