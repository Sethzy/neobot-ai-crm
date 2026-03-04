# Phase 1 Manual QA Checklist (Steps 6–16)

> **How to use:** Go through each item in order. Check the box when verified. Add notes for any failures.

---

## 6. CRM Tools via Chat (The Demo Moment)

### 6.1 Create contact + deal via natural language

- [ ] Open `/chat` and start a new thread
- [ ] Type: **"I just met Sarah Lim at 88 Tanjong Pagar. She's a buyer interested in the unit. Price around 1.8 million."**
- [ ] Press Enter — message appears as a right-aligned user bubble
- [ ] Assistant response begins streaming in token-by-token
- [ ] During the response, you see **inline tool-call pills** appear (small pills with a dot + tool name)
- [ ] At least these tool calls should appear: `create_contact`, `create_deal`, `link_contact_to_deal`
- [ ] Each tool-call pill shows a **pulsing dot** while executing, then a **static dot** when done
- [ ] Click on the `create_contact` pill → it **expands** to show:
  - [ ] **Arguments** section with JSON (should include `name: "Sarah Lim"`, `type: "buyer"`)
  - [ ] **Result** section with JSON (should include `success: true` and the created entity)
- [ ] Click on the `create_deal` pill → it expands to show:
  - [ ] Arguments with `address` containing "Tanjong Pagar", `stage: "lead"`, `price` around 1800000
  - [ ] Result with `success: true`
- [ ] Click on the `link_contact_to_deal` pill → it expands to show:
  - [ ] Arguments with `contact_id` and `deal_id` UUIDs
  - [ ] Result with `success: true`
- [ ] The assistant's final text message confirms it created the contact, deal, and linked them
- [ ] Collapse an expanded pill by clicking it again — it collapses back to the compact pill

**Notes / failures:**

```
(write notes here)
```

---

## 7. CRM — Contacts Page

### 7.1 Navigation

- [ ] Click **CRM** in the sidebar (under DATABASE section)
- [ ] URL auto-redirects to `/crm/contacts`
- [ ] The **Contacts** tab at the top of the CRM layout is highlighted/underlined
- [ ] The **Deals** tab is visible but not highlighted

### 7.2 Contacts table

- [ ] Table is visible with column headers (Name, Type, Email, Phone, etc.)
- [ ] **Sarah Lim** appears in the table
- [ ] Sarah's row shows a **"buyer"** type badge
- [ ] If Sarah has no email yet, it shows `—` or empty in that column

### 7.3 Search

- [ ] Type **"Sarah"** in the search box
- [ ] Table filters — only Sarah Lim (and any other "Sarah" contacts) remain
- [ ] Type **"zzzznonexistent"** — table shows no results
- [ ] Clear the search box — all contacts return

### 7.4 Type filter

