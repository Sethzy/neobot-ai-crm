# Viktor Tool Reference — Full SDK Definitions

Auto-generated from `/work/sdk/tools/*.py`

---


## `browser_tools` (3 tools)

### `browser_create_session`

```python
async def browser_create_session(starting_url: str | None = None, viewport_width: int = 1024, viewport_height: int = 768, enable_proxies: bool = False, timeout_seconds: int = 300) -> BrowserCreateSessionResponse:
    """Create a new Browserbase session and return connection info.

    Args:
        starting_url: Optional URL to open after connecting in the sandbox
        viewport_width: Viewport width in pixels
        viewport_height: Viewport height in pixels
        enable_proxies: Enable Browserbase proxies
        timeout_seconds: Session timeout in seconds (keep_alive)

    Returns:
        BrowserCreateSessionResponse: Response with session info for connecting.
    """
    return BrowserCreateSessionResponse.model_validate(await get_client().call("browser_create_session", starting_url=starting_url, viewport_width=viewport_width, viewport_height=viewport_height, enable_proxies=enable_proxies, timeout_seconds=timeout_seconds))
```

### `browser_download_files`

```python
async def browser_download_files(session_id: str, target_directory: str = "/work/downloads") -> BrowserDownloadFilesResponse:
    """Download files from a browser session to the sandbox.

    Args:
        session_id: Browserbase session ID
        target_directory: Target directory in sandbox for downloaded files

    Returns:
        BrowserDownloadFilesResponse: Response from downloading files.
    """
    return BrowserDownloadFilesResponse.model_validate(await get_client().call("browser_download_files", session_id=session_id, target_directory=target_directory))
```

### `browser_close_session`

```python
async def browser_close_session(session_id: str) -> BrowserCloseSessionResponse:
    """Close a browser session to release resources.

    Args:
        session_id: Browserbase session ID

    Returns:
        BrowserCloseSessionResponse: Response from closing a session.
    """
    return BrowserCloseSessionResponse.model_validate(await get_client().call("browser_close_session", session_id=session_id))
```

#### Response Models

```python
class BrowserCreateSessionResponse(BaseModel):
    """Response with session info for connecting."""

    session_id: str | None = None  # Browserbase session ID
    connect_url: str | None = None  # CDP connect URL containing a session signingKey (safe for sandbox)
    live_view_url: str | None = None  # Live session URL for viewing the browser
    recording_url: str | None = None  # Browserbase session recording URL
    error: str | None = None  # Error message if failed
```

```python
class BrowserDownloadFilesResponse(BaseModel):
    """Response from downloading files."""

    files: list[str]  # Downloaded file paths
    error: str | None = None  # Error message if failed
```

```python
class BrowserCloseSessionResponse(BaseModel):
    """Response from closing a session."""

    success: bool  # Whether the close succeeded
    error: str | None = None  # Error message if failed
```


## `default_tools` (16 tools)

### `bash`

```python
async def bash(command: str, timeout: int | None = None, description: str | None = None) -> BashResponse:
    """Executes bash commands in a persistent shell session with optional timeout.

    Args:
        command: The command to execute
        timeout: Optional timeout in milliseconds (max 600000)
        description: Clear, concise description of what this command does in 5-10 words, in active voice. Examples: 'List files in current directory', 'Show working tree status', 'Install package dependencies'

    Returns:
        BashResponse: Response from bash command execution.
    """
    return BashResponse.model_validate(await get_client().call("bash", command=command, timeout=timeout, description=description))
```

### `file_edit`

```python
async def file_edit(file_path: str, old_string: str, new_string: str, replace_all: bool = False) -> FileEditResponse:
    """Performs exact string replacements in files.

    Args:
        file_path: The absolute path to the file to modify
        old_string: The text to replace
        new_string: The text to replace it with (must be different from old_string)
        replace_all: Replace all occurrences of old_string (default false)

    Returns:
        FileEditResponse: Response from file edit operation.
    """
    return FileEditResponse.model_validate(await get_client().call("file_edit", file_path=file_path, old_string=old_string, new_string=new_string, replace_all=replace_all))
```

### `file_read`

```python
async def file_read(file_path: str, offset: int | None = None, limit: int | None = None) -> FileReadResponse:
    """Reads files from the local filesystem, including text, images, PDFs, and Jupyter notebooks.

    Args:
        file_path: The absolute path to the file to read
        offset: The line number to start reading from. Only provide if the file is too large to read at once
        limit: The number of lines to read. Only provide if the file is too large to read at once. Note: output is truncated to ~32KB regardless of limit, so for files with large lines (like JSONL), use a smaller limit (e.g., 10-20 lines)

    Returns:
        FileReadResponse: Response from file read operation.
    """
    return FileReadResponse.model_validate(await get_client().call("file_read", file_path=file_path, offset=offset, limit=limit))
```

### `file_write`

```python
async def file_write(file_path: str, content: str) -> FileWriteResponse:
    """Writes a file to the local filesystem, overwriting if it exists.

    Args:
        file_path: The absolute path to the file to write (must be absolute, not relative)
        content: The content to write to the file

    Returns:
        FileWriteResponse: Response from file write operation.
    """
    return FileWriteResponse.model_validate(await get_client().call("file_write", file_path=file_path, content=content))
```

### `glob`

```python
async def glob(pattern: str, path: str | None = None) -> GlobResponse:
    """Fast file pattern matching that works with any codebase size.

    Args:
        pattern: The glob pattern to match files against
        path: The directory to search in. If not specified, the current working directory will be used. Must be a valid directory path if provided.

    Returns:
        GlobResponse: Response from glob pattern matching.
    """
    return GlobResponse.model_validate(await get_client().call("glob", pattern=pattern, path=path))
```

### `grep`

