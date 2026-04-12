---
name: deal-comparison
description: "Compares multiple deals, properties, or options using explicit criteria and tradeoffs. Use when the user asks to compare options, weigh alternatives, or recommend the best fit."
---

# Deal Comparison

Build a professional Excel financial model comparing properties side-by-side.

## Before you start

Check if the user uploaded files:
- If yes, note the file URLs — these are the primary input
- If no, ask which properties to compare, then search CRM

## Workflow

### Step 1: Gather property data from CRM

For each property the user mentions, search CRM:

```
search_crm({ query: "{property name or address}", table: "deals" })
```

Collect: purchase price, size (sqft), tenure, floor, unit number, asking rent, any notes.

### Step 2: Get market context

Search for recent comparable transactions:

```
web_search({ query: "{project name} recent transactions {year}" })
```

This gives the model comparison points for sensitivity analysis.

### Step 3: Read user context

```
storage_read({ path: "/agent/SOUL.md" })
```

Note the user's market focus, client context, and any relevant preferences.

### Step 4: Analyze and present

Using the gathered data from steps 1-3, perform the analysis the user requested:
- Calculate yields, mortgage payments, and financial metrics
- Compare properties side by side
- Highlight key differences and tradeoffs

Present the results clearly with tables and structured data. Offer to:
- Email it to someone (use send_message)
- Refine the analysis ("add a sensitivity table", "remove property 3")
- Do a follow-up analysis

## Gotchas

- If the user asks "which is better?" — present the numbers first, then give your opinion based on the data.
- SG-specific: always mention ABSD/BSD applicability and TDSR if relevant.
- If the user hasn't set up their re-analyst preferences yet, suggest they do ("want me to set up your analysis preferences first?").
