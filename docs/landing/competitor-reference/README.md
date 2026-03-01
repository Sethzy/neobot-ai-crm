# Competitor Reference: OpenAgent.sg

Screenshots saved from OpenAgent (https://openagent.sg) on 2026-03-01 as baseline for UI polish.

## Screenshot Inventory

### 1. Agent Profile Page (`openagent-agent-profile.png`)
- Source: `openagent.sg/agent/R006480J` (Peter Wong)
- **Dark theme, data-rich dashboard layout**
- Key features:
  - 5 hero stat cards in a row: Transactions, Last 12 months, Last Transaction, Avg txn/quarter, Active years
  - Transaction bar chart with Monthly/Quarterly/Yearly toggle
  - Activity Heatmap (month x year grid, colored by activity)
  - Property Type pie/donut chart
  - Transaction Type, Sales Representation, Rental Representation donut charts (3 across)
  - Top Neighbourhoods with Singapore choropleth map + ranked list
  - Transaction Records table with pagination (showing 20 of 233, 12 pages)
  - Movement History section (agency transfers)
  - Contact actions: Claim profile, Call, WhatsApp

### 2. Property Profile Page (`openagent-property-profile.png`)
- Source: `openagent.sg/property/eight-riversuites`
- **Dark theme, data-rich analytics layout**
- Key features:
  - Property metadata: District, Type (Condominium), Age (99 yrs), Completion year
  - 5 hero stat cards: Transactions (1,283), Avg PSF ($1,416), Median price ($1.13M), Price range, Last sale date
  - Transaction volume bar chart with Monthly/Quarterly/Yearly toggle
  - Price Trend line chart (Min/Median/Max PSF over time)
  - Floor Level Premium scatter plot (floor vs PSF)
  - Type of Sale donut chart (New Sale/Resale/Sub Sale)
  - Purchaser Profile donut (HDB/Private/N/A)
  - All Transactions table with pagination + unit number search filter

## What We Should Match (Feature Parity Targets)

### Listing Pages (Agents, Properties, HDB)
Our listing pages are already comparable. Key differences:
- OpenAgent does NOT have equivalent listing pages (they use search-driven nav)
- Our listing pages with search + stat cards + table are actually solid
- **Polish: better mobile responsiveness, tighter visual hierarchy**

### Profile Pages (Agent Detail, Property Detail)
This is where the big gap is:
1. **Stat cards**: OpenAgent shows 5 across vs our 4. Richer data points.
2. **Charts**: OpenAgent has 6-8 charts per profile page. We have zero.
3. **Table pagination**: They paginate (20 per page). We dump 100-120 rows.
4. **Interactive filters**: Monthly/Quarterly/Yearly toggles on charts, unit search on tables.
5. **Visual density**: Dark theme makes data visualizations pop. Our white theme needs stronger visual hierarchy.

## What We Should NOT Copy
- Dark theme (our brand is white/clean)
- Map/choropleth (complex, low ROI for now)
- Movement History (we don't track this data)
- Claim profile / Contact CTAs (different product model)

## Priority Order for Polish
1. Listing page visual refinement (quick wins)
2. Profile page stat card improvements
3. Table pagination
4. Add key charts to profile pages (transaction volume, type breakdowns)
5. Mobile responsiveness pass
