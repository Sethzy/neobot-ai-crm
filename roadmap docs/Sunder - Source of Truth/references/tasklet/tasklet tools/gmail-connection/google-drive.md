# Google Drive via Tasklet — Full Tool & Capability Briefing

## Connection Overview

- **Service:** Google Drive
- **Description:** An integration with Google Drive. Allows search and access of files, as well as the creation and editing of Docs and Sheets.
- **Total Tools Available:** 13

---

## Tools (Verbatim)

### 1. google_drive_list_drives

**Description:** List shared drives accessible to the user. Returns drive IDs, names, and metadata. Use the returned drive IDs with the google_drive_search_documents tool to search within specific shared drives.

**Arguments:**

- `query` — Optional search query to filter shared drives by name or other properties.
- `limit` — Maximum number of shared drives to return (1-100). Default: 50.
- `paginationToken` — Token to retrieve the next page of results.

---

### 2. google_drive_search_documents

**Description:** Search for files in Google Drive using the Drive API query syntax. Returns file metadata including name, type, link, owner, and last modified time.

A Drive query string contains the following three parts: query_term operator values

1. query_term is the query term or field to search upon (e.g. name, mimeType, fullText, modifiedTime).
2. operator specifies the condition for the query term (e.g. =, !=, in, and, or).
3. values are the specific values you want to use to filter your search results.

Common query patterns:

- Search by name: "name contains 'quarterly report'"
- Filter by type: "mimeType = 'application/vnd.google-apps.document'"
- Filter by last modified time: "lastModified > '2025-11-01T00:00:00'"
- Search in folder: "'folderId' in parents"
- Full text search: "fullText contains 'budget'"
- Exclude trash: "trashed = false"
- Combine conditions: "name contains 'report' and mimeType = 'application/vnd.google-apps.spreadsheet'

Specify the corpora field to scope the search to a set of files.
Use the 'user' corpora to search within user's personal Drive. Use the 'drive' corpora to search a given shared Drive.
If searching in the 'user' corpora doesn't find any results, try searching in the 'allDrives' corpora to include user's shared drives."

**Arguments:**

- `query` — A Google Drive search query string that filters results. Supports searching by file name, MIME type, content, folder location, ownership, and more. Examples: "name contains 'report'", "mimeType = 'application/vnd.google-apps.document'", "'folderId' in parents", "'{email}' in owners". Multiple conditions can be combined with 'and'/'or' operators. For complete query syntax reference, see https://developers.google.com/workspace/drive/api/guides/ref-search-terms.
- `corpora` — Specifies which files to search across (i.e. scope of the search): "user" - User's personal Drive files only (default, most common), "domain" - All files in the user's organization, "drive" - Files in a specific shared drive (must also set the driveId parameter), "allDrives" - All accessible files across personal Drive, shared drives, and team drives (slower)
- `driveId` — The ID of a specific shared drive to search within. Required when corpora is set to "drive". Ignore this parameter for personal Drive searches.
- `limit` — Maximum number of results to return per request. Ranges from 1-100. Use smaller values (10-25) for faster responses with broad queries. Use 100 for fetching large batches. If you need more than 100 results, use the paginationToken to fetch additional pages.
- `paginationToken` — The pagination token to continue a previous search request

---

### 3. google_drive_get_document

**Description:** Retrieve a document from Google Drive by its ID. Returns metadata and content. For Google Docs, returns the document content as markdown. For other file types, returns metadata only.

**Arguments:**

- `documentId` — The ID of the Google Drive document to retrieve

---

### 4. google_drive_append_text_to_document

**Description:** Append text to the end of a Google Docs document. This tool only works with Google Docs files.

**Arguments:**

- `documentId` — The ID of the Google Docs document to append text to.
- `text` — The text content to append to the document (supports markdown syntax)

---

### 5. google_drive_replace_text_in_document

**Description:** Replace text in a Google Docs document. This tool replaces ALL occurrences of the target text - make your target text specific enough to match only what you intend to replace.

**Arguments:**

- `documentId` — The ID of the Google Docs document to replace text in.
- `targetText` — The exact text to find and replace. IMPORTANT: Provide an unambiguous match - include enough surrounding text to ensure only the intended occurrences are replaced. If the text appears multiple times, all matching occurrences will be replaced.
- `replacementText` — The text to replace the target text with

---

### 6. google_drive_create_document

**Description:** Create a new Google Docs document with the specified title.

**Arguments:**

- `title` — The title of the new Google Docs document
- `parentFolderId` — Optional folder ID where the new document should be created.

---

### 7. google_drive_create_folder

**Description:** Create a new folder in Google Drive with the specified name.

**Arguments:**

- `title` — The name of the new folder
- `parentFolderId` — Optional folder ID where the new folder should be created.

---

### 8. google_drive_create_spreadsheet

**Description:** Create a new Google Sheets spreadsheet with the specified title and optional initial data.

**Arguments:**