```python
async def grep(pattern: str, path: str | None = None, glob: str | None = None, output_mode: Literal['content', 'files_with_matches', 'count'] | None = None, context_before: int | None = None, context_after: int | None = None, context: int | None = None, line_numbers: bool | None = None, case_insensitive: bool | None = None, file_type: str | None = None, head_limit: int | None = None, skip_offset: int | None = None, multiline: bool | None = None) -> GrepResponse:
    """Searches for a regular expression pattern in files.

    Args:
        pattern: The regular expression pattern to search for in file contents
        path: File or directory to search in. Defaults to current working directory.
        glob: Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}")
        output_mode: Output mode: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), "files_with_matches" shows file paths (supports head_limit), "count" shows match counts (supports head_limit). Defaults to "files_with_matches".
        context_before: Number of lines to show before each match (rg -B). Requires output_mode: "content".
        context_after: Number of lines to show after each match (rg -A). Requires output_mode: "content".
        context: Number of lines to show before and after each match (rg -C). Requires output_mode: "content".
        line_numbers: Show line numbers in output (rg -n). Requires output_mode: "content". Defaults to true.
        case_insensitive: Case insensitive search (rg -i)
        file_type: File type to search (rg --type). Common types: js, py, rust, go, java, etc.
        head_limit: Limit output to first N lines/entries, equivalent to "| head -N". Works across all output modes. Defaults to 0 (unlimited).
        skip_offset: Skip first N lines/entries before applying head_limit. Works across all output modes. Defaults to 0.
        multiline: Enable multiline mode where . matches newlines and patterns can span lines. Default: false.

    Returns:
        GrepResponse: Response from grep search.
    """
    return GrepResponse.model_validate(await get_client().call("grep", pattern=pattern, path=path, glob=glob, output_mode=output_mode, context_before=context_before, context_after=context_after, context=context, line_numbers=line_numbers, case_insensitive=case_insensitive, file_type=file_type, head_limit=head_limit, skip_offset=skip_offset, multiline=multiline))
```

### `view_image`

```python
async def view_image(file_path: str) -> ViewImageResponse:
    """View an image file from the local filesystem. The image will be displayed to the AI for visual analysis.

    Args:
        file_path: The absolute path to the image file to view (supports jpg, jpeg, png, gif, webp)

    Returns:
        ViewImageResponse: Response from view image operation.
    """
    return ViewImageResponse.model_validate(await get_client().call("view_image", file_path=file_path))
```

### `coworker_slack_history`

```python
async def coworker_slack_history(channel_ids: list[str], range: str = "3 months", end_date: str = "today", latest_ts: str | None = None, messages_per_channel: int = 999, include_threads: bool = True) -> CoworkerSlackHistoryResponse:
    """Retrieve Slack channel history to workspace files.

    Fetches message history from specified channels for a date range,
    including thread replies by default, and stores them in workspace files at
    /slack/{channel_name}/channel.log with threads in /slack/{channel_name}/threads/.
    If run while files already exist, merges new messages with existing ones.
    Files are automatically kept up-to-date via webhooks for new messages, edits, and deletes.

    Args:
        channel_ids: List of channel IDs to backfill
        range: How far back to fetch: '1 week', '30 days', '3 months', '1 year'
        end_date: End date: 'today' or 'YYYY-MM-DD' format
        latest_ts: Optional precise latest Slack timestamp override for continuation rounds (e.g. '1700000000.123456')
        messages_per_channel: Max messages to fetch per channel (if limit reached, response includes truncation info)
        include_threads: Whether to fetch full thread replies (default: True)

    Returns:
        CoworkerSlackHistoryResponse: Response from retrieving Slack history.
    """
    return CoworkerSlackHistoryResponse.model_validate(await get_client().call("coworker_slack_history", channel_ids=channel_ids, range=range, end_date=end_date, latest_ts=latest_ts, messages_per_channel=messages_per_channel, include_threads=include_threads))
```

### `coworker_send_slack_message`

```python
async def coworker_send_slack_message(channel_id: str, blocks: list[dict], reflection: str, do_send: bool, thread_ts: str | None = None, message_type: Literal['regular', 'permission_request'] = "regular", permission_request_draft_ids: list[str] | None = None, detailed_approval_context: str | None = None, replace_message_ts: str | None = None) -> CoworkerSendSlackMessageResponse:
    """Send a Slack message using Block Kit blocks.

    Block types: section, header, divider, context, actions, image. @display name will be converted to <@USER_ID> format.

    Example with markdown, button, and image:
    [
        {"type": "section", "text": {"type": "mrkdwn", "text": "Hey @peter, please review this *report*"}},
        {"type": "image", "image_url": "https://example.com/img.png", "alt_text": "description"},
        {"type": "actions", "elements": [{"type": "button", "text": {"type": "plain_text", "text": "Click"}, "action_id": "btn1"}]}
    ]

    Args:
        channel_id: Channel ID to send to
        blocks: Slack Block Kit blocks
        reflection: Before sending, reflect: Is this message helpful? Is the tone appropriate? Is the content accurate?
        do_send: After reflection, set True to send or False to skip. Allows reconsidering before sending
        thread_ts: Thread timestamp to reply to
        message_type: 'regular' for normal messages, 'permission_request' to add Approve/Reject buttons for drafts approval Allowed values: 'regular', 'permission_request'
        permission_request_draft_ids: Required when message_type='permission_request'. The draft IDs that will be approved/rejected
        detailed_approval_context: Additional context shown when user approves. Helps agent understand what was approved
        replace_message_ts: If set, updates an existing message instead of posting new. Use the message_ts from a previous send

    Returns:
        CoworkerSendSlackMessageResponse: Response from sending Slack message.
    """
    return CoworkerSendSlackMessageResponse.model_validate(await get_client().call("coworker_send_slack_message", channel_id=channel_id, thread_ts=thread_ts, blocks=blocks, message_type=message_type, permission_request_draft_ids=permission_request_draft_ids, detailed_approval_context=detailed_approval_context, replace_message_ts=replace_message_ts, reflection=reflection, do_send=do_send))
```

