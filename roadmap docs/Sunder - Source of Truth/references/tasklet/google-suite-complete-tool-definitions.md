# Google Suite: Verbatim Tool Definitions + Skill Files

Everything below is exactly what the Tasklet platform gives the LLM. Nothing paraphrased.

---

## 1. Gmail (conn_7ydrcj6nwqbr8sd2zbrs) — 16 tools, HAS skill file

### Skill File (auto-generated)

```xml
<read-mask-instructions>
  Use the readMask parameter to control what information is returned. Choose the minimal readMask for your task:
  - Email metadata analysis (response times, sender patterns, counts): Default [date, participants, subject, bodySnippet] is sufficient
  - Content analysis (reading email bodies, sentiment analysis): Add bodyFull - but this uses significantly more tokens and may cause truncation
  - Label management tasks: Add labelIds to see message label IDs
  - Attachment-related tasks: Add attachments to see attachment info
  Message and thread IDs are always returned regardless of readMask.
</read-mask-instructions>
<labels>
  Gmail labels have two identifiers: a user-facing **name** and a fixed **Label ID**.
  - System labels (INBOX, SENT, IMPORTANT, etc.): name and ID are identical (e.g., both are "INBOX")
  - Category and user-created labels: name and ID differ (e.g., name: "My Label", ID: "Label_123")

  Use gmail_search_labels to retrieve label names and IDs.

  **Which identifier to use:**
  - gmail_search_threads: use label **names** in search queries (e.g., "label:My-Label")
  - All other tools (gmail_modify_message_labels, etc.): use label **IDs**
</labels>
<link-instructions>
You can use 'https://mail.google.com/mail/u/${'user's email address'}/#inbox/${'threadId or messageId'}' to give the user a link to view a message, draft, or thread in the browser. Do not try to view a thread in the browser yourself with this link.
</link-instructions>
```

### Tool: gmail_search_threads (activated)

**Description:**
```
Search Gmail threads using Gmail search syntax. Returns threads and messages with IDs and fields from the readMask.
<search-strategy>
  Query Construction:
  - Keyword searches may be overly restrictive. For time-based tasks, prefer date ranges: "after:2024/01/15", "newer_than:7d", "older_than:1y"
  - When keywords are needed, use OR operators: "dinner OR lunch OR meeting", "project OR proposal"
  - Label filters are most effective: "label:important", "label:sent", "from:@company.com OR to:@company.com"
  - User labels must specify the name, not the label ID. Use gmail_search_labels to get the names of user labels. Label names with spaces should have the spaces replaced with hyphens: "label:my-label-name"
  - Combine approaches: "label:sent newer_than:2m", "has:attachment after:2024/01/01"

  Search Iteration:
  - Be thorough with your searches. If initial search doesn't find necessary information, try different approaches
  - Start broader, then narrow down. Consider alternative date ranges, keyword combinations, or label filters
  - You should be willing to try up to 5 different queries before giving up

  Completeness:
  - Remember to retrieve and use ALL relevant results from searches
  - Use the nextPageToken to get complete results: make sequential calls with pageToken to get more than the maximum results for a single search
</search-strategy>
```

**Arguments:**
| Name | Description |
|------|-------------|
| query | Gmail search query. Examples: "from:me", "to:john@example.com", "subject:dinner", "after:2024/04/16", "newer_than:7d", "older_than:1y" (h/d/m/y), "has:attachment", "is:unread", "(from:@foo.com OR to:@bar.com)", "dinner -movie", "exact phrase", "label:my-label". Common system labels: inbox, unread, sent, spam, trash, starred, important. Use hyphens in label names instead of spaces, but be sure to include the full label name including any other characters, e.g. for a label named "Test: label.$  42", use "label:Test:-label.$--42". Use parentheses to group OR queries. |
| readMask | Array of fields to include in the response. Options: date (message date), participants (from/to/cc/bcc), subject (email subject), bodySnippet (brief excerpt), bodyFull (complete message body as markdown), bodyHtml (raw HTML body), labelIds (message label IDs), attachments (attachment info). Default includes basic metadata with snippet. Only include bodyFull or bodyHtml if you need to read the complete message content. |
| includeSpamTrash | Include messages from label:spam and label:trash in the results (default: false) |
| maxResults | Number of results to return (max 100) |
| pageToken | Page token to continue from. Use to get the next page of results from a previous search that returned a nextPageToken. |