- [ ] Open the contact type filter dropdown
- [ ] Select **"buyer"** → only buyer contacts show (Sarah Lim should be here)
- [ ] Select **"seller"** → Sarah Lim disappears (she's a buyer)
- [ ] Select **"All types"** → all contacts return

### 7.5 Combined search + filter

- [ ] Type "Sarah" in search AND select "buyer" filter → Sarah shows
- [ ] Change filter to "seller" while "Sarah" is still in search → Sarah disappears
- [ ] Clear both → all contacts return

### 7.6 Contact detail page

- [ ] Click on **Sarah Lim's row** in the table
- [ ] Navigated to `/crm/contacts/[contactId]`
- [ ] Breadcrumb shows: **CRM / Contacts / Sarah Lim**
- [ ] Name is displayed prominently at the top
- [ ] **Type badge** shows "buyer"
- [ ] **Email card** — shows email value or `—` if empty
- [ ] **Phone card** — shows phone value or `—` if empty
- [ ] **Notes card** — shows notes or `—` if empty

### 7.7 Contact detail — Deals tab

- [ ] A **Deals** tab is visible on the contact detail page
- [ ] Click the Deals tab
- [ ] The **88 Tanjong Pagar** deal is listed (linked via `link_contact_to_deal` earlier)
- [ ] Deal entry shows the address and stage

### 7.8 Contact detail — Activity tab

- [ ] An **Activity** tab is visible on the contact detail page
- [ ] Click the Activity tab
- [ ] If no interactions logged yet, it shows an empty state (this is expected for now — we'll create one in step 10)

### 7.9 Contact not found

- [ ] Manually edit the URL to `/crm/contacts/00000000-0000-0000-0000-000000000000`
- [ ] Page shows **"Contact not found"**
- [ ] A **"Back to Contacts"** link is visible
- [ ] Click the link → returns to `/crm/contacts`

**Notes / failures:**

```
(write notes here)
```

---

## 8. CRM — Deals Page

### 8.1 Deals table

- [ ] Click the **Deals** tab at the top of the CRM layout
- [ ] URL is `/crm/deals`
- [ ] Deals tab is now highlighted/underlined, Contacts tab is not
- [ ] Table shows the **88 Tanjong Pagar** deal
- [ ] Deal row shows: address, **stage badge** (color-coded, should say "lead"), price (~$1,800,000), primary contact (Sarah Lim)

### 8.2 Search

- [ ] Type **"Tanjong"** in the search box → filters to that deal
- [ ] Type **"zzzznonexistent"** → no results
- [ ] Clear search → all deals return

### 8.3 Empty state (optional — only if you have no deals)

- [ ] If no deals existed, you'd see a Handshake icon + "No deals yet"

### 8.4 Deal detail page

- [ ] Click the **88 Tanjong Pagar** deal row
- [ ] Navigated to `/crm/deals/[dealId]`
- [ ] Breadcrumb shows: **CRM / Deals / 88 Tanjong Pagar**
- [ ] **Stage badge** visible at top (should say "lead" with color)
- [ ] **Price card** shows $1,800,000 (or the value the agent set)
- [ ] **Contact card** shows **Sarah Lim** (primary contact)
- [ ] **Created** and **Updated** date cards show valid dates
- [ ] **Notes card** shows notes or `—` if empty
- [ ] **Interactions** section below — empty for now (no interactions logged on this deal yet)

### 8.5 Deal not found

- [ ] Manually edit the URL to `/crm/deals/00000000-0000-0000-0000-000000000000`
- [ ] Page shows **"Deal not found"**
- [ ] A **"Back to Deals"** link is visible
- [ ] Click the link → returns to `/crm/deals`

**Notes / failures:**

```
(write notes here)
```

---

## 9. Tasks (via Chat + Tasks Page)

### 9.1 Create a task via chat

- [ ] Go back to `/chat` (same thread or new thread)
- [ ] Type: **"Create a task to follow up with Sarah about the Tanjong Pagar deal by next Friday"**
- [ ] Press Enter
- [ ] Agent makes a `create_task` tool call — pill visible in the response
- [ ] Expand the pill — Arguments show title, due_date, and possibly linked contact/deal IDs
- [ ] Result shows `success: true`

### 9.2 Tasks page

- [ ] Click **Tasks** in the sidebar (under AGENT section)
- [ ] URL is `/tasks`
- [ ] The task you just created appears in the table
- [ ] Table shows: **title**, **status badge**, **due date**, linked contact, linked deal
- [ ] Due date matches approximately "next Friday" from when you sent the message

### 9.3 Tasks search

- [ ] Type the task title (or part of it) in the search box → filters correctly
- [ ] Type **"zzzznonexistent"** → no results
- [ ] Clear search → all tasks return

### 9.4 Tasks loading/error states

- [ ] On initial load, skeleton rows flash briefly before data appears (loading state)

**Notes / failures:**

```
(write notes here)
```

---

## 10. More CRM Tools via Chat

### 10.1 Update a contact

- [ ] In chat, type: **"Update Sarah Lim's email to sarah@example.com"**
- [ ] Agent calls `search_contacts` (to find Sarah) → pill visible
- [ ] Agent calls `update_contact` (to set email) → pill visible
- [ ] Expand `update_contact` pill → Arguments include `email: "sarah@example.com"`
- [ ] Result shows `success: true`

### 10.2 Verify update in CRM

- [ ] Navigate to `/crm/contacts` → click Sarah Lim
- [ ] **Email card** now shows **sarah@example.com**
- [ ] Email is a clickable `mailto:` link

### 10.3 Search contacts via chat

- [ ] In chat, type: **"Search my contacts"**
- [ ] Agent calls `search_contacts` → pill visible
- [ ] Agent returns a list of contacts in the chat text (including Sarah Lim with updated email)

### 10.4 Log an interaction

- [ ] In chat, type: **"Log an interaction: I called Sarah today to discuss pricing for the Tanjong Pagar unit"**
- [ ] Agent calls `create_interaction` → pill visible
- [ ] Expand pill → Arguments include `type` (e.g., "call"), `summary` with the description, and `contact_id`
- [ ] Result shows `success: true`

### 10.5 Verify interaction in CRM

- [ ] Navigate to `/crm/contacts` → click Sarah Lim → **Activity tab**
- [ ] The new interaction appears in the timeline: type, summary, and date
- [ ] Navigate to `/crm/deals` → click 88 Tanjong Pagar → **Interactions** section
- [ ] The same interaction appears here too (if it was linked to the deal)

**Notes / failures:**

```
(write notes here)
```

---

## 11. Web Search Tool

### 11.1 Web search

- [ ] In chat, type: **"Search for recent property launches in Singapore"**
- [ ] Agent calls `web_search` → tool-call pill visible
- [ ] Expand the pill → Arguments include the search query
- [ ] Result contains an array of search results (titles, snippets, URLs)
- [ ] Agent's text response summarizes the search results in a readable format

### 11.2 No crash on search

- [ ] After the web search response, the chat input re-enables
- [ ] You can send another message normally

**Notes / failures:**

```
(write notes here)
```

---

## 12. File Tools

### 12.1 Write a file

- [ ] In chat, type: **"Write a note about today's showing at 45 Bukit Timah Road. The client loved the garden but thought the kitchen was too small."**
- [ ] Agent calls `write_file` → tool-call pill visible
- [ ] Expand pill → Arguments show a file path and content
- [ ] Result shows `success: true`
- [ ] Agent confirms the note was saved

### 12.2 Read a file

- [ ] In chat, type: **"Read my note about Bukit Timah"**
- [ ] Agent calls `read_file` → tool-call pill visible
- [ ] Expand pill → Result contains the file content you wrote earlier
- [ ] Agent's text response includes the note content (garden comment, kitchen comment)

**Notes / failures:**

```
(write notes here)
```

---

## 13. Knowledge Base

### 13.1 Navigation

- [ ] Click **Knowledge** in the sidebar (under DATABASE section)
- [ ] URL is `/knowledge`
- [ ] The Knowledge link in the sidebar is highlighted/active

### 13.2 Empty state (if no files uploaded yet)

- [ ] Page shows: FileText icon + **"No files yet. Upload documents to get started."**

### 13.3 Upload a file

- [ ] Click the **"Upload"** button
- [ ] A native file picker dialog opens
- [ ] File picker restricts to text-based files (`.txt`, `.md`, `.pdf`, etc.)
- [ ] Select a `.txt` or `.md` file from your computer
- [ ] Button shows **"Uploading..."** during upload
- [ ] After upload completes, the file appears in the table
- [ ] Table row shows: **filename**, **content type**, **file size**, **upload date**

### 13.4 Upload error (optional)

- [ ] Try uploading an invalid/corrupt file or disconnect network during upload
- [ ] A red error banner appears: **"Upload failed: [error message]"**

### 13.5 Search

- [ ] Type the filename (or part of it) in the search box → file appears in filtered results
- [ ] Type **"zzzznonexistent"** → **"No files match your search"**
- [ ] Clear search → all files return

### 13.6 Loading state

- [ ] Refresh the page → skeleton rows flash briefly before data loads

**Notes / failures:**

```
(write notes here)
```

---

## 14. Realtime Updates

### 14.1 Setup

- [ ] Open `/crm/contacts` in **Tab A** (keep it open, don't touch it)
- [ ] Open `/chat` in **Tab B**

### 14.2 Create a contact via chat

- [ ] In Tab B, type: **"Create a contact for John Tan, phone 8888-1234, type seller"**
- [ ] Agent creates the contact (tool call pills visible)
- [ ] **Without refreshing Tab A**, switch to it

### 14.3 Verify realtime

- [ ] **John Tan** appears in the contacts table in Tab A — **no page refresh needed**
- [ ] John Tan's row shows type "seller" and phone "8888-1234"

### 14.4 Realtime for deals (optional)

- [ ] Open `/crm/deals` in Tab A
- [ ] In Tab B (chat), type: **"Create a deal at 55 Robertson Quay, stage prospect, price 2.5 million"**
- [ ] Switch to Tab A — the new deal appears without refresh

**Notes / failures:**

```
(write notes here)
```

---

## 15. Error Resilience

### 15.1 Recovery after tool errors

- [ ] If any tool calls failed during earlier testing (red error pills), confirm:
  - [ ] The chat did **not** show a hard crash / error boundary page
  - [ ] You were able to send the next message normally
  - [ ] The failed tool-call pill shows an error state (red styling) with an error message

### 15.2 Normal operation continues

- [ ] After all the testing above, send a simple message: **"Hello, how are you?"**
- [ ] Agent responds normally with no tool calls — just a text response
- [ ] Chat is fully functional, no residual errors

**Notes / failures:**

```
(write notes here)
```

---

## 16. Mobile Responsiveness

### 16.1 Setup

- [ ] Open Chrome DevTools (Cmd+Option+I) → toggle Device Toolbar (Cmd+Shift+M)
- [ ] Select **iPhone 14 Pro** (or any ~390px width device)

### 16.2 Sidebar

- [ ] Sidebar is **hidden by default** on mobile
- [ ] A hamburger / trigger button is visible to open the sidebar
- [ ] Tap the trigger → sidebar slides open as an overlay
- [ ] Tap a nav item → sidebar closes and navigates to that page

### 16.3 Chat on mobile

- [ ] Navigate to `/chat`
- [ ] Message bubbles fit within the viewport (no horizontal overflow)
- [ ] The text input is visible and usable at the bottom
- [ ] Type a message and send → message appears, response streams in
- [ ] Tool-call pills are visible and tappable on mobile
- [ ] Expanding a tool-call pill shows the JSON without breaking layout

### 16.4 CRM on mobile

- [ ] Navigate to `/crm/contacts`
- [ ] Table scrolls horizontally if it doesn't fit, OR columns adapt to narrow width
- [ ] Search box is usable
- [ ] Tap a contact row → detail page loads
- [ ] Detail page cards stack vertically and are readable

### 16.5 Tasks on mobile

- [ ] Navigate to `/tasks`
- [ ] Table is usable (horizontal scroll or responsive columns)
- [ ] Search box is accessible

### 16.6 Knowledge on mobile

- [ ] Navigate to `/knowledge`
- [ ] Upload button is accessible
- [ ] File table is usable

**Notes / failures:**

```
(write notes here)
```

---

## Summary

| Section | Status | Notes |
|---------|--------|-------|
| 6. CRM Tools via Chat | ⬜ | |
| 7. CRM — Contacts | ⬜ | |
| 8. CRM — Deals | ⬜ | |
| 9. Tasks | ⬜ | |
| 10. More CRM Tools | ⬜ | |
| 11. Web Search | ⬜ | |
| 12. File Tools | ⬜ | |
| 13. Knowledge Base | ⬜ | |
| 14. Realtime | ⬜ | |
| 15. Error Resilience | ⬜ | |
| 16. Mobile Responsiveness | ⬜ | |

> Replace ⬜ with ✅ (pass), ⚠️ (partial), or ❌ (fail) as you go.