### `coworker_slack_react`

```python
async def coworker_slack_react(channel_id: str, message_ts: str, emoji: str) -> CoworkerSlackReactResponse:
    """Add an emoji reaction to a Slack message.

    Args:
        channel_id: Channel ID
        message_ts: Message timestamp
        emoji: Emoji name without colons (e.g., 'eyes')

    Returns:
        CoworkerSlackReactResponse: Response from adding reaction.
    """
    return CoworkerSlackReactResponse.model_validate(await get_client().call("coworker_slack_react", channel_id=channel_id, message_ts=message_ts, emoji=emoji))
```

### `coworker_delete_slack_message`

```python
async def coworker_delete_slack_message(channel_id: str, message_ts: str) -> CoworkerDeleteSlackMessageResponse:
    """Delete a Slack message sent by the bot.

    Args:
        channel_id: Channel ID
        message_ts: Timestamp of message to delete

    Returns:
        CoworkerDeleteSlackMessageResponse: Response from deleting Slack message.
    """
    return CoworkerDeleteSlackMessageResponse.model_validate(await get_client().call("coworker_delete_slack_message", channel_id=channel_id, message_ts=message_ts))
```

### `coworker_upload_to_slack`

```python
async def coworker_upload_to_slack(file_path: str) -> CoworkerUploadToSlackResponse:
    """Upload a local file to Slack's file storage and get a permalink, that can be used in a coworker_send_slack_message block to share it with users.

    Args:
        file_path: Local file path to upload

    Returns:
        CoworkerUploadToSlackResponse: Response from file upload.
    """
    return CoworkerUploadToSlackResponse.model_validate(await get_client().call("coworker_upload_to_slack", file_path=file_path))
```

### `coworker_download_from_slack`

```python
async def coworker_download_from_slack(slack_file_url: str, filename: str | None = None) -> CoworkerDownloadFromSlackResponse:
    """Download a Slack file to local storage.

    Args:
        slack_file_url: Slack file URL
        filename: Optional filename

    Returns:
        CoworkerDownloadFromSlackResponse: Response from file download.
    """
    return CoworkerDownloadFromSlackResponse.model_validate(await get_client().call("coworker_download_from_slack", slack_file_url=slack_file_url, filename=filename))
```

### `create_thread`

```python
async def create_thread(path: str, title: str, initial_prompt: str, dependent_paths: list[str] | None = None) -> CreateThreadResponse:
    """Creates a new thread for ad-hoc work. Always starts execution immediately.

    Args:
        path: Path for the thread, e.g. '/slack/general/budget_question'
        title: Title for the thread
        initial_prompt: Initial prompt/context for the thread
        dependent_paths: Paths to wait for before starting

    Returns:
        CreateThreadResponse: 
    """
    return CreateThreadResponse.model_validate(await get_client().call("create_thread", path=path, title=title, initial_prompt=initial_prompt, dependent_paths=dependent_paths))
```

### `send_message_to_thread`

```python
async def send_message_to_thread(content: str, thread_id: str | None = None, agent_runs_path: str | None = None, trigger_reply: bool = True) -> SendMessageToThreadResponse:
    """Sends a message to another agent thread and optionally triggers a reply.

    Use this to forward messages to threads with more context - especially when users
    reply outside a Slack thread and you need to route their response to the original
    conversation. Find the target via `[origin:...]` tags in Slack logs. Use
    `trigger_reply=True` to reactivate that thread's agent so it can respond with full context.

    Args:
        content: The message content to send
        thread_id: The thread ID to send the message to
        agent_runs_path: Alternative: the agent_runs path from an [origin:...] tag in Slack logs (e.g., /agent_runs/slack/Toni/threads/1768561579_387979)
        trigger_reply: Whether to trigger an agent reply after sending the message

    Returns:
        SendMessageToThreadResponse: 
    """
    return SendMessageToThreadResponse.model_validate(await get_client().call("send_message_to_thread", thread_id=thread_id, agent_runs_path=agent_runs_path, content=content, trigger_reply=trigger_reply))
```

### `wait_for_paths`

```python
async def wait_for_paths(paths: list[str], timeout_minutes: int = 30) -> WaitForPathsResponse:
    """Wait for specified paths to finish execution. Works for cron paths (waits for any running thread) and thread paths.

    Args:
        paths: List of paths to wait for
        timeout_minutes: Maximum minutes to wait

    Returns:
        WaitForPathsResponse: Response from waiting for paths.
    """
    return WaitForPathsResponse.model_validate(await get_client().call("wait_for_paths", paths=paths, timeout_minutes=timeout_minutes))
```

#### Response Models

```python
class BashResponse(BaseModel):
    """Response from bash command execution."""

    content: str  # Command output (stdout and/or stderr)
    exit_code: int  # Exit code of the command
```

```python
class FileEditResponse(BaseModel):
    """Response from file edit operation."""

    content: str  # Status message
    success: bool  # Whether the edit succeeded
```

```python
class FileReadResponse(BaseModel):
    """Response from file read operation."""

    content: str  # File content or error message
```

```python
class FileWriteResponse(BaseModel):
    """Response from file write operation."""

    content: str  # Status message
    success: bool  # Whether the write succeeded
```

```python
class GlobResponse(BaseModel):
    """Response from glob pattern matching."""

    content: str  # Matched file paths, one per line
```

```python
class GrepResponse(BaseModel):
    """Response from grep search."""

    content: str  # Search results
```

```python
class ViewImageResponse(BaseModel):
    """Response from view image operation."""

    content: str  # Status message about the image
    error: str | None = None  # Error message if failed
```