### Tool: gmail_send_message (activated)

**Description:**
```
Send an email message immediately to recipients on behalf of the user. Use only when the user has explicitly requested to SEND an email (not when they want to compose, draft, or prepare). This tool sends emails to other people, not to the user themselves.
```

**Arguments:**
| Name | Description |
|------|-------------|
| to | Recipient email addresses |
| cc | CC recipient email addresses |
| bcc | BCC recipient email addresses |
| from | Send-as alias for the "From:" header. Can be an email address or a display name with email. If omitted, uses the default sending address. |
| subject | Email subject. If replying to an email, use the subject of the original email. |
| body | Email body as markdown (converted to HTML). Provide body OR bodyHtml, not both. |
| bodyHtml | Email body as raw HTML. Do not wrap in CDATA tags. IMPORTANT: Use inline styles instead of style tags or CSS classes. Provide body OR bodyHtml, not both. |
| replyToMessageId | Message ID to reply to (for proper email threading) |
| attachments | File paths in /agent/ to attach to the email |
| includeSignature | Include the user's Gmail signature in the message. |

### Tool: gmail_list_drafts (deactivated)

**Description:** List draft email messages in Gmail

**Arguments:**
| Name | Description |
|------|-------------|
| maxResults | Number of results to return (max 100) |
| query | Gmail search query to filter drafts |

### Tool: gmail_send_draft (deactivated)

**Description:** Send a draft email from Gmail

**Arguments:**
| Name | Description |
|------|-------------|
| draftId | The ID of the draft to send |

### Tool: gmail_get_draft (deactivated)

**Description:** Get a specific draft email by ID from Gmail with configurable detail level using readMask

**Arguments:**
| Name | Description |
|------|-------------|
| draftId | The ID of the draft to retrieve |
| readMask | Array of fields to include in the response. Options: date, participants, subject, bodySnippet, bodyFull, bodyHtml, labelIds, attachments. |

### Tool: gmail_get_threads (deactivated)

**Description:** Get specific email threads by IDs from Gmail with configurable detail level using readMask

**Arguments:**
| Name | Description |
|------|-------------|
| threadIds | The IDs of the threads to retrieve. Max 1000 threads. |
| readMask | Array of fields to include in the response. |

### Tool: gmail_get_messages (deactivated)

**Description:** Get specific email messages by IDs from Gmail with configurable detail level using readMask

**Arguments:**
| Name | Description |
|------|-------------|
| messageIds | The IDs of the messages to retrieve. Max 1000 messages. |
| readMask | Array of fields to include in the response. |

### Tool: gmail_search_labels (deactivated)

**Description:** Search for Gmail labels. Use this tool to get the IDs and names of **user** labels - other Gmail tools only return label IDs without names. Gmail system labels always have the same ID and name (e.g., "INBOX"), but user-created labels have different IDs and names.

**Arguments:**
| Name | Description |
|------|-------------|
| filter | Optional filter to apply to the search. Case-insensitive. If not specified, all labels returned. |

### Tool: gmail_modify_message_labels (deactivated)

**Description:** Add or remove labels from multiple Gmail messages

**Arguments:**
| Name | Description |
|------|-------------|
| messageIds | The IDs of the messages to modify |
| addLabelIds | Label IDs to add to the messages |
| removeLabelIds | Label IDs to remove from the messages |

### Tool: gmail_create_label (deactivated)

**Description:** Create a new Gmail label

**Arguments:**
| Name | Description |
|------|-------------|
| name | Name for the new label |

### Tool: gmail_update_label (deactivated)

**Description:** Update an existing Gmail label name by ID

**Arguments:**
| Name | Description |
|------|-------------|
| labelId | The ID of the label to update |
| name | New name for the label |

### Tool: gmail_delete_label (deactivated)