- `title` — The title of the new Google Sheets spreadsheet
- `parentFolderId` — Optional folder ID where the new spreadsheet should be created.
- `data` — Initial data structure for the spreadsheet in Google Sheets API format

---

### 9. google_drive_get_spreadsheet

**Description:** Retrieve data from a Google Sheets spreadsheet in one of two modes:

**Mode 1: Summary (no range specified)** - When called without a range parameter, returns metadata about all sheets including their dimensions (row and column counts) but NO actual cell data. Use this to explore the spreadsheet structure first.

**Mode 2: Data retrieval (range specified)** - When called with a range parameter, returns the actual cell data for that specific range only. The response includes a dataRange indicating the actual bounds of data found.

**Range parameter format:** 'SheetName'!A1:Z100 (e.g., 'Sheet1'!A1:D10, 'My Sheet'!A1:B50)

- Always quote sheet names with single quotes
- If sheet name contains single quotes, escape by doubling (e.g., 'John''s Sheet')
- Without a range, defaults to summary mode

⚠️ Performance Warning: Spreadsheets in production can be extremely large. Pulling massive ranges at once can cause hundreds of MB of data to be downloaded and cause performance issues.

Best practices:

- Start with summary mode (no range) to check gridProperties and understand sheet dimensions
- Use specific, bounded ranges (e.g., 'Sheet1'!A1:E50) rather than entire rows/columns
- For large datasets, fetch data in logical chunks rather than pulling everything at once
- If you need all data from a sheet, check the dataRange first and retrieve incrementally

**Arguments:**

- `spreadsheetId` — The ID of the Google Sheets spreadsheet to retrieve
- `range` — The range to retrieve in A1 notation. Format: '<sheet_name>'!<range>. Examples: "'Sheet1'", "'Sheet1'!A1:D10", "'My Sheet'!A1:B2". Sheet names should always be quoted (single quotes). If the sheet name contains single quotes, escape them by doubling: "'John''s Sheet'!A1:B2". If not specified, defaults to the first sheet.
- `includeEffective` — Include the effectiveValue (computed value) for each cell in the response. For cells with formulas, this is the calculated value. For cells with literals, this is the same as the userEnteredValue. Only request this when absolutely necessary.
- `includeEntered` — Include the userEnteredValue (what the user typed) for each cell in the response. Only request this when absolutely necessary.

---

### 10. google_drive_update_spreadsheet

**Description:** Perform update operations on a Google Sheets spreadsheet. Supports: (1) updating cell values with A1 notation, (2) adding new sheets, and (3) updating sheet properties (title or position).

**Arguments:**

- `operation`

---

### 11. google_drive_move_file

**Description:** Move a file to a different folder and/or rename it in Google Drive. You can move, rename, or do both in a single operation.

**Arguments:**

- `fileId` — The ID of the Google Drive file to move or rename.
- `targetParentId` — The ID of the folder where the file should be moved to as its new parent.
- `newFileName` — The new name for the file.

---

### 12. google_drive_upload_file

**Description:** Upload a file from the agent file system to Google Drive. The file must be located in the /agent/ file system. This tool reads the file and uploads it to the user's Google Drive. You can optionally convert local files (DOCX, XLSX, PPTX, etc.) to their Google Workspace equivalents (Docs, Sheets, Slides) using uploadMimeType.

**Arguments:**

- `filePath` — The path to the file to upload. Must start with /agent/ prefix. Example: /agent/home/document.pdf
- `parentFolderId` — Optional folder ID where the file should be uploaded in Google Drive.
- `fileIdToReplace` — Existing file ID in Google Drive to replace with this upload.
- `uploadMimeType` — Optional MIME type to convert the uploaded file to a Google Workspace format. Common types: "application/vnd.google-apps.document" (Google Docs), "application/vnd.google-apps.spreadsheet" (Google Sheets), "application/vnd.google-apps.presentation" (Google Slides). Useful when uploading locally edited files (DOCX, XLSX, PPTX, etc.) to their Google equivalents.

---

### 13. google_drive_download_file

**Description:** Download a file from Google Drive to the agent file system. The file will be saved in /agent/home/ directory. For Google Workspace files (Docs, Sheets, Slides, etc.), you can optionally export them to various formats using exportMimeType (see https://developers.google.com/workspace/drive/api/guides/ref-export-formats for supported formats). Regular files are downloaded as-is.

**Arguments:**

- `fileId` — The ID of the Google Drive file to download
- `destinationPath` — Optional path in /agent/home/ where the file should be saved. If not provided, defaults to /agent/home/{fileName} using the file name from Google Drive. Example: /agent/home/my-document.pdf
- `exportMimeType` — Optional MIME type to export the file as. Only applicable to Google Workspace files (Docs, Sheets, Slides, etc.). For supported export formats, see: https://developers.google.com/workspace/drive/api/guides/ref-export-formats. Regular files are downloaded as-is and this parameter is ignored.