```python
class CoworkerSlackHistoryResponse(BaseModel):
    """Response from retrieving Slack history."""

    channels_stored: int  # Number of channels successfully stored
    total_messages: int  # Total messages stored across all channels
    files_by_channel: dict[str, int]  # Count of files created per channel
    thread_parents_by_channel: dict[str, list[str]]  # Thread parent timestamps discovered in channel history, keyed by channel ID
    truncated: list[dict]  # Channels that hit message limit. Each has: channel_id, name, oldest_fetched, oldest_fetched_ts, backfill_end_ts, backfill_end_date
    backfill_hint: str | None = None  # If truncated, shows how to fetch older history with latest_ts continuation
    errors: list[str]  # Any errors encountered
```

```python
class CoworkerSendSlackMessageResponse(BaseModel):
    """Response from sending Slack message."""

    success: bool
    message_ts: str | None = None  # Timestamp of sent message
    error: str | None = None  # Error if send failed
    modifications: str | None = None  # Info about automatic modifications made (action_ids, file uploads)
```

```python
class CoworkerSlackReactResponse(BaseModel):
    """Response from adding reaction."""

    success: bool
    error: str | None = None
```

```python
class CoworkerDeleteSlackMessageResponse(BaseModel):
    """Response from deleting Slack message."""

    success: bool
    error: str | None = None
```

```python
class CoworkerUploadToSlackResponse(BaseModel):
    """Response from file upload."""

    permalink: str | None = None
    info: str | None = None
    error: str | None = None
```

```python
class CoworkerDownloadFromSlackResponse(BaseModel):
    """Response from file download."""

    file_path: str | None = None  # Local file path where the file was saved
    error: str | None = None
```

```python
class CreateThreadResponse(BaseModel):
    status: str
    thread_id: str | None = None
    path: str | None = None
```

```python
class SendMessageToThreadResponse(BaseModel):
    status: str
    message_id: str | None = None
```

```python
class WaitForPathsResponse(BaseModel):
    """Response from waiting for paths."""

    waited_seconds: int  # How long we waited in seconds
    paths_waited_for: list[str]  # Which paths we waited for
    timed_out: bool  # Whether we timed out waiting
```


## `docs_tools` (2 tools)

### `resolve_library_id`

```python
async def resolve_library_id(library_name: str, query: str) -> ResolveLibraryIdResponse:
    """Resolve a library/API/framework name to a Context7-compatible ID.

    Use this tool first to find the correct ID before fetching documentation.
    The ID is required for the query_library_docs tool.

    Works with many types of documentation sources:
    - Libraries and packages (react, pandas, lodash)
    - Frameworks (next.js, fastapi, django)
    - APIs and services (stripe, twilio, openai)
    - Databases (postgresql, mongodb, redis)
    - Tools and CLIs (docker, kubernetes, git)

    Returns matching results ranked by relevance to your query.

    Args:
        library_name: The name of the library, framework, API, or service to search for (e.g., 'react', 'stripe api', 'postgresql', 'kubernetes')
        query: Your question or task - used to rank results by relevance (e.g., 'authentication with JWT', 'how to create a payment intent')

    Returns:
        ResolveLibraryIdResponse: Response from library ID resolution.
    """
    return ResolveLibraryIdResponse.model_validate(await get_client().call("resolve_library_id", library_name=library_name, query=query))
```

### `query_library_docs`

```python
async def query_library_docs(library_id: str, query: str) -> QueryLibraryDocsResponse:
    """Fetch documentation using a Context7 library ID.

    Use resolve_library_id first to get the library_id, then use this tool
    to fetch relevant documentation and code examples.

    You can also use a library ID directly if you already know it
    (e.g., '/vercel/next.js', '/stripe/stripe-node').

    Args:
        library_id: The Context7-compatible ID (e.g., '/vercel/next.js', '/stripe/stripe-node'). Get this from resolve_library_id.
        query: What you want to know. Be specific - e.g., 'How to use useEffect cleanup functions' or 'How to create a payment intent'

    Returns:
        QueryLibraryDocsResponse: Response from documentation query.
    """
    return QueryLibraryDocsResponse.model_validate(await get_client().call("query_library_docs", library_id=library_id, query=query))
```

#### Response Models

```python
class ResolveLibraryIdResponse(BaseModel):
    """Response from library ID resolution."""

    library_id: str | None = None  # The resolved Context7-compatible library ID (e.g., '/vercel/next.js'). Use this with query_library_docs.
    library_name: str | None = None  # The display name of the resolved library
    description: str | None = None  # Description of the library
    alternatives: list[dict] | None = None  # Alternative matching libraries if multiple were found
    error: str | None = None  # Error message if resolution failed
```

```python
class QueryLibraryDocsResponse(BaseModel):
    """Response from documentation query."""

    library_id: str | None = None  # The library ID that was queried
    documentation: str | None = None  # The fetched documentation content with code examples
    error: str | None = None  # Error message if the query failed
```


## `email_tools` (2 tools)

### `coworker_send_email`

```python
async def coworker_send_email(to: list[str], subject: str, body: str, cc: list[str] = None, bcc: list[str] = None, reply_to_email_id: str | None = None, attachments: list[str] = None) -> CoworkerSendEmailResponse:
    """Send an email from the coworker's email address.

    The email will be sent via the configured email service and a copy
    will be saved to /work/emails/sent/.

    Args:
        to: Recipient email addresses
        subject: Email subject line
        body: Email body in markdown format
        cc: CC recipients
        bcc: BCC recipients
        reply_to_email_id: Email ID to reply to (will set In-Reply-To header and prepend Re: to subject)
        attachments: List of local file paths to attach (from /work/)

    Returns:
        CoworkerSendEmailResponse: Response from sending an email.
    """
    return CoworkerSendEmailResponse.model_validate(await get_client().call("coworker_send_email", to=to, cc=cc, bcc=bcc, subject=subject, body=body, reply_to_email_id=reply_to_email_id, attachments=attachments))
```

### `coworker_get_attachment`

