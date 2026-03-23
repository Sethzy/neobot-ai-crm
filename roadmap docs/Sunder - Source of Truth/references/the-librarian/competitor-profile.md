# The Librarian — Competitor Profile

> **Last updated:** 2026-03-23
> **Website:** [thelibrarian.io](https://thelibrarian.io)
> **Category:** AI executive assistant for real estate agents
> **HQ:** Singapore + Seattle, WA
> **Funding:** $2M Seed (Nov 2025, 3 investors)

---

## Overview

The Librarian is a WhatsApp-first AI personal assistant targeting busy professionals, with a strong vertical play in **real estate**. Named after the character in Neal Stephenson's *Snow Crash*, it positions itself as an always-on executive assistant that lives inside messaging apps (WhatsApp, SMS, Slack) rather than requiring users to open a separate app or dashboard.

**Tagline:** "Supercharge your day with your own AI personal assistant"

---

## Team

| Name | Role | Background |
|------|------|------------|
| Tiago Costa Alves | CEO & Co-Founder | Fulbright Scholar, HP, Aptoide. Based in Singapore |
| Neil Kumar | CTO & Co-Founder | VP Engineering at Yelp, CTO at Karat. Based in Seattle |
| Rhett Garber | VP of R&D | Yelp, Postmates, GitHub. Based in Seattle |

**Partnerships:** Google for Startups, Nvidia, AWS, Block 71, Microsoft

---

## Product Features

### Core Capabilities
- **Voice-first interface** — dictate commands via WhatsApp voice notes or SMS
- **Email management** — drafting, summarization, intelligent replies (Gmail, Outlook)
- **Smart scheduling** — calendar management, conflict resolution, automatic invites
- **Document retrieval** — instant file location across Google Drive, Notion
- **Morning briefs** — daily overview of meetings, tasks, priorities
- **Reminders** — custom-timed notifications via WhatsApp
- **Memory & facts** — stores personal details (addresses, Zoom links, signatures)
- **File/image processing** — extracts info from PDFs, business cards, images
- **Web integration** — real-time weather, news, directions, web search
- **80+ language support**

### Real Estate Vertical Features
- **Lead response & qualification** — instant replies, turns leads into booked appointments
- **Transaction & listing coordination** — tracks offers, inspections, contingencies
- **Follow-up cadences** — automated text/email sequences by stage, property, buyer/seller profile
- **Content & marketing** — listing descriptions, social posts, newsletters
- **CRM & property portal search** — searches listings by client criteria across connected databases
- **Inbox & notes organization** — summarizes emails/texts into structured notes and tasks
- **Privacy & control** — approve messages before they go out, full audit log

### Real Estate Use Cases
1. **Listing creation** — photograph property, dictate details, assistant generates social posts with media
2. **Appointment scheduling** — parse text conversations to create calendar invites with access instructions
3. **Contact management** — photograph business cards to populate CRM with buyer preferences and budget
4. **Paperwork initiation** — document photos trigger email workflows to legal/operations teams
5. **Property research** — real-time comps and inventory searches during client calls
6. **Buyer matching** — search across CRM and property portals for homes matching criteria

---

## Integrations

| Category | Platforms |
|----------|-----------|
| Messaging | WhatsApp, SMS, Slack |
| Google Workspace | Gmail, Google Calendar, Google Drive, Google Contacts |
| Other | Outlook, Notion, LinkedIn |
| Real Estate CRMs | Pixxi, MoxiWorks |
| Property Portals | MLS, Bayut, PropertyGuru, 99.co |

---

## Pricing

- **Basic:** Free (current)
- **Premium:** Paid tier with advanced features (price TBD, "launching soon")
- 50% discount code `AIAGENTS50` found on AI Agents Directory

---

## Traction & Social Proof

- **Product Hunt:** #2 Product of the Day, Top 10 of the Month (April 2025)
- **AI Agents Directory:** 4.9/5 stars, 33 reviews, 428 upvotes
- **Monthly views:** ~526 (AI Agents Directory, last 30 days)
- **Total interactions:** 21,438 views
- **#1 Personal Assistant** on Top AI Tools directory
- **Google CASA certified**
- **SOC2 compliance** anticipated (timeline unclear)
- **Customers:** Neo Realty, RE/MAX, ERA Singapore, Jawitz, PropNex, Hutton

### Claimed Outcomes
- 5x faster lead response (minutes to seconds)
- 30% more appointments booked
- 10+ hours saved per week

### Testimonials
- **Tshepo Maubane** (Neo Realty CEO): "We've cut admin time and increased response speed"
- **Veronica Sims** (RE/MAX): "Librarian ensures no balls are dropped"
- **Samuel Ong** (PropNex): calls it his "on-the-go coordinator" for WhatsApp conversations

---

## Security

- AES-256 encryption (data at rest and in transit)
- Google CASA certified
- Strict access controls respecting original file permissions
- Approval workflow: "drafts first, then lets you approve or tweak"

---

## Competitive Positioning

### Strengths (vs Sunder)
- **WhatsApp-native** — meets real estate agents where they already live (especially strong in APAC markets like Singapore where WhatsApp is dominant)
- **Voice-first** — hands-free dictation is perfect for agents driving between showings
- **Free tier** — low barrier to entry
- **Property portal integrations** — MLS, Bayut, 99.co, PropertyGuru are high-value for agents
- **Strong social proof** — Product Hunt, directory rankings, named enterprise customers
- **Multi-language** — 80+ languages, critical for international markets
- **Image/document processing** — snap a business card or document, assistant processes it

### Weaknesses (vs Sunder)
- **No deep orchestration** — appears to be a task-by-task assistant, not a persistent agent with compounding memory and autonomous workflows
- **WhatsApp dependency** — entire UX lives inside messaging; no rich dashboard or CRM views
- **No visible autopilot/triggers** — user must initiate every interaction; no background scanning or proactive agent behavior
- **No visible tool/API extensibility** — closed ecosystem, no composable tool framework
- **Horizontal roots** — started as a generic executive assistant, real estate is a vertical overlay rather than purpose-built
- **Limited transparency on architecture** — closed source, no technical blog or docs
- **Pricing unclear** — free tier may not be sustainable; premium pricing unknown

### Key Differences

| Dimension | The Librarian | Sunder |
|-----------|--------------|--------|
| Primary interface | WhatsApp / SMS | Web chat + dashboard |
| Agent model | Reactive (user-initiated) | Proactive (autopilot + triggers) |
| Memory | Basic facts/preferences | Compounding memory system (SOUL/USER/MEMORY) |
| Approval model | Draft-then-approve per message | Two-tier safety (internal auto-runs, external needs approval) |
| CRM | Integrates with external CRMs | Built-in CRM |
| Target market | APAC real estate (Singapore focus) | US advisory sales (broader) |
| Pricing | Free + upcoming premium | SaaS subscription |
| Deployment | Closed SaaS | Vercel + Supabase |

---

## Sunder Implications

1. **Voice/WhatsApp channel is table stakes** — Sunder's Telegram integration (PRs 41-42) is a start, but WhatsApp is far more critical for real estate. Should be prioritized.
2. **"Hands-free" narrative resonates** — agents spend hours driving; voice-first UX is a real differentiator, not a gimmick.
3. **Property portal integrations matter** — MLS/listing portal search is high-value for agents; worth considering as a connection type.
4. **Compounding memory is Sunder's moat** — The Librarian stores basic facts; Sunder's SOUL/USER/MEMORY system is fundamentally deeper.
5. **Proactive agent is Sunder's moat** — The Librarian is reactive; Sunder's autopilot + triggers architecture is a structural advantage.
6. **Free tier is a GTM weapon** — may need to consider a free/trial tier for Sunder's launch strategy.

---

## Sources

- [thelibrarian.io](https://thelibrarian.io)
- [thelibrarian.io/real_estate](https://thelibrarian.io/real_estate)
- [Voice Assistant for Real Estate Agents (article)](https://thelibrarian.io/articles/voice-assistant-for-real-estate-agents)
- [AI Agents Directory profile](https://aiagentsdirectory.com/agent/thelibrarianio)
- [AI CRE Tools listing](https://www.aicretools.com/the-librarian)
- [Tracxn profile](https://tracxn.com/d/companies/thelibrarian/__gywkGZpqx4LkUePI7XxyPIirLSFcOthsTUZnLsvbPWQ)
- [Startup to Follow article](https://www.startuptofollow.com/article/revolutionizing-productivity-how-the-librarian-is-bringing-ai-executive-assistants-to-whatsapp)
