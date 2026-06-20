# read_file

```json
{
  "name": "read_file",
  "description": "Reads the contents of a file or directory by its path. If the path is a directory, returns a recursive tree-style listing of its contents. Image files are displayed directly. For PDF files, returns pages as images by default to preserve visual layout, formatting, and diagrams. Use format='text' to extract text content only. Specify optional start_line/end_line or start_page/end_page for large files. Use negative indices to count from the end (e.g., start_line: -10, end_line: -1 reads the last 10 lines).",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["path"],
    "additionalProperties": false,
    "properties": {
      "path": {
        "type": "string",
        "description": "Absolute path to the file or directory to view (e.g., '/agent/home' or '/tmp/file.txt')"
      },
      "start_line": {
        "type": "number",
        "description": "For text files only. The line to start reading from (1-indexed). Use negative numbers to count from the end (-1 = last line, -10 = 10th from last). Defaults to 1 if not specified."
      },
      "end_line": {
        "type": "number",
        "description": "For text files only. The line to stop reading at (1-indexed, inclusive). Use negative numbers to count from the end (-1 = last line). Defaults to end of file if not specified."
      },
      "pdf_start_page": {
        "type": "number",
        "description": "For PDF files only. The page to start reading from (1-indexed). Use negative numbers to count from the end (-1 = last page). Defaults to 1 if not specified."
      },
      "pdf_end_page": {
        "type": "number",
        "description": "For PDF files only. The page to stop reading at (1-indexed, inclusive). Use negative numbers to count from the end (-1 = last page). Defaults to end of file if not specified."
      },
      "pdf_format": {
        "type": "string",
        "enum": ["image", "text"],
        "description": "For PDF files only. Specifies whether to return PDF pages as images or extracted text. Defaults to \"image\". Images provide better fidelity for complex layouts, diagrams, and formatting."
      }
    }
  }
}
```