```python
async def coworker_get_attachment(internal_url: str, filename: str, save_path: str | None = None) -> CoworkerGetAttachmentResponse:
    """Download an email attachment to local storage.

    Attachments in received emails have an `_internal_url` field that requires
    API authentication. Pass the `_internal_url` and `filename` from the email
    frontmatter to download the attachment.

    Args:
        internal_url: The _internal_url from the email attachment metadata
        filename: Filename to save as (e.g. 'report.pdf')
        save_path: Custom save path (default: /work/emails/attachments/{filename})

    Returns:
        CoworkerGetAttachmentResponse: Response from downloading an attachment.
    """
    return CoworkerGetAttachmentResponse.model_validate(await get_client().call("coworker_get_attachment", internal_url=internal_url, filename=filename, save_path=save_path))
```

#### Response Models

```python
class CoworkerSendEmailResponse(BaseModel):
    """Response from sending an email."""

    success: bool
    email_id: str | None = None  # ID of sent email
    error: str | None = None  # Error message if send failed
```

```python
class CoworkerGetAttachmentResponse(BaseModel):
    """Response from downloading an attachment."""

    file_path: str | None = None  # Path where attachment was saved
    error: str | None = None  # Error message if download failed
```


## `scheduled_crons` (4 tools)

### `create_agent_cron`

```python
async def create_agent_cron(path: str, description: str, cron: str, title: str | None = None, model: str | None = None, dependent_paths: list[str] | None = None, condition_script_path: str | None = None, slack_sender_name: str | None = None, trigger_now: bool = False) -> dict:
    """Creates a scheduled cron job that runs an agent with a prompt.

    Args:
        path: Path for the cron job, e.g. '/reports/weekly'
        description: Task prompt/instructions to execute on each run.
        cron: Cron expression for scheduling
        title: Short title for the cron job
        model: Optional model override for this cron. Must be a valid model name from ai_configs (for example: 'claude-opus-4-6#ReasoningLevel:very_high', 'gpt-5.4', 'claude-sonnet-4-6', 'gemini-3-flash-preview').
        dependent_paths: Paths to wait for before each run. Can be cron paths or thread paths.
        condition_script_path: Optional path to a Python script in sandbox that determines whether this cron should run. Exit code 0 = run, non-zero = skip.
        slack_sender_name: Optional custom Slack display name to use when this cron's threads send Slack messages (e.g. 'Viktor Reports'). Pass empty string to clear.
        trigger_now: Whether to immediately run this cron job.

    Returns:
        Tool execution result
    """
    return await get_client().call("create_agent_cron", path=path, title=title, description=description, cron=cron, model=model, dependent_paths=dependent_paths, condition_script_path=condition_script_path, slack_sender_name=slack_sender_name, trigger_now=trigger_now)
```

### `create_script_cron`

```python
async def create_script_cron(path: str, script_path: str, cron: str, title: str | None = None, dependent_paths: list[str] | None = None, condition_script_path: str | None = None, trigger_now: bool = False) -> dict:
    """Creates a scheduled cron job that runs a Python script directly.

    Args:
        path: Path for the cron job, e.g. '/cleanup/logs'
        script_path: Path to Python script in sandbox, e.g. '/work/scripts/cleanup_logs.py'
        cron: Cron expression for scheduling
        title: Short title for the cron job
        dependent_paths: Paths to wait for before each run. Can be cron paths or thread paths.
        condition_script_path: Optional path to a Python script in sandbox that determines whether this cron should run. Exit code 0 = run, non-zero = skip.
        trigger_now: Whether to immediately run this cron job.

    Returns:
        Tool execution result
    """
    return await get_client().call("create_script_cron", path=path, title=title, script_path=script_path, cron=cron, dependent_paths=dependent_paths, condition_script_path=condition_script_path, trigger_now=trigger_now)
```

### `delete_cron`

```python
async def delete_cron(path: str | None = None, cron_id: str | None = None) -> DeleteCronResponse:
    """Deletes a scheduled cron job permanently. Requires either path or cron_id.

    Args:
        path: Path of the cron job to delete
        cron_id: ID of the cron job to delete

    Returns:
        DeleteCronResponse: Response from deleting a cron job.
    """
    return DeleteCronResponse.model_validate(await get_client().call("delete_cron", path=path, cron_id=cron_id))
```

### `trigger_cron`

```python
async def trigger_cron(path: str, extra_prompt: str | None = None) -> TriggerCronResponse:
    """Manually trigger a cron job to run immediately, optionally with additional context.

    Args:
        path: Path of the cron job to trigger
        extra_prompt: Optional additional context or instructions to include when triggering.

    Returns:
        TriggerCronResponse: Response from triggering a cron job.
    """
    return TriggerCronResponse.model_validate(await get_client().call("trigger_cron", path=path, extra_prompt=extra_prompt))
```

#### Response Models

```python
class DeleteCronResponse(BaseModel):
    """Response from deleting a cron job."""

    status: str
    deleted: bool
```

```python
class TriggerCronResponse(BaseModel):
    """Response from triggering a cron job."""

    status: str
    thread_id: str | None = None
    thread_path: str | None = None
```


## `slack_admin_tools` (8 tools)

### `coworker_list_slack_channels`

```python
async def coworker_list_slack_channels() -> CoworkerListSlackChannelsResponse:
    """List all Slack channels with their access status.

    Returns:
        CoworkerListSlackChannelsResponse: Response listing Slack channels.
    """
    return CoworkerListSlackChannelsResponse.model_validate(await get_client().call("coworker_list_slack_channels", ))
```

### `coworker_join_slack_channels`

```python
async def coworker_join_slack_channels(channel_ids: list[str]) -> dict:
    """Join one or more Slack conversations.

    Supports public channels and MPIM group DMs.
    Private channels still require the user to invite you.

    NOTE: Creates a draft. Request user approval, then call submit_draft(draft_id, approval_code).

    Args:
        channel_ids: List of conversation IDs (e.g., ['C01ABC123', 'G01DEF456']) to join/open

    Returns:
        dict: Draft response with "content" containing the draft_id.
    """
    return await get_client().call("coworker_join_slack_channels", channel_ids=channel_ids)
```