**Description:** Delete an existing Gmail label by ID

**Arguments:**
| Name | Description |
|------|-------------|
| labelId | The ID of the label to delete |

### Tool: gmail_forward_message (deactivated)

**Description:** Forward an email message with its complete content including all replies and attachments

**Arguments:**
| Name | Description |
|------|-------------|
| messageId | The ID of the message to forward |
| to | Recipient email addresses |
| cc | CC recipient email addresses |
| bcc | BCC recipient email addresses |
| additionalBody | Additional text as markdown to add before the forwarded message. Provide additionalBody OR additionalBodyHtml, not both. |
| additionalBodyHtml | Additional text as raw HTML to add before the forwarded message. Use inline styles. |
| includeAttachments | Whether to include attachments from the original message |

### Tool: gmail_download_attachment (deactivated)

**Description:** Download an email attachment from Gmail to the agent file system. The attachment is identified by filename.

**Arguments:**
| Name | Description |
|------|-------------|
| messageId | The ID of the Gmail message containing the attachment |
| filename | The name of the attachment file to download |
| destinationPath | Optional path in /agent/home/ where the file should be saved. Defaults to /agent/home/{filename} |

### Tool: gmail_create_draft (deactivated)

**Description:** Create a draft email that can be reviewed and edited before sending. Use this when the user wants to compose, prepare, write, or draft an email. Drafts can be sent later using the gmail_send_draft tool.

**Arguments:**
| Name | Description |
|------|-------------|
| to | Recipient email addresses |
| cc | CC recipient email addresses |
| bcc | BCC recipient email addresses |
| from | Send-as alias for the "From:" header. |
| subject | Email subject. If replying, use original subject. |
| body | Email body as markdown. Provide body OR bodyHtml, not both. |
| bodyHtml | Email body as raw HTML. Use inline styles. |
| replyToMessageId | Message ID to reply to |
| attachments | File paths in /agent/ to attach |
| includeSignature | Include the user's Gmail signature |

### Tool: gmail_update_draft (deactivated)

**Description:** Update an existing draft email in Gmail

**Arguments:**
| Name | Description |
|------|-------------|
| draftId | The ID of the draft to update |
| to | New recipient email addresses |
| cc | New CC recipient email addresses |
| bcc | New BCC recipient email addresses |
| from | Send-as alias for the "From:" header. |
| subject | New email subject |
| body | New email body as markdown. Provide body OR bodyHtml, not both. |
| bodyHtml | New email body as raw HTML. Use inline styles. |
| attachments | File paths in /agent/ to attach |
| includeSignature | Include the user's Gmail signature |

---

## 2. Google Calendar (conn_72k4wd66yshe1rk9ey0a) — 4 tools, NO skill file

### Tool: google_calendar_search_events (activated)

**Description:**
```
Search the user's Google Calendar for events using date ranges, text queries, or both.
<search-strategy>
1. Date Range Only (Preferred): For bounded periods ≤35 days, use ONLY start/end to get all events, then filter via reasoning. This prevents missing events due to keyword mismatches. Examples: "this week", "next month", "tomorrow", "team meetings this week" (use date range for week, analyze for "team").
2. Query Only: For unbounded time searches where you don't know the timeframe. Examples: "when did I last meet with Alice?", "find all dentist appointments".
3. Combined (Rare): Only when time window >35 days AND keywords needed. Example: "Alice meetings in Q1 2024" (90 days requires query="Alice" + date range).

⚠️ DO NOT add query for bounded periods:
- ❌ "Team meetings this week" → Use date range only, NOT query="team"
- ❌ "Lunch events this month" → Use date range only, NOT query="lunch"
- ✅ "When did I last meet Alice?" → Use query="Alice" (unbounded)

Requirements:
- Must provide: date range (both start AND end) OR query (or both)
- Date range limit: 35 days without query, unlimited with query
</search-strategy>
```

