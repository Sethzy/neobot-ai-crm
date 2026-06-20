# 31. gmail_search_threads

- Group: Gmail Connection Tools
- Category: Gmail (Connection)
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "gmail_search_threads",
  "description": "Search Gmail threads using Gmail search syntax. Returns threads and messages with IDs and fields from the readMask.\n<search-strategy>\n  Query Construction:\n  - Keyword searches may be overly restrictive. For time-based tasks, prefer date ranges: \"after:2024/01/15\", \"newer_than:7d\", \"older_than:1y\"\n  - When keywords are needed, use OR operators: \"dinner OR lunch OR meeting\", \"project OR proposal\"\n  - Label filters are most effective: \"label:important\", \"label:sent\", \"from:@company.com OR to:@company.com\"\n  - User labels must specify the name, not the label ID. Use gmail_search_labels to get the names of user labels. Label names with spaces should have the spaces replaced with hyphens: \"label:my-label-name\"\n  - Combine approaches: \"label:sent newer_than:2m\", \"has:attachment after:2024/01/01\"\n\n  Search Iteration:\n  - Be thorough with your searches. If initial search doesn't find necessary information, try different approaches\n  - Start broader, then narrow down. Consider alternative date ranges, keyword combinations, or label filters\n  - You should be willing to try up to 5 different queries before giving up\n\n  Completeness:\n  - Remember to retrieve and use ALL relevant results from searches\n  - Use the nextPageToken to get complete results: make sequential calls with pageToken to get more than the maximum results for a single search\n</search-strategy>",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["query", "readMask"],
    "additionalProperties": false,
    "properties": {
      "query": {
        "type": "string",
        "description": "Gmail search query. Examples: \"from:me\", \"to:john@example.com\", \"subject:dinner\", \"after:2024/04/16\", \"newer_than:7d\", \"older_than:1y\" (h/d/m/y), \"has:attachment\", \"is:unread\", \"(from:@foo.com OR to:@bar.com)\", \"dinner -movie\", \"exact phrase\", \"label:my-label\". Common system labels: inbox, unread, sent, spam, trash, starred, important. Use hyphens in label names instead of spaces, but be sure to include the full label name including any other characters, e.g. for a label named \"Test: label.$  42\", use \"label:Test:-label.$--42\". Use parentheses to group OR queries."
      },
      "readMask": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["date", "participants", "subject", "bodySnippet", "bodyFull", "bodyHtml", "labels", "attachments"]
        },
        "default": ["date", "participants", "subject", "bodySnippet"],
        "description": "Array of fields to include in the response. Options: date (message date), participants (from/to/cc/bcc), subject (email subject), bodySnippet (brief excerpt), bodyFull (complete message body as markdown), bodyHtml (raw HTML body), labels (message labels), attachments (attachment info). Default includes basic metadata with snippet. Only include bodyFull or bodyHtml if you need to read the complete message content."
      },
      "maxResults": {
        "type": "number",
        "minimum": 1,
        "maximum": 100,
        "description": "Number of results to return (max 100)"
      },
      "pageToken": {
        "type": "string",
        "description": "Page token to continue from. Use to get the next page of results from a previous search that returned a nextPageToken."
      },
      "includeSpamTrash": {
        "type": "boolean",
        "description": "Include messages from label:spam and label:trash in the results (default: false)"
      }
    }
  }
}
```