### `coworker_open_slack_conversation`

```python
async def coworker_open_slack_conversation(user_ids: list[str]) -> CoworkerOpenSlackConversationResponse:
    """Open a multi-person direct message conversation.

    Creates (or re-opens) a group DM with the specified Slack users.
    Returns the conversation ID so you can send messages to it.

    Args:
        user_ids: List of Slack user IDs (e.g., ['U01ABC123', 'U02DEF456']) to include in the conversation

    Returns:
        CoworkerOpenSlackConversationResponse: Response from opening a multi-person conversation.
    """
    return CoworkerOpenSlackConversationResponse.model_validate(await get_client().call("coworker_open_slack_conversation", user_ids=user_ids))
```

### `coworker_leave_slack_channels`

```python
async def coworker_leave_slack_channels(channel_ids: list[str]) -> dict:
    """Leave one or more Slack channels.

    Works for channels where the bot is currently a member.

    NOTE: Creates a draft. Request user approval, then call submit_draft(draft_id, approval_code).

    Args:
        channel_ids: List of channel IDs (e.g., ['C01ABC123', 'C02DEF456']) to leave

    Returns:
        dict: Draft response with "content" containing the draft_id.
    """
    return await get_client().call("coworker_leave_slack_channels", channel_ids=channel_ids)
```

### `coworker_list_slack_users`

```python
async def coworker_list_slack_users(include_bots: bool = False) -> CoworkerListSlackUsersResponse:
    """List users in the Slack workspace.

    Args:
        include_bots: Whether to include bot users in the results

    Returns:
        CoworkerListSlackUsersResponse: Response listing Slack users.
    """
    return CoworkerListSlackUsersResponse.model_validate(await get_client().call("coworker_list_slack_users", include_bots=include_bots))
```

### `coworker_invite_slack_user_to_team`

```python
async def coworker_invite_slack_user_to_team(slack_user_id: str, message: str = "") -> CoworkerInviteSlackUserToTeamResponse:
    """Invite a Slack user to join the team by sending them a DM with an invite link.

    Args:
        slack_user_id: The Slack user ID (e.g., U123ABC)
        message: Optional personalized message

    Returns:
        CoworkerInviteSlackUserToTeamResponse: Response from inviting a Slack user to the team.
    """
    return CoworkerInviteSlackUserToTeamResponse.model_validate(await get_client().call("coworker_invite_slack_user_to_team", slack_user_id=slack_user_id, message=message))
```

### `coworker_get_slack_reactions`

```python
async def coworker_get_slack_reactions(channel_id: str, message_ts: str) -> CoworkerGetSlackReactionsResponse:
    """Get reactions for a Slack message by timestamp.

    Args:
        channel_id: Channel ID (or user ID for DMs)
        message_ts: Timestamp of message to fetch reactions for

    Returns:
        CoworkerGetSlackReactionsResponse: Response from fetching Slack reactions.
    """
    return CoworkerGetSlackReactionsResponse.model_validate(await get_client().call("coworker_get_slack_reactions", channel_id=channel_id, message_ts=message_ts))
```

### `coworker_report_issue`

```python
async def coworker_report_issue(text: str) -> dict:
    """Report a product issue to the internal team Slack.

    SDK-only. Use this when you find a real bug, broken workflow, or repeated
    product issue that the team should investigate.

    NOTE: Creates a draft. Request user approval, then call submit_draft(draft_id, approval_code).

    Args:
        text: Describe what went wrong, impact, and any useful repro/context.

    Returns:
        dict: Draft response with "content" containing the draft_id.
    """
    return await get_client().call("coworker_report_issue", text=text)
```

#### Response Models

```python
class CoworkerListSlackChannelsResponse(BaseModel):
    """Response listing Slack channels."""

    info: str
    channels: list[dict]  # List of channels with id, name, is_private, bot_has_access
```

```python
class CoworkerOpenSlackConversationResponse(BaseModel):
    """Response from opening a multi-person conversation."""

    success: bool
    channel_id: str | None = None  # The conversation ID (e.g., G01ABC123) — use this to send messages
    already_open: bool  # Whether the conversation already existed
    error: str | None = None  # Error if open failed
```

```python
class CoworkerListSlackUsersResponse(BaseModel):
    """Response listing Slack users."""

    users: list[dict]  # List of users with id, name, real_name, display_name, email, is_bot, is_admin, has_viktor_account
```

```python
class CoworkerInviteSlackUserToTeamResponse(BaseModel):
    """Response from inviting a Slack user to the team."""

    success: bool
    error: str | None = None  # Error if invite failed
    invite_id: str | None = None  # Created team invite ID
    invited_email: str | None = None  # Email of invited user
    invited_name: str | None = None  # Display name of invited user
```

```python
class CoworkerGetSlackReactionsResponse(BaseModel):
    """Response from fetching Slack reactions."""

    found: bool  # Whether the message was found
    reactions: list[dict]  # List of reactions with name, count, and optional users
    error: str | None = None  # Error if fetch failed
    info: str | None = None  # Extra info (e.g., no reactions)
```


## `thread_orchestration_tools` (2 tools)

### `list_running_paths`

```python
async def list_running_paths() -> ListRunningPathsResponse:
    """List all currently running threads.

    Returns:
        ListRunningPathsResponse: Response listing running paths.
    """
    return ListRunningPathsResponse.model_validate(await get_client().call("list_running_paths", ))
```

### `get_path_info`

```python
async def get_path_info(path: str) -> GetPathInfoResponse:
    """Get detailed information about a path. Works for cron jobs and threads.

    Args:
        path: The path to get info for

    Returns:
        GetPathInfoResponse: Response for getting path info.
    """
    return GetPathInfoResponse.model_validate(await get_client().call("get_path_info", path=path))
```