**Arguments:**
| Name | Description |
|------|-------------|
| start | Start time in RFC-3339 format (e.g., 2024-01-15T09:00:00-08:00) |
| end | End time in RFC-3339 format |
| query | Free text search for keywords in title, description, location, or attendee names/emails |
| calendarId | Calendar ID. Leave empty for primary. Use email address for another user's calendar. |
| startDayOfWeek | Validate start date falls on expected day of week. Use for "next Friday" style scheduling, not "January 15th" style. Returns error on mismatch. |

### Tool: google_calendar_create_event (deactivated)

**Description:** Creates or schedules a calendar event. Does not support creation of recurring calendar events.

**Arguments:**
| Name | Description |
|------|-------------|
| calendarId | Calendar ID. Leave empty for primary. |
| title | The title of the event. Choose a generic title meaningful to all attendees. Examples: "ABC project discussion", "Alice / Bob", "Pizza lunch" |
| isAllDay | Whether all-day event. If true, start/end should be YYYY-MM-DD. |
| start | Start of event. All-day: YYYY-MM-DD. Timed: RFC-3339. |
| end | End of event. All-day: YYYY-MM-DD (day after last day). Timed: RFC-3339. |
| attendees | Comma-separated email addresses. Include user's email if they're attending. Omit for personal events. |
| location | Location of the event |
| transparency | 'transparent' = Free, 'opaque' = Busy. Defaults to 'opaque'. |
| description | Description. Include relevant info and thread reference string for related email. |
| sendNotifications | Whether to notify attendees via email. Defaults to false. |
| attachments | Array of file attachments from Google Drive |
| startDayOfWeek | Day-of-week validation for the start date |

### Tool: google_calendar_edit_event (deactivated)

**Description:** Edits an existing calendar event. Can only be used with events returned by google_calendar_search_events.

**Arguments:**
| Name | Description |
|------|-------------|
| eventId | The ID of the event (from search results) |
| calendarId | The calendar ID the event belongs to |
| title | New title |
| isAllDay | Required when updating start or end times |
| start | New start time |
| end | New end time |
| attendees | Replaces existing attendee list entirely |
| location | New location |
| transparency | 'transparent' or 'opaque' |
| description | New description |
| sendNotifications | Whether to notify attendees |
| attachments | Replaces existing attachments |
| conference | 'add' to create Meet link, 'remove' to delete one |
| deleteEvent | Whether to delete the event |
| startDayOfWeek | Day-of-week validation |

### Tool: google_calendar_list_calendars (activated)

**Description:** List all calendars accessible to the user, including shared calendars. Returns calendar IDs that can be used with other calendar tools.

**Arguments:** None

---

## 3. Google Forms (conn_bdy5sjwy7hbdgjzrmx4a) — 5 tools, NO skill file

### Tool: google_forms_get_form (activated)

**Description:** Retrieves a Google Form by ID, including its title, description, questions, and settings.

**Arguments:**
| Name | Description |
|------|-------------|
| formId | The ID of the Google Form to retrieve |

### Tool: google_forms_list_responses (activated)

**Description:** Lists all responses submitted to a Google Form.

**Arguments:**
| Name | Description |
|------|-------------|
| formId | The ID of the Google Form to get responses from |

### Tool: google_forms_get_response (deactivated)

**Description:** Retrieves a specific response from a Google Form by response ID.

**Arguments:**
| Name | Description |
|------|-------------|
| formId | The ID of the Google Form |
| responseId | The ID of the specific response to retrieve |

### Tool: google_forms_create_form (deactivated)

**Description:** Creates a new Google Form with a title. After creation, use google_forms_update_form to add questions.

**Arguments:**
| Name | Description |
|------|-------------|
| title | The title for the new Google Form |

### Tool: google_forms_update_form (deactivated)

