---
name: property-showcase
description: "Creates a polished property showcase using listing details, context, and differentiators. Use when the user asks to present a property, package a listing, or create a client-facing property summary."
---

# Property Showcase

Build a polished, shareable property showcase page.

## Workflow

### Step 1: Identify the property

If the user named a property, search CRM:

```
search_crm({ query: "{property name or address}", table: "deals" })
```

Collect: address, price, beds, sqft, tenure, floor, any listing notes.

### Step 2: Get the agent's info

```
storage_read({ path: "/agent/SOUL.md" })
```

You need the agent's name, phone, email, and agency for the contact card.

### Step 3: Research the neighborhood

```
web_search({ query: "{address} nearby MRT schools amenities" })
```

Get: nearest MRT + walk time, nearby schools (2-3), shopping, parks, key selling points.

### Step 4: Get recent transactions (optional but valuable)

```
web_search({ query: "{project name} recent transactions {year}" })
```

or

```
browser_scrape({ url: "https://edgeprop.sg/...", extract: "transactions" })
```

Recent comparable sales add credibility to the page.

### Step 5: Get listing photos

If CRM has photo URLs, download them:

```
fetch_url({ url: "{photo URL}" })
```

Aim for 4-8 photos. If no photos in CRM, ask the user to share some.

### Step 6: Present the showcase

Using the gathered data from steps 1-5, present a structured property showcase to the user:
- Property details, pricing, and key features
- Neighborhood highlights (MRT, schools, amenities)
- Recent comparable transactions
- Agent contact details

Offer to:
- **Send to a client** — use send_message with the formatted property details
- **Refine the content** — adjust details, add/remove sections

## Gotchas

- Don't skip the photo gathering step. A showcase page without photos is useless.
- Always include the agent's contact card. The whole point is lead generation.
- If neighborhood data is sparse, say so rather than making things up.
- If no frontend-design skill exists yet, the default template (dark + gold luxury) applies. Suggest the user set up brand preferences if they want a custom look.