#### Response Models

```python
class PathInfo(BaseModel):
    """Information about any path - can be a cron job or thread."""

    path_type: Literal['cron', 'thread', 'not_found']
    cron: dict | None = None
    thread: dict | None = None
```

```python
class CronInfo(BaseModel):
    """Information about a cron job."""

    id: str
    path: str
    title: str
    description: str | None = None
    slack_sender_name: str | None = None
    script_path: str | None = None
    condition_script_path: str | None = None
    execution_type: str
    model: str | None = None
    cron: str
    dependent_paths: list[str] | None = None
    deleted: bool
    created_at: str
    updated_at: str
    threads: list[dict]  # Threads under this cron job
    depth: int
```

```python
class ThreadInfo(BaseModel):
    """Information about a thread."""

    id: str
    title: str | None = None
    status: str | None = None
    timestamp: str | None = None
    updated: str | None = None
    path: str | None = None
    thread_type: str | None = None
```

```python
class ListRunningPathsResponse(BaseModel):
    """Response listing running paths."""

    running_paths: list[str]  # List of paths currently running
```

```python
class GetPathInfoResponse(BaseModel):
    """Response for getting path info."""

    info: PathInfo | None = None
    error: str | None = None
```


## `utils_tools` (5 tools)

### `file_to_markdown`

```python
async def file_to_markdown(file_path: str) -> FileToMarkdownResponse:
    """Convert a file to markdown format.

    Supported formats: .pdf, .docx, .xlsx, .xls, .pptx, .ppt, .rtf, .odt, .ods, .odp

    Args:
        file_path: The absolute path to the file to convert

    Returns:
        FileToMarkdownResponse: Response from file to markdown conversion.
    """
    return FileToMarkdownResponse.model_validate(await get_client().call("file_to_markdown", file_path=file_path))
```

### `ai_structured_output`

```python
async def ai_structured_output(prompt: str, output_schema: dict, input_text: str | None = None, intelligence_level: Literal['fast', 'balanced', 'smart'] = "fast") -> AiStructuredOutputResponse:
    """Call an AI model and get a structured JSON response matching your schema.

    Use this tool when you need to:
    - Extract structured data from text (e.g., parse entities, extract fields)
    - Generate content in a specific format (e.g., JSON with required fields)
    - Classify or categorize content into predefined categories
    - Transform unstructured text into structured data
    - Generate AI summaries with specific fields (e.g., title, key_points, action_items)
    - Analyze or score content (e.g., sentiment, priority, relevance)

    The output_schema should be a JSON Schema that defines the expected structure.

    Args:
        prompt: The prompt/instructions for the AI. Be specific about what you want extracted or generated.
        output_schema: JSON Schema defining the expected output structure. Example: {'type': 'object', 'properties': {'name': {'type': 'string'}, 'age': {'type': 'integer'}}, 'required': ['name']}
        input_text: Optional input text to process. If provided, the AI will analyze this text according to your prompt.
        intelligence_level: The intelligence/capability level of the model to use. 'fast' (default): Gemini Flash Lite - very fast and cheap, no thinking, good for simple extraction. 'balanced': Gemini Flash 3 - fast with good capability, good for most tasks. 'smart': Gemini Flash 3 with thinking - best for complex reasoning and nuanced extraction. Allowed values: 'fast', 'balanced', 'smart'

    Returns:
        AiStructuredOutputResponse: Response from AI structured output call.
    """
    return AiStructuredOutputResponse.model_validate(await get_client().call("ai_structured_output", prompt=prompt, output_schema=output_schema, input_text=input_text, intelligence_level=intelligence_level))
```

### `coworker_text2im`

```python
async def coworker_text2im(prompt: str, image_paths: list[str] | None = None, aspect_ratio: Literal['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] | None = None) -> CoworkerText2ImResponse:
    """Generates an artistic illustration from prompt (not for charts/diagrams).

    Can also edit images if image_paths are provided. The generated image is saved
    locally to the sandbox volume and also available via URL.

    Args:
        prompt: The prompt describing the image to generate.
        image_paths: Optional list of local file paths to images to edit. If provided, the prompt will be used to edit these images instead of generating a new one.
        aspect_ratio: Aspect ratio for the generated image. Choose based on the use case: 1:1 for square/social, 16:9 for landscape/widescreen, 9:16 for portrait/mobile, 4:3 for standard photos, 3:2 for classic photos, 21:9 for ultrawide/cinematic.

    Returns:
        CoworkerText2ImResponse: Response from coworker text2im generation.
    """
    return CoworkerText2ImResponse.model_validate(await get_client().call("coworker_text2im", prompt=prompt, image_paths=image_paths, aspect_ratio=aspect_ratio))
```

### `create_custom_api_integration`

```python
async def create_custom_api_integration(name: str, base_url: str, auth_config: CustomApiAuthNone | CustomApiAuthBearer | CustomApiAuthHeader | CustomApiAuthBasic | CustomApiAuthQueryParameter, api_type: Literal['rest'] = "rest", methods: list[Literal['GET', 'POST', 'PUT', 'PATCH', 'DELETE']] = None, default_headers: dict[str, str] | None = None, docs_url: str | None = None, slug: str | None = None) -> CreateCustomApiIntegrationResponse:
    """Create a custom API integration and return a secure credential form link.

    Args:
        name: Human-friendly integration name
        base_url: Base URL for the API (no query/fragment, no trailing slash preferred)
        auth_config: Credential form configuration
        api_type: API type
        methods: HTTP methods to enable for this integration
        default_headers: Headers applied to every request
        docs_url: Link to API documentation
        slug: Optional slug override (otherwise derived from name)

    Returns:
        CreateCustomApiIntegrationResponse: Response for create_custom_api_integration.
    """
    return CreateCustomApiIntegrationResponse.model_validate(await get_client().call("create_custom_api_integration", name=name, base_url=base_url, api_type=api_type, methods=methods, auth_config=auth_config, default_headers=default_headers, docs_url=docs_url, slug=slug))
```

