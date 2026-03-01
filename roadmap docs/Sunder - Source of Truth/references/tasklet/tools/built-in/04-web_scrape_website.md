# 4. web_scrape_website

- Group: Built-In Tools
- Category: Web
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "web_scrape_website",
  "description": "Reads a single webpage and extracts its content as markdown",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["url"],
    "additionalProperties": false,
    "properties": {
      "url": {
        "type": "string",
        "description": "The URL of the webpage to scrape. Must be either a http:// or https:// URL."
      }
    }
  }
}
```