**Description:**
```
Updates a Google Form by adding, modifying, or removing questions and settings. Uses batch update API.

Question types:
- textQuestion: Short answer or paragraph (set paragraph: true for long text)
- choiceQuestion: Multiple choice, checkbox, or dropdown (type: "RADIO", "CHECKBOX", or "DROP_DOWN")
- scaleQuestion: Linear scale with low/high values
- dateQuestion: Date picker (optionally includeTime, includeYear)
- timeQuestion: Time picker (optionally duration)

Example requests:
1. Add text question: {"createItem": {"item": {"title": "What is your name?", "questionItem": {"question": {"required": true, "textQuestion": {}}}}, "location": {"index": 0}}}
2. Add multiple choice: {"createItem": {"item": {"title": "Favorite color?", "questionItem": {"question": {"choiceQuestion": {"type": "RADIO", "options": [{"value": "Red"}, {"value": "Blue"}, {"value": "Green"}]}}}}, "location": {"index": 1}}}
3. Update form title: {"updateFormInfo": {"info": {"title": "New Title"}, "updateMask": "title"}}
4. Delete item at index 0: {"deleteItem": {"location": {"index": 0}}}
```

**Arguments:**
| Name | Description |
|------|-------------|
| formId | The ID of the Google Form to update |
| requests | Array of update requests. Each can be: createItem, updateItem, deleteItem, moveItem, updateFormInfo, updateSettings. |

---

## Why The Skill File Content Can't Just Go In Tool Definitions

### What's IN the Gmail skill file:

1. **readMask strategy** — "choose minimal readMask for your task"
2. **Label name vs ID rule** — "use names in search, IDs everywhere else"
3. **Link format** — how to build clickable Gmail URLs

### Why these DON'T fit in tool definitions:

**Problem 1: Cross-tool knowledge.**

The label rule says: "gmail_search_threads uses label **names**, but gmail_modify_message_labels uses label **IDs**."

Which tool's description do you put this in? It's about the *relationship between two tools*. If you put it in gmail_search_threads, the LLM doesn't see it when calling gmail_modify_message_labels. If you put it in both, you're duplicating. If you put it in all 16 tools, you've added ~100 tokens × 16 = 1,600 tokens of duplication.

The skill file says it **once** (~500 tokens), and the LLM reads it before using **any** Gmail tool.

**Problem 2: The readMask guidance is a strategy, not a parameter description.**

The tool definition already describes what readMask accepts:
> "Options: date, participants, subject, bodySnippet, bodyFull, bodyHtml, labelIds, attachments"

The skill file adds *when to use which option*:
> "Email metadata analysis → default is sufficient. Content analysis → add bodyFull but it uses significantly more tokens."

This is workflow guidance, not parameter documentation. It doesn't belong in a parameter's `description` field — it's advice about how to think about the parameter in context.

**Problem 3: Link format applies to zero tools.**

The Gmail link format (`https://mail.google.com/mail/u/{email}/#inbox/{threadId}`) isn't a tool at all. It's how to format output for the user. There's no "gmail_generate_link" tool to attach it to. It's agent-level knowledge that applies when presenting results from *any* Gmail tool.

**Problem 4: Token economics at scale.**

Right now I have 3 connections. What if I had 10? Each with skill-level guidance embedded in every tool definition?

```
CURRENT (lazy-loaded skill files):
  10 connections × ~80 tokens pointer each = ~800 tokens always loaded
  + ~500 tokens per skill file, only when used = ~500 tokens on demand
  TYPICAL TURN: ~800 + 500 = 1,300 tokens

IF EMBEDDED IN TOOL DEFINITIONS:
  10 connections × ~5 tools average × ~100 extra tokens each = ~5,000 tokens
  ALL LOADED EVERY TURN whether needed or not
  EVERY TURN: 5,000 tokens (even for "what's the weather?")
```

The skill file is the platform's way of saying: "here's cross-cutting knowledge about this service that multiple tools need, but which you should only pay for when you're actually using the service."

### What IS in the tool definitions (and belongs there):

- Parameter schemas (what the API accepts)
- Search strategies (embedded in the specific search tool that uses them)
- Single-tool behavioral rules ("Use only when user explicitly says SEND")
- Format requirements ("RFC-3339 date-time string")

### The split:

| Goes in tool definition | Goes in skill file |
|---|---|
| What this specific tool accepts | How tools relate to each other |
| Parameter formats and constraints | When to prefer one approach over another |
| Single-tool behavioral guards | Output formatting (links, display) |
| API-specific search syntax | Service-level gotchas (name vs ID) |