### `quick_ai_search`

```python
async def quick_ai_search(search_question: str) -> QuickAiSearchResponse:
    """One Google search; read top ~3 results; present answer as bullets or a table with links.

    Args:
        search_question

    Returns:
        QuickAiSearchResponse: 
    """
    return QuickAiSearchResponse.model_validate(await get_client().call("quick_ai_search", search_question=search_question))
```

#### Response Models

```python
class FileToMarkdownResponse(BaseModel):
    """Response from file to markdown conversion."""

    content: str  # Markdown content or error message
    error: str | None = None  # Error message if conversion failed
```

```python
class AiStructuredOutputResponse(BaseModel):
    """Response from AI structured output call."""

    result: dict | None = None  # The structured output matching the schema
    error: str | None = None  # Error message if the call failed
```

```python
class CoworkerText2ImResponse(BaseModel):
    """Response from coworker text2im generation."""

    response_text: str  # Status message about the generation
    image_url: str | None = None  # Public URL to view/download the generated image
    file_uri: str | None = None  # Unified URI for the image (for use with other tools)
    local_path: str | None = None  # Local path where the image is saved on the sandbox volume
    error: str | None = None  # Error message if generation failed
    usd_cost_estimate: float | None = None  # Estimated USD cost for billing
```

```python
class CreateCustomApiIntegrationResponse(BaseModel):
    """Response for create_custom_api_integration."""

    integration_id: str | None = None
    service_name: str | None = None
    connect_url: str | None = None
    status: str | None = None
    expires_at: str | None = None
    error: str | None = None
```

```python
class QuickAiSearchResponse(BaseModel):
    search_response: str
```


## `viktor_spaces_tools` (6 tools)

### `init_app_project`

```python
async def init_app_project(project_name: str, description: str | None = None) -> InitAppProjectResponse:
    """Initialize a new web app project with Convex backend and Vercel hosting.

    Args:
        project_name: Unique name for the project (lowercase, alphanumeric, hyphens)
        description: Brief description of what this app will do

    Returns:
        InitAppProjectResponse: 
    """
    return InitAppProjectResponse.model_validate(await get_client().call("init_app_project", project_name=project_name, description=description))
```

### `deploy_app`

```python
async def deploy_app(project_name: str, environment: Literal['preview', 'production'], commit_message: str | None = None) -> DeployAppResponse:
    """Deploy an app to preview or production environment.

    Args:
        project_name: Name of the project to deploy
        environment: Target environment Allowed values: 'preview', 'production'
        commit_message: Git commit message for changes (auto-generated if not provided)

    Returns:
        DeployAppResponse: 
    """
    return DeployAppResponse.model_validate(await get_client().call("deploy_app", project_name=project_name, environment=environment, commit_message=commit_message))
```

### `list_apps`

```python
async def list_apps() -> ListAppsResponse:
    """List all app projects created by this coworker.

    Returns:
        ListAppsResponse: 
    """
    return ListAppsResponse.model_validate(await get_client().call("list_apps", ))
```

### `get_app_status`

```python
async def get_app_status(project_name: str) -> GetAppStatusResponse:
    """Get detailed status of an app project.

    Args:
        project_name: Name of the project

    Returns:
        GetAppStatusResponse: 
    """
    return GetAppStatusResponse.model_validate(await get_client().call("get_app_status", project_name=project_name))
```

### `query_app_database`

```python
async def query_app_database(project_name: str, function_name: str, args: dict | None = None, environment: Literal['dev', 'prod'] = "prod") -> QueryAppDatabaseResponse:
    """Query data from an app's Convex database. Runs a query function against the specified environment.

    Args:
        project_name: Name of the app project
        function_name: Convex function to call (e.g., 'users:list', 'tasks:getByStatus')
        args: Arguments to pass to the function as JSON object
        environment: Which environment to query (dev or prod) Allowed values: 'dev', 'prod'

    Returns:
        QueryAppDatabaseResponse: 
    """
    return QueryAppDatabaseResponse.model_validate(await get_client().call("query_app_database", project_name=project_name, function_name=function_name, args=args, environment=environment))
```

### `delete_app_project`

```python
async def delete_app_project(project_name: str) -> DeleteAppProjectResponse:
    """Delete an app project and all its resources (Convex deployments, Vercel project, sandbox files).

    Args:
        project_name: Name of the project to delete

    Returns:
        DeleteAppProjectResponse: 
    """
    return DeleteAppProjectResponse.model_validate(await get_client().call("delete_app_project", project_name=project_name))
```

#### Response Models

```python
class InitAppProjectResponse(BaseModel):
    success: bool
    project_name: str | None = None
    sandbox_path: str | None = None
    convex_url_dev: str | None = None
    convex_url_prod: str | None = None
    error: str | None = None
```

```python
class DeployAppResponse(BaseModel):
    success: bool
    environment: str | None = None
    url: str | None = None
    vercel_url: str | None = None
    convex_deployment: str | None = None
    error: str | None = None
```

```python
class ListAppsResponse(BaseModel):
    apps: list[dict]
```

```python
class GetAppStatusResponse(BaseModel):
    project_name: str
    sandbox_path: str | None = None
    convex_url_dev: str | None = None
    convex_url_prod: str | None = None
    preview_url: str | None = None
    production_url: str | None = None
    last_deployed_at: str | None = None
    error: str | None = None
```

```python
class QueryAppDatabaseResponse(BaseModel):
    success: bool
    data: dict | list | None = None
    error: str | None = None
```

```python
class DeleteAppProjectResponse(BaseModel):
    success: bool
    project_name: str | None = None
    deleted_resources: list[str] | None = None
    error: str | None = None
```
