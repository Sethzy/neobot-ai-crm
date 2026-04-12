---
name: market-report
description: "Generates a client-ready market report using CRM context, research, and stored materials. Use when the user asks for a market report, client update, neighborhood report, or market snapshot."
---

# Market Report

Produce a data-driven market analysis as an Excel workbook with charts.

## Workflow

### Step 1: Clarify scope

Ask the user (or infer from context):
- Which area, district, or project?
- What time period? (default: last 12 months)
- Any specific metrics? (price psf trends, volume, rental yields)

### Step 2: Gather transaction data

```
browser_scrape({ url: "https://edgeprop.sg/...", extract: "transactions" })
```

or

```
web_search({ query: "{area} property transactions {year} price trends" })
```

Get as many data points as possible — recent transactions, median prices, volume.

### Step 3: Get CRM context

```
search_crm({ query: "{area}", table: "deals" })
```

Check if the user has any active deals in the area — makes the report more relevant.

### Step 4: Read user context

```
storage_read({ path: "/agent/SOUL.md" })
```

Note the user's market specialization and client focus.

### Step 5: Analyze and present

Using the gathered data from steps 1-4, present a structured market analysis:
- Transaction volume trends by month
- Median price psf trends
- Price distribution and top transactions
- Comparison with user's active deals if relevant

## Gotchas

- Web-scraped transaction data may be incomplete. Note the data source and date range in the report.
- Don't present scraped data as authoritative — frame it as "based on available public data."
- If the user wants to share this with clients, suggest converting key charts to a showcase page (property-showcase skill).
